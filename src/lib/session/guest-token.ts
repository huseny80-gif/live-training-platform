// Guest JWT for participants — issued on join, verified on answer submission.
// Payload contains participantId and sessionId.
// Secret: SESSION_SECRET env var (required) — must be independent from AUTH_SECRET.
//
// In production, SESSION_SECRET must be set explicitly. Falling back to AUTH_SECRET
// would allow a crafted NextAuth token to be accepted as a guest token.
// In non-production environments the fallback is permitted for local dev convenience,
// but a warning is printed to stderr so the gap is visible in logs.

import jwt from "jsonwebtoken";
import crypto from "crypto";

function getSecret(): string {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) return explicit;

  if (process.env.NODE_ENV === "production") {
    // Hard failure in production — misconfiguration must surface immediately.
    throw new Error(
      "SESSION_SECRET env var is required in production and must not fall back to AUTH_SECRET"
    );
  }

  // Non-production only: allow AUTH_SECRET as a convenience fallback.
  const fallback = process.env.AUTH_SECRET;
  if (fallback) {
    process.stderr.write(
      "[guest-token] WARNING: SESSION_SECRET not set — using AUTH_SECRET as fallback. " +
        "Set SESSION_SECRET to an independent value before deploying to production.\n"
    );
    return fallback;
  }

  throw new Error("SESSION_SECRET env var not set");
}

export interface GuestTokenPayload {
  participantId: string;
  sessionId: string;
  displayName: string;
}

export function issueGuestToken(payload: GuestTokenPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "12h", algorithm: "HS256" });
}

export function verifyGuestToken(token: string): GuestTokenPayload {
  const decoded = jwt.verify(token, getSecret(), { algorithms: ["HS256"] });
  if (
    typeof decoded !== "object" ||
    !decoded ||
    typeof (decoded as Record<string, unknown>).participantId !== "string"
  ) {
    throw new Error("INVALID_TOKEN");
  }
  return decoded as GuestTokenPayload;
}

/** Hash of the token stored in DB — so the raw JWT is never persisted */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
