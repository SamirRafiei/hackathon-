"use client";

import { ArrowLeft, FileText, KeyRound } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ContractLink } from "../contracts/contract-link";
import type { AgreementContract } from "../contracts/model";
import { BrowserContractStorage } from "../contracts/storage";
import {
  parseDemoDepositAmount,
  validateDemoAgreementInput,
  type DemoAgreementInput,
} from "@/features/demo/model";
import { DEMO_AGREEMENT_PRESETS } from "@/features/demo/agreement-presets";

type Props = {
  isLandlord: boolean;
  allowCancel?: boolean;
  onCancel: () => void;
  onCreate: (input: DemoAgreementInput) => void;
};

export default function AgreementSetupForm({
  isLandlord,
  allowCancel = true,
  onCancel,
  onCreate,
}: Props) {
  const initial = DEMO_AGREEMENT_PRESETS.APARTMENT;
  const [assetType, setAssetType] = useState(initial.assetType);
  const [title, setTitle] = useState(initial.title);
  const [address, setAddress] = useState(initial.address);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [amount, setAmount] = useState(String(initial.amountMinor / 100));
  const [terms, setTerms] = useState(initial.terms);
  const [error, setError] = useState("");
  const [contract, setContract] = useState<AgreementContract | null>(
    initial.contract,
  );
  const [uploading, setUploading] = useState(false);
  const storage = useMemo(() => new BrowserContractStorage(), []);
  const uploadSequence = useRef(0);
  const uploadInFlight = useRef(false);

  function selectExample(type: DemoAgreementInput["assetType"]) {
    const example = DEMO_AGREEMENT_PRESETS[type];
    if (uploadInFlight.current) return;
    setContract(example.contract);
    setAssetType(type);
    setTitle(example.title);
    setAddress(example.address);
    setStartDate(example.startDate);
    setEndDate(example.endDate);
    setAmount(String(example.amountMinor / 100));
    setTerms(example.terms);
    setError("");
  }

  async function attachContract(file?: File) {
    if (!file || !isLandlord || uploadInFlight.current) return;
    const sequence = ++uploadSequence.current;
    uploadInFlight.current = true;
    setUploading(true);
    setContract(null);
    setError("");
    try {
      const uploaded = await storage.upload(file);
      if (uploadSequence.current === sequence) setContract(uploaded);
    } catch (failure) {
      if (uploadSequence.current === sequence)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not attach the contract. Retry.",
        );
    } finally {
      uploadInFlight.current = false;
      setUploading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isLandlord) {
      setError("Switch to the landlord demo identity to create an agreement.");
      return;
    }
    if (uploadInFlight.current) {
      setError("Wait for the contract PDF to finish saving.");
      return;
    }
    if (!contract) {
      setError(
        "Attach a contract PDF before creating the agreement, or use the demo contract.",
      );
      return;
    }
    try {
      const input = validateDemoAgreementInput({
        assetType,
        title,
        address,
        startDate,
        endDate,
        amountMinor: parseDemoDepositAmount(amount),
        terms,
        contract,
      });
      onCreate(input);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check the agreement details and retry.",
      );
    }
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
            and accepts this exact version. You then publish the condition
            baseline for tenant review before funding becomes available.
          </p>
        </div>
      </div>

      <div className="setup-participant">
        <strong>
          {assetType === "APARTMENT"
            ? "Tenant for this walkthrough"
            : "Renter for this walkthrough"}
        </strong>
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

      <form className="setup-form" noValidate onSubmit={submit}>
        {error && (
          <div className="setup-hint" role="alert">
            {error}
          </div>
        )}
        <label htmlFor="asset-type">Rental type</label>
        <select
          id="asset-type"
          disabled={uploading}
          onChange={(event) =>
            selectExample(event.target.value as DemoAgreementInput["assetType"])
          }
          value={assetType}
        >
          <option value="APARTMENT">Apartment security deposit</option>
          <option value="EQUIPMENT">Equipment security deposit</option>
        </select>
        <p className="setup-warning">
          Changing rental type loads that example’s sample values. You can edit
          them before creating the agreement.
        </p>

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

        <div className="space-y-3 rounded-2xl border border-border p-4">
          <label htmlFor="agreement-contract">Contract PDF</label>
          <p className="setup-warning">
            Attach the contract the tenant will review with these terms. PDF
            only, up to 10 MB. Files stay in this browser; use fictional
            documents for the demo.
          </p>
          <input
            id="agreement-contract"
            type="file"
            accept="application/pdf,.pdf"
            disabled={!isLandlord || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void attachContract(file);
            }}
          />
          {uploading && <p role="status">Saving contract PDF…</p>}
          {contract && <ContractLink contract={contract} />}
          {contract && (
            <button
              className="secondary-action"
              type="button"
              disabled={uploading}
              onClick={() => setContract(null)}
            >
              Remove contract
            </button>
          )}
          {contract?.source !== "demo-preset" && (
            <button
              className="secondary-action"
              type="button"
              disabled={uploading}
              onClick={() =>
                setContract(DEMO_AGREEMENT_PRESETS[assetType].contract)
              }
            >
              Use demo contract PDF
            </button>
          )}
        </div>

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
          {allowCancel && (
            <button
              className="secondary-action"
              onClick={onCancel}
              type="button"
              disabled={uploading}
            >
              <ArrowLeft size={15} /> Back to agreement
            </button>
          )}
          <button
            className="primary-action"
            disabled={!isLandlord || uploading}
            type="submit"
          >
            Create and accept version 1
          </button>
        </div>
      </form>
    </section>
  );
}
