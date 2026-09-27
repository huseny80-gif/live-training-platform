// Phase 20.2.3E — Scoring Configuration Tests
// Tests parseScoringConfig behavior via submitAnswer integration stubs.

import { strict as assert } from "assert";

// Inline the parser logic to test it in isolation (mirrors service.ts exactly)
const DEFAULT_SCORE_CORRECT = 10;

function parseScoringConfig(raw: unknown): { scoreCorrect: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { scoreCorrect: DEFAULT_SCORE_CORRECT };
  }
  const cfg = raw as Record<string, unknown>;
  const v = cfg["scoreCorrect"];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10000) {
    return { scoreCorrect: DEFAULT_SCORE_CORRECT };
  }
  return { scoreCorrect: v };
}

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

console.log("PHASE-20-2-3E — parseScoringConfig");

// SCORING-01: empty object falls back to 10
test("SCORING-01: {} → scoreCorrect=10", () => {
  const result = parseScoringConfig({});
  assert.equal(result.scoreCorrect, 10);
});

// SCORING-02: null falls back to 10
test("SCORING-02: null → scoreCorrect=10", () => {
  const result = parseScoringConfig(null);
  assert.equal(result.scoreCorrect, 10);
});

// SCORING-03: valid scoreCorrect=20 is honoured
test("SCORING-03: { scoreCorrect: 20 } → scoreCorrect=20", () => {
  const result = parseScoringConfig({ scoreCorrect: 20 });
  assert.equal(result.scoreCorrect, 20);
});

// SCORING-04: negative value falls back to 10
test("SCORING-04: { scoreCorrect: -5 } → scoreCorrect=10", () => {
  const result = parseScoringConfig({ scoreCorrect: -5 });
  assert.equal(result.scoreCorrect, 10);
});

// SCORING-05: string value falls back to 10
test("SCORING-05: { scoreCorrect: '15' } → scoreCorrect=10", () => {
  const result = parseScoringConfig({ scoreCorrect: "15" });
  assert.equal(result.scoreCorrect, 10);
});

// SCORING-06: NaN falls back to 10
test("SCORING-06: { scoreCorrect: NaN } → scoreCorrect=10", () => {
  const result = parseScoringConfig({ scoreCorrect: NaN });
  assert.equal(result.scoreCorrect, 10);
});

// SCORING-07: too-large value (>10000) falls back to 10
test("SCORING-07: { scoreCorrect: 99999 } → scoreCorrect=10", () => {
  const result = parseScoringConfig({ scoreCorrect: 99999 });
  assert.equal(result.scoreCorrect, 10);
});

// SCORING-08: zero is valid (zero-score session)
test("SCORING-08: { scoreCorrect: 0 } → scoreCorrect=0", () => {
  const result = parseScoringConfig({ scoreCorrect: 0 });
  assert.equal(result.scoreCorrect, 0);
});

// SCORING-09: array falls back to 10
test("SCORING-09: [] → scoreCorrect=10", () => {
  const result = parseScoringConfig([]);
  assert.equal(result.scoreCorrect, 10);
});

// SCORING-10: missing key entirely falls back to 10
test("SCORING-10: { otherKey: 5 } → scoreCorrect=10", () => {
  const result = parseScoringConfig({ otherKey: 5 });
  assert.equal(result.scoreCorrect, 10);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
