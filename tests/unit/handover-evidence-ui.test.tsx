import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidencePreview } from "@/features/handover/evidence/evidence-preview";
import { EvidenceUploader } from "@/features/handover/evidence/evidence-uploader";
import type {
  EvidenceFile,
  EvidenceStorage,
} from "@/features/handover/contracts";

const file: EvidenceFile = {
  id: "photo",
  agreementId: "pact",
  phase: "baseline",
  fileName: "photo.png",
  mimeType: "image/png",
  sizeBytes: 200,
  sha256: "hash",
  createdAt: "2026-10-17T10:00:00Z",
  uploaderId: "owner",
  caption: "Before handover",
  storage: "browser-demo",
  objectPath: "private/random",
  submittedAt: null,
};
function storage(): EvidenceStorage {
  return {
    mode: "browser-demo",
    upload: vi.fn(),
    getUrl: vi
      .fn()
      .mockResolvedValue({ url: "blob:private", release: vi.fn() }),
    finalize: vi.fn(),
    remove: vi.fn(),
  };
}
describe("private evidence controls", () => {
  it("opens the correct picker from the upload and camera buttons", () => {
    render(
      <EvidenceUploader
        agreementId="pact"
        phase="baseline"
        actor={{ id: "owner", displayName: "Owner", role: "owner" }}
        storage={storage()}
        files={[]}
        onChange={vi.fn()}
      />,
    );
    const choose = vi.spyOn(
      screen.getByLabelText("Choose evidence files"),
      "click",
    );
    const camera = vi.spyOn(
      screen.getByLabelText("Take condition photo"),
      "click",
    );
    fireEvent.click(screen.getByRole("button", { name: "Upload photos" }));
    expect(choose).toHaveBeenCalledOnce();
    expect(camera).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Take photo" }));
    expect(camera).toHaveBeenCalledOnce();
    expect(screen.getByText("No files attached yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Attach contract PDF" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Choose contract PDF"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Choose evidence files")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
  });
  it("disables both pickers when the record reaches its file limit", async () => {
    render(
      <EvidenceUploader
        agreementId="pact"
        phase="dispute"
        actor={{ id: "owner", displayName: "Owner", role: "owner" }}
        storage={storage()}
        files={Array.from({ length: 12 }, (_, index) => ({
          ...file,
          id: String(index),
        }))}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Upload files" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Take photo" })).toBeDisabled();
    expect(screen.getByText(/File limit reached/)).toBeInTheDocument();
    await screen.findAllByAltText("Before handover");
  });
  it("offers recoverable errors for image decode failures and does not change submitted evidence", async () => {
    const adapter = storage();
    const submitted = { ...file, submittedAt: "2026-10-17T12:00:00Z" };
    render(<EvidencePreview file={submitted} storage={adapter} />);
    fireEvent.error(await screen.findByAltText("Before handover"));
    expect(screen.getByRole("alert")).toHaveTextContent("photo.png");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This image could not be displayed",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "submitted evidence cannot be replaced",
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    await screen.findByAltText("Before handover");
    expect(adapter.getUrl).toHaveBeenCalledTimes(2);
    expect(adapter.finalize).not.toHaveBeenCalled();
    expect(adapter.remove).not.toHaveBeenCalled();
  });
  it("identifies missing draft files and tells the presenter how to re-upload", async () => {
    const adapter = storage();
    adapter.getUrl = vi.fn().mockRejectedValue(new Error("Local file missing"));
    render(<EvidencePreview file={file} storage={adapter} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("photo.png");
    expect(alert).toHaveTextContent(
      "remove this draft and upload the original file again",
    );
  });
  it("releases temporary preview URLs on unmount", async () => {
    const release = vi.fn();
    const adapter = storage();
    adapter.getUrl = vi
      .fn()
      .mockResolvedValue({ url: "blob:private", release });
    const view = render(<EvidencePreview file={file} storage={adapter} />);
    await screen.findByAltText("Before handover");
    view.unmount();
    expect(release).toHaveBeenCalledOnce();
  });
  it("releases a late URL when unmounted before loading finishes", async () => {
    const release = vi.fn();
    let resolve: (value: {
      url: string;
      release: () => void;
    }) => void = () => {};
    const adapter = storage();
    adapter.getUrl = vi.fn().mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = render(<EvidencePreview file={file} storage={adapter} />);
    view.unmount();
    resolve({ url: "blob:late", release });
    await waitFor(() => expect(release).toHaveBeenCalledOnce());
  });
  it("only exposes deletion for the current actor's unsubmitted drafts", async () => {
    const adapter = storage();
    render(
      <EvidenceUploader
        agreementId="pact"
        phase="baseline"
        actor={{ id: "owner", displayName: "Owner", role: "owner" }}
        storage={adapter}
        files={[
          file,
          { ...file, id: "other", uploaderId: "renter", fileName: "other.png" },
          {
            ...file,
            id: "submitted",
            fileName: "submitted.png",
            submittedAt: "2026-10-17T12:00:00Z",
          },
        ]}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Remove photo.png" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove other.png" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove submitted.png" }),
    ).not.toBeInTheDocument();
    await screen.findAllByAltText("Before handover");
  });
});
