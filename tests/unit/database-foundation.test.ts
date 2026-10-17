// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { allocateContributions } from "../../src/lib/domain/allocation";
import type {
  OperationResult,
  OperationOutput,
} from "../../src/lib/domain/contracts";

const uid = (n: number) =>
  `00000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
const owner = uid(1),
  borrower = uid(2),
  secondBorrower = uid(3),
  stranger = uid(4),
  reviewer = uid(5),
  otherReviewer = uid(6);
const agreement = uid(100),
  otherAgreement = uid(101),
  version = uid(200);
const participant = uid(301),
  secondParticipant = uid(302);
const contribution = uid(401),
  secondContribution = uid(402),
  reviewCase = uid(501);
const evidence = uid(601),
  draftEvidence = uid(602);
const operation = uid(701),
  attempt = uid(801),
  transaction = uid(901),
  settlement = uid(1001);
let db: PGlite;

type FundingResult = OperationResult<
  OperationOutput<"startContribution"> &
    OperationOutput<"completeSimulatedContribution"> &
    OperationOutput<"processDueContributions"> &
    OperationOutput<"cancelAgreement">
>;
async function fundingCall(
  name: string,
  input: object,
): Promise<FundingResult> {
  const result = await db.query<{ result: FundingResult }>(
    `select public.${name}($1::jsonb) as result`,
    [JSON.stringify(input)],
  );
  return result.rows[0].result;
}
async function setupCall(name: string, input: object) {
  const result = await db.query<{ result: Record<string, unknown> }>(
    `select public.${name}($1::jsonb) as result`,
    [JSON.stringify(input)],
  );
  return result.rows[0].result;
}
function successful(result: FundingResult) {
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}
async function readyFunding() {
  await db.exec(`reset role;
    insert into public.acceptances(agreement_id,version_id,actor_id) values
      ('${agreement}','${version}','${owner}'),('${agreement}','${version}','${borrower}'),('${agreement}','${version}','${secondBorrower}');
    update public.agreements set state='awaiting_funding' where id='${agreement}'`);
}
async function startFunding(
  actor = borrower,
  contributionId = contribution,
  key = "start-1",
) {
  await db.exec("reset role");
  const revision = (
    await db.query<{ revision: string }>(
      `select revision::text from public.agreements where id='${agreement}'`,
    )
  ).rows[0].revision;
  await asUser(actor);
  return fundingCall("start_contribution", {
    agreementId: agreement,
    versionId: version,
    contributionId,
    expectedRevision: revision,
    idempotencyKey: key,
  });
}
async function completeFunding(attemptId: string, key = "complete-1") {
  await db.exec("reset role; set local role service_role");
  return fundingCall("complete_simulated_contribution", {
    attemptId,
    idempotencyKey: key,
  });
}
async function cancelAgreement(actor = borrower, key = "cancel-1") {
  await db.exec("reset role");
  const revision = (
    await db.query<{ revision: string }>(
      `select revision::text from public.agreements where id='${agreement}'`,
    )
  ).rows[0].revision;
  await asUser(actor);
  return fundingCall("cancel_agreement", {
    agreementId: agreement,
    expectedRevision: revision,
    idempotencyKey: key,
  });
}
const waitForDue = () => new Promise((resolve) => setTimeout(resolve, 2100));

// Only Supabase-owned infrastructure is stubbed. All PACT DDL/functions/policies
// below are the actual migrations executed by a real embedded PostgreSQL engine.
const bootstrap = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id), name text not null, unique(bucket_id, name));
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
`;

async function asUser(user: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
    user,
  ]);
  await db.exec("set local role authenticated");
}
async function rejected(sql: string, reason?: string) {
  await db.exec("savepoint expected_failure");
  try {
    await expect(db.exec(sql)).rejects.toThrow(reason);
  } finally {
    await db.exec("rollback to savepoint expected_failure");
  }
}
async function count(table: string) {
  const result = await db.query<{ count: number }>(
    `select count(*)::integer as count from public.${table}`,
  );
  return result.rows[0].count;
}
const operationSql = `insert into public.operation_requests (id, agreement_id, actor_id, actor_scope, operation, idempotency_key, payload_hash)
  values ('${operation}', '${agreement}', '${borrower}', 'user:${borrower}', 'startContribution', 'test-key', repeat('a',64));`;
const fundingSql = `
  ${operationSql}
  insert into public.payment_attempts (id, agreement_id, contribution_id, operation_id, due_at)
    values ('${attempt}', '${agreement}', '${contribution}', '${operation}', now());
  insert into public.ledger_transactions (id, agreement_id, currency, operation_id, kind, payment_attempt_id)
    values ('${transaction}', '${agreement}', 'EUR', '${operation}', 'funding', '${attempt}');
`;
const balancedEntries = `insert into public.ledger_entries (agreement_id, transaction_id, currency, account, contribution_id, amount_minor) values
  ('${agreement}', '${transaction}', 'EUR', 'simulated_source', '${contribution}', -15000),
  ('${agreement}', '${transaction}', 'EUR', 'restricted_deposit', null, 15000);`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(bootstrap);
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }
  await db.exec(`begin;
    insert into auth.users (id,email,email_confirmed_at) values
      ('${owner}','owner@example.com',now()), ('${borrower}','borrower@example.com',now()),
      ('${secondBorrower}','second@example.com',now()), ('${stranger}','stranger@example.com',now()),
      ('${reviewer}','reviewer@example.com',now()), ('${otherReviewer}','other@example.com',now()),
      ('${uid(7)}','unverified@example.com',null);
    insert into public.profiles (id,display_name) select id,split_part(email,'@',1) from auth.users;
    insert into public.reviewer_grants (user_id,granted_by) values ('${reviewer}','${owner}'), ('${otherReviewer}','${owner}');
    insert into public.agreements (id,owner_id,currency) values ('${agreement}','${owner}','EUR'), ('${otherAgreement}','${stranger}','USD');
    insert into public.participants (id,agreement_id,user_id,email,share_bps,allocated_minor,joined_at) values
      ('${participant}','${agreement}','${borrower}','borrower@example.com',6000,15000,now()),
      ('${secondParticipant}','${agreement}','${secondBorrower}','second@example.com',4000,10000,now());
    insert into public.agreement_versions (id,agreement_id,owner_id,version_number,currency,deposit_minor,
      item_name,item_description,terms,condition_requirements,starts_at,due_at)
      values ('${version}','${agreement}','${owner}',1,'EUR',25000,'Camera','Camera','Return safely','{}',now(),now()+interval '3 days');
    insert into public.version_participants (agreement_id,version_id,participant_id,email,share_bps,allocated_minor)
      select agreement_id,'${version}',id,email,share_bps,allocated_minor from public.participants where agreement_id='${agreement}';
    update public.agreements set current_version_id='${version}',state='awaiting_acceptance' where id='${agreement}';
    insert into public.contributions (id,agreement_id,version_id,participant_id,currency,amount_minor) values
      ('${contribution}','${agreement}','${version}','${participant}','EUR',15000),
      ('${secondContribution}','${agreement}','${version}','${secondParticipant}','EUR',10000);
    insert into public.review_cases (id,agreement_id,reason,assigned_reviewer_id,next_action)
      values ('${reviewCase}','${agreement}','overdue_return','${reviewer}','Review return evidence');
    insert into public.evidence_files (id,agreement_id,uploader_id,phase,object_path,mime_type,size_bytes,sha256,submitted_at) values
      ('${evidence}','${agreement}','${borrower}','item','${agreement}/item/${evidence}','image/jpeg',100,repeat('a',64),now()),
      ('${draftEvidence}','${agreement}','${borrower}','item','${agreement}/item/${draftEvidence}','image/jpeg',100,repeat('b',64),null);
    insert into storage.objects (bucket_id,name) values ('pact-evidence','${agreement}/item/${evidence}');
    insert into public.notifications (agreement_id,recipient_id,kind,deduplication_key,message)
      values ('${agreement}','${borrower}','status','status:1','Accept the agreement');
    commit;`);
}, 60000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback; reset role");
});
afterAll(async () => {
  await db?.close();
});

