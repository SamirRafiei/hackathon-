import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClaimInvitation } from "@/features/agreements/components/claim-invitation";
import { signOut } from "@/features/auth/server/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Review Pact invitation",
  robots: { index: false, follow: false },
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[0-9a-f-]{32,128}$/i.test(token)) {
    return (
      <InvitationMessage message="This invitation link is invalid or expired." />
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }
  if (!data.user.email_confirmed_at) {
    return (
      <InvitationMessage message="Verify your email, then sign in again to claim this invitation." />
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <meta name="referrer" content="no-referrer" />
        <Link className="auth-brand" href="/">
          Pact
        </Link>
        <p className="auth-kicker">PRIVATE INVITATION</p>
        <h1>You’ve been invited</h1>
        <p className="auth-intro">
          Claiming requires the verified email address the owner invited. You’ll
          be able to review the agreement terms before accepting them.
        </p>
        <ClaimInvitation token={token} />
        <div className="auth-switch">
          Signed in as {data.user.email}. Wrong account?{" "}
          <form action={signOut} className="inline-auth-form">
            <button type="submit">Sign out</button>
          </form>
        </div>
      </section>
    </main>
  );
}

function InvitationMessage({ message }: { message: string }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" href="/">
          Pact
        </Link>
        <p className="auth-kicker">PRIVATE INVITATION</p>
        <h1>Invitation needs attention</h1>
        <p className="auth-intro">{message}</p>
        <Link className="auth-submit auth-submit-link" href="/login">
          Sign in
        </Link>
      </section>
    </main>
  );
}
