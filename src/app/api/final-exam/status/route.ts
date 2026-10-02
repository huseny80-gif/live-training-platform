import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { finalJobStatus } from "@/lib/ai/final-jobs";
export async function GET(request: NextRequest) {
  const user = await auth(); if (!user?.user?.id) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const programId = request.nextUrl.searchParams.get("programId"); if (!programId) return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  const status = await finalJobStatus(programId, user.user.id);
  return status ? NextResponse.json(status) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}
