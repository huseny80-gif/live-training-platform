// Phase 20.2.4 — Certificate Model Tests
// Tests parseScoringConfig passingScore extension and certificate issuance logic
// in isolation (no DB required).

import { strict as assert } from "assert";
import { randomBytes } from "crypto";

// ── Inline parseScoringConfig (mirrors service.ts exactly) ───────────────────

const DEFAULT_SCORE_CORRECT = 10;

function parseScoringConfig(raw: unknown): { scoreCorrect: number; passingScore: number | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { scoreCorrect: DEFAULT_SCORE_CORRECT, passingScore: null };
  }
  const cfg = raw as Record<string, unknown>;

  const v = cfg["scoreCorrect"];
  const scoreCorrect =
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10000
      ? v
      : DEFAULT_SCORE_CORRECT;

  const ps = cfg["passingScore"];
  const passingScore =
    typeof ps === "number" && Number.isFinite(ps) && ps >= 0 && ps <= 100
      ? ps
      : null;

  return { scoreCorrect, passingScore };
}

const VERIFICATION_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateVerificationCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map((b) => VERIFICATION_CODE_CHARS[b % VERIFICATION_CODE_CHARS.length])
    .join("")
    .slice(0, 8);
}

// ── Inline eligibility check (mirrors issueCertificates logic) ───────────────

function isEligible(correctCount: number, questionsTotal: number, passingScore: number): boolean {
  const rate = questionsTotal > 0 ? (correctCount / questionsTotal) * 100 : 0;
  return rate >= passingScore;
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

console.log("PHASE-20-2-4 — Certificate Model");

// CERT-01: passingScore=null when not set (empty config)
test("CERT-01: {} → passingScore=null, no auto-issuance", () => {
  const result = parseScoringConfig({});
  assert.equal(result.passingScore, null);
});

// CERT-02: passingScore=null when missing key
test("CERT-02: { scoreCorrect: 10 } → passingScore=null", () => {
  const result = parseScoringConfig({ scoreCorrect: 10 });
  assert.equal(result.passingScore, null);
});

// CERT-03: passingScore=0 issues to all participants
test("CERT-03: passingScore=0 → eligible at 0% correct", () => {
  const { passingScore } = parseScoringConfig({ passingScore: 0 });
  assert.equal(passingScore, 0);
  assert.equal(isEligible(0, 5, 0), true);
});

// CERT-04: passingScore=80 threshold — 80% correct is eligible, 60% is not
test("CERT-04: passingScore=80 → 4/5 eligible, 3/5 not", () => {
  const { passingScore } = parseScoringConfig({ passingScore: 80 });
  assert.equal(passingScore, 80);
  assert.equal(isEligible(4, 5, 80), true);   // 80% exact — eligible
  assert.equal(isEligible(3, 5, 80), false);  // 60% — not eligible
});

// CERT-05: certificateNumber format CERT-YYYY-NNNNNN
test("CERT-05: certificateNumber follows CERT-YYYY-NNNNNN format", () => {
  const year = new Date().getFullYear();
  const seqVal = 42;
  const certNum = `CERT-${year}-${String(seqVal).padStart(6, "0")}`;
  assert.match(certNum, /^CERT-\d{4}-\d{6}$/);
  assert.equal(certNum, `CERT-${year}-000042`);
});

// CERT-06: verificationCode is 8 chars uppercase alphanumeric
test("CERT-06: verificationCode is 8 uppercase alphanumeric chars", () => {
  for (let i = 0; i < 20; i++) {
    const code = generateVerificationCode();
    assert.equal(code.length, 8, `expected 8 chars, got ${code.length}`);
    assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/, `unexpected char in: ${code}`);
  }
});

// CERT-07: invalid passingScore values fall back to null
test("CERT-07: passingScore=-1 → null", () => {
  assert.equal(parseScoringConfig({ passingScore: -1 }).passingScore, null);
});

test("CERT-07b: passingScore=101 → null", () => {
  assert.equal(parseScoringConfig({ passingScore: 101 }).passingScore, null);
});

test("CERT-07c: passingScore='80' (string) → null", () => {
  assert.equal(parseScoringConfig({ passingScore: "80" }).passingScore, null);
});

// CERT-08: passingScore=100 requires perfect score
test("CERT-08: passingScore=100 → 5/5 eligible, 4/5 not", () => {
  assert.equal(isEligible(5, 5, 100), true);
  assert.equal(isEligible(4, 5, 100), false);
});

// CERT-09: scoreCorrect and passingScore coexist correctly
test("CERT-09: { scoreCorrect: 20, passingScore: 60 } → both parsed", () => {
  const result = parseScoringConfig({ scoreCorrect: 20, passingScore: 60 });
  assert.equal(result.scoreCorrect, 20);
  assert.equal(result.passingScore, 60);
});

// CERT-10: questionsTotal=0 edge case → 0% rate, fails any passing threshold > 0
test("CERT-10: 0 questions → 0% rate, fails passingScore=1", () => {
  assert.equal(isEligible(0, 0, 1), false);
  assert.equal(isEligible(0, 0, 0), true);  // passingScore=0 still passes
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
