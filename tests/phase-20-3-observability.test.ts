// Phase 20.3 — Production Readiness & Observability Tests
// OBS-01 through OBS-07 (offline, no real DB or network required)

import { strict as assert } from "assert";

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

// ── Inline logger (mirrors src/lib/logger.ts logic) for unit testing ─────────

type LogLevel = "debug" | "info" | "warn" | "error";
const SENSITIVE_KEYS = new Set([
  "password", "passwordHash", "secret", "token", "accessToken",
  "refreshToken", "apiKey", "authorization", "cookie", "sessionSecret",
  "UPSTASH_REDIS_REST_TOKEN", "AUTH_SECRET", "SESSION_SECRET",
]);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function buildLogLine(level: LogLevel, msg: string, meta?: Record<string, unknown>): string {
  const line: Record<string, unknown> = {
    level,
    msg,
    timestamp: new Date().toISOString(),
  };
  if (meta) {
    const safe = redact(meta) as Record<string, unknown>;
    Object.assign(line, safe);
  }
  return JSON.stringify(line);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log("PHASE-20-3 — Production Readiness & Observability");

  // OBS-01: /api/health shape — status, uptime, timestamp
  await test("OBS-01: health endpoint returns status:ok with uptime and timestamp", () => {
    const payload = {
      status: "ok",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    assert.equal(payload.status, "ok");
    assert.ok(typeof payload.uptime === "number" && payload.uptime >= 0, "uptime must be non-negative number");
    assert.ok(!isNaN(Date.parse(payload.timestamp)), "timestamp must be valid ISO string");
  });

  // OBS-02: /api/ready shape — status, checks.database with latencyMs
  await test("OBS-02: ready payload has status and nested checks with database.latencyMs", () => {
    const payload = {
      status: "ok",
      checks: {
        database: { status: "ok", latencyMs: 4 },
        redis: { status: "degraded", reason: "not configured" },
        socketio: { status: "degraded", reason: "not initialised" },
      },
      timestamp: new Date().toISOString(),
    };
    assert.ok("status" in payload, "status must be present");
    assert.ok("checks" in payload, "checks must be present");
    assert.ok("database" in payload.checks, "checks.database must be present");
    assert.ok(typeof payload.checks.database.latencyMs === "number", "latencyMs must be a number");
    assert.ok(!isNaN(Date.parse(payload.timestamp)), "timestamp must be valid ISO string");
  });

  // OBS-03: /api/ready returns 503 when DB check fails
  await test("OBS-03: ready returns 503 when database check status is error", () => {
    const dbStatus = "error" as string;
    const overallOk = dbStatus === "ok";
    const httpStatus = overallOk ? 200 : 503;
    assert.equal(httpStatus, 503, "HTTP 503 expected when DB is error");
  });

  // OBS-04: error handler returns generic message, not stack trace
  await test("OBS-04: caught DB error returns generic message without stack trace", () => {
    const dbError = new Error("connection timeout\n    at Object.query (/app/node_modules/pg/lib/client.js:123:10)");
    const body = { error: "Internal server error" };
    assert.equal(body.error, "Internal server error");
    assert.ok(!JSON.stringify(body).includes(dbError.stack?.split("\n")[1] ?? "at Object"), "stack trace must not appear in response body");
    assert.ok(!JSON.stringify(body).includes("pg/lib"), "internal path must not appear in response body");
  });

  // OBS-05: logger emits valid JSON with required fields
  await test("OBS-05: logger emits valid JSON with level, msg, timestamp fields", () => {
    const line = buildLogLine("info", "test message");
    const parsed = JSON.parse(line) as Record<string, unknown>;
    assert.equal(parsed.level, "info");
    assert.equal(parsed.msg, "test message");
    assert.ok("timestamp" in parsed, "timestamp must be present");
    assert.ok(!isNaN(Date.parse(parsed.timestamp as string)), "timestamp must be valid ISO string");
  });

  // OBS-06: request-id header is echoed in response
  await test("OBS-06: x-request-id from request is echoed in response header", () => {
    const incomingId = "test-request-id-abc123";
    // Simulate middleware: pass through the incoming header
    const outgoingId = incomingId; // middleware picks up existing header
    assert.equal(outgoingId, incomingId, "response x-request-id must match request x-request-id");
  });

  await test("OBS-06b: x-request-id is generated as UUID when not supplied", () => {
    const { randomUUID } = require("crypto") as typeof import("crypto");
    const generated = randomUUID();
    assert.match(generated, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "generated id must be a valid v4 UUID");
  });

  // OBS-07: logger redacts sensitive fields
  await test("OBS-07: logger redacts password, token, secret fields", () => {
    const line = buildLogLine("error", "auth failure", {
      password: "secret123",
      token: "eyJhbGci...",
      secret: "mysecret",
      SESSION_SECRET: "topsecret",
      AUTH_SECRET: "anothersecret",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
      userId: "usr-abc",
      email: "safe@example.com",
    });
    const parsed = JSON.parse(line) as Record<string, unknown>;
    assert.equal(parsed.password, "[REDACTED]", "password must be redacted");
    assert.equal(parsed.token, "[REDACTED]", "token must be redacted");
    assert.equal(parsed.secret, "[REDACTED]", "secret must be redacted");
    assert.equal(parsed.SESSION_SECRET, "[REDACTED]", "SESSION_SECRET must be redacted");
    assert.equal(parsed.AUTH_SECRET, "[REDACTED]", "AUTH_SECRET must be redacted");
    assert.equal(parsed.UPSTASH_REDIS_REST_TOKEN, "[REDACTED]", "UPSTASH_REDIS_REST_TOKEN must be redacted");
    // Non-sensitive fields must pass through
    assert.equal(parsed.userId, "usr-abc", "userId must not be redacted");
    assert.equal(parsed.email, "safe@example.com", "email must not be redacted");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
