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
          title: "جلسة الحقيبة التدريبية",
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
      className="tp-w-full tp-mt-2 tp-px-3 tp-py-2 tp-rounded-lg tp-border tp-text-sm tp-font-medium tp-transition-colors tp-bg-white tp-hover-bg-green-50 tp-text-green-700 tp-border-green-200"
    >
      {message ?? "مشاركة رابط الجلسة"}
    </button>
  );
}
