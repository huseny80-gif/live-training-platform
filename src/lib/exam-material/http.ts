/** Mutation endpoints accept only same-origin browser requests. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && new URL(request.url).origin === origin);
}
export async function smallJson(request: Request) {
  const body = await request.text();
  if (body.length > 16_000) throw new Error("BODY_TOO_LARGE");
  return JSON.parse(body) as unknown;
}
