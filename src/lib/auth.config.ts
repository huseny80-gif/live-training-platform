// Edge-compatible auth config — no Node.js-only modules (no prisma, no pg)
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic =
        nextUrl.pathname === "/about" ||
        nextUrl.pathname === "/exam-material-recovery.json" ||
        nextUrl.pathname === "/gis-review-encrypted.json" ||
        nextUrl.pathname === "/hussein-profile.webp" ||
        nextUrl.pathname === "/training-logo.webp" ||
        nextUrl.pathname.startsWith("/login") ||
        nextUrl.pathname.startsWith("/api/auth") ||
        nextUrl.pathname.startsWith("/join") ||
        (nextUrl.pathname === "/session" || nextUrl.pathname.startsWith("/session/")) ||
        nextUrl.pathname.startsWith("/study/") ||
        nextUrl.pathname.startsWith("/api/study/") ||
        nextUrl.pathname.startsWith("/api/session");
      if (!isLoggedIn && !isPublic) return false;
      if (isLoggedIn && nextUrl.pathname === "/login") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
  },
};
