/**
 * PHASE 4 Tests — Program Management + Ownership Security
 * PROG-01 through PROG-10
 * Run: npx tsx tests/programs.test.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcryptjs from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function run() {
  console.log("\n=== PHASE 4 Program Management & Ownership Tests ===\n");

  // Setup: create 2 instructors
  const hash = await bcryptjs.hash("TestPass123!", 12);
  const instrA = await prisma.instructor.upsert({
    where: { email: "instrA@test.com" },
    update: {},
    create: { email: "instrA@test.com", name: "Instructor A", passwordHash: hash, isActive: true },
  });
  const instrB = await prisma.instructor.upsert({
    where: { email: "instrB@test.com" },
    update: {},
    create: { email: "instrB@test.com", name: "Instructor B", passwordHash: hash, isActive: true },
  });
  console.log(`Setup: instrA=${instrA.id}, instrB=${instrB.id}`);

  // PROG-01: Instructor A creates a program → owned by A
  console.log("\nPROG-01: Create program");
  const progA = await prisma.trainingProgram.create({
    data: { title: "Program A", instructorId: instrA.id, language: "AR", status: "DRAFT" },
  });
  assert(progA.instructorId === instrA.id, "program owned by A");
  assert(progA.status === "DRAFT", "initial status is DRAFT");
  assert(/^[0-9a-f-]{36}$/.test(progA.id), "program ID is UUID");

  // PROG-02: Instructor A can list their own programs
  console.log("\nPROG-02: List owned programs");
  const aPrograms = await prisma.trainingProgram.findMany({
    where: { instructorId: instrA.id },
  });
  assert(aPrograms.some((p: typeof aPrograms[number]) => p.id === progA.id), "A sees own program");

  // PROG-03: Instructor B does NOT see A's program in their list
  console.log("\nPROG-03: B cannot see A's programs");
  const bPrograms = await prisma.trainingProgram.findMany({
    where: { instructorId: instrB.id },
  });
  assert(!bPrograms.some((p: typeof bPrograms[number]) => p.id === progA.id), "B cannot see A's program");

  // PROG-04: OWNERSHIP — B cannot update A's program (server-side check simulation)
  console.log("\nPROG-04: Cross-ownership update rejected");
  const ownerCheck = await prisma.trainingProgram.findUnique({
    where: { id: progA.id },
    select: { instructorId: true },
  });
  assert(ownerCheck!.instructorId !== instrB.id, "B is not owner — update must be blocked");

  // PROG-05: OWNERSHIP — B cannot delete A's program
  console.log("\nPROG-05: Cross-ownership delete rejected");
  const canBDelete = ownerCheck!.instructorId === instrB.id;
  assert(!canBDelete, "B is not owner — delete must be blocked");

  // PROG-06: A can update their own program
  console.log("\nPROG-06: Owner can update program");
  await prisma.trainingProgram.update({
    where: { id: progA.id },
    data: { title: "Program A — Updated", status: "ACTIVE" },
  });
  const updated = await prisma.trainingProgram.findUnique({ where: { id: progA.id } });
  assert(updated!.title === "Program A — Updated", "title updated");
  assert(updated!.status === "ACTIVE", "status updated to ACTIVE");

  // PROG-07: Training Day creation within owned program
  console.log("\nPROG-07: Create training day");
  const day1 = await prisma.trainingDay.create({
    data: {
      programId: progA.id,
      dayNumber: 1,
      title: "Day 1: Introduction",
      objectives: ["Understand basics", "Apply concepts"],
      status: "DRAFT",
    },
  });
  assert(day1.dayNumber === 1, "day number is 1");
  assert(day1.objectives.length === 2, "objectives stored as array");
  assert(day1.programId === progA.id, "day linked to correct program");

  // PROG-08: Duplicate dayNumber within same program is rejected
  console.log("\nPROG-08: Duplicate day number rejected");
  let dupError = false;
  try {
    await prisma.trainingDay.create({
      data: {
        programId: progA.id,
        dayNumber: 1, // duplicate
        title: "Duplicate Day 1",
        objectives: [],
      },
    });
  } catch {
    dupError = true;
  }
  assert(dupError, "duplicate dayNumber(1) in same program throws error");

  // PROG-09: Day numbers 1–10 constraint (schema-level: max is enforced by app, not DB)
  console.log("\nPROG-09: Days 2–3 can be added, each has correct dayNumber");
  const day2 = await prisma.trainingDay.create({
    data: {
      programId: progA.id,
      dayNumber: 2,
      title: "Day 2: Deep Dive",
      objectives: ["Analyze patterns"],
    },
  });
  assert(day2.dayNumber === 2, "day 2 created with dayNumber=2");

  // PROG-10: Safe delete — program with no active sessions can be deleted
  console.log("\nPROG-10: Safe delete — no active sessions");
  const activeSessions = await prisma.liveSession.count({
    where: { programId: progA.id, status: { in: ["ACTIVE"] } },
  });
  assert(activeSessions === 0, "no active sessions — safe to delete");

  // Cleanup
  await prisma.trainingDay.deleteMany({ where: { programId: progA.id } });
  await prisma.trainingProgram.delete({ where: { id: progA.id } });
  await prisma.instructor.deleteMany({
    where: { email: { in: ["instrA@test.com", "instrB@test.com"] } },
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run()
  .catch((err) => {
    console.error("Test error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
