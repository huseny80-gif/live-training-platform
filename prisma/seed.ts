import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcryptjs from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcryptjs.hash("TestPass123!", 12);

  const instructor = await prisma.instructor.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: {
      email: "test@example.com",
      name: "Test Instructor",
      passwordHash,
      role: "INSTRUCTOR",
      isActive: true,
    },
  });

  console.log("Seeded instructor:", instructor.email, "id:", instructor.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
