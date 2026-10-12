import { spawnSync } from "node:child_process";

function run(script) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit", env: process.env });
  if (result.error || result.status !== 0) process.exit(result.status ?? 1);
}

// Production must have the new tables before the new application becomes live.
// Preview builds must not modify a potentially shared production database.
if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DATABASE_URL) {
    console.error("Production deployment requires DATABASE_URL before applying migrations.");
    process.exit(1);
  }
  run("db:migrate:deploy");
  const check = spawnSync("npx", ["tsx", "scripts/check-resource-storage.ts"], { stdio: "inherit", env: process.env });
  if (check.error || check.status !== 0) process.exit(check.status ?? 1);


}
run("build");
