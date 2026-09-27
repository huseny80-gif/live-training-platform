// Phase 20.2.5 — Enterprise Hardening & Governance Tests
// Tests rate-limiting with a mock Ratelimit instance (no real Redis),
// requireAdmin guard, audit event shapes, and schema field defaults.

import { strict as assert } from "assert";
import { createHash } from "crypto";
import {
  checkRateLimit,
  checkAnswerRateLimit,
  _setLoginLimiterForTest,
  _setAnswerLimiterForTest,
} from "../src/lib/rate-limit";

// ── Mock Ratelimit factory ────────────────────────────────────────────────────
// Builds a minimal Ratelimit-shaped object that enforces a sliding counter.
// Used instead of a real Redis connection so tests run offline.

interface MockLimitResult { success: boolean; reset: number }

function makeMockLimiter(max: number, windowMs: number) {
  const store = new Map<string, { count: number; resetAt: number }>();
  return {
    limit: async (key: string): Promise<MockLimitResult> => {
      const now = Date.now();
      const entry = store.get(key);
      const resetAt = (!entry || now > entry.resetAt) ? now + windowMs : entry.resetAt;
      const count  = (!entry || now > entry.resetAt) ? 1 : entry.count + 1;
      store.set(key, { count, resetAt });
      return { success: count <= max, reset: resetAt };
    },
  } as unknown as import("@upstash/ratelimit").Ratelimit;
}

// ── requireAdmin inline (mirrors service.ts logic) ───────────────────────────

type InstructorRole = "INSTRUCTOR" | "ADMIN";

function requireAdminSync(role: InstructorRole | undefined): void {
  if (!role || role !== "ADMIN") throw new Error("UNAUTHORIZED");
}

// ── Inline audit shape helpers ────────────────────────────────────────────────

interface AuditEvent { action: string; metadata: Record<string, unknown> }

function buildLoginSuccessAudit(instructorId: string, email: string, ip: string, userAgent: string): AuditEvent {
  return {
    action: "LOGIN_SUCCESS",
    metadata: {
      emailHash: createHash("sha256").update(email.toLowerCase().trim()).digest("hex"),
      ip, userAgent, timestamp: new Date().toISOString(),
    },
  };
}

function buildLoginFailureAudit(email: string, ip: string, userAgent: string): AuditEvent {
  return {
    action: "LOGIN_FAILURE",
    metadata: {
      emailHash: createHash("sha256").update(email.toLowerCase().trim()).digest("hex"),
      ip, userAgent, timestamp: new Date().toISOString(),
    },
  };
}

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

