"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { createAgreement } from "@/features/agreements/server/mutations";

type Result = Awaited<ReturnType<typeof createAgreement>>;

export function AuthenticatedAgreementForm() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);
  const [invitationLink, setInvitationLink] = useState("");
  const [agreementLink, setAgreementLink] = useState("");
  const [invitedEmail, setInvitedEmail] = useState("");
  const [assetType, setAssetType] = useState<"APARTMENT" | "EQUIPMENT">(
    "APARTMENT",
  );
  const [title, setTitle] = useState("Apartment security deposit");
  const [tenantEmail, setTenantEmail] = useState("");
  const [amount, setAmount] = useState("1000.00");
  const idempotencyKey = useRef<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(
      String(form.get("amount") ?? ""),
    );
    if (!match) {
      setResult({
        ok: false,
        error: {
          code: "validation_failed",
          message: "Enter a deposit with up to two decimal places.",
          retryable: false,
        },
      });
      return;
    }
    const amountMinor =
      Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
    if (amountMinor < 100 || amountMinor > 100_000_000) {
      setResult({
        ok: false,
        error: {
          code: "validation_failed",
          message: "The deposit must be between €1 and €1,000,000.",
          retryable: false,
        },
      });
      return;
    }
    if (idempotencyKey.current === null) {
      idempotencyKey.current = crypto.randomUUID();
    }
    const input = {
      assetType,
      title: String(form.get("title") ?? ""),
      address: String(form.get("address") ?? ""),
      tenantEmail: String(form.get("tenantEmail") ?? ""),
      startDate: String(form.get("startDate") ?? ""),
      endDate: String(form.get("endDate") ?? ""),
      amountMinor,
      terms: String(form.get("terms") ?? ""),
      idempotencyKey: idempotencyKey.current,
    };
    setInvitedEmail(input.tenantEmail);
    startTransition(() => {
      void createAgreement(input)
        .then((response) => {
          setResult(response);
          if (!response.ok) return;
          const token = response.data.invitationToken;
          const id = response.data.agreementId;
          if (typeof token !== "string" || typeof id !== "string") {
            setResult({
              ok: false,
              error: {
                code: "temporarily_unavailable",
                message:
                  "Agreement created, but the invitation link could not be read. Contact the project operator before retrying.",
                retryable: false,
              },
            });
            return;
          }
          setInvitationLink(
            `${window.location.origin}/invite/${encodeURIComponent(token)}`,
          );
          setAgreementLink(`${window.location.origin}/agreements/${id}`);
        })
        .catch(() => {
          setResult({
            ok: false,
            error: {
              code: "temporarily_unavailable",
              message:
                "Could not reach Pact. Retry with the same terms; the request is protected against duplicates.",
              retryable: true,
            },
          });
        });
    });
  }

  return (
    <section
      className="auth-card agreement-card"
      aria-labelledby="agreement-create-title"
    >
      <Link className="auth-brand" href="/">
        Pact
      </Link>
      <p className="auth-kicker">NEW SECURITY DEPOSIT</p>
      <h1 id="agreement-create-title">Set the terms</h1>
      <p className="auth-intro">
        The tenant must sign in with the verified email below, review this
        version, and accept it before simulated funding becomes available.
      </p>
      {result && !result.ok && (
        <p className="auth-error" role="alert">
          {result.error.message}
        </p>
      )}
      {invitationLink ? (
        <div className="agreement-created" role="status">
          <strong>Agreement created.</strong>
          <p>
            Share this invite with <b>{invitedEmail}</b>. The link can only be
            claimed by an account with that verified email.
          </p>
          <label htmlFor="invitation-link">Private invitation link</label>
          <input
            id="invitation-link"
            readOnly
            value={invitationLink}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className="auth-submit"
            onClick={() => void navigator.clipboard.writeText(invitationLink)}
            type="button"
          >
            Copy invitation link
          </button>
          <a className="auth-submit auth-submit-link" href={agreementLink}>
            Open created agreement
          </a>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="assetType">Rental type</label>
          <select
            id="assetType"
            onChange={(event) => {
              const next = event.target.value as typeof assetType;
              setAssetType(next);
              setTitle(
                next === "APARTMENT"
                  ? "Apartment security deposit"
                  : "Equipment security deposit",
              );
            }}
            value={assetType}
          >
            <option value="APARTMENT">Apartment security deposit</option>
            <option value="EQUIPMENT">Equipment security deposit</option>
          </select>
          <label htmlFor="title">Agreement name</label>
          <input
            id="title"
            name="title"
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
          <label htmlFor="address">
            {assetType === "APARTMENT"
              ? "Property location"
              : "Pickup / return location"}
          </label>
          <input id="address" name="address" maxLength={240} required />
          <label htmlFor="tenantEmail">Tenant’s verified email</label>
          <input
            id="tenantEmail"
            name="tenantEmail"
            onChange={(event) => setTenantEmail(event.target.value)}
            type="email"
            required
            value={tenantEmail}
          />
          <label htmlFor="amount">Refundable deposit · EUR</label>
          <input
            id="amount"
            inputMode="decimal"
            max="1000000"
            min="1"
            name="amount"
            onChange={(event) => setAmount(event.target.value)}
            required
            step="0.01"
            type="number"
            value={amount}
          />
          <div className="agreement-date-grid">
            <div>
              <label htmlFor="startDate">Rental starts</label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                required
                defaultValue="2026-11-01"
              />
            </div>
            <div>
              <label htmlFor="endDate">Rental ends</label>
              <input
                id="endDate"
                name="endDate"
                type="date"
                required
                defaultValue="2027-08-31"
              />
            </div>
          </div>
          <label htmlFor="terms">Terms and return expectations</label>
          <textarea
            id="terms"
            name="terms"
            minLength={10}
            maxLength={20_000}
            required
            rows={5}
            defaultValue="Both parties agree to the stated rental dates, condition checklist, and 48-hour return review. Any deduction requires mutual agreement."
          />
          <p className="agreement-demo-note">
            Demo only: funds are simulated. This creates a persistent agreement
            record, not a real escrow or payment.
          </p>
          <button className="auth-submit" disabled={pending} type="submit">
            {pending ? "Creating…" : "Create agreement and invite tenant"}
          </button>
        </form>
      )}
    </section>
  );
}
