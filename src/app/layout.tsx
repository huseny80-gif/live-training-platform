import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "الحقيبة التدريبية",
  description: "منصة التدريب المباشر والاختبارات التفاعلية",
};

const appearanceInit = `
(function () {
  try {
    var theme = localStorage.getItem("dlp-theme") || "system";
    var font = localStorage.getItem("dlp-font-size") || "medium";
    var resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.fontSize = font;
  } catch (_) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: appearanceInit }} />
      </head>
      <body className="brand-page">{children}</body>
    </html>
  );
}
