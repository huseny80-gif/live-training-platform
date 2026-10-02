"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { aboutGroups, type AboutContent } from "@/lib/about-content";
import { updateAbout } from "./actions";

export default function AboutEditor({ content, version }: { content: AboutContent; version: string }) {
  const [currentVersion, setVersion] = useState(version);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <form className="tp-space-y-5" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError(""); setMessage("");
    start(async () => {
      try {
        const result = await updateAbout(form);
        if (result.ok) { setVersion(result.version); setMessage("تم حفظ معلومات «من نحن» ونشرها في الصفحة."); }
        else setError(result.error);
      } catch { setError("تعذّر الحفظ. حاول مجدداً بعد التحقق من الاتصال."); }
    });
  }}>
    <input type="hidden" name="version" value={currentVersion}/>
    <p>يمكن تعديل جميع المعلومات أدناه. ضع كل نقطة في سطر مستقل داخل حقول القوائم. اترك رابط التواصل فارغاً لإظهار «ستُفعّل قريباً».</p>
    {aboutGroups.map(group => <fieldset key={group.title} className="brand-card tp-p-4 tp-space-y-3" disabled={pending}><legend>{group.title}</legend>
      {group.fields.map(field => <div key={field.key} className="tp-space-y-2"><label htmlFor={`about-${field.key}`}>{field.label}</label>
        {field.multiline ? <textarea id={`about-${field.key}`} name={field.key} className="platform-input" rows={5} maxLength={4000} defaultValue={content[field.key]}/> : <input id={`about-${field.key}`} name={field.key} className="platform-input" maxLength={2000} defaultValue={content[field.key]}/>}
        {field.hint && <p className="tp-text-sm">{field.hint}</p>}
      </div>)}
    </fieldset>)}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="tp-flex tp-flex-wrap tp-gap-3"><button type="submit" className="brand-btn brand-btn-primary" disabled={pending}>{pending ? "جاري الحفظ…" : "حفظ معلومات من نحن"}</button><Link className="brand-btn brand-btn-secondary" href="/about">عرض الصفحة</Link></div>
  </form>;
}
