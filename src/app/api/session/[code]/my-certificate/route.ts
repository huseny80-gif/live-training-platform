// GET /api/session/[code]/my-certificate
// Authenticated via guest_token cookie. Returns the participant's certificate
// for this session. Never exposes raw tokens or correctOptionId.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCertificateForParticipant } from "@/lib/session/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("guest_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const cert = await getCertificateForParticipant(token, code);
    return NextResponse.json(cert);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ERROR";
    const status =
      msg === "INVALID_TOKEN" ? 401 :
      msg === "SESSION_NOT_FOUND" || msg === "SESSION_MISMATCH" ? 404 :
      msg === "CERTIFICATE_NOT_FOUND" ? 404 :
      msg === "CERTIFICATE_REVOKED" ? 410 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
