import type { NextConfig } from "next";

function serverActionAllowedOrigins(): string[] {
  const origins = new Set<string>(["localhost:3000"]);

  // Production may still define NEXTAUTH_URL explicitly.
  if (process.env.NEXTAUTH_URL) {
    origins.add(new URL(process.env.NEXTAUTH_URL).host);
  }

  // Every Vercel Preview receives its own VERCEL_URL. Including it keeps
  // Server Actions on the deployment that received the request instead of
  // coupling Preview builds to the Production hostname.
  if (process.env.VERCEL_URL) {
    origins.add(process.env.VERCEL_URL);
  }

  return [...origins];
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: serverActionAllowedOrigins(),
    },
  },
};

export default nextConfig;