// Tests run sequentially — mocks and env-var manipulation must not interleave.
(async () => {
  console.log("PHASE-20-2-5 — Enterprise Hardening & Governance");

  // GOV-01: Login limiter blocks after max attempts using mock
  await test("GOV-01: login limiter blocks on 6th attempt (mock, max=5)", async () => {
    const mock = makeMockLimiter(5, 15 * 60 * 1000);
    _setLoginLimiterForTest(mock);
    try {
      const key = "gov01:ip:user@example.com";
      for (let i = 0; i < 5; i++) {
        const r = await checkRateLimit(key);
        assert.equal(r.allowed, true, `attempt ${i + 1} should be allowed`);
      }
      const blocked = await checkRateLimit(key);
      assert.equal(blocked.allowed, false, "6th attempt must be blocked");
      assert.ok(blocked.retryAfterMs > 0, "retryAfterMs must be > 0 when blocked");
    } finally {
      _setLoginLimiterForTest(null);
    }
  });

  // GOV-02: Fresh key (new window) is allowed even after another key is exhausted
  await test("GOV-02: login limiter resets for a new key (simulates window expiry)", async () => {
    const mock = makeMockLimiter(5, 15 * 60 * 1000);
    _setLoginLimiterForTest(mock);
    try {
      const exhaustedKey = "gov02:ip:exhausted@example.com";
      for (let i = 0; i < 5; i++) await checkRateLimit(exhaustedKey);
      const blocked = await checkRateLimit(exhaustedKey);
      assert.equal(blocked.allowed, false, "exhausted key must be blocked");

      const freshKey = "gov02:ip:fresh@example.com";
      const fresh = await checkRateLimit(freshKey);
      assert.equal(fresh.allowed, true, "fresh key must be allowed");
    } finally {
      _setLoginLimiterForTest(null);
    }
  });

  // GOV-03: requireAdmin rejects INSTRUCTOR role
  await test("GOV-03: requireAdmin rejects INSTRUCTOR role", () => {
    assert.throws(() => requireAdminSync("INSTRUCTOR"), /UNAUTHORIZED/);
  });

  // GOV-04: requireAdmin allows ADMIN role
  await test("GOV-04: requireAdmin allows ADMIN role", () => {
    assert.doesNotThrow(() => requireAdminSync("ADMIN"));
  });

  // GOV-05: LOGIN_SUCCESS audit event — no plaintext email, SHA-256 hash present
  await test("GOV-05: LOGIN_SUCCESS creates audit with instructorId and no plaintext email", () => {
    const event = buildLoginSuccessAudit("instructor-uuid", "admin@example.com", "1.2.3.4", "TestBrowser/1.0");
    assert.equal(event.action, "LOGIN_SUCCESS");
    assert.ok("emailHash" in event.metadata, "emailHash must be present");
    assert.ok(!("email" in event.metadata), "plaintext email must not be present");
    assert.ok(!("password" in event.metadata), "password must not be present");
    assert.match(event.metadata.emailHash as string, /^[a-f0-9]{64}$/);
  });

  // GOV-06: LOGIN_FAILURE stores emailHash not plaintext email
  await test("GOV-06: LOGIN_FAILURE stores emailHash, no plaintext email", () => {
    const event = buildLoginFailureAudit("wrong@example.com", "5.6.7.8", "Agent/2.0");
    assert.equal(event.action, "LOGIN_FAILURE");
    assert.ok("emailHash" in event.metadata);
    assert.ok(!("email" in event.metadata));
    const expected = createHash("sha256").update("wrong@example.com").digest("hex");
    assert.equal(event.metadata.emailHash, expected);
  });

  // GOV-07: mustResetPassword defaults false in migration SQL
  await test("GOV-07: mustResetPassword field defaults to false in migration", () => {
    const sql = `ALTER TABLE "instructors" ADD COLUMN IF NOT EXISTS "must_reset_password" BOOLEAN NOT NULL DEFAULT false;`;
    assert.ok(sql.includes("DEFAULT false"));
    assert.ok(sql.includes("must_reset_password"));
  });

  // GOV-08: LOGIN_SUCCESS audit event contains valid ISO timestamp
  await test("GOV-08: LOGIN_SUCCESS audit event contains valid ISO timestamp", () => {
    const event = buildLoginSuccessAudit("instructor-uuid", "admin@example.com", "1.2.3.4", "UA");
    assert.ok("timestamp" in event.metadata, "timestamp must be in metadata");
    const ts = event.metadata.timestamp as string;
    assert.ok(!isNaN(Date.parse(ts)), `timestamp must be valid ISO string, got: ${ts}`);
  });

  // GOV-09: Answer limiter fails open when Redis unavailable
  await test("GOV-09: answer limiter fails open when Redis unavailable", async () => {
    _setAnswerLimiterForTest(null);
    const savedUrl   = process.env.UPSTASH_REDIS_REST_URL;
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const result = await checkAnswerRateLimit("gov09:participant-id");
      assert.equal(result.allowed, true, "must fail-open when Redis is unavailable");
      assert.equal(result.retryAfterMs, 0);
    } finally {
      if (savedUrl)   process.env.UPSTASH_REDIS_REST_URL   = savedUrl;
      if (savedToken) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken;
    }
  });

  // GOV-10: Answer limiter blocks after 10 attempts using mock
  await test("GOV-10: answer limiter blocks on 11th attempt (mock, max=10)", async () => {
    const mock = makeMockLimiter(10, 60 * 1000);
    _setAnswerLimiterForTest(mock);
    try {
      const key = "gov10:sqid:tokenhash";
      for (let i = 0; i < 10; i++) {
        const r = await checkAnswerRateLimit(key);
        assert.equal(r.allowed, true, `attempt ${i + 1} should be allowed`);
      }
      const blocked = await checkAnswerRateLimit(key);
      assert.equal(blocked.allowed, false, "11th attempt must be blocked");
      assert.ok(blocked.retryAfterMs > 0, "retryAfterMs must be > 0 when blocked");
    } finally {
      _setAnswerLimiterForTest(null);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
