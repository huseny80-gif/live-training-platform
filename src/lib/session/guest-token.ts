// Guest JWT for participants — issued on join, verified on answer submission.
// Payload contains participantId and sessionId.
// Secret: SESSION_SECRET env var — required in ALL environments.
// Must be independent from AUTH_SECRET so a crafted NextAuth token cannot be
// accepted as a guest token or vice versa.

import jwt from "jsonwebtoken";
import crypto from "crypto";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  throw new Error(
    "SESSION_SECRET is required for guest tokens. Set it in your environment variables."
  );
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
