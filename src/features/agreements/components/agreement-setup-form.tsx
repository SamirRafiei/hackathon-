"use client";

import { ArrowLeft, FileText, KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { DemoAgreementInput } from "@/features/demo/model";

type Props = {
  isLandlord: boolean;
  onCancel: () => void;
  onCreate: (input: DemoAgreementInput) => void;
};

export default function AgreementSetupForm({
  isLandlord,
  onCancel,
  onCreate,
}: Props) {
  const [assetType, setAssetType] =
    useState<DemoAgreementInput["assetType"]>("APARTMENT");
  const [title, setTitle] = useState("Apartment security deposit");
  const [address, setAddress] = useState("18 Kertész utca, Budapest");
  const [startDate, setStartDate] = useState("2026-11-01");
  const [endDate, setEndDate] = useState("2027-08-31");
  const [amount, setAmount] = useState("1000");
  const [terms, setTerms] = useState(
    "Both parties agree to the stated rental dates, condition checklist, and 48-hour return review. Any deduction requires mutual agreement.",
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      assetType,
      title,
      address,
      startDate,
      endDate,
      amountMinor: Math.round(Number(amount) * 100),
      terms,
    });
  }

  return (
    <section aria-labelledby="setup-heading" className="setup-card">
      <div className="setup-heading">
        <span className="setup-heading-icon">
          <FileText size={18} />
        </span>
        <div>
          <p className="section-kicker">AGREEMENT SETUP · VERSION 1</p>
          <h2 id="setup-heading">Set the terms together</h2>
          <p>
            Create a simulated security-deposit agreement. The tenant reviews
            and accepts this exact version before funding becomes available.
          </p>
        </div>
      </div>

      <div className="setup-participant">
        <strong>Tenant for this walkthrough</strong>
        <span>
          Luca Martin · demo identity. No invitation is sent; after creation,
          switch to Tenant to review and accept the version.
        </span>
      </div>

      {!isLandlord && (
        <div className="setup-hint" role="status">
          Switch to the landlord demo identity to create an agreement.
        </div>
      )}

      <form className="setup-form" onSubmit={submit}>
        <label htmlFor="asset-type">Rental type</label>
        <select
          id="asset-type"
          onChange={(event) =>
            setAssetType(event.target.value as DemoAgreementInput["assetType"])
          }
          value={assetType}
        >
          <option value="APARTMENT">Apartment security deposit</option>
          <option value="EQUIPMENT">Equipment security deposit</option>
        </select>

        <label htmlFor="agreement-title">Agreement name</label>
        <input
          id="agreement-title"
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />

        <label htmlFor="agreement-address">
          {assetType === "APARTMENT"
            ? "Property location"
            : "Pickup / return location"}
        </label>
        <input
          id="agreement-address"
          maxLength={240}
          onChange={(event) => setAddress(event.target.value)}
          required
          value={address}
        />

        <label htmlFor="agreement-amount">Refundable deposit · EUR</label>
        <div className="input-with-prefix">
          <span>€</span>
          <input
            id="agreement-amount"
            inputMode="decimal"
            max="1000000"
            min="1"
            onChange={(event) => setAmount(event.target.value)}
            required
            step="0.01"
            type="number"
            value={amount}
          />
        </div>

        <div className="setup-date-grid">
          <div>
            <label htmlFor="agreement-start">Rental starts</label>
            <input
              id="agreement-start"
              onChange={(event) => setStartDate(event.target.value)}
              required
              type="date"
              value={startDate}
            />
          </div>
          <div>
            <label htmlFor="agreement-end">Rental ends</label>
            <input
              id="agreement-end"
              onChange={(event) => setEndDate(event.target.value)}
              required
              type="date"
              value={endDate}
            />
          </div>
        </div>

        <label htmlFor="agreement-terms">Terms and return expectations</label>
        <textarea
          id="agreement-terms"
          maxLength={20000}
          minLength={10}
          onChange={(event) => setTerms(event.target.value)}
          required
          rows={4}
          value={terms}
        />

        <div className="setup-policy">
          <KeyRound size={15} />
          <span>
            The demo uses a 48-hour return review. A split can settle only when
            both parties approve it.
          </span>
        </div>
        <p className="setup-warning">
          Creating this agreement replaces the current agreement in this
          browser’s demo data. Do not enter real personal or payment details.
          Reservation advances are not part of this flow yet.
        </p>
        <div className="setup-actions">
          <button className="secondary-action" onClick={onCancel} type="button">
            <ArrowLeft size={15} /> Back to agreement
          </button>
          <button
            className="primary-action"
            disabled={!isLandlord}
            type="submit"
          >
            Create and accept version 1
          </button>
        </div>
      </form>
    </section>
  );
}
