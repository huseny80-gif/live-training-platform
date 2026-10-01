"use client";

import { useState } from "react";

export default function ShareLinkButton({ url }: { url: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "الحقيبة التدريبية",
          text: "انضم إلى جلسة الاختبار",
          url,
        });
        setMessage("تمت مشاركة الرابط بنجاح");
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("تم نسخ الرابط");
      }
      setTimeout(() => setMessage(null), 2000);
    } catch {
      return;
    }
  }

  return (
    <button type="button" onClick={handleShare} className="dlp-action-button share">
      {message ?? "مشاركة رابط الجلسة"}
    </button>
  );
}
