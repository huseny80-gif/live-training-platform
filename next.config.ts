import type { NextConfig } from "next";

function hostFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

const allowedOrigins = Array.from(
  new Set(
    [
      hostFromUrl(process.env.NEXTAUTH_URL),
      hostFromUrl(process.env.AUTH_URL),
      hostFromUrl(process.env.NEXT_PUBLIC_PARTICIPANT_URL),
      "localhost:3000",
    ].filter((value): value is string => Boolean(value)),
  ),
);

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;
