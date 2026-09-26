import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const instructorId = session.user.id;

  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "MISSING_DOCUMENT_ID" }, { status: 400 });
  }

  const doc = await prisma.trainingDocument.findFirst({
    where: { id: documentId, program: { instructorId } },
    select: {
      id: true,
      extractionStatus: true,
      extractionNotes: true,
      pageCount: true,
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json(doc);
}
