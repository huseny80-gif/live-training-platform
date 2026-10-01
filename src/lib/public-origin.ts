const DEFAULT_PARTICIPANT_ORIGIN = "https://live-training-platform.vercel.app";
const PRODUCTION_VERCEL_HOST = "live-training-platform.vercel.app";

export function getPublicParticipantOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_PARTICIPANT_URL?.trim();
  if (!configured) return DEFAULT_PARTICIPANT_ORIGIN;

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("INVALID_NEXT_PUBLIC_PARTICIPANT_URL");
  }

  const host = url.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) {
    throw new Error("NEXT_PUBLIC_PARTICIPANT_URL_MUST_USE_HTTPS");
  }

  // Never encode a Vercel branch/preview deployment in a public QR.
  // Preview deployments may be protected by Vercel Authentication.
  if (host.endsWith(".vercel.app") && host !== PRODUCTION_VERCEL_HOST) {
    return DEFAULT_PARTICIPANT_ORIGIN;
  }
  if (host === "vercel.com" || host.endsWith(".vercel.com")) {
    return DEFAULT_PARTICIPANT_ORIGIN;
  }

  return url.origin.replace(/\/$/, "");
}
