const DEFAULT_PUBLIC_PARTICIPANT_ORIGIN = "https://live-training-platform.vercel.app";

export function getPublicParticipantOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_PARTICIPANT_URL?.trim();
  const raw = configured || DEFAULT_PUBLIC_PARTICIPANT_ORIGIN;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("INVALID_NEXT_PUBLIC_PARTICIPANT_URL");
  }

  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("PARTICIPANT_URL_MUST_USE_HTTPS");
  }

  return url.origin.replace(/\/$/, "");
}

export function buildParticipantJoinUrl(sessionCode: string): string {
  const code = sessionCode.trim().toUpperCase();
  return `${getPublicParticipantOrigin()}/join/${encodeURIComponent(code)}`;
}
