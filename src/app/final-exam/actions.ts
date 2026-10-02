"use server";
import { auth } from "@/lib/auth";
import { createFinalSession } from "@/lib/session/service";
import { redirect } from "next/navigation";
export async function createFinalExam(form: FormData) {
  const user = await auth(); if (!user?.user?.id) redirect("/login");
  const programId = String(form.get("programId") ?? "");
  let session;
  try { session = await createFinalSession(programId, user.user.id, Number(form.get("count"))); }
  catch { redirect(`/final-exam?programId=${encodeURIComponent(programId)}&error=questions`); }
  redirect(`/programs/${programId}/sessions/${session.id}`);
}
