import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ArrivalInspectionPanel,
  type ArrivalInspectionPanelProps,
} from "@/features/handover/arrival/arrival-inspection-panel";
import type { EvidenceFile } from "@/features/handover/contracts";

const photo: EvidenceFile = {
  id: "photo",
  agreementId: "agreement",
  phase: "arrival",
  fileName: "arrival.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 100,
  sha256: "hash",
  createdAt: "2026-10-17T11:59:00.000Z",
  uploaderId: "renter",
  caption: "Entry",
  storage: "browser-demo",
  objectPath: "arrival/photo",
  submittedAt: null,
};
vi.mock("@/features/handover/evidence/evidence-uploader", () => ({
  EvidenceUploader: ({
    onChange,
  }: {
    onChange: (files: EvidenceFile[]) => void;
  }) => (
    <button type="button" onClick={() => onChange([photo])}>
      Add photo
    </button>
  ),
}));
vi.mock("@/features/handover/evidence/evidence-preview", () => ({
  EvidencePreview: () => <div>Arrival photograph</div>,
}));
function settings(): ArrivalInspectionPanelProps {
  return {
    agreementId: "agreement",
    actor: { id: "renter", displayName: "Sam", role: "renter" },
    ownerId: "owner",
    renterId: "renter",
    enabled: true,
    record: null,
    listing: {
      title: "Student flat",
      address: "12 College Road",
      description: "Quiet room",
      promisedFeatures: ["Desk", "Private bathroom"],
    },
    storage: {
      mode: "browser-demo",
      upload: vi.fn(),
      getUrl: vi.fn(),
      remove: vi.fn(),
      finalize: vi.fn(async (file: EvidenceFile) => ({
        ...file,
        submittedAt: "2026-10-17T12:00:00.000Z",
      })),
    },
    onSubmitInspection: vi.fn(),
  };
}
function fill() {
  for (const question of [
    "Could you access the property?",
    "Was the property available for your arrival?",
    "Does the property match the accepted listing?",
  ]) {
    fireEvent.click(
      within(screen.getByRole("group", { name: question })).getByRole("radio", {
        name: "Yes",
      }),
    );
  }
  fireEvent.click(screen.getByRole("button", { name: "Add photo" }));
}
describe("ArrivalInspectionPanel", () => {
  it("shows accepted features but reserves submission for the renter", () => {
    const props = settings();
    render(
      <ArrivalInspectionPanel
        {...props}
        actor={{ id: "owner", displayName: "Alex", role: "owner" }}
      />,
    );
    expect(screen.getByText("Private bathroom")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit arrival inspection" }),
    ).not.toBeInTheDocument();
  });
  it("requires all answers before finalizing photos", async () => {
    const props = settings();
    render(<ArrivalInspectionPanel {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Submit arrival inspection" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/all three/);
    expect(props.storage.finalize).not.toHaveBeenCalled();
  });
  it("finalizes photographs and submits once", async () => {
    const props = settings();
    render(<ArrivalInspectionPanel {...props} />);
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Submit arrival inspection" }),
    );
    await waitFor(() =>
      expect(props.onSubmitInspection).toHaveBeenCalledTimes(1),
    );
    expect(props.storage.finalize).toHaveBeenCalledWith(photo);
    expect(
      screen.getByRole("button", { name: "Inspection submitted" }),
    ).toBeDisabled();
  });
  it("discards late finalization after an agreement changes", async () => {
    const props = settings();
    let finish!: (file: EvidenceFile) => void;
    props.storage.finalize = vi.fn(
      () =>
        new Promise<EvidenceFile>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<ArrivalInspectionPanel {...props} />);
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Submit arrival inspection" }),
    );
    view.rerender(
      <ArrivalInspectionPanel {...props} agreementId="other-agreement" />,
    );
    await act(async () => {
      finish({ ...photo, submittedAt: "2026-10-17T12:00:00.000Z" });
    });
    expect(props.onSubmitInspection).not.toHaveBeenCalled();
  });
});
