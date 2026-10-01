/**
 * Phase 20.2.3C — correctOptionId Migration Safety Audit
 *
 * Checks the three conditions that must all return 0 rows before
 * the FK constraint (questions.correct_option_id → question_options.id)
 * can be safely applied.
 *
 * Run with:
 *   npx tsx scripts/audit-correct-option-id.ts
 *
 * Requires a live DATABASE_URL in .env.
 * This script is READ-ONLY — it performs zero writes.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Audit 1: Orphan correctOptionId ─────────────────────────────────────────
// Questions where correctOptionId is set but points to a non-existent option.
// These rows WILL cause the FK migration to fail with a foreign-key violation.
// Required result: 0 rows

async function auditOrphanCorrectOptionId() {
  const result = await prisma.$queryRaw<{ id: string; correct_option_id: string; question_text: string }[]>`
    SELECT
      q.id,
      q.correct_option_id,
      LEFT(q.question_text, 80) AS question_text
    FROM questions q
    WHERE q.correct_option_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM question_options qo
        WHERE qo.id = q.correct_option_id
      )
    ORDER BY q.created_at DESC
  `;
  return result;
}

// ─── Audit 2: Cross-question option reference ─────────────────────────────────
// Questions where correctOptionId points to an option belonging to a
// DIFFERENT question. The option exists in DB but is wrong.
// This is a data integrity bug (not prevented by a simple FK).
// Required result: 0 rows

async function auditCrossQuestionOptionRef() {
  const result = await prisma.$queryRaw<{
    question_id: string;
    correct_option_id: string;
    option_question_id: string;
    question_text: string;
  }[]>`
    SELECT
      q.id           AS question_id,
      q.correct_option_id,
      qo.question_id AS option_question_id,
      LEFT(q.question_text, 80) AS question_text
    FROM questions q
    JOIN question_options qo ON qo.id = q.correct_option_id
    WHERE qo.question_id <> q.id
    ORDER BY q.created_at DESC
  `;
  return result;
}

// ─── Audit 3: Null correctOptionId statistics ────────────────────────────────
// Questions where correctOptionId IS NULL — scoring always returns isCorrect=false.
// These are not blocking for the FK migration (NULL is valid for a nullable FK),
// but they represent questions that can never be answered correctly.

async function auditNullCorrectOptionId() {
  const [total, nullCount, byStatus] = await Promise.all([
    prisma.question.count(),
    prisma.question.count({ where: { correctOptionId: null } }),
    prisma.$queryRaw<{ status: string; count: bigint }[]>`
      SELECT status, COUNT(*) AS count
      FROM questions
      WHERE correct_option_id IS NULL
      GROUP BY status
      ORDER BY count DESC
    `,
  ]);
  return { total, nullCount, percentage: total > 0 ? ((nullCount / total) * 100).toFixed(1) : "0.0", byStatus };
}

// ─── Audit 4: Questions with no options at all ───────────────────────────────
// Extra safety check: questions that have no QuestionOption rows at all.

async function auditQuestionsWithNoOptions() {
  const result = await prisma.$queryRaw<{ id: string; question_text: string; status: string }[]>`
    SELECT
      q.id,
      LEFT(q.question_text, 80) AS question_text,
      q.status
    FROM questions q
    WHERE NOT EXISTS (
      SELECT 1 FROM question_options qo WHERE qo.question_id = q.id
    )
    ORDER BY q.created_at DESC
    LIMIT 20
  `;
  return result;
}

// ─── Summary verdict ──────────────────────────────────────────────────────────

function verdict(orphans: unknown[], crossRef: unknown[]) {
  if (orphans.length === 0 && crossRef.length === 0) {
    return "✅ SAFE — FK constraint can be applied without data cleanup.";
  }
  const lines: string[] = ["❌ NOT SAFE — data cleanup required before FK migration:"];
  if (orphans.length > 0) {
    lines.push(`  • ${orphans.length} question(s) have orphan correctOptionId (option deleted or never created)`);
    lines.push(`    Fix: SET correct_option_id = NULL for these questions, then re-assign the correct option.`);
  }
  if (crossRef.length > 0) {
    lines.push(`  • ${crossRef.length} question(s) have correctOptionId pointing to a DIFFERENT question's option`);
    lines.push(`    Fix: Update correct_option_id to the matching option within the same question.`);
  }
  return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Phase 20.2.3C — correctOptionId Migration Safety Audit      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  try {
    console.log("── Audit 1: Orphan correctOptionId ─────────────────────────────");
    const orphans = await auditOrphanCorrectOptionId();
    if (orphans.length === 0) {
      console.log("  ✅ 0 orphan rows — all set correctOptionId values exist in question_options\n");
    } else {
      console.log(`  ❌ ${orphans.length} orphan row(s) found:\n`);
      for (const row of orphans) {
        console.log(`    id=${row.id}`);
        console.log(`    correct_option_id=${row.correct_option_id}`);
        console.log(`    text="${row.question_text}"\n`);
      }
    }

    console.log("── Audit 2: Cross-question option reference ────────────────────");
    const crossRef = await auditCrossQuestionOptionRef();
    if (crossRef.length === 0) {
      console.log("  ✅ 0 cross-question references — all correctOptionId values match their own question\n");
    } else {
      console.log(`  ❌ ${crossRef.length} cross-question reference(s) found:\n`);
      for (const row of crossRef) {
        console.log(`    question_id=${row.question_id}`);
        console.log(`    correct_option_id=${row.correct_option_id}`);
        console.log(`    belongs_to_question=${row.option_question_id}`);
        console.log(`    text="${row.question_text}"\n`);
      }
    }

    console.log("── Audit 3: NULL correctOptionId statistics ────────────────────");
    const nullStats = await auditNullCorrectOptionId();
    console.log(`  Total questions:          ${nullStats.total}`);
    console.log(`  With correctOptionId=NULL: ${nullStats.nullCount} (${nullStats.percentage}%)`);
    if (nullStats.byStatus.length > 0) {
      console.log(`  Breakdown by status:`);
      for (const row of nullStats.byStatus) {
        console.log(`    ${String(row.status).padEnd(12)} ${row.count}`);
      }
    }
    if (nullStats.nullCount > 0) {
      console.log(`\n  ⚠️  NOTE: NULL is valid for a nullable FK — not blocking for migration.`);
      console.log(`  ⚠️  But these questions will always score isCorrect=false until correctOptionId is set.\n`);
    } else {
      console.log(`  ✅ All questions have correctOptionId set\n`);
    }

    console.log("── Audit 4: Questions with no options ──────────────────────────");
    const noOptions = await auditQuestionsWithNoOptions();
    if (noOptions.length === 0) {
      console.log("  ✅ All questions have at least one QuestionOption row\n");
    } else {
      console.log(`  ⚠️  ${noOptions.length} question(s) have no options (showing up to 20):\n`);
      for (const row of noOptions) {
        console.log(`    id=${row.id} status=${row.status} text="${row.question_text}"`);
      }
      console.log();
    }

    console.log("── VERDICT ─────────────────────────────────────────────────────");
    console.log(`  ${verdict(orphans, crossRef)}\n`);

    if (orphans.length === 0 && crossRef.length === 0) {
      console.log("  Next step: run the FK migration (Phase 20.2.3D).");
      console.log("  Migration SQL:");
      console.log("    ALTER TABLE \"questions\"");
      console.log("      ADD CONSTRAINT \"questions_correct_option_id_fkey\"");
      console.log("      FOREIGN KEY (\"correct_option_id\")");
      console.log("      REFERENCES \"question_options\"(\"id\")");
      console.log("      ON DELETE SET NULL ON UPDATE CASCADE;");
      console.log("\n  Rollback SQL:");
      console.log("    ALTER TABLE \"questions\"");
      console.log("      DROP CONSTRAINT \"questions_correct_option_id_fkey\";");
    } else {
      console.log("  Run the cleanup SQL above before attempting the FK migration.");
      console.log("  Re-run this script after cleanup to confirm 0 violations.");
    }

    console.log("\n══════════════════════════════════════════════════════════════");
    console.log("  PHASE 20.2.3C STATUS: AUDIT COMPLETE");
    console.log("══════════════════════════════════════════════════════════════\n");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Audit error:", err);
  process.exit(1);
});
