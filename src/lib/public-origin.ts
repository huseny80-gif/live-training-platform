const DEFAULT_PARTICIPANT_ORIGIN = "https://live-training-platform.vercel.app";

export function getPublicParticipantOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_PARTICIPANT_URL?.trim();
  if (!configured) return DEFAULT_PARTICIPANT_ORIGIN;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("INVALID_NEXT_PUBLIC_PARTICIPANT_URL");
  }

  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) {
    throw new Error("NEXT_PUBLIC_PARTICIPANT_URL_MUST_USE_HTTPS");
  }

  return url.origin.replace(/\/$/, "");
}
