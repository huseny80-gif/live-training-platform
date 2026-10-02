"use server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function updateAccountName(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 100) redirect("/settings?error=name");
  await prisma.instructor.update({ where: { id: session.user.id }, data: { name } });
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}
