// PATCH /api/session/[code]/certificates/[certId]/revoke
// Instructor-only. Revokes an issued certificate.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeCertificate } from "@/lib/session/service";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ certId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { certId } = await params;

  try {
    const cert = await revokeCertificate(certId, session.user.id);
    return NextResponse.json({ ok: true, revokedAt: cert.revokedAt?.toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ERROR";
    const status =
      msg === "CERTIFICATE_NOT_FOUND" ? 404 :
      msg === "UNAUTHORIZED" ? 403 :
      msg === "ALREADY_REVOKED" ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
