"use client";
import { useEffect, useMemo, useState } from "react";
import {
  type AgreementContract,
  contractName,
  presetContractUrl,
} from "./model";
import { BrowserContractStorage } from "./storage";
export function ContractLink({
  contract,
  onReady,
}: {
  contract: AgreementContract;
  onReady?: (ready: boolean) => void;
}) {
  const storage = useMemo(() => new BrowserContractStorage(), []);
  const [resource, setResource] = useState<{
    contract: AgreementContract;
    url: string;
  }>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    void attempt;
    let active = true;
    let release: (() => void) | undefined;
    setResource(undefined);
    setError("");
    onReady?.(contract.source === "demo-preset");
    if (contract.source === "browser-demo") {
      void storage
        .getUrl(contract)
        .then((result) => {
          release = result.release;
          if (active) {
            setResource({ contract, url: result.url });
            onReady?.(true);
          } else release();
        })
        .catch((failure: unknown) => {
          if (active)
            setError(
              failure instanceof Error
                ? failure.message
                : "Could not open the contract.",
            );
        });
    }
    return () => {
      active = false;
      release?.();
    };
  }, [contract, storage, attempt, onReady]);
  const href =
    presetContractUrl(contract) ??
    (resource?.contract === contract ? resource.url : undefined);
  return (
    <div className="setup-contract">
      {href ? (
        <a
          className="font-semibold break-words underline"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          Open contract PDF: {contractName(contract)}
        </a>
      ) : !error ? (
        <p role="status">Loading contract PDF…</p>
      ) : null}
      {contract.source === "demo-preset" && (
        <p className="setup-warning">
          Demo sample contract. Replace it with your PDF for a different
          agreement.
        </p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="secondary-action"
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry contract
          </button>
        </div>
      )}
    </div>
  );
}
