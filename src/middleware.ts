import { NextRequest, NextResponse } from "next/server";

// Attach x-request-id to all /api requests.
// Passes through any id the caller supplies; otherwise generates a new UUID.
// Uses globalThis.crypto.randomUUID() — Web Crypto API available in Edge Runtime.

export function middleware(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? globalThis.crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
