import { randomUUID } from "node:crypto";

export type VideoCue = { id: string; startSeconds: number; endSeconds: number; text: string };
function seconds(value: string) {
  const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) throw new Error("INVALID_TRANSCRIPT");
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

/** Only plain, timestamped, instructor-reviewed captions. Never invent a transcript from a URL. */
export function parseVideoTranscript(input: string): VideoCue[] {
  if (input.length > 120_000 || /\u0000|\uFFFD/u.test(input)) throw new Error("INVALID_TRANSCRIPT");
  const blocks = input.replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/);
  const cues: VideoCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (!block.trim() || /^WEBVTT(?:\s|$)/.test(lines[0]) || /^NOTE(?:\s|$)/.test(lines[0])) continue;
    const index = lines.findIndex(line => line.includes("-->"));
    if (index < 0 || index > 1) throw new Error("INVALID_TRANSCRIPT");
    const match = /^\s*(\S+)\s+-->\s+(\S+)(?:\s+[^\n]*)?$/.exec(lines[index]);
    if (!match) throw new Error("INVALID_TRANSCRIPT");
    const startSeconds = seconds(match[1]), endSeconds = seconds(match[2]);
    // Store caption characters unchanged; HTML/styling isn't source prose and needs manual review.
    const text = lines.slice(index + 1).join("\n");
    if (!text.trim() || /<[^>]*>|&(?:[a-zA-Z]+|#\d+);/.test(text) || endSeconds <= startSeconds || endSeconds > 24 * 3600 || (cues.length && startSeconds < cues[cues.length - 1].endSeconds)) throw new Error("INVALID_TRANSCRIPT");
    cues.push({ id: randomUUID(), startSeconds, endSeconds, text });
    if (cues.length > 2000) throw new Error("INVALID_TRANSCRIPT");
  }
  if (!cues.length) throw new Error("INVALID_TRANSCRIPT");
  return cues;
}

export function safeVideoUrl(input: string) {
  if (!input) return null;
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !["www.youtube.com", "youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"].includes(url.hostname)) throw new Error("INVALID_VIDEO_URL");
  if (url.hostname.includes("youtube.com") && url.pathname !== "/watch") throw new Error("INVALID_VIDEO_URL");
  if (url.hostname.includes("youtube.com") && !/^[\w-]{11}$/.test(url.searchParams.get("v") ?? "")) throw new Error("INVALID_VIDEO_URL");
  if (url.hostname === "youtu.be" && !/^\/[\w-]{11}$/.test(url.pathname)) throw new Error("INVALID_VIDEO_URL");
  if (url.hostname.includes("vimeo.com") && !/^\/\d+$/.test(url.pathname)) throw new Error("INVALID_VIDEO_URL");
  url.hash = "";
  const videoId = url.searchParams.get("v"); url.search = "";
  if (videoId && url.hostname.includes("youtube.com")) url.searchParams.set("v", videoId);
  return url.toString();
}
