import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  BaselineRecord,
  EvidenceFile,
} from "@/features/handover/contracts";
import {
  ReturnPanel,
  type ReturnPanelProps,
} from "@/features/handover/returns/return-panel";

vi.mock("@/features/handover/evidence/evidence-uploader", () => ({
  EvidenceUploader: ({
    onChange,
    onBusyChange,
  }: {
    onChange: (files: EvidenceFile[]) => void;
    onBusyChange: (busy: boolean) => void;
  }) => (
    <div>
      Return photo uploader
      <button
        type="button"
        onClick={() =>
          onChange([
            {
              id: "photo",
              agreementId: "agreement",
              phase: "return",
              uploaderId: "renter",
              fileName: "return.jpg",
              mimeType: "image/jpeg",
              sizeBytes: 100,
              sha256: "hash",
              createdAt: "2026-10-17T12:00:00.000Z",
              caption: "Return",
              storage: "browser-demo",
              objectPath: "path",
              submittedAt: null,
            },
          ])
        }
      >
        Attach photo
      </button>
      <button type="button" onClick={() => onBusyChange(true)}>
        Start upload
      </button>
      <button type="button" onClick={() => onBusyChange(false)}>
        Finish upload
      </button>
    </div>
  ),
}));
vi.mock("@/features/handover/evidence/evidence-preview", () => ({
  EvidencePreview: () => <div>Return evidence preview</div>,
}));

function props(): ReturnPanelProps & { baseline: BaselineRecord } {
  return {
    agreementId: "agreement",
    actor: { id: "renter", displayName: "Sam", role: "renter" },
    ownerId: "owner",
    renterId: "renter",
    record: null,
    active: true,
    baseline: {
      id: "baseline",
      agreementId: "agreement",
      termsVersion: 1,
      version: 1,
      assetType: "APARTMENT",
      identifier: "Flat 2",
      notes: "",
      checklist: [],
      evidence: [],
      publishedAt: "2026-10-17T10:00:00.000Z",
      acknowledgedBy: {
        owner: "2026-10-17T10:00:00.000Z",
        renter: "2026-10-17T10:00:00.000Z",
      },
    },
    storage: {
      mode: "browser-demo",
      upload: vi.fn(),
      getUrl: vi.fn(),
      finalize: vi.fn(),
      remove: vi.fn(),
    },
    onSubmitReturn: vi.fn(),
  };
}

describe("ReturnPanel", () => {
  function fillReturn() {
    fireEvent.change(screen.getByLabelText("Return location"), {
      target: { value: "Front desk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach photo" }));
  }

  it("blocks submission while evidence is uploading", () => {
    const settings = props();
    render(<ReturnPanel {...settings} />);
    fillReturn();
    fireEvent.click(screen.getByRole("button", { name: "Start upload" }));
    const submit = screen.getByRole("button", {
      name: "Submit return declaration",
    });
    expect(submit).toBeDisabled();
    const form = submit.closest("form");
    if (!form) throw new Error("Return form is missing");
    fireEvent.submit(form);
    expect(settings.storage.finalize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Finish upload" }));
    expect(submit).not.toBeDisabled();
  });

  it.each(["unmount", "inactive", "actor", "baseline"])(
    "suppresses stale finalization after %s",
    async (change) => {
      const settings = props();
      let finish!: (file: EvidenceFile) => void;
      let pendingFile!: EvidenceFile;
      settings.storage.finalize = vi.fn((file) => {
        pendingFile = file;
        return new Promise<EvidenceFile>((resolve) => {
          finish = resolve;
        });
      });
      const view = render(<ReturnPanel {...settings} />);
      fillReturn();
      fireEvent.click(
        screen.getByRole("button", { name: "Submit return declaration" }),
      );
      expect(settings.storage.finalize).toHaveBeenCalledOnce();
      if (change === "unmount") view.unmount();
      if (change === "inactive")
        view.rerender(<ReturnPanel {...settings} active={false} />);
      if (change === "actor")
        view.rerender(
          <ReturnPanel
            {...settings}
            actor={{ id: "owner", displayName: "Alex", role: "owner" }}
          />,
        );
      if (change === "baseline")
        view.rerender(
          <ReturnPanel
            {...settings}
            baseline={{ ...settings.baseline, version: 2 }}
          />,
        );
      await act(async () => {
        finish({ ...pendingFile, submittedAt: "2026-10-17T12:00:00.000Z" });
      });
      expect(settings.onSubmitReturn).not.toHaveBeenCalled();
    },
  );

  it("preserves rejection errors and allows retry without restarting a recorded return", async () => {
    const settings = props();
    settings.storage.finalize = vi.fn(async (file) => ({
      ...file,
      submittedAt: "2026-10-17T12:00:00.000Z",
    }));
    settings.onSubmitReturn = vi.fn().mockImplementationOnce(() => {
      throw new Error("State changed; please retry.");
    });
    render(<ReturnPanel {...settings} />);
    fillReturn();
    fireEvent.click(
      screen.getByRole("button", { name: "Submit return declaration" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "State changed; please retry.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Submit return declaration" }),
    );
    await waitFor(() =>
      expect(settings.onSubmitReturn).toHaveBeenCalledTimes(2),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Return declaration saved",
    );
  });

  it("does not let an owner submit a renter declaration", () => {
    render(
      <ReturnPanel
        {...props()}
        actor={{ id: "owner", displayName: "Alex", role: "owner" }}
      />,
    );
    expect(screen.getByText(/The renter can submit/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit return declaration" }),
    ).not.toBeInTheDocument();
  });

  it("requires both baseline acknowledgments", () => {
    const settings = props();
    settings.baseline.acknowledgedBy = { renter: "2026-10-17T10:00:00.000Z" };
    render(<ReturnPanel {...settings} />);
    expect(
      screen.getByText(/Both parties must acknowledge/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Return photo uploader")).not.toBeInTheDocument();
  });

  it("shows the recorded deadline read-only even when the agreement is no longer active", () => {
    const settings = props();
    settings.active = false;
    settings.record = {
      id: "return",
      agreementId: "agreement",
      baselineId: "baseline",
      baselineVersion: 1,
      submittedBy: "renter",
      submittedAt: "2026-10-17T12:00:00.000Z",
      inspectionDeadline: "2026-10-19T12:00:00.000Z",
      location: "Front desk",
      notes: "Keys with reception",
      checklist: [],
      evidence: [],
    };
    render(<ReturnPanel {...settings} />);
    expect(screen.getByText("Front desk")).toBeInTheDocument();
    expect(
      screen.getByText(/does not prove physical receipt/),
    ).toBeInTheDocument();
    expect(
      document.querySelector('time[datetime="2026-10-19T12:00:00.000Z"]'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Submit/ }),
    ).not.toBeInTheDocument();
    expect(settings.onSubmitReturn).not.toHaveBeenCalled();
  });
});
