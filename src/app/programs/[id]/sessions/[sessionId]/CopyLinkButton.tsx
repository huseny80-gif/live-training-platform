"use client";

import { useState } from "react";

export default function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="w-full mt-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors bg-white hover:bg-blue-50 text-blue-700 border-blue-200"
    >
      {copied ? "✓ تم نسخ الرابط بنجاح" : "نسخ رابط الجلسة"}
    </button>
  );
}
