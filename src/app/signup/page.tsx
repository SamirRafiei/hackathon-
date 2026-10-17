import { AuthForm } from "@/features/auth/components/auth-form";
import { safeNextPath } from "@/lib/auth/navigation";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next ?? null);
  return <AuthForm mode="signup" next={next} />;
}
