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
  it("enforces the 24-hour policy and exactly-once receipt timestamp", async () => {
    await rejected(
      `update public.agreements set handover_at=now(),returned_at=now(),inspection_deadline=now()+interval '1 hour' where id='${agreement}'`,
      "check constraint",
    );
    await db.exec(
      `update public.agreements set handover_at=now(),returned_at=now(),inspection_deadline=now()+interval '24 hours' where id='${agreement}'`,
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
