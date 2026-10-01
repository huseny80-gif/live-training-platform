// ── Distributed rate limiting via Upstash Redis ──────────────────────────────
// Replaces the previous in-memory Map store which was NOT multi-instance safe.
// On Redis unavailability: fail-open (allow request) + log RATE_LIMIT_BACKEND_UNAVAILABLE.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ── Test injection hooks ──────────────────────────────────────────────────────
// Allow tests to supply a mock Ratelimit instance without a real Redis connection.
// Never called in production paths.
let _testLoginLimiter: Ratelimit | null = null;
let _testAnswerLimiter: Ratelimit | null = null;

export function _setLoginLimiterForTest(l: Ratelimit | null) { _testLoginLimiter = l; }
export function _setAnswerLimiterForTest(l: Ratelimit | null) { _testAnswerLimiter = l; }

// ── Lazy-initialised production limiters ──────────────────────────────────────
let _redis: Redis | null = null;
let _loginLimiter: Ratelimit | null = null;
let _answerLimiter: Ratelimit | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

function getLoginLimiter(): Ratelimit | null {
  if (_testLoginLimiter) return _testLoginLimiter;
  if (_loginLimiter) return _loginLimiter;
  const redis = getRedis();
  if (!redis) return null;
  _loginLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "rl:login",
  });
  return _loginLimiter;
}

function getAnswerLimiter(): Ratelimit | null {
  if (_testAnswerLimiter) return _testAnswerLimiter;
  if (_answerLimiter) return _answerLimiter;
  const redis = getRedis();
  if (!redis) return null;
  _answerLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"),
    prefix: "rl:answer",
  });
  return _answerLimiter;
}

// Fire-and-forget security log — avoids circular import by writing directly to DB
async function logBackendUnavailable(limiterName: string) {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.auditLog.create({
      data: {
        entityType: "RateLimiter",
        entityId: limiterName,
        action: "RATE_LIMIT_BACKEND_UNAVAILABLE",
        actorType: "SYSTEM",
        metadata: { limiter: limiterName, timestamp: new Date().toISOString() },
      },
    });
  } catch {
    process.stderr.write(
      `[rate-limit] RATE_LIMIT_BACKEND_UNAVAILABLE for ${limiterName} — audit write also failed\n`
    );
  }
}

// ── Login rate limiter ─────────────────────────────────────────────────────────
// Policy: 5 attempts / 15 minutes per IP:email key

export async function checkRateLimit(
  key: string
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const limiter = getLoginLimiter();
  if (!limiter) {
    void logBackendUnavailable("login").catch(() =>
      process.stderr.write("[rate-limit] logBackendUnavailable failed silently\n")
    );
    return { allowed: true, retryAfterMs: 0 };
  }

  try {
    const result = await limiter.limit(key);
    if (result.success) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: Math.max(0, result.reset - Date.now()) };
  } catch {
    void logBackendUnavailable("login").catch(() =>
      process.stderr.write("[rate-limit] logBackendUnavailable failed silently\n")
    );
    return { allowed: true, retryAfterMs: 0 };
  }
}

export async function resetRateLimit(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`rl:login:${key}`);
  } catch {
    // best-effort reset; non-fatal
  }
}

// ── Answer submission rate limiter ────────────────────────────────────────────
// Policy: 10 attempts / 1 minute per participantId key

export async function checkAnswerRateLimit(
  key: string
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const limiter = getAnswerLimiter();
  if (!limiter) {
    void logBackendUnavailable("answer").catch(() =>
      process.stderr.write("[rate-limit] logBackendUnavailable failed silently\n")
    );
    return { allowed: true, retryAfterMs: 0 };
  }

  try {
    const result = await limiter.limit(key);
    if (result.success) return { allowed: true, retryAfterMs: 0 };
    return { allowed: false, retryAfterMs: Math.max(0, result.reset - Date.now()) };
  } catch {
    void logBackendUnavailable("answer").catch(() =>
      process.stderr.write("[rate-limit] logBackendUnavailable failed silently\n")
    );
    return { allowed: true, retryAfterMs: 0 };
  }
}
