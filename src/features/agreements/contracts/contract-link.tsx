"use client";
import { ExternalLink, FileText } from "lucide-react";
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
          className="group flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-3 no-underline transition-colors hover:border-[#91b879] hover:bg-[#f8fbf5]"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`View PDF: ${contractName(contract)} (opens in a new tab)`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-[#315f38]">
            <FileText aria-hidden="true" size={20} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold break-all text-foreground">
              {contractName(contract)}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              PDF document
            </span>
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-2 text-xs font-semibold text-foreground transition-colors group-hover:bg-primary">
            View PDF <ExternalLink aria-hidden="true" size={14} />
          </span>
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
