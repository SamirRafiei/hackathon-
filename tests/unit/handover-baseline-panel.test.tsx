import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  EvidenceFile,
  EvidenceStorage,
} from "@/features/handover/contracts";
import {
  BaselinePanel,
  type BaselinePanelProps,
} from "@/features/handover/baseline/baseline-panel";

vi.mock("@/features/handover/evidence/evidence-uploader", () => ({
  EvidenceUploader: ({
    onChange,
    agreementId,
    onBusyChange,
  }: {
    onChange: (files: EvidenceFile[]) => void;
    agreementId: string;
    onBusyChange?: (busy: boolean) => void;
  }) => (
    <>
      <button type="button" onClick={() => onBusyChange?.(true)}>
        Start pending upload
      </button>
      <button
        type="button"
        onClick={() =>
          onChange([
            {
              id: "photo",
              agreementId,
              phase: "baseline",
              fileName: "photo.jpg",
              mimeType: "image/jpeg",
              sizeBytes: 100,
              sha256: "hash",
              createdAt: "2026-10-17T12:00:00Z",
              uploaderId: "owner",
              caption: "",
              storage: "browser-demo",
              objectPath: "photo",
              submittedAt: null,
            },
          ])
        }
      >
        Add test photo
      </button>
    </>
  ),
}));
vi.mock("@/features/handover/evidence/evidence-preview", () => ({
  EvidencePreview: () => <span>Condition photo</span>,
}));

function props(finalize: EvidenceStorage["finalize"]): BaselinePanelProps {
  return {
    agreementId: "a",
    assetType: "EQUIPMENT",
    termsVersion: 1,
    actor: { id: "owner", displayName: "Owner", role: "owner" },
    ownerId: "owner",
    renterId: "renter",
    record: null,
    onChange: vi.fn(),
    storage: {
      mode: "browser-demo",
      upload: vi.fn(),
      getUrl: vi.fn(),
      remove: vi.fn(),
      finalize,
    },
  };
}
function fill() {
  fireEvent.change(
    screen.getByLabelText("Item model and serial / identifying number"),
    { target: { value: "Camera SN123" } },
  );
  for (const checkbox of screen.getAllByRole("checkbox"))
    fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Add test photo" }));
}

describe("baseline publication UI", () => {
  it("prefills editable demo details but still requires a live photo before publication", () => {
    const input = props(vi.fn());
    render(
      <BaselinePanel
        {...input}
        assetType="APARTMENT"
        demoPreset={{
          identifier: "Demo apartment; two keys",
          notes: "Existing wall mark beside the sofa.",
          checklistNotes: [
            "Clean rooms",
            "Sofa and table",
            "Two keys",
            "Wall mark",
          ],
        }}
      />,
    );
    expect(
      screen.getByLabelText("Property address and identifying details"),
    ).toHaveValue("Demo apartment; two keys");
    for (const checkbox of screen.getAllByRole("checkbox"))
      expect(checkbox).toBeChecked();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish condition record" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add at least one condition photograph",
    );
    expect(input.onChange).not.toHaveBeenCalled();
    expect(input.storage.finalize).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Condition and existing damage"), {
      target: { value: "Updated during the demo" },
    });
    expect(screen.getByLabelText("Condition and existing damage")).toHaveValue(
      "Updated during the demo",
    );
  });
  it("blocks publication while another photograph is uploading", () => {
    const finalize = vi.fn();
    const input = props(finalize);
    render(<BaselinePanel {...input} />);
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Start pending upload" }),
    );
    expect(
      screen.getByRole("button", { name: "Publish condition record" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish condition record" }),
    );
    expect(finalize).not.toHaveBeenCalled();
    expect(input.onChange).not.toHaveBeenCalled();
  });
  it("waits for storage finalization before publishing", async () => {
    let resolve!: (file: EvidenceFile) => void;
    let uploaded!: EvidenceFile;
    const finalize = vi.fn((file: EvidenceFile) => {
      uploaded = file;
      return new Promise<EvidenceFile>((done) => {
        resolve = done;
      });
    });
    const input = props(finalize);
    render(<BaselinePanel {...input} />);
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish condition record" }),
    );
    expect(finalize).toHaveBeenCalledOnce();
    expect(input.onChange).not.toHaveBeenCalled();
    await act(async () =>
      resolve({ ...uploaded, submittedAt: "2026-10-17T12:01:00Z" }),
    );
    expect(input.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ version: 1, identifier: "Camera SN123" }),
    );
  });
  it("discards publication when the actor changes during finalization", async () => {
    let resolve!: (file: EvidenceFile) => void;
    let uploaded!: EvidenceFile;
    const input = props((file) => {
      uploaded = file;
      return new Promise((done) => {
        resolve = done;
      });
    });
    const view = render(<BaselinePanel {...input} />);
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Publish condition record" }),
    );
    view.rerender(
      <BaselinePanel
        {...input}
        actor={{ id: "renter", displayName: "Borrower", role: "renter" }}
      />,
    );
    await act(async () =>
      resolve({ ...uploaded, submittedAt: "2026-10-17T12:01:00Z" }),
    );
    expect(input.onChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Publish condition record" }),
    ).not.toBeInTheDocument();
  });
  it("does not expose publishing for an activated agreement", () => {
    render(<BaselinePanel {...props(vi.fn())} locked />);
    expect(
      screen.queryByRole("button", { name: "Publish condition record" }),
    ).not.toBeInTheDocument();
  });
});
