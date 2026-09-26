// Next.js 16: proxy.ts for route protection (replaces middleware.ts)
// Uses edge-compatible auth config — no Prisma, no pg adapter
import NextAuth from "next-auth";
import { authConfig } from "./lib/auth.config";

const { auth } = NextAuth(authConfig);

// Next.js 16 proxy: must export a named "proxy" function or default
export async function proxy(request: Request) {
  const pathname = new URL(request.url).pathname;

  // handleUpload reads the JSON body; auth(request) consumes the stream first.
  if (pathname === "/api/documents/upload-url") {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return auth(request as any);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
