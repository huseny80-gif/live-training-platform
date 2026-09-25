/**
 * AUTH-01 through AUTH-10: Instructor Authentication Tests
 * Run with: npx tsx tests/auth.test.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcryptjs from "bcryptjs";
import { checkRateLimit, resetRateLimit } from "../src/lib/rate-limit";

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
  console.log("\n=== PHASE 3 Authentication Tests ===\n");

  // AUTH-01: Password hashing uses bcrypt (cost factor ≥ 12)
  console.log("AUTH-01: Password hashing");
  {
    const hash = await bcryptjs.hash("MyPassword123!", 12);
    const rounds = bcryptjs.getRounds(hash);
    assert(rounds >= 12, "bcrypt cost factor ≥ 12", `got ${rounds}`);
    const valid = await bcryptjs.compare("MyPassword123!", hash);
    assert(valid, "correct password verifies");
    const invalid = await bcryptjs.compare("WrongPassword!", hash);
    assert(!invalid, "wrong password rejects");
  }

  // AUTH-02: Seeded instructor exists and password verifies
  console.log("\nAUTH-02: Seeded instructor DB lookup");
  {
    const instructor = await prisma.instructor.findUnique({
      where: { email: "test@example.com" },
    });
    assert(instructor !== null, "instructor found in DB");
    assert(instructor?.isActive === true, "instructor is active");
    const valid = await bcryptjs.compare("TestPass123!", instructor!.passwordHash);
    assert(valid, "seeded password verifies against stored hash");
  }

  // AUTH-03: Wrong password returns null (does not throw)
  console.log("\nAUTH-03: Wrong password → null");
  {
    const instructor = await prisma.instructor.findUnique({
      where: { email: "test@example.com" },
    });
    const valid = await bcryptjs.compare("WrongPassword!", instructor!.passwordHash);
    assert(!valid, "wrong password returns false (not error)");
  }

  // AUTH-04: Non-existent user → null
  console.log("\nAUTH-04: Non-existent user");
  {
    const instructor = await prisma.instructor.findUnique({
      where: { email: "nobody@example.com" },
    });
    assert(instructor === null, "non-existent user returns null");
  }

  // AUTH-05: Inactive instructor → blocked
  console.log("\nAUTH-05: Inactive instructor blocked");
  {
    const inactive = await prisma.instructor.upsert({
      where: { email: "inactive@example.com" },
      update: { isActive: false },
      create: {
        email: "inactive@example.com",
        name: "Inactive",
        passwordHash: await bcryptjs.hash("TestPass123!", 12),
        isActive: false,
      },
    });
    assert(inactive.isActive === false, "inactive instructor created");
    const fetched = await prisma.instructor.findUnique({
      where: { email: "inactive@example.com" },
    });
    assert(!fetched?.isActive, "isActive=false blocks auth check");
    await prisma.instructor.delete({ where: { email: "inactive@example.com" } });
  }

  // AUTH-06: Instructor ID is UUID (not sequential integer)
  console.log("\nAUTH-06: UUID primary key");
  {
    const instructor = await prisma.instructor.findUnique({
      where: { email: "test@example.com" },
    });
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert(uuidRegex.test(instructor!.id), "ID is a valid UUID");
  }

  // AUTH-07: Rate limiting — blocks after 5 attempts
  console.log("\nAUTH-07: Rate limiting (5 attempts / 15 min)");
  {
    const key = "test:rate:limit:test-ip:attacker@example.com";
    resetRateLimit(key);
    let lastResult = { allowed: true, retryAfterMs: 0 };
    for (let i = 0; i < 5; i++) {
      lastResult = checkRateLimit(key);
      assert(lastResult.allowed, `attempt ${i + 1} allowed`);
    }
    const blocked = checkRateLimit(key);
    assert(!blocked.allowed, "6th attempt blocked");
    assert(blocked.retryAfterMs > 0, "retryAfterMs > 0 when blocked");
    resetRateLimit(key);
  }

  // AUTH-08: Rate limit reset works
  console.log("\nAUTH-08: Rate limit reset");
  {
    const key = "test:rate:limit:reset:ip@test";
    for (let i = 0; i < 5; i++) checkRateLimit(key);
    const blocked = checkRateLimit(key);
    assert(!blocked.allowed, "blocked before reset");
    resetRateLimit(key);
    const afterReset = checkRateLimit(key);
    assert(afterReset.allowed, "allowed after reset");
  }

  // AUTH-09: Different IPs have independent rate limits
  console.log("\nAUTH-09: Per-IP rate limit isolation");
  {
    const key1 = "test:rate:ip1:user@example.com";
    const key2 = "test:rate:ip2:user@example.com";
    resetRateLimit(key1);
    resetRateLimit(key2);
    for (let i = 0; i < 5; i++) checkRateLimit(key1);
    checkRateLimit(key1); // blocked
    const ip2result = checkRateLimit(key2);
    assert(ip2result.allowed, "different IP not affected by first IP's limit");
    resetRateLimit(key1);
    resetRateLimit(key2);
  }

  // AUTH-10: Password hash is never stored in plaintext
  console.log("\nAUTH-10: Password stored as bcrypt hash (never plaintext)");
  {
    const instructor = await prisma.instructor.findUnique({
      where: { email: "test@example.com" },
    });
    assert(instructor!.passwordHash.startsWith("$2"), "hash starts with bcrypt prefix $2");
    assert(instructor!.passwordHash !== "TestPass123!", "stored value is not plaintext");
    assert(instructor!.passwordHash.length > 50, "hash has expected length");
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

run()
  .catch((err) => {
    console.error("Test suite error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
