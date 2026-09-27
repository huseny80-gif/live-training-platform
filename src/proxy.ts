// Next.js 16: proxy.ts for route protection (replaces middleware.ts)
// Uses edge-compatible auth config — no Prisma, no pg adapter
import NextAuth from "next-auth";
import { authConfig } from "./lib/auth.config";

const { auth } = NextAuth(authConfig);

// Next.js 16 proxy: must export a named "proxy" function or default
export async function proxy(request: Request) {
  const pathname = new URL(request.url).pathname;

  // Inject x-request-id on all /api/* requests (pass-through or generate UUID).
  if (pathname.startsWith("/api/")) {
    const requestId =
      (request.headers.get("x-request-id") as string | null) ??
      globalThis.crypto.randomUUID();

    // handleUpload reads the JSON body; auth(request) consumes the stream first.
    // Return early without calling auth so the body stream stays intact.
    if (pathname === "/api/documents/upload-url") {
      return undefined;
    }

    const headers = new Headers(request.headers);
    headers.set("x-request-id", requestId);
    const tagged = new Request(request, { headers });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authRes = await ((auth as unknown) as (req: Request) => Promise<Response | undefined>)(tagged);
    if (authRes) {
      authRes.headers.set("x-request-id", requestId);
    }
    return authRes;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return auth(request as any);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