describe("migration and access foundation", () => {
  it("enables RLS on every application table", async () => {
    const result = await db.query(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    );
    expect(result.rows).toEqual([]);
  });
  it.each([owner, borrower, secondBorrower, reviewer])(
    "allows a participant or assigned reviewer %s to read the agreement",
    async (actor) => {
      await asUser(actor);
      expect(await count("agreements")).toBe(1);
      expect(await count("participants")).toBe(2);
      expect(await count("contributions")).toBe(2);
    },
  );
  it.each([stranger, otherReviewer])(
    "denies unrelated agreement and evidence access for %s",
    async (actor) => {
      await asUser(actor);
      const rows = await db.query(
        "select id from public.agreements where id=$1",
        [agreement],
      );
      expect(rows.rows).toEqual([]);
      for (const table of [
        "participants",
        "agreement_versions",
        "version_participants",
        "contributions",
        "evidence_files",
        "review_cases",
        "notifications",
      ]) {
        expect(await count(table)).toBe(0);
      }
    },
  );
  it("revoking a reviewer removes read access", async () => {
    await db.exec(
      `update public.reviewer_grants set revoked_at=now() where user_id='${reviewer}'`,
    );
    await asUser(reviewer);
    expect(await count("agreements")).toBe(0);
  });
  it("does not disclose unsubmitted evidence to another participant/reviewer", async () => {
    await asUser(owner);
    expect(await count("evidence_files")).toBe(1);
    await db.exec("reset role");
    await asUser(borrower);
    expect(await count("evidence_files")).toBe(2);
  });
  it("blocks all direct authoritative writes even for the owner", async () => {
    await asUser(owner);
    for (const table of [
      "agreements",
      "participants",
      "acceptances",
      "contributions",
      "payment_attempts",
      "ledger_entries",
      "settlements",
      "reviewer_decisions",
      "reviewer_grants",
      "job_runs",
    ]) {
      await rejected(`delete from public.${table}`, "permission denied");
    }
    await rejected(
      `update public.contributions set secured_minor=amount_minor`,
      "permission denied",
    );
    await rejected(
      `insert into public.acceptances(agreement_id,version_id,actor_id) values ('${agreement}','${version}','${owner}')`,
      "permission denied",
    );
  });
  it("keeps secrets and internal helpers inaccessible", async () => {
    await asUser(owner);
    for (const table of [
      "invitations",
      "verification_challenges",
      "operation_requests",
      "reviewer_grants",
      "job_runs",
    ]) {
      await rejected(`select * from public.${table}`, "permission denied");
    }
    await rejected(
      "select * from pact_private.allocate_contributions(1,'[]')",
      "permission denied",
    );
  });
  it("denies anonymous and service-role table access", async () => {
    await db.exec("set local role anon");
    await rejected("select * from public.agreements", "permission denied");
    await db.exec("reset role; set local role service_role");
    await rejected(
      "update public.contributions set secured_minor=amount_minor",
      "permission denied",
    );
  });
  it("permits only own display name and notification read state", async () => {
    await asUser(borrower);
    await db.exec(
      "update public.profiles set display_name='Updated' where id=auth.uid(); update public.notifications set read_at=now()",
    );
    await rejected(
      "update public.profiles set created_at=now()",
      "permission denied",
    );
    await rejected(
      "update public.notifications set message='forged'",
      "permission denied",
    );
    const result = await db.query(
      "update public.profiles set display_name='Impersonation' where id=$1 returning id",
      [owner],
    );
    expect(result.rows).toEqual([]);
  });
  it("requires authorized draft metadata for upload and forbids overwrite/finalized deletion", async () => {
    await asUser(borrower);
    await db.exec(
      `insert into storage.objects(bucket_id,name) values ('pact-evidence','${agreement}/item/${draftEvidence}')`,
    );
    await rejected(
      `insert into storage.objects(bucket_id,name) values ('pact-evidence','${agreement}/item/${uid(999)}')`,
      "row-level security",
    );
    const updated = await db.query(
      "update storage.objects set name='replacement' returning id",
    );
    expect(updated.rows).toEqual([]);
    const removed = await db.query(
      "delete from storage.objects returning name",
    );
    expect(removed.rows).toEqual([
      { name: `${agreement}/item/${draftEvidence}` },
    ]);
  });
  it("denies stranger storage reads and uploads", async () => {
    await asUser(stranger);
    expect((await db.query("select * from storage.objects")).rows).toEqual([]);
    await rejected(
      `insert into storage.objects(bucket_id,name) values ('pact-evidence','${agreement}/item/${draftEvidence}')`,
      "row-level security",
    );
  });
});

