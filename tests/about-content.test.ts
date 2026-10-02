import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { defaultAbout, aboutSchema } from "../src/lib/about-content";
import { canEditAbout } from "../src/lib/about-permissions";
import { readAbout, saveAboutContent } from "../src/lib/about-store";

async function run() {
  if (!["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local test database required");
  assert.ok(aboutSchema.safeParse(defaultAbout).success);
  assert.equal(canEditAbout({ isActive: true, role: "ADMIN" }), true);
  assert.equal(canEditAbout({ isActive: true, role: "INSTRUCTOR" }), true);
  assert.equal(canEditAbout({ isActive: false, role: "ADMIN" }), false);
  assert.equal(canEditAbout({ isActive: true, role: "PARTICIPANT" }), false);
  assert.equal(aboutSchema.safeParse({ ...defaultAbout, photoUrl: "javascript:alert(1)" }).success, false);
  assert.equal(aboutSchema.safeParse({ ...defaultAbout, archiveUrl: "http://example.test" }).success, false);
  console.log("PASS defaults, active-staff authorization, inactive account and unsafe-link rejection");
  const owner = await prisma.instructor.create({ data: { email: `about-${Date.now()}@example.test`, passwordHash: "unused", name: "About test", role: "ADMIN" } });
  const other = await prisma.instructor.create({ data: { email: `other-${Date.now()}@example.test`, passwordHash: "unused", name: "Other", isActive: false } });
  try {
    const current = await readAbout();
    const form = new FormData();
    for (const [key, value] of Object.entries(current.content)) form.set(key, value);
    form.set("version", current.version); form.set("introduction", "نبذة معدلة لاختبار حفظ محتوى الحقيبة التدريبية.");
    assert.equal((await saveAboutContent(other.id, form)).ok, false);
    assert.equal((await readAbout()).version, current.version);
    const saved = await saveAboutContent(owner.id, form); assert.equal(saved.ok, true);
    const reloaded = await readAbout(); assert.equal(reloaded.content.introduction, form.get("introduction"));
    assert.equal((await saveAboutContent(owner.id, form)).ok, false, "stale editor cannot overwrite a newer save");
    form.set("version", reloaded.version); form.set("telegram", "javascript:alert(1)");
    assert.equal((await saveAboutContent(owner.id, form)).ok, false);
    assert.equal((await readAbout()).version, reloaded.version);
    console.log("PASS durable save/reload, unauthorized writes, stale version and invalid data leave published content intact");
  } finally {
    await prisma.auditLog.deleteMany({ where: { actorId: owner.id } });
    await prisma.instructor.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
    await prisma.$disconnect();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
