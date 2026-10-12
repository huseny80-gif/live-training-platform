import { writeFileSync } from "node:fs";
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
  const recovery = spawnSync("npm", ["run", "exam:recover"], { stdio: "inherit", env: process.env, timeout: 120000, killSignal: "SIGTERM" });
  if (recovery.error || recovery.status !== 0) {
    writeFileSync("public/exam-material-recovery.json", JSON.stringify({ release: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown", status: "RECOVERY_UNAVAILABLE" }));
    console.warn("Exam recovery could not complete; deploying the tested application update.");
  }
}
run("build");