describe("authenticated agreement setup", () => {
  const newAgreementInput = (idempotencyKey = "create-one") => ({
    assetType: "APARTMENT",
    title: "Flat deposit",
    address: "10 Example Street",
    tenantEmail: "borrower@example.com",
    startDate: "2026-11-01",
    endDate: "2027-10-31",
    amountMinor: "125000",
    terms: "Return the property in the condition recorded at handover.",
    idempotencyKey,
  });

  it("creates a profile only for a signed-in verified user", async () => {
    const callProfile = async (name: string | null) => {
      const result = await db.query<{ result: Record<string, unknown> }>(
        "select public.ensure_profile($1::text) as result",
        [name],
      );
      return result.rows[0].result;
    };
    expect(await callProfile(null)).toMatchObject({
      ok: false,
      error: { code: "not_authenticated" },
    });
    await asUser(uid(7));
    expect(await callProfile("Unverified")).toMatchObject({
      ok: false,
      error: { code: "verified_email_required" },
    });
    await db.exec("reset role");
    await asUser(borrower);
    expect(await callProfile("Changed name")).toMatchObject({
      ok: true,
    });
    await db.exec("reset role");
    expect(
      (
        await db.query(
          `select display_name from public.profiles where id='${borrower}'`,
        )
      ).rows,
    ).toEqual([{ display_name: "borrower" }]);
  });

  it("creates an owner-bound agreement and replays creation idempotently", async () => {
    await asUser(owner);
    const input = newAgreementInput();
    const first = await setupCall("create_agreement", input);
    expect(first).toMatchObject({ ok: true, replayed: false });
    const data = first.data as Record<string, unknown>;
    expect(data.invitationToken).toEqual(expect.any(String));
    expect(data.invitationExpiresAt).toEqual(expect.any(String));
    const replay = await setupCall("create_agreement", input);
    expect(replay).toEqual({ ...first, replayed: true });
    await db.exec("reset role");
    expect(await count("agreements")).toBe(3);
    expect(await count("agreement_versions")).toBe(2);
    expect(await count("acceptances")).toBe(1);
    expect(await count("invitations")).toBe(1);
    expect(await count("audit_events")).toBe(1);
  });

  it("rejects unauthenticated creation, invalid inputs, and key reuse with changed data", async () => {
    expect(
      await setupCall("create_agreement", newAgreementInput()),
    ).toMatchObject({
      ok: false,
      error: { code: "not_authenticated" },
    });
    await asUser(owner);
    expect(
      await setupCall("create_agreement", {
        ...newAgreementInput(),
        amountMinor: "0",
      }),
    ).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    const first = await setupCall(
      "create_agreement",
      newAgreementInput("same-key"),
    );
    expect(first.ok).toBe(true);
    expect(
      await setupCall("create_agreement", {
        ...newAgreementInput("same-key"),
        title: "Changed terms",
      }),
    ).toMatchObject({ ok: false, error: { code: "idempotency_conflict" } });
  });

  it("limits invitation claims to the invited verified email and accepts only the published version", async () => {
    await asUser(owner);
    const created = await setupCall("create_agreement", newAgreementInput());
    const createdData = created.data as Record<string, unknown>;
    const invitationToken = createdData.invitationToken as string;
    await db.exec("reset role");
    await asUser(stranger);
    expect(
      await setupCall("claim_invitation", {
        invitationToken,
        idempotencyKey: "wrong-email",
      }),
    ).toMatchObject({ ok: false, error: { code: "invitation_invalid" } });
    await db.exec("reset role");
    await asUser(borrower);
    const claimed = await setupCall("claim_invitation", {
      invitationToken,
      idempotencyKey: "claim-once",
    });
    expect(claimed).toMatchObject({ ok: true, replayed: false });
    expect(
      await setupCall("claim_invitation", {
        invitationToken,
        idempotencyKey: "claim-once",
      }),
    ).toEqual({ ...claimed, replayed: true });
    const claimedData = claimed.data as Record<string, unknown>;
    const acceptInput = {
      agreementId: createdData.agreementId,
      versionId: createdData.versionId,
      expectedRevision: claimedData.revision,
      idempotencyKey: "accept-once",
    };
    const accepted = await setupCall("accept_agreement_version", acceptInput);
    expect(accepted).toMatchObject({
      ok: true,
      replayed: false,
      data: { agreement: { state: "awaiting_funding" } },
    });
    expect(await setupCall("accept_agreement_version", acceptInput)).toEqual({
      ...accepted,
      replayed: true,
    });
    await db.exec("reset role");
    expect(await count("acceptances")).toBe(2);
    expect(await count("audit_events")).toBe(3);
  });

  it("keeps terms pending until the invited party joins and rejects stale acceptance", async () => {
    await asUser(owner);
    const created = await setupCall("create_agreement", newAgreementInput());
    const data = created.data as Record<string, unknown>;
    const accepted = await setupCall("accept_agreement_version", {
      agreementId: data.agreementId,
      versionId: data.versionId,
      expectedRevision: data.revision,
      idempotencyKey: "owner-acceptance",
    });
    expect(accepted).toMatchObject({
      ok: true,
      data: { agreement: { state: "awaiting_acceptance" } },
    });
    expect(
      await setupCall("accept_agreement_version", {
        agreementId: data.agreementId,
        versionId: data.versionId,
        expectedRevision: data.revision,
        idempotencyKey: "stale-acceptance",
      }),
    ).toMatchObject({ ok: false, error: { code: "stale_revision" } });
  });
});

