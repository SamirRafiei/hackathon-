import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AcceptAgreement } from "@/features/agreements/components/accept-agreement";
import { signOut } from "@/features/auth/server/actions";
import { createClient } from "@/lib/supabase/server";

function money(minor: number | string, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    Number(minor) / 100,
  );
}

export default async function AgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    redirect(`/login?next=${encodeURIComponent(`/agreements/${id}`)}`);
  if (!auth.user.email_confirmed_at) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Verify your email</h1>
          <p className="auth-intro">
            Verify your account before viewing this agreement.
          </p>
        </section>
      </main>
    );
  }

  const { data: agreement } = await supabase
    .from("agreements")
    .select("id, owner_id, currency, state, current_version_id, revision")
    .eq("id", id)
    .maybeSingle();
  if (!agreement?.current_version_id) notFound();

  const [versionResult, participantResult, acceptanceResult] =
    await Promise.all([
      supabase
        .from("agreement_versions")
        .select(
          "id, agreement_id, version_number, deposit_minor, item_name, item_description, terms, starts_at, due_at",
        )
        .eq("agreement_id", agreement.id)
        .eq("id", agreement.current_version_id)
        .maybeSingle(),
      supabase
        .from("participants")
        .select("id, user_id, email, share_bps, allocated_minor, joined_at")
        .eq("agreement_id", agreement.id),
      supabase
        .from("acceptances")
        .select("actor_id, accepted_at")
        .eq("agreement_id", agreement.id)
        .eq("version_id", agreement.current_version_id),
    ]);
  if (
    versionResult.error ||
    participantResult.error ||
    acceptanceResult.error
  ) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Agreement unavailable</h1>
          <p className="auth-intro">
            Pact could not load all agreement details. Refresh the page or
            contact the person who shared the invitation.
          </p>
        </section>
      </main>
    );
  }
  const version = versionResult.data;
  if (!version) notFound();
  const participants = participantResult.data ?? [];
  const acceptedActorIds = new Set(
    (acceptanceResult.data ?? []).map((entry) => entry.actor_id),
  );
  const acceptedByMe = acceptedActorIds.has(auth.user.id);
  const detail = (() => {
    try {
      return JSON.parse(version.item_description) as {
        assetType?: string;
        location?: string;
      };
    } catch {
      return { location: version.item_description };
    }
  })();

  return (
    <main className="auth-page agreement-page">
      <article className="auth-card agreement-detail">
        <Link className="auth-brand" href="/">
          Pact
        </Link>
        <p className="auth-kicker">
          VERSION {version.version_number} · SIMULATED FUNDS
        </p>
        <h1>{version.item_name}</h1>
        <p className="auth-intro">
          {detail.assetType === "EQUIPMENT"
            ? "Equipment security deposit"
            : "Apartment security deposit"}{" "}
          · {agreement.state.replaceAll("_", " ")}
        </p>

        <section className="agreement-detail-section">
          <h2>Deposit and dates</h2>
          <dl className="agreement-facts">
            <div>
              <dt>Deposit</dt>
              <dd>{money(version.deposit_minor, agreement.currency)}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{detail.location}</dd>
            </div>
            <div>
              <dt>Starts</dt>
              <dd>{new Date(version.starts_at).toLocaleDateString("en-GB")}</dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd>{new Date(version.due_at).toLocaleDateString("en-GB")}</dd>
            </div>
          </dl>
        </section>

        <section className="agreement-detail-section">
          <h2>People and shares</h2>
          <ul className="agreement-parties">
            <li>
              <span>Landlord</span>
              <b>
                {acceptedActorIds.has(agreement.owner_id)
                  ? "Accepted"
                  : "Needs to accept"}
              </b>
            </li>
            {participants.map((participant) => (
              <li key={participant.id}>
                <span>
                  {participant.email} · {participant.share_bps / 100}%
                </span>
                <b>
                  {!participant.user_id
                    ? "Invitation pending"
                    : acceptedActorIds.has(participant.user_id)
                      ? "Accepted"
                      : "Needs to accept"}
                </b>
              </li>
            ))}
          </ul>
        </section>

        <section className="agreement-detail-section">
          <h2>Terms</h2>
          <p className="agreement-terms">{version.terms}</p>
        </section>

        {!acceptedByMe && agreement.state === "awaiting_acceptance" ? (
          <AcceptAgreement
            agreementId={agreement.id}
            versionId={version.id}
            revision={String(agreement.revision)}
          />
        ) : acceptedByMe ? (
          <p className="auth-message" role="status">
            You accepted version {version.version_number}.
          </p>
        ) : null}
        <p className="agreement-demo-note">
          This is a persistent demo record. Funding is simulated and no money is
          held or transferred.
        </p>
        <form action={signOut} className="agreement-signout">
          <button type="submit">Sign out ({auth.user.email})</button>
        </form>
      </article>
    </main>
  );
}
