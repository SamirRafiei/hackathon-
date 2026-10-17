import { demoSnapshotSchema, type DemoSnapshot } from "@/features/demo/model";

/** Storage boundary. A server-backed Supabase repository can implement this later. */
export interface PactRepository {
  load(): Promise<DemoSnapshot | null>;
  save(snapshot: DemoSnapshot): Promise<void>;
  reset(): Promise<void>;
}

/** Browser-local storage for the explicitly simulated demo only. */
export class LocalDemoRepository implements PactRepository {
  async load() {
    try {
      const raw = window.localStorage.getItem("pact-demo-v1");
      if (!raw) return null;
      const parsed = demoSnapshotSchema.safeParse(JSON.parse(raw));
      return parsed.success ? (parsed.data as DemoSnapshot) : null;
    } catch {
      return null;
    }
  }

  async save(snapshot: DemoSnapshot) {
    try {
      window.localStorage.setItem("pact-demo-v1", JSON.stringify(snapshot));
    } catch {
      // Storage can be unavailable in private browsing or restricted contexts.
    }
  }

  async reset() {
    try {
      window.localStorage.removeItem("pact-demo-v1");
    } catch {
      // The in-memory demo can still be reset if browser storage is unavailable.
    }
  }
}
