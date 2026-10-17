import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  EvidenceComparison,
  type EvidenceComparisonProps,
} from "@/features/handover/comparison/evidence-comparison";
import type {
  BaselineRecord,
  EvidenceFile,
  ReturnRecord,
} from "@/features/handover/contracts";

vi.mock("@/features/handover/evidence/evidence-preview", () => ({
  EvidencePreview: ({ file }: { file: EvidenceFile }) => (
    <span>Preview {file.fileName}</span>
  ),
}));

function props(): EvidenceComparisonProps & {
  baseline: BaselineRecord;
  returnRecord: ReturnRecord;
} {
  return {
    baseline: {
      id: "baseline",
      agreementId: "agreement",
      termsVersion: 1,
      version: 2,
      assetType: "EQUIPMENT",
      identifier: "Camera",
      notes: "Good condition",
      checklist: [
        { id: "case", label: "Camera case", checked: true, note: "Clean" },
      ],
      evidence: [],
      publishedAt: "2026-10-17T10:00:00Z",
      acknowledgedBy: {},
    },
    returnRecord: {
      id: "return",
      agreementId: "agreement",
      baselineId: "baseline",
      baselineVersion: 2,
      submittedBy: "renter",
      submittedAt: "2026-10-18T10:00:00Z",
      inspectionDeadline: "2026-10-20T10:00:00Z",
      location: "Front door",
      notes: "Check case",
      checklist: [
        {
          id: "case",
          label: "Camera case",
          checked: false,
          note: "Mark on case",
        },
      ],
      evidence: [],
    },
    storage: {
      mode: "browser-demo",
      upload: vi.fn(),
      getUrl: vi.fn(),
      finalize: vi.fn(),
      remove: vi.fn(),
    },
  };
}

describe("EvidenceComparison", () => {
  it("shows safe empty states", () => {
    render(
      <EvidenceComparison {...props()} baseline={null} returnRecord={null} />,
    );
    expect(screen.getByText(/No baseline record/)).toBeInTheDocument();
    expect(screen.getByText(/No return declaration/)).toBeInTheDocument();
  });

  it.each(["agreementId", "baselineId", "baselineVersion"] as const)(
    "refuses an unrelated %s before rendering evidence",
    (field) => {
      const settings = props();
      if (field === "baselineVersion")
        settings.returnRecord.baselineVersion = 3;
      else settings.returnRecord[field] = "unrelated";
      render(<EvidenceComparison {...settings} />);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Load the matching baseline",
      );
      expect(screen.queryByText("Camera")).not.toBeInTheDocument();
    },
  );

  it("shows note changes and unchecked exceptions without implying responsibility", () => {
    render(<EvidenceComparison {...props()} />);
    expect(
      screen.getByText("Recorded differences: confirmation, notes"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Not confirmed — review exception"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Overall notes differ/)).toBeInTheDocument();
    expect(
      screen.getByText(/Differences do not establish damage/),
    ).toBeInTheDocument();
  });

  it("delegates evidence previews and shows captions and uploader attribution", () => {
    const settings = props();
    settings.baseline.evidence = [
      {
        id: "photo",
        agreementId: "agreement",
        phase: "baseline",
        fileName: "camera.webp",
        mimeType: "image/webp",
        sizeBytes: 30,
        sha256: "hash",
        createdAt: "2026-10-17T10:00:00Z",
        uploaderId: "owner",
        caption: "Lens before handover",
        storage: "browser-demo",
        objectPath: "private/camera",
        submittedAt: "2026-10-17T10:00:00Z",
      },
    ];
    render(<EvidenceComparison {...settings} />);
    expect(screen.getByText("Preview camera.webp")).toBeInTheDocument();
    expect(screen.getByText("Lens before handover")).toBeInTheDocument();
    expect(screen.getByText(/Uploaded by owner/)).toBeInTheDocument();
  });

  it("withholds previews for evidence attached to an unrelated agreement", () => {
    const settings = props();
    settings.baseline.evidence = [
      {
        id: "foreign",
        agreementId: "other",
        phase: "baseline",
        fileName: "private.pdf",
        mimeType: "application/pdf",
        sizeBytes: 30,
        sha256: "hash",
        createdAt: "2026-10-17T10:00:00Z",
        uploaderId: "owner",
        caption: "Private",
        storage: "browser-demo",
        objectPath: "private/file",
        submittedAt: null,
      },
    ];
    render(<EvidenceComparison {...settings} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Preview withheld");
    expect(screen.queryByText("Preview private.pdf")).not.toBeInTheDocument();
  });
});
