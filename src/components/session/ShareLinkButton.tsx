"use client";

import { useState } from "react";

interface Props {
  url: string;
}

export default function ShareLinkButton({ url }: Props) {
  const [message, setMessage] = useState<string | null>(null);

  const handleShare = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "الحقيبة التدريبية",
          text: "انضم إلى جلسة الاختبار",
          url,
        });
        setMessage("تمت مشاركة الرابط بنجاح");
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("تم نسخ الرابط (المشاركة غير مدعومة)");
      }
    } catch {
      // user cancelled share or clipboard failed — do nothing
      return;
    }
    setTimeout(() => setMessage(null), 2000);
  };

  return (
    <button
      onClick={handleShare}
      className="w-full mt-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors bg-white hover:bg-green-50 text-green-700 border-green-200"
    >
      {message ?? "مشاركة رابط الجلسة"}
    </button>
  );
}
