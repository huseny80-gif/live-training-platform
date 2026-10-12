export function formatTimestamp(seconds = 0) {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const rest = `${String(Math.floor(whole / 60) % 60).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
  return hours ? `${String(hours).padStart(2, "0")}:${rest}` : rest;
}

export function captionTimestamp(seconds: number) {
  const milliseconds = Math.round(seconds * 1000);
  const whole = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(whole / 3600)).padStart(2, "0")}:${String(Math.floor(whole / 60) % 60).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")},${String(milliseconds % 1000).padStart(3, "0")}`;
}
export function videoAtTime(input: string, seconds: number) {
  const url = new URL(input);
  if (url.protocol !== "https:" || !["www.youtube.com", "youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"].includes(url.hostname)) return null;
  if (url.hostname.includes("vimeo.com")) url.hash = `t=${Math.floor(seconds)}s`;
  else url.searchParams.set("t", `${Math.floor(seconds)}s`);
  return url.toString();
}
