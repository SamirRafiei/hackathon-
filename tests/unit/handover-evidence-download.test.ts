// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/evidence/[id]/download/route";
import { signedEvidenceDownload } from "@/features/handover/evidence/download";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => mocks);

const id = "11111111-1111-4111-8111-111111111111";
const path = `22222222-2222-4222-8222-222222222222/collection/${id}`;
const url = "https://storage.example/private?token=short-lived";
const request = () =>
  new Request(`http://localhost/api/evidence/${id}/download`);
const get = (fileId = id) =>
  GET(request(), { params: Promise.resolve({ id: fileId }) });

function client() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { bucket_id: "pact-evidence", object_path: path },
    error: null,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const createSignedUrl = vi.fn().mockResolvedValue({
    data: { signedUrl: url },
    error: null,
  });
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: { id: "session-actor", email_confirmed_at: "2026-10-17" },
        },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({ select }),
    storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
  };
  mocks.createClient.mockResolvedValue(supabase);
  return { ...supabase, maybeSingle, eq, select, createSignedUrl };
}

describe("authenticated evidence download endpoint", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects malformed IDs before creating a client", async () => {
    const response = await get("../private-path");
    expect(response.status).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each(["anonymous", "unverified", "invalid-session"])(
    "refuses %s callers before reading files",
    async (kind) => {
      const supabase = client();
      supabase.auth.getUser.mockResolvedValue({
        data: {
          user:
            kind === "anonymous"
              ? null
              : {
                  email_confirmed_at:
                    kind === "unverified" ? null : "confirmed",
                },
        },
        error: kind === "invalid-session" ? new Error("expired") : null,
      });
      const response = await get();
      expect(response.status).toBe(kind === "unverified" ? 403 : 401);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.storage.from).not.toHaveBeenCalled();
    },
  );

  it("never signs an absent or RLS-hidden file", async () => {
    const supabase = client();
    supabase.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await get();
    expect(response.status).toBe(404);
    expect(supabase.createSignedUrl).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("uses only the RLS-visible stored path and signs for 60 seconds", async () => {
    const supabase = client();
    const response = await GET(
      new Request(`${request().url}?object_path=forged&actorId=owner`),
      { params: Promise.resolve({ id }) },
    );
    expect(supabase.from).toHaveBeenCalledWith("evidence_files");
    expect(supabase.eq).toHaveBeenCalledWith("id", id);
    expect(supabase.storage.from).toHaveBeenCalledWith("pact-evidence");
    expect(supabase.createSignedUrl).toHaveBeenCalledWith(path, 60);
    expect(await response.json()).toEqual({ url, expiresIn: 60 });
    expect(response.headers.get("cache-control")).toContain(
      "private, no-store",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("returns no link if Storage denies access after the database read", async () => {
    const supabase = client();
    supabase.createSignedUrl.mockResolvedValue({
      data: null,
      error: new Error(path),
    });
    const response = await get();
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(path);
  });

  it("sanitizes database and configuration failures", async () => {
    const supabase = client();
    supabase.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error("secret database detail"),
    });
    const databaseFailure = await get();
    expect(databaseFailure.status).toBe(503);
    expect(await databaseFailure.text()).not.toContain("secret");
    mocks.createClient.mockRejectedValue(new Error("secret configuration"));
    const configFailure = await get();
    expect(configFailure.status).toBe(503);
    expect(await configFailure.text()).not.toContain("secret");
  });
});

describe("authenticated evidence download transport", () => {
  it("requests a fresh cookie-authenticated link without caching", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ url, expiresIn: 60 }));
    try {
      expect(await signedEvidenceDownload(id)).toEqual({ url });
      expect(fetchMock).toHaveBeenCalledWith(`/api/evidence/${id}/download`, {
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
    } finally {
      fetchMock.mockRestore();
    }
  });

  it.each([401, 403, 404, 503])(
    "does not treat HTTP %s as a successful preview",
    async (status) => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(Response.json({ error: "failure" }, { status }));
      try {
        await expect(signedEvidenceDownload(id)).rejects.toThrow();
      } finally {
        fetchMock.mockRestore();
      }
    },
  );

  it("rejects malformed success payloads", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ url: "invalid", expiresIn: 3600 }));
    try {
      await expect(signedEvidenceDownload(id)).rejects.toThrow(
        "private evidence download",
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
});
