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
      className="tp-w-full tp-mt-2 tp-px-3 tp-py-2 tp-rounded-lg tp-border tp-text-sm tp-font-medium tp-transition-colors tp-bg-white tp-hover-bg-blue-50 tp-text-blue-700 tp-border-blue-200"
    >
      {copied ? "✓ تم نسخ الرابط بنجاح" : "نسخ رابط الجلسة"}
    </button>
  );
}
