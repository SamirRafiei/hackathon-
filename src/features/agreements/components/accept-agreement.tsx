"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptAgreementVersion } from "@/features/agreements/server/mutations";

export function AcceptAgreement({
  agreementId,
  versionId,
  revision,
}: {
  agreementId: string;
  versionId: string;
  revision: string;
}) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [accepted, setAccepted] = useState(false);

  function accept() {
    setError("");
    idempotencyKey.current ??= crypto.randomUUID();
    startTransition(() => {
      void acceptAgreementVersion({
        agreementId,
        versionId,
        expectedRevision: revision,
        idempotencyKey: idempotencyKey.current,
      })
        .then((result) => {
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setAccepted(true);
          router.refresh();
        })
        .catch(() =>
          setError("Could not record acceptance. Please try again."),
        );
    });
  }

  return (
    <div className="agreement-accept">
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {accepted ? (
        <p className="auth-message" role="status">
          Your acceptance was recorded.
        </p>
      ) : (
        <button
          className="auth-submit"
          disabled={pending}
          onClick={accept}
          type="button"
        >
          {pending ? "Recording acceptance…" : "I accept this version"}
        </button>
      )}
    </div>
  );
}
