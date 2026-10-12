import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const directory = mkdtempSync(join(tmpdir(), "vercel-build-test-"));
try {
  writeFileSync(join(directory, "npm"), `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.BUILD_TEST_LOG, process.argv.slice(2).join(' ') + '\\n');
if (process.env.BUILD_TEST_FAIL && process.argv[3] === 'db:migrate:deploy') process.exit(42);
`, { mode: 0o755 });
  function execute(environment, database, fail = false) {
    const log = join(directory, "commands"); writeFileSync(log, "");
    const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, VERCEL_ENV: environment, BUILD_TEST_LOG: log };
    if (database) env.DATABASE_URL = "postgresql://test-only"; else delete env.DATABASE_URL;
    if (fail) env.BUILD_TEST_FAIL = "1";
    const result = spawnSync(process.execPath, [resolve("scripts/vercel-build.mjs")], { env, encoding: "utf8" });
    return { status: result.status, commands: readFileSync(log, "utf8").trim().split("\n").filter(Boolean) };
  }
  assert.deepEqual(execute("production", true), { status: 0, commands: ["run db:migrate:deploy", "run build"] });
  assert.deepEqual(execute("preview", true), { status: 0, commands: ["run build"] });
  assert.deepEqual(execute("production", false), { status: 1, commands: [] });
  assert.deepEqual(execute("production", true, true), { status: 42, commands: ["run db:migrate:deploy"] });
  console.log("PASS: production migrates before build; preview skips migration; missing database and failed migration stop deployment (mock commands).");
} finally { rmSync(directory, { recursive: true, force: true }); }
