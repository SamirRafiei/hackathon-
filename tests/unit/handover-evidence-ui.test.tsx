import { render, screen, waitFor } from "@testing-library/react";
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
