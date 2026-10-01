// Next.js 16: proxy.ts for route protection (replaces middleware.ts)
// Uses edge-compatible auth config — no Prisma, no pg adapter
import NextAuth from "next-auth";
import { authConfig } from "./lib/auth.config";

const { auth } = NextAuth(authConfig);

const PRODUCTION_HOST = "live-training-platform.vercel.app";

function productionRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();

  const isVercelPreview =
    host.endsWith(".vercel.app") &&
    host !== PRODUCTION_HOST;

  if (!isVercelPreview) return null;

  const target = new URL(url.pathname + url.search, `https://${PRODUCTION_HOST}`);
  return Response.redirect(target, 307);
}

// Next.js 16 proxy: must export a named "proxy" function or default
export async function proxy(request: Request) {
  // Preview deployments intentionally do not serve the live application.
  // This prevents users from landing on a deployment with missing Preview
  // environment variables and guarantees one canonical runtime origin.
  const redirect = productionRedirect(request);
  if (redirect) return redirect;

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
