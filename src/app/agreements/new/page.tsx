import { redirect } from "next/navigation";
import { AuthenticatedAgreementForm } from "@/features/agreements/components/authenticated-agreement-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewAgreementPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login?next=%2Fagreements%2Fnew");
  }
  if (!data.user.email_confirmed_at) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Verify your email</h1>
          <p className="auth-intro">
            Confirm your email address before creating an agreement.
          </p>
        </section>
      </main>
    );
  }
  return (
    <main className="auth-page">
      <AuthenticatedAgreementForm />
    </main>
  );
}
