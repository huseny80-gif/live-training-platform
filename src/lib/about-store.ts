import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aboutSchema, defaultAbout } from "./about-content";
import { canEditAbout } from "./about-permissions";

const where = { entityType: "PlatformContent", entityId: "about", action: "UPDATE" };
// Append-only versions use the existing audit table: no production schema migration.
export async function readAbout() {
  const saved = await prisma.auditLog.findFirst({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!saved) return { content: defaultAbout, version: "default" };
  const parsed = aboutSchema.safeParse(saved.metadata);
  if (!parsed.success) throw new Error("ABOUT_CONTENT_INVALID");
  return { content: parsed.data, version: saved.id };
}

export async function saveAboutContent(instructorId: string, form: FormData) {
  const parsed = aboutSchema.safeParse(Object.fromEntries(Object.keys(defaultAbout).map(key => [key, form.get(key) ?? ""])));
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  return prisma.$transaction(async tx => {
    const account = await tx.instructor.findUnique({ where: { id: instructorId }, select: { role: true, email: true, isActive: true } });
    if (!canEditAbout(account)) return { ok: false as const, error: "تعديل معلومات المنصة متاح لحسابات المدربين والأدمن النشطة فقط." };
    const current = await tx.auditLog.findFirst({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (String(form.get("version")) !== (current?.id ?? "default")) return { ok: false as const, error: "حُدّثت الصفحة بواسطة مستخدم آخر. حدّث الصفحة قبل حفظ تعديلاتك." };
    const saved = await tx.auditLog.create({ data: { ...where, actorId: instructorId, actorType: "INSTRUCTOR", createdAt: new Date(Math.max(Date.now(), (current?.createdAt.getTime() ?? 0) + 1)), metadata: parsed.data } });
    return { ok: true as const, version: saved.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
