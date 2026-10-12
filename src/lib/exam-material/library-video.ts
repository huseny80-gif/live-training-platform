/** Only this exact internal route is accepted; arbitrary relative URLs are not sources. */
export function libraryVideoId(url: string | null | undefined) {
  return /^\/api\/resources\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/file$/i.exec(url ?? '')?.[1] ?? null;
}
export function videoReviewUrl(url: string, seconds: number, token?: string | null) {
  const id = libraryVideoId(url);
  if (!id) return null;
  const base = token ? `/api/study/${encodeURIComponent(token)}/video/${id}` : url;
  return `${base}#t=${Math.max(0, Math.floor(seconds))}`;
}
