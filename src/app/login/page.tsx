import { AuthForm } from "@/features/auth/components/auth-form";
import { safeNextPath } from "@/lib/auth/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next ?? null);
  const message =
    params.error === "verification"
      ? "That verification link is invalid or expired. Sign in or request a new one."
      : undefined;
  return <AuthForm mode="login" next={next} message={message} />;
}
