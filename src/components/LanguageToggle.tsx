"use client";

import { useEffect, useState } from "react";

export default function LanguageToggle() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  useEffect(() => {
    const saved = localStorage.getItem("portfolio-language") === "en" ? "en" : "ar";
    setLang(saved);
    document.documentElement.lang = saved;
    document.documentElement.dir = saved === "ar" ? "rtl" : "ltr";
  }, []);
  function change(next: "ar" | "en") {
    setLang(next);
    localStorage.setItem("portfolio-language", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    window.dispatchEvent(new CustomEvent("portfolio-language", { detail: next }));
  }
  return <div className="dlp-language-toggle" aria-label="Language">
    <button className={lang === "ar" ? "active" : ""} onClick={() => change("ar")}>العربية</button>
    <button className={lang === "en" ? "active" : ""} onClick={() => change("en")}>English</button>
  </div>;
}
