"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
type FontSize = "small" | "medium" | "large";

const THEME_KEY = "dlp-theme";
const FONT_KEY = "dlp-font-size";

function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme;
  document.documentElement.dataset.theme = resolved;
}

function applyFont(size: FontSize) {
  document.documentElement.dataset.fontSize = size;
}

export default function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>("system");
  const [fontSize, setFontSize] = useState<FontSize>("medium");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const storedTheme = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system";
    const storedFont = (localStorage.getItem(FONT_KEY) as FontSize | null) ?? "medium";
    setTheme(storedTheme);
    setFontSize(storedFont);
    applyTheme(storedTheme);
    applyFont(storedFont);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (((localStorage.getItem(THEME_KEY) as Theme | null) ?? "system") === "system") {
        applyTheme("system");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function save() {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(FONT_KEY, fontSize);
    applyTheme(theme);
    applyFont(fontSize);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function reset() {
    localStorage.removeItem(THEME_KEY);
    localStorage.removeItem(FONT_KEY);
    setTheme("system");
    setFontSize("medium");
    applyTheme("system");
    applyFont("medium");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <section className="brand-card dlp-settings-card">
      <h1>الإعدادات</h1>
      <p className="dlp-settings-note">
        هذه التفضيلات خاصة بواجهة الحقيبة على هذا الجهاز ولا تغيّر محتوى البرامج أو بيانات الجلسات.
      </p>

      <div className="dlp-appearance-grid">
        <div>
          <strong>المظهر</strong>
          <small>اختر الوضع المناسب للواجهة.</small>
          <div className="dlp-choice-group">
            {([
              ["light", "فاتح"],
              ["dark", "داكن"],
              ["system", "حسب النظام"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={theme === value ? "active" : ""}
                onClick={() => {
                  setTheme(value);
                  applyTheme(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <strong>حجم الخط</strong>
          <small>غيّر حجم النص في واجهة الإدارة.</small>
          <div className="dlp-choice-group">
            {([
              ["small", "صغير"],
              ["medium", "متوسط"],
              ["large", "كبير"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={fontSize === value ? "active" : ""}
                onClick={() => {
                  setFontSize(value);
                  applyFont(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dlp-settings-actions">
        <button type="button" className="dlp-control-button primary" onClick={save}>
          حفظ الإعدادات
        </button>
        <button type="button" className="dlp-control-button neutral" onClick={reset}>
          استعادة الافتراضي
        </button>
        {saved ? <span className="dlp-success">تم تطبيق الإعدادات ✓</span> : null}
      </div>
    </section>
  );
}
