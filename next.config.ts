import type { NextConfig } from "next";

// PDF.js loads its worker and native Node helpers dynamically.
const pdfRuntimeFiles = [
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "./node_modules/@napi-rs/canvas/**/*",
  "./node_modules/@napi-rs/canvas-*/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/documents/process": pdfRuntimeFiles,
    "/programs/*": pdfRuntimeFiles,
  },
  experimental: {
    serverActions: {
      allowedOrigins: process.env.NEXTAUTH_URL
        ? [new URL(process.env.NEXTAUTH_URL).host, "localhost:3000"]
        : ["localhost:3000"],
    },
  },
};

export default nextConfig;
