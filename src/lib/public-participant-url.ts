const PRODUCTION_PARTICIPANT_ORIGIN = "https://live-training-platform.vercel.app";

function normalizeCandidate(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const host = url.hostname.toLowerCase();

    // Never encode a protected/ephemeral Vercel preview deployment in a public QR.
    // The canonical production host is explicitly allowed.
    if (
      host.endsWith(".vercel.app") &&
      host !== "live-training-platform.vercel.app"
    ) {
      return null;
    }

    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return null;
  }
}

export function getPublicParticipantOrigin(
  candidate = process.env.NEXT_PUBLIC_PARTICIPANT_URL,
): string {
  return normalizeCandidate(candidate) ?? PRODUCTION_PARTICIPANT_ORIGIN;
}

export function buildParticipantJoinUrl(
  sessionCode: string,
  candidate = process.env.NEXT_PUBLIC_PARTICIPANT_URL,
): string {
  const code = sessionCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new Error("INVALID_SESSION_CODE");
  }
  return `${getPublicParticipantOrigin(candidate)}/join/${encodeURIComponent(code)}`;
}

export const PUBLIC_PARTICIPANT_ORIGIN = PRODUCTION_PARTICIPANT_ORIGIN;