describe("database integrity", () => {
  it("matches TypeScript largest-remainder results", async () => {
    for (const amount of [3, 101, 25000, 100000000]) {
      for (const weights of [
        [6000, 4000],
        [3333, 3333, 3334],
        [5000, 5000],
      ]) {
        const split = weights.map((shareBps, i) => ({
          participantId: uid(300 + i),
          shareBps,
        }));
        const sql = await db.query<{
          participant_id: string;
          share_bps: number;
          amount_minor: number;
        }>("select * from pact_private.allocate_contributions($1,$2::jsonb)", [
          amount,
          JSON.stringify(split),
        ]);
        expect(
          sql.rows.map((row) => ({
            participantId: row.participant_id,
            shareBps: row.share_bps,
            amountMinor: Number(row.amount_minor),
          })),
        ).toEqual(
          allocateContributions(
            { currency: "EUR", amountMinor: amount },
            split,
          ),
        );
      }
    }
  });
  it("rejects duplicate borrowers, self-borrowing, and unverified membership", async () => {
    await rejected(
      `insert into public.participants(agreement_id,email,share_bps,allocated_minor) values ('${agreement}','borrower@example.com',1000,1)`,
      "duplicate key",
    );
    await rejected(
      `insert into public.participants(agreement_id,email,share_bps,allocated_minor) values ('${agreement}','owner@example.com',1000,1)`,
      "owner_cannot_borrow",
    );
    await rejected(
      `insert into public.participants(agreement_id,user_id,email,share_bps,allocated_minor,joined_at) values ('${agreement}','${uid(7)}','unverified@example.com',1000,1,now())`,
      "verified_email_required",
    );
  });
  it("rejects malformed and zero-amount SQL allocations", async () => {
    await rejected(
      `select * from pact_private.allocate_contributions(100,'[{"participantId":"${participant}","shareBps":9999}]')`,
      "invalid_split",
    );
    await rejected(
      `select * from pact_private.allocate_contributions(1,'[{"participantId":"${participant}","shareBps":5000},{"participantId":"${secondParticipant}","shareBps":5000}]')`,
      "deposit_too_small",
    );
    await rejected(
      `select * from pact_private.allocate_contributions(100,'[]')`,
      "invalid_participant_count",
    );
  });
  it("only records acceptance by a current version participant", async () => {
    await rejected(
      `insert into public.acceptances(agreement_id,version_id,actor_id) values ('${agreement}','${version}','${stranger}')`,
      "acceptance_actor_not_participant",
    );
  });
  it("freezes membership and versions after funding", async () => {
    await db.exec(
      `update public.agreements set terms_frozen_at=now() where id='${agreement}'`,
    );
    await rejected(
      `update public.participants set share_bps=5000 where id='${participant}'`,
      "membership_frozen",
    );
    await rejected(
      `update public.agreements set current_version_id=null where id='${agreement}'`,
      "terms_frozen",
    );
  });
  it("rejects cross-agreement references and mismatched currencies", async () => {
    await rejected(
      `insert into public.acceptances(agreement_id,version_id,actor_id) values ('${otherAgreement}','${version}','${owner}')`,
      "stale_version",
    );
    await rejected(
      `insert into public.change_requests(agreement_id,version_id,proposed_by,proposed_changes,reason) values ('${otherAgreement}','${version}','${borrower}','{}','Change')`,
      "foreign key",
    );
    await rejected(
      `update public.contributions set currency='USD' where id='${contribution}'`,
      "contribution_identity_immutable",
    );
    await rejected(
      `insert into public.ledger_transactions(agreement_id,currency,operation_id,kind,payment_attempt_id) values ('${agreement}','USD','${operation}','funding','${attempt}')`,
      "foreign key",
    );
  });
  it("protects immutable versions, snapshots, acceptances and submitted evidence", async () => {
    await rejected(
      `update public.agreement_versions set deposit_minor=1 where id='${version}'`,
      "append-only",
    );
    await rejected(
      `update public.version_participants set allocated_minor=1`,
      "append-only",
    );
    await rejected(
      `insert into public.version_participants(agreement_id,version_id,participant_id,email,share_bps,allocated_minor) values ('${agreement}','${version}','${participant}','borrower@example.com',6000,15000)`,
      "immutable_parent",
    );
    await db.exec(
      `insert into public.acceptances(agreement_id,version_id,actor_id) values ('${agreement}','${version}','${owner}')`,
    );
    await rejected(`delete from public.acceptances`, "append-only");
    await rejected(
      `delete from public.evidence_files where id='${evidence}'`,
      "submitted_evidence_immutable",
    );
  });
  it("enforces the 48-hour return-review policy and exactly-once timestamp", async () => {
    await rejected(
      `update public.agreements set handover_at=now(),returned_at=now(),inspection_deadline=now()+interval '1 hour' where id='${agreement}'`,
      "check constraint",
    );
    await db.exec(
      `update public.agreements set handover_at=now(),returned_at=now(),inspection_deadline=now()+interval '48 hours' where id='${agreement}'`,
    );
    await rejected(
      `update public.agreements set returned_at=returned_at+interval '1 second' where id='${agreement}'`,
      "receipt_already_recorded",
    );
    expect(
      (
        await db.query<{ revision: number }>(
          `select revision from public.agreements where id='${agreement}'`,
        )
      ).rows[0].revision,
    ).toBe(2);
  });
  it("requires complete, correctly allocated version snapshots at transaction end", async () => {
    await rejected(
      `insert into public.agreement_versions(agreement_id,owner_id,version_number,currency,deposit_minor,item_name,item_description,terms,condition_requirements,starts_at,due_at)
      values ('${agreement}','${owner}',2,'EUR',25000,'Camera','','Terms','{}',now(),now()+interval '1 day'); set constraints all immediate`,
      "borrowers_required",
    );
    await rejected(
      `insert into public.agreement_versions(id,agreement_id,owner_id,version_number,currency,deposit_minor,item_name,item_description,terms,condition_requirements,starts_at,due_at)
      values ('${uid(201)}','${agreement}','${owner}',2,'EUR',25001,'Camera','','Terms','{}',now(),now()+interval '1 day');
      insert into public.version_participants(agreement_id,version_id,participant_id,email,share_bps,allocated_minor)
      select agreement_id,'${uid(201)}',id,email,share_bps,allocated_minor from public.participants where agreement_id='${agreement}'; set constraints all immediate`,
      "invalid_allocated_snapshot",
    );
  });
  it("enforces actor/operation/key uniqueness and immutable payment outcomes", async () => {
    await db.exec(operationSql);
    await rejected(
      `insert into public.operation_requests(agreement_id,actor_id,actor_scope,operation,idempotency_key,payload_hash)
      values ('${agreement}','${borrower}','user:${borrower}','startContribution','test-key',repeat('b',64))`,
      "duplicate key",
    );
    await db.exec(
      `update public.operation_requests set status='succeeded',result='{}',completed_at=now() where id='${operation}'`,
    );
    await rejected(
      `update public.operation_requests set result='{"changed":true}' where id='${operation}'`,
      "outcome_immutable",
    );
  });
  it("checks balanced postings at transaction end and preserves append-only history", async () => {
    await rejected(
      `${fundingSql} set constraints all immediate`,
      "unbalanced_ledger",
    );
    await rejected(
      `${fundingSql} insert into public.ledger_entries(agreement_id,transaction_id,currency,account,contribution_id,amount_minor)
      values ('${agreement}','${transaction}','EUR','simulated_source','${contribution}',-15000); set constraints all immediate`,
      "unbalanced_ledger",
    );
    await db.exec(
      `${fundingSql} ${balancedEntries} set constraints all immediate`,
    );
    expect(await count("ledger_entries")).toBe(2);
    await rejected(
      "update public.ledger_entries set amount_minor=1",
      "append-only",
    );
    await rejected("delete from public.ledger_transactions", "append-only");
  });
  it("requires settlement allocations to cover every secured contribution exactly", async () => {
    await db.exec(
      `${operationSql} update public.contributions set secured_minor=amount_minor,state='secured';`,
    );
    const insert = `insert into public.settlements(id,agreement_id,currency,operation_id,reason,secured_minor,owner_minor,refunded_minor)
      values ('${settlement}','${agreement}','EUR','${operation}','cancellation',25000,0,25000);`;
    await rejected(
      `${insert} set constraints all immediate`,
      "settlement_totals_mismatch",
    );
    await db.exec(`${insert}
      insert into public.settlement_allocations(agreement_id,settlement_id,contribution_id,secured_minor,deducted_minor,refunded_minor)
      select agreement_id,'${settlement}',id,secured_minor,0,secured_minor from public.contributions;
      set constraints all immediate;`);
    expect(await count("settlement_allocations")).toBe(2);
    await rejected(
      `update public.settlements set owner_minor=1`,
      "append-only",
    );
  });
  it("never allocates a refund to an unfunded contribution", async () => {
    await db.exec(operationSql);
    await rejected(
      `insert into public.settlements(id,agreement_id,currency,operation_id,reason,secured_minor,owner_minor,refunded_minor)
      values ('${settlement}','${agreement}','EUR','${operation}','cancellation',15000,0,15000);
      insert into public.settlement_allocations(agreement_id,settlement_id,contribution_id,secured_minor,deducted_minor,refunded_minor)
      values ('${agreement}','${settlement}','${contribution}',15000,0,15000);
      set constraints all immediate`,
      "settlement_secured_mismatch",
    );
  });
  it("prevents a participant reviewer assignment and unassigned decisions", async () => {
    await db.exec(
      `insert into public.reviewer_grants(user_id,granted_by) values ('${borrower}','${owner}')`,
    );
    await rejected(
      `update public.review_cases set assigned_reviewer_id='${borrower}' where id='${reviewCase}'`,
      "independent_reviewer_required",
    );
    await rejected(
      `insert into public.reviewer_decisions(agreement_id,case_id,reviewer_id,kind,explanation,policy_basis)
      values ('${agreement}','${reviewCase}','${otherReviewer}','receipt_unconfirmed','Insufficient evidence','Receipt policy')`,
      "reviewer_not_assigned",
    );
  });
  it("deduplicates persisted notifications", async () => {
    await rejected(
      `insert into public.notifications(agreement_id,recipient_id,kind,deduplication_key,message)
      values ('${agreement}','${borrower}','status','status:1','Repeated')`,
      "duplicate key",
    );
  });
});

