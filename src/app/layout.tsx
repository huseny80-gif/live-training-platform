import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "الحقيبة التدريبية",
  description: "منصة التدريب المباشر والاختبارات التفاعلية",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="brand-page">{children}</body>
    </html>
  );
}
