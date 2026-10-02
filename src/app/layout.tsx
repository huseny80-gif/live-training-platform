import PlatformNav from "@/components/platform/PlatformNav";
import type { Metadata } from "next";
import "./portfolio-ui.css";
import "./brand-tokens.css";

export const metadata: Metadata = {
  title: "الحقيبة التدريبية",
  description: "منصة التدريب المباشر والاختبارات التفاعلية",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="brand-page"><PlatformNav />{children}</body>
    </html>
  );
}
