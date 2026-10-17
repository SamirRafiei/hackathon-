import { demoSnapshotSchema, type DemoSnapshot } from "@/features/demo/model";

/** Storage boundary. A server-backed Supabase repository can implement this later. */
export interface PactRepository {
  load(): Promise<DemoSnapshot | null>;
  save(snapshot: DemoSnapshot): void;
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

  save(snapshot: DemoSnapshot) {
    try {
      window.localStorage.setItem("pact-demo-v1", JSON.stringify(snapshot));
    } catch {
      throw new Error(
        "This browser could not save the demo change. Free up storage or use another browser and retry.",
      );
    }
  }

  async reset() {
    try {
      window.localStorage.removeItem("pact-demo-v1");
    } catch {
      throw new Error(
        "This browser could not reset the saved demo. Check storage access and retry.",
      );
    }
  }
}
