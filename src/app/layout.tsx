import type { Metadata } from "next";
import "./brand-tokens.css";

export const metadata: Metadata = {
  title: "القيادة الرقمية والحوكمة الذكية",
  description: "Digital Leadership & Smart Governance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="brand-page">{children}</body>
    </html>
  );
}
