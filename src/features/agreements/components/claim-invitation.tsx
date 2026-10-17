"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimInvitation } from "@/features/agreements/server/mutations";

export function ClaimInvitation({ token }: { token: string }) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function claim() {
    setError("");
    if (idempotencyKey.current === null) {
      idempotencyKey.current = crypto.randomUUID();
    }
    startTransition(() => {
      void claimInvitation({
        invitationToken: token,
        idempotencyKey: idempotencyKey.current,
      })
        .then((result) => {
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          const agreementId = result.data.agreementId;
          if (typeof agreementId !== "string") {
            setError(
              "The invitation was claimed, but Pact could not open the agreement. Contact the owner before retrying.",
            );
            return;
          }
          router.replace(`/agreements/${agreementId}`);
          router.refresh();
        })
        .catch(() => setError("Could not reach Pact. Please try again."));
    });
  }

  return (
    <>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="auth-submit"
        disabled={pending}
        onClick={claim}
        type="button"
      >
        {pending ? "Checking invitation…" : "Claim invitation and review terms"}
      </button>
    </>
  );
}
