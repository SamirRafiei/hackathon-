import Image from "next/image";
import Link from "next/link";

export function DemoHeader({
  view,
  isLandlord,
  onSwitchIdentity,
}: {
  view: "agreements" | "activity";
  isLandlord: boolean;
  onSwitchIdentity: (role: "landlord" | "tenant") => void;
}) {
  return (
    <header className="topbar">
      <a aria-label="Pact home" className="brand" href="#top">
        <Image
          src="/brand/pact.svg"
          alt="Pact"
          width={165}
          height={68}
          className="brand-logo"
          preload
        />
      </a>
      <nav aria-label="Main navigation" className="main-nav">
        <Link
          aria-current={view === "agreements" ? "page" : undefined}
          className={`nav-link ${view === "agreements" ? "nav-link-active" : ""}`}
          href={view === "agreements" ? "#agreement" : "/"}
        >
          Agreements
        </Link>
        <Link
          aria-current={view === "activity" ? "page" : undefined}
          className={`nav-link ${view === "activity" ? "nav-link-active" : ""}`}
          href="/activity"
        >
          Activity
        </Link>
      </nav>
      <div className="topbar-right">
        <span className="topbar-demo">
          <span /> DEMO MODE
        </span>
        <fieldset className="identity-switch">
          <legend className="sr-only">Choose a demo identity</legend>
          <button
            aria-pressed={isLandlord}
            className={
              isLandlord
                ? "identity-option identity-selected"
                : "identity-option"
            }
            onClick={() => onSwitchIdentity("landlord")}
            type="button"
          >
            <span className="avatar avatar-landlord">MP</span>
            <span>Landlord</span>
          </button>
          <button
            aria-pressed={!isLandlord}
            className={
              !isLandlord
                ? "identity-option identity-selected"
                : "identity-option"
            }
            onClick={() => onSwitchIdentity("tenant")}
            type="button"
          >
            <span className="avatar avatar-tenant">LM</span>
            <span>Tenant</span>
          </button>
        </fieldset>
        <a className="account-entry" href="/agreements/new">
          Use account
        </a>
      </div>
    </header>
  );
}
