"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function instructorId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session.user.id;
}

export async function getAdminProfile() {
  const id = await instructorId();
  const instructor = await prisma.instructor.findUnique({ where: { id }, select: { name: true, email: true } });
  const profile = await prisma.adminProfile.findUnique({ where: { instructorId: id } });
  return { instructor, profile };
}

export async function saveAdminProfile(formData: FormData) {
  const id = await instructorId();
  const value = (name: string, max: number) => String(formData.get(name) ?? "").trim().slice(0, max) || null;
  await prisma.adminProfile.upsert({
    where: { instructorId: id },
    create: { instructorId: id, title: value("title",120), organization:value("organization",200), qualification:value("qualification",200), bio:value("bio",3000), phone:value("phone",80), emailPublic:value("emailPublic",200), website:value("website",500), photoUrl:value("photoUrl",1000) },
    update: { title: value("title",120), organization:value("organization",200), qualification:value("qualification",200), bio:value("bio",3000), phone:value("phone",80), emailPublic:value("emailPublic",200), website:value("website",500), photoUrl:value("photoUrl",1000) },
  });
  revalidatePath("/about");
  return { ok: true };
}
