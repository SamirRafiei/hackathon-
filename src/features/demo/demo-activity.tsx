"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDollarSign,
  LockKeyhole,
} from "lucide-react";
import { formatMoney, type DemoAgreement } from "./model";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function DemoActivity({ agreement }: { agreement: DemoAgreement }) {
  return (
    <>
      <section
        aria-labelledby="activity-heading"
        className="activity-card"
        id="activity"
      >
        <div className="activity-header">
          <div>
            <p className="section-kicker">LOCAL DEMO RECORD</p>
            <h2 id="activity-heading">Agreement activity</h2>
          </div>
          <span className="activity-count">
            {agreement.activity.length} updates
          </span>
        </div>
        <div className="activity-list">
          {agreement.activity.map((item, index) => (
            <div className="activity-item" key={item.id}>
              <span
                className={`activity-marker ${index === 0 ? "activity-marker-current" : ""}`}
              >
                {index === 0 ? <Check size={14} /> : <span />}
              </span>
              <div className="activity-body">
                <strong>{item.description}</strong>
                <span>{item.actorName}</span>
              </div>
              <time dateTime={item.createdAt}>
                {dateTimeFormatter.format(new Date(item.createdAt))}
              </time>
            </div>
          ))}
        </div>
        <div className="activity-footer">
          <span>
            <LockKeyhole size={13} /> Visible to both demo identities in this
            browser
          </span>
          <button
            onClick={() =>
              document
                .getElementById("ledger")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            type="button"
          >
            View ledger <ChevronRight size={14} />
          </button>
        </div>
      </section>

      <section
        aria-labelledby="ledger-heading"
        className="ledger-card"
        id="ledger"
      >
        <div className="ledger-header">
          <div>
            <p className="section-kicker">SIMULATED TRANSACTIONS</p>
            <h2 id="ledger-heading">Demo ledger</h2>
          </div>
          <span className="ledger-badge">NO REAL FUNDS</span>
        </div>
        {agreement.ledger.length === 0 ? (
          <div className="ledger-empty">
            <span>
              <CircleDollarSign size={19} />
            </span>
            <p>
              <strong>No ledger entries yet</strong>
              <small>
                After both accept, simulated funding and settlement steps appear
                here.
              </small>
            </p>
          </div>
        ) : (
          <div className="ledger-entries">
            {agreement.ledger.map((entry) => (
              <div className="ledger-entry" key={entry.id}>
                <span
                  className={`ledger-entry-icon ${entry.amountMinor < 0 ? "ledger-out" : "ledger-in"}`}
                >
                  {entry.amountMinor < 0 ? (
                    <ArrowUpRight size={15} />
                  ) : (
                    <ArrowDownLeft size={15} />
                  )}
                </span>
                <div>
                  <strong>{ledgerAccountLabel(entry.account)}</strong>
                  <small>Operation {entry.operationId.slice(0, 15)}</small>
                </div>
                <span
                  className={
                    entry.amountMinor < 0
                      ? "ledger-amount ledger-negative"
                      : "ledger-amount"
                  }
                >
                  {entry.amountMinor > 0 ? "+" : ""}
                  {formatMoney(entry.amountMinor)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ledgerAccountLabel(
  account: DemoAgreement["ledger"][number]["account"],
) {
  switch (account) {
    case "renter_available":
      return "Tenant demo balance";
    case "agreement_reserved":
      return "Agreement reserved";
    case "renter_refund":
      return "Tenant refund";
    case "landlord_allocation":
      return "Landlord allocation";
  }
}
