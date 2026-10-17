/**
 * Identity boundary for Pact.
 *
 * The demo provider below is deliberately not authentication. A future host app
 * provider must verify a signed, short-lived assertion on the server before it
 * returns an identity. UI-selected names and browser storage are never proof of
 * identity or authorization.
 */
export type PactActor = {
  id: string;
  displayName: string;
  role: "landlord" | "tenant";
  source: "demo" | "host";
};

export interface IdentityProvider {
  getCurrentActor(): Promise<PactActor>;
}

export const demoActors = {
  landlord: {
    id: "demo-landlord",
    displayName: "Maya Petrova",
    role: "landlord",
    source: "demo",
  },
  tenant: {
    id: "demo-tenant",
    displayName: "Luca Martin",
    role: "tenant",
    source: "demo",
  },
} as const satisfies Record<"landlord" | "tenant", PactActor>;

/**
 * A local-only identity adapter for the interactive prototype.
 * Do not use this adapter for real agreements, private data, or real funds.
 */
export class DemoIdentityProvider implements IdentityProvider {
  constructor(private readonly actor: PactActor) {}

  async getCurrentActor() {
    return this.actor;
  }
}
