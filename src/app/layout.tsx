import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Training Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