describe("Stage 2 funding and cancellation", () => {
  it("cancels a processing attempt if its accepted version is superseded", async () => {
    await readyFunding();
    const started = successful(await startFunding());
    await db.exec(`reset role;
      insert into public.agreement_versions(id,agreement_id,owner_id,version_number,currency,deposit_minor,item_name,item_description,terms,condition_requirements,starts_at,due_at)
        select '${uid(202)}',agreement_id,owner_id,2,currency,deposit_minor,item_name,item_description,terms,condition_requirements,starts_at,due_at
        from public.agreement_versions where id='${version}';
      insert into public.version_participants(agreement_id,version_id,participant_id,email,share_bps,allocated_minor)
        select agreement_id,'${uid(202)}',participant_id,email,share_bps,allocated_minor from public.version_participants where version_id='${version}';
      update public.agreements set current_version_id='${uid(202)}',state='awaiting_acceptance' where id='${agreement}';`);
    expect(
      successful(await completeFunding(started.attemptId)).attemptState,
    ).toBe("cancelled");
    await db.exec("reset role; set constraints all immediate");
    expect(await count("ledger_entries")).toBe(0);
  });
  it("records worker failures while rolling back all batch financial changes", async () => {
    await readyFunding();
    successful(await startFunding());
    await waitForDue();
    await db.exec(`reset role;
      create function pg_temp.fail_batch_audit() returns trigger language plpgsql as $$ begin
        if new.action='contribution_succeeded' then raise exception 'private_failure'; end if; return new; end $$;
      create trigger test_batch_audit before insert on public.audit_events for each row execute function pg_temp.fail_batch_audit();
      set local role service_role;`);
    expect(
      await fundingCall("process_due_contributions", {
        batchSize: 10,
        idempotencyKey: "failed-batch",
      }),
    ).toMatchObject({ ok: false, error: { code: "temporarily_unavailable" } });
    await db.exec("reset role");
    expect(await count("ledger_entries")).toBe(0);
    expect(
      (await db.query("select status,error_code from public.job_runs")).rows,
    ).toEqual([{ status: "failed", error_code: "payment_worker_failed" }]);
    await db.exec(
      "drop trigger test_batch_audit on public.audit_events; set local role service_role",
    );
    expect(
      successful(
        await fundingCall("process_due_contributions", {
          batchSize: 10,
          idempotencyKey: "recovered-batch",
        }),
      ).processedCount,
    ).toBe(1);
  });
  it.each([owner, stranger, reviewer, secondBorrower])(
    "rejects funding another borrower's share: %s",
    async (actor) => {
      await readyFunding();
      expect(await startFunding(actor)).toMatchObject({
        ok: false,
        error: { code: "not_authorized" },
      });
      await db.exec("reset role");
      expect(await count("payment_attempts")).toBe(0);
    },
  );
  it("requires owner and every borrower to accept, even when state claims funding is ready", async () => {
    await db.exec(
      `update public.agreements set state='awaiting_funding' where id='${agreement}'`,
    );
    expect(await startFunding()).toMatchObject({
      ok: false,
      error: { code: "acceptances_required" },
    });
    await db.exec(`reset role; insert into public.acceptances(agreement_id,version_id,actor_id) values
      ('${agreement}','${version}','${owner}'),('${agreement}','${version}','${borrower}')`);
    expect(await startFunding()).toMatchObject({
      ok: false,
      error: { code: "acceptances_required" },
    });
  });

  describe("Stage 2B cancellation and refunds", () => {
    it("authorizes any participant, rejects strangers and forbids cancellation after handover", async () => {
      await readyFunding();
      expect(await cancelAgreement(stranger)).toMatchObject({
        ok: false,
        error: { code: "not_authorized" },
      });
      await db.exec(`reset role;
        update public.agreements set state='active',handover_at=now() where id='${agreement}'`);
      expect(
        await cancelAgreement(secondBorrower, "after-handover"),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_state" },
      });
      await db.exec("reset role");
      expect(await count("settlements")).toBe(0);
    });

    it("cancels with zero secured funds without inventing refunds or ledger entries", async () => {
      const result = successful(await cancelAgreement(owner));
      expect(result.agreement.state).toBe("cancelled");
      await db.exec("reset role; set constraints all immediate");
      expect(
        (
          await db.query(
            "select reason,secured_minor,owner_minor,refunded_minor from public.settlements",
          )
        ).rows,
      ).toEqual([
        {
          reason: "cancellation",
          secured_minor: 0,
          owner_minor: 0,
          refunded_minor: 0,
        },
      ]);
      expect(await count("settlement_allocations")).toBe(0);
      expect(await count("ledger_transactions")).toBe(0);
      expect(await count("ledger_entries")).toBe(0);
      expect(
        (
          await db.query(
            "select state,secured_minor,refunded_minor from public.contributions order by id",
          )
        ).rows,
      ).toEqual([
        { state: "awaiting_payment", secured_minor: 0, refunded_minor: 0 },
        { state: "awaiting_payment", secured_minor: 0, refunded_minor: 0 },
      ]);
    });

    it("refunds only secured borrower contributions in a partially funded group", async () => {
      await readyFunding();
      const started = successful(await startFunding());
      await waitForDue();
      expect(
        successful(await completeFunding(started.attemptId)).attemptState,
      ).toBe("succeeded");
      expect(
        successful(await cancelAgreement(secondBorrower)).agreement.state,
      ).toBe("cancelled");
      await db.exec("reset role; set constraints all immediate");
      expect(
        (
          await db.query(
            "select secured_minor,owner_minor,refunded_minor from public.settlements",
          )
        ).rows,
      ).toEqual([
        { secured_minor: 15000, owner_minor: 0, refunded_minor: 15000 },
      ]);
      expect(
        (
          await db.query(
            "select c.id,c.state,c.secured_minor,c.refunded_minor from public.contributions c order by c.id",
          )
        ).rows,
      ).toEqual([
        {
          id: contribution,
          state: "refunded",
          secured_minor: 15000,
          refunded_minor: 15000,
        },
        {
          id: secondContribution,
          state: "awaiting_payment",
          secured_minor: 0,
          refunded_minor: 0,
        },
      ]);
      expect(
        (
          await db.query(
            "select contribution_id,secured_minor,refunded_minor from public.settlement_allocations",
          )
        ).rows,
      ).toEqual([
        {
          contribution_id: contribution,
          secured_minor: 15000,
          refunded_minor: 15000,
        },
      ]);
      expect(await count("ledger_entries")).toBe(4);
      expect(
        (
          await db.query(
            "select sum(amount_minor)::integer as balance from public.ledger_entries where account='restricted_deposit'",
          )
        ).rows,
      ).toEqual([{ balance: 0 }]);
    });

    it("reconciles in-flight success before refunding and replays cancellation idempotently", async () => {
      await readyFunding();
      const started = successful(await startFunding());
      await db.exec("reset role");
      const revision = (
        await db.query<{ revision: string }>(
          `select revision::text from public.agreements where id='${agreement}'`,
        )
      ).rows[0].revision;
      const input = {
        agreementId: agreement,
        expectedRevision: revision,
        idempotencyKey: "in-flight-cancel",
      };
      await asUser(owner);
      const first = await fundingCall("cancel_agreement", input);
      expect(successful(first).agreement.state).toBe("cancelled");
      expect(await fundingCall("cancel_agreement", input)).toEqual({
        ...first,
        replayed: true,
      });
      expect(
        await completeFunding(started.attemptId, "complete-after-cancel"),
      ).toMatchObject({
        ok: false,
        error: { code: "already_processed" },
      });
      await db.exec("reset role; set constraints all immediate");
      expect(
        (
          await db.query(
            `select p.state as attempt_state,c.state as contribution_state,c.secured_minor,c.refunded_minor
             from public.payment_attempts p join public.contributions c on c.id=p.contribution_id
             where p.id='${started.attemptId}'`,
          )
        ).rows,
      ).toEqual([
        {
          attempt_state: "succeeded",
          contribution_state: "refunded",
          secured_minor: 15000,
          refunded_minor: 15000,
        },
      ]);
      expect(await count("ledger_transactions")).toBe(2);
      expect(await count("ledger_entries")).toBe(4);
      expect(await count("settlements")).toBe(1);
    });

    it("reconciles a failed in-flight attempt without refunding it", async () => {
      await readyFunding();
      await db.exec(
        `insert into pact_private.simulated_failure_fixtures values ('${contribution}',1)`,
      );
      const started = successful(await startFunding());
      expect(successful(await cancelAgreement()).agreement.state).toBe(
        "cancelled",
      );
      await db.exec("reset role; set constraints all immediate");
      expect(
        (
          await db.query(
            `select p.state as attempt_state,c.state as contribution_state,c.secured_minor,c.refunded_minor
             from public.payment_attempts p join public.contributions c on c.id=p.contribution_id
             where p.id='${started.attemptId}'`,
          )
        ).rows,
      ).toEqual([
        {
          attempt_state: "failed",
          contribution_state: "failed",
          secured_minor: 0,
          refunded_minor: 0,
        },
      ]);
      expect(await count("settlement_allocations")).toBe(0);
      expect(await count("ledger_transactions")).toBe(0);
      expect(await count("ledger_entries")).toBe(0);
    });

    it("reconciles every pending borrower attempt before refunding secured outcomes", async () => {
      await readyFunding();
      await db.exec(
        `insert into pact_private.simulated_failure_fixtures values ('${secondContribution}',1)`,
      );
      const succeeded = successful(await startFunding());
      const failed = successful(
        await startFunding(
          secondBorrower,
          secondContribution,
          "second-pending",
        ),
      );
      expect(successful(await cancelAgreement()).agreement.state).toBe(
        "cancelled",
      );
      await db.exec("reset role; set constraints all immediate");
      expect(
        (
          await db.query(
            `select p.id,p.state as attempt_state,c.state as contribution_state,c.secured_minor,c.refunded_minor
             from public.payment_attempts p join public.contributions c on c.id=p.contribution_id order by c.id`,
          )
        ).rows,
      ).toEqual([
        {
          id: succeeded.attemptId,
          attempt_state: "succeeded",
          contribution_state: "refunded",
          secured_minor: 15000,
          refunded_minor: 15000,
        },
        {
          id: failed.attemptId,
          attempt_state: "failed",
          contribution_state: "failed",
          secured_minor: 0,
          refunded_minor: 0,
        },
      ]);
      expect(
        (
          await db.query(
            "select secured_minor,refunded_minor from public.settlements",
          )
        ).rows,
      ).toEqual([{ secured_minor: 15000, refunded_minor: 15000 }]);
      expect(await count("settlement_allocations")).toBe(1);
      expect(await count("ledger_transactions")).toBe(2);
      expect(await count("ledger_entries")).toBe(4);
    });

    it("rejects stale revisions and changed-key payloads without duplicate refunds", async () => {
      await readyFunding();
      const started = successful(await startFunding());
      await waitForDue();
      successful(await completeFunding(started.attemptId));
      await db.exec("reset role");
      const revision = (
        await db.query<{ revision: string }>(
          `select revision::text from public.agreements where id='${agreement}'`,
        )
      ).rows[0].revision;
      await asUser(owner);
      const input = {
        agreementId: agreement,
        expectedRevision: revision,
        idempotencyKey: "cancel-once",
      };
      const first = await fundingCall("cancel_agreement", input);
      expect(
        await fundingCall("cancel_agreement", {
          ...input,
          expectedRevision: (BigInt(revision) - BigInt(1)).toString(),
        }),
      ).toMatchObject({ ok: false, error: { code: "idempotency_conflict" } });
      expect(
        await fundingCall("cancel_agreement", {
          ...input,
          idempotencyKey: "cancel-again",
        }),
      ).toMatchObject({ ok: false, error: { code: "already_processed" } });
      expect(successful(first).agreement.state).toBe("cancelled");
      await db.exec("reset role");
      expect(await count("settlements")).toBe(1);
      expect(await count("ledger_entries")).toBe(4);
    });

    it("rolls back reconciliation, refunds, settlement and state when audit persistence fails", async () => {
      await readyFunding();
      const started = successful(await startFunding());
      await db.exec(`reset role;
        create function pg_temp.fail_cancellation_audit() returns trigger language plpgsql as $$ begin
          if new.action='agreement_cancelled' then raise exception 'private_audit_failure'; end if; return new; end $$;
        create trigger test_cancellation_audit before insert on public.audit_events
          for each row execute function pg_temp.fail_cancellation_audit();`);
      const revision = (
        await db.query<{ revision: string }>(
          `select revision::text from public.agreements where id='${agreement}'`,
        )
      ).rows[0].revision;
      await asUser(owner);
      await rejected(
        `select public.cancel_agreement('{"agreementId":"${agreement}","expectedRevision":"${revision}","idempotencyKey":"rollback-cancel"}'::jsonb)`,
        "private_audit_failure",
      );
      await db.exec("reset role");
      expect(await count("settlements")).toBe(0);
      expect(await count("ledger_transactions")).toBe(0);
      expect(await count("ledger_entries")).toBe(0);
      expect(
        (
          await db.query(
            `select state,secured_minor,refunded_minor from public.contributions where id='${contribution}'`,
          )
        ).rows,
      ).toEqual([{ state: "processing", secured_minor: 0, refunded_minor: 0 }]);
      expect(
        (
          await db.query(
            `select state from public.payment_attempts where id='${started.attemptId}'`,
          )
        ).rows,
      ).toEqual([{ state: "processing" }]);
      expect(
        (
          await db.query(
            `select state from public.agreements where id='${agreement}'`,
          )
        ).rows,
      ).toEqual([{ state: "awaiting_funding" }]);
    });
  });
  it("rejects unclaimed, changed, or unverified snapshot membership", async () => {
    await readyFunding();
    await db.exec(
      `update auth.users set email_confirmed_at=null where id='${secondBorrower}'`,
    );
    expect(await startFunding()).toMatchObject({
      ok: false,
      error: { code: "acceptances_required" },
    });
  });
  it("validates RPC inputs and rejects stale versions/revisions and forbidden outcomes", async () => {
    await readyFunding();
    await asUser(borrower);
    const input = {
      agreementId: agreement,
      versionId: version,
      contributionId: contribution,
      expectedRevision: "2",
      idempotencyKey: "v",
    };
    for (const change of [
      { expectedRevision: "-1" },
      { expectedRevision: "999999999999999999999" },
      { outcome: "succeeded" },
      { contributionId: "invalid" },
      { idempotencyKey: "" },
    ]) {
      expect(
        await fundingCall("start_contribution", { ...input, ...change }),
      ).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    }
    expect(
      await fundingCall("start_contribution", {
        ...input,
        expectedRevision: "0",
      }),
    ).toMatchObject({ ok: false, error: { code: "stale_revision" } });
    expect(
      await fundingCall("start_contribution", {
        ...input,
        versionId: uid(999),
      }),
    ).toMatchObject({ ok: false, error: { code: "stale_version" } });
  });
  it("persists processing without posting funds and forbids early/client completion", async () => {
    await readyFunding();
    const started = successful(await startFunding());
    expect(started.agreement.state).toBe("awaiting_funding");
    expect(await count("ledger_entries")).toBe(0);
    await rejected(
      `select public.complete_simulated_contribution('{"attemptId":"${started.attemptId}","idempotencyKey":"x"}')`,
      "permission denied",
    );
    await rejected(
      `select public.process_due_contributions('{"batchSize":1,"idempotencyKey":"x"}')`,
      "permission denied",
    );
    expect(await completeFunding(started.attemptId)).toMatchObject({
      ok: false,
      error: { code: "temporarily_unavailable", retryable: true },
    });
    await db.exec("reset role");
    expect(
      (
        await db.query(
          `select state,secured_minor from public.contributions where id='${contribution}'`,
        )
      ).rows,
    ).toEqual([{ state: "processing", secured_minor: 0 }]);
    expect(await count("operation_requests")).toBe(1);
  });
  it("replays the original start result before stale-revision checks and rejects changed payloads", async () => {
    await readyFunding();
    await asUser(borrower);
    const input = {
      agreementId: agreement,
      versionId: version,
      contributionId: contribution,
      expectedRevision: "2",
      idempotencyKey: "same",
    };
    const first = await fundingCall("start_contribution", input);
    const duplicate = await fundingCall("start_contribution", input);
    expect(duplicate).toEqual({ ...first, replayed: true });
    expect(
      await fundingCall("start_contribution", {
        ...input,
        expectedRevision: "3",
      }),
    ).toMatchObject({ ok: false, error: { code: "idempotency_conflict" } });
    expect(await startFunding(borrower, contribution, "new-key")).toMatchObject(
      { ok: false, error: { code: "invalid_state" } },
    );
    await db.exec("reset role");
    expect(await count("payment_attempts")).toBe(1);
  });
  it("funds both borrowers separately, balances the ledger, freezes terms and gates handover", async () => {
    await readyFunding();
    const first = successful(await startFunding());
    const second = successful(
      await startFunding(secondBorrower, secondContribution, "start-2"),
    );
    await waitForDue();
    const one = successful(await completeFunding(first.attemptId));
    expect(one.attemptState).toBe("succeeded");
    expect(one.agreement.state).toBe("awaiting_funding");
    const two = successful(
      await completeFunding(second.attemptId, "complete-2"),
    );
    expect(two.agreement.state).toBe("ready_for_handover");
    await db.exec("reset role; set constraints all immediate");
    expect(
      (
        await db.query(
          "select sum(amount_minor)::integer as balance from public.ledger_entries",
        )
      ).rows,
    ).toEqual([{ balance: 0 }]);
    expect(
      (
        await db.query(
          "select sum(secured_minor)::integer as secured from public.contributions",
        )
      ).rows,
    ).toEqual([{ secured: 25000 }]);
    expect(await count("ledger_transactions")).toBe(2);
    expect(await count("ledger_entries")).toBe(4);
    await rejected(
      `update public.participants set share_bps=5000 where id='${participant}'`,
      "membership_frozen",
    );
  });
  it("persists a deterministic decline and permits a new-key retry with one successful posting", async () => {
    await readyFunding();
    await db.exec(
      `insert into pact_private.simulated_failure_fixtures values ('${contribution}',1)`,
    );
    const failed = successful(await startFunding());
    await waitForDue();
    expect(
      successful(await completeFunding(failed.attemptId)).attemptState,
    ).toBe("failed");
    await db.exec("reset role");
    expect(await count("ledger_entries")).toBe(0);
    const retry = successful(
      await startFunding(borrower, contribution, "retry-1"),
    );
    expect(retry.attemptId).not.toBe(failed.attemptId);
    await waitForDue();
    expect(
      successful(await completeFunding(retry.attemptId, "complete-retry"))
        .attemptState,
    ).toBe("succeeded");
    await db.exec("reset role; set constraints all immediate");
    expect(await count("payment_attempts")).toBe(2);
    expect(await count("ledger_transactions")).toBe(1);
    expect(
      (
        await db.query<{ state: string }>(
          "select state from public.payment_attempts order by created_at,id",
        )
      ).rows
        .map((row) => row.state)
        .sort(),
    ).toEqual(["failed", "succeeded"]);
  }, 10000);
  it("duplicate completions with same/different keys never post twice", async () => {
    await readyFunding();
    const started = successful(await startFunding());
    await waitForDue();
    const first = await completeFunding(started.attemptId);
    expect(await completeFunding(started.attemptId)).toEqual({
      ...first,
      replayed: true,
    });
    expect(await completeFunding(started.attemptId, "different")).toMatchObject(
      { ok: false, error: { code: "already_processed" } },
    );
    await db.exec("reset role; set constraints all immediate");
    expect(await count("ledger_transactions")).toBe(1);
    expect(await count("ledger_entries")).toBe(2);
  });
  it("rejects a completion key reused for another attempt", async () => {
    await readyFunding();
    const first = successful(await startFunding());
    const second = successful(
      await startFunding(secondBorrower, secondContribution, "second"),
    );
    await waitForDue();
    successful(await completeFunding(first.attemptId));
    expect(await completeFunding(second.attemptId)).toMatchObject({
      ok: false,
      error: { code: "idempotency_conflict" },
    });
  });
  it("handles duplicate requests submitted together (serialized by the embedded connection)", async () => {
    await readyFunding();
    await asUser(borrower);
    const input = {
      agreementId: agreement,
      versionId: version,
      contributionId: contribution,
      expectedRevision: "2",
      idempotencyKey: "parallel",
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => fundingCall("start_contribution", input)),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(
      results.filter((result) => result.ok && !result.replayed),
    ).toHaveLength(1);
    await db.exec("reset role");
    expect(await count("payment_attempts")).toBe(1);
  });
  it("cancellation-first ordering reconciles the attempt without securing money", async () => {
    await readyFunding();
    const started = successful(await startFunding());
    await db.exec(
      `reset role; update public.agreements set state='cancelling' where id='${agreement}'`,
    );
    expect(
      successful(await completeFunding(started.attemptId)).attemptState,
    ).toBe("cancelled");
    expect(
      await startFunding(borrower, contribution, "retry-after-cancel"),
    ).toMatchObject({ ok: false, error: { code: "invalid_state" } });
    await db.exec("reset role");
    expect(await count("ledger_entries")).toBe(0);
    expect(
      (
        await db.query(
          `select secured_minor from public.contributions where id='${contribution}'`,
        )
      ).rows,
    ).toEqual([{ secured_minor: 0 }]);
  });
  it("completion-first ordering preserves funds for the future cancellation/refund transaction", async () => {
    await readyFunding();
    const started = successful(await startFunding());
    await waitForDue();
    successful(await completeFunding(started.attemptId));
    await db.exec(
      `reset role; update public.agreements set state='cancelling' where id='${agreement}'`,
    );
    expect(
      await completeFunding(started.attemptId, "late-completion"),
    ).toMatchObject({ ok: false, error: { code: "already_processed" } });
    await db.exec("reset role; set constraints all immediate");
    expect(
      (
        await db.query(
          `select secured_minor from public.contributions where id='${contribution}'`,
        )
      ).rows,
    ).toEqual([{ secured_minor: 15000 }]);
    expect(await count("ledger_transactions")).toBe(1);
  });
  it("rolls back postings, aggregates and attempt completion if an audit write fails", async () => {
    await readyFunding();
    const started = successful(await startFunding());
    await waitForDue();
    await db.exec(`reset role;
      create function pg_temp.fail_funding_audit() returns trigger language plpgsql as $$ begin
        if new.action='contribution_succeeded' then raise exception 'injected_audit_failure'; end if; return new; end $$;
      create trigger test_fail_audit before insert on public.audit_events for each row execute function pg_temp.fail_funding_audit();
      set local role service_role;`);
    await rejected(
      `select public.complete_simulated_contribution('{"attemptId":"${started.attemptId}","idempotencyKey":"atomic"}')`,
      "injected_audit_failure",
    );
    await db.exec("reset role");
    expect(await count("ledger_entries")).toBe(0);
    expect(await count("operation_requests")).toBe(1);
    expect(
      (
        await db.query(
          `select state from public.payment_attempts where id='${started.attemptId}'`,
        )
      ).rows,
    ).toEqual([{ state: "processing" }]);
    expect(
      (
        await db.query(
          `select secured_minor from public.contributions where id='${contribution}'`,
        )
      ).rows,
    ).toEqual([{ secured_minor: 0 }]);
  });
  it("processes bounded due batches without a browser and replays batch results", async () => {
    await readyFunding();
    successful(await startFunding());
    successful(
      await startFunding(secondBorrower, secondContribution, "worker-second"),
    );
    await waitForDue();
    await db.exec("reset role; set local role service_role");
    const first = await fundingCall("process_due_contributions", {
      batchSize: 1,
      idempotencyKey: "batch-1",
    });
    expect(successful(first)).toMatchObject({
      processedCount: 1,
      hasMore: true,
    });
    expect(
      await fundingCall("process_due_contributions", {
        batchSize: 1,
        idempotencyKey: "batch-1",
      }),
    ).toEqual({ ...first, replayed: true });
    expect(
      successful(
        await fundingCall("process_due_contributions", {
          batchSize: 1,
          idempotencyKey: "batch-2",
        }),
      ),
    ).toMatchObject({ processedCount: 1, hasMore: false });
    await db.exec("reset role; set constraints all immediate");
    expect(await count("job_runs")).toBe(2);
    expect(await count("ledger_transactions")).toBe(2);
  });
});
