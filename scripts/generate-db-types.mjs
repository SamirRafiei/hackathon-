import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const isLocal =
  args.length === 0 || (args.length === 1 && args[0] === "--local");
const isRemote =
  args.length === 2 &&
  args[0] === "--project-id" &&
  /^[a-z0-9]+$/.test(args[1]);

if (!isLocal && !isRemote) {
  console.error(
    "Usage: npm run db:types [-- --local | -- --project-id PROJECT_REF]",
  );
  process.exit(1);
}

const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [
    require.resolve("supabase/dist/supabase.js"),
    "gen",
    "types",
    "typescript",
    ...(isLocal ? ["--local"] : args),
  ],
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
);

if (
  result.error ||
  result.status !== 0 ||
  !result.stdout.includes("export type Database")
) {
  console.error(
    result.error?.message ?? result.stderr ?? "Type generation failed.",
  );
  process.exit(1);
}

// Write only after success so a CLI/auth failure cannot erase existing types.
writeFileSync(
  new URL("../src/types/database.ts", import.meta.url),
  result.stdout,
  "utf8",
);
console.log("Updated src/types/database.ts");
