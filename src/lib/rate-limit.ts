// ── Shared types ─────────────────────────────────────────────────────────────

interface Attempt {
  count: number;
  resetAt: number;
}

// ── Login rate limiter ────────────────────────────────────────────────────────
// LIMITATION: in-memory store — resets on server restart and is NOT shared
// across multiple process instances (multi-instance / serverless deployments).
// Suitable for single-process / self-hosted deployments only.
// For multi-instance production, replace with a shared store (e.g. Redis).

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const store = new Map<string, Attempt>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string): void {
  store.delete(key);
}

// ── Answer submission rate limiter ────────────────────────────────────────────
// LIMITATION: in-memory store — resets on server restart and is NOT shared
// across multiple process instances (multi-instance / serverless deployments).
// Suitable for single-process / self-hosted deployments only.
// For multi-instance production, replace with a shared store (e.g. Redis).
//
// Key format: `${sessionQuestionId}:${hashToken(guestToken)}`
// This scopes the limit per-question per-participant, preventing one participant
// from submitting the same answer more than ANSWER_MAX_ATTEMPTS times per window.

const ANSWER_WINDOW_MS = 60 * 1000; // 1 minute
const ANSWER_MAX_ATTEMPTS = 10;

const answerStore = new Map<string, Attempt>();

export function checkAnswerRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = answerStore.get(key);

  if (!entry || now > entry.resetAt) {
    answerStore.set(key, { count: 1, resetAt: now + ANSWER_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= ANSWER_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

// Prune expired entries every 30 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  store.forEach((entry, key) => {
    if (now > entry.resetAt) store.delete(key);
  });
  answerStore.forEach((entry, key) => {
    if (now > entry.resetAt) answerStore.delete(key);
  });
}, 30 * 60 * 1000);
