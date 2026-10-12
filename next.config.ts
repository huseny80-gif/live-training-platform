import type { NextConfig } from "next";

// PDF.js loads its worker and native Node helpers dynamically.
const pdfRuntimeFiles = [
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
  "./node_modules/@napi-rs/canvas/**/*",
  "./node_modules/@napi-rs/canvas-*/**/*",
];

const ocrRuntimeFiles = [...pdfRuntimeFiles, "./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/**/*",
  "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**/*", "./node_modules/@tesseract.js-data/ara/4.0.0_best_int/**/*"];
const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas", "tesseract.js", "tesseract.js-core", "@tesseract.js-data/eng", "@tesseract.js-data/ara"],
  outputFileTracingIncludes: {
    "/api/exam-material": ocrRuntimeFiles,
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
