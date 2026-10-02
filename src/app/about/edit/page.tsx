import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditAbout } from "@/lib/about-permissions";
import { readAbout } from "@/lib/about-store";
import { notFound, redirect } from "next/navigation";
import AboutEditor from "./AboutEditor";

export default async function EditAboutPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const account = await prisma.instructor.findUnique({ where: { id: session.user.id }, select: { role: true, email: true, isActive: true } });
  if (!canEditAbout(account)) notFound();
  const saved = await readAbout();
  return <main className="platform-content"><h1>تعديل معلومات من نحن</h1><AboutEditor content={saved.content} version={saved.version}/></main>;
}
