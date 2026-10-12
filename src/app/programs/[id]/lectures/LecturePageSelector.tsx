"use client";

import { useId, useState } from "react";

type LecturePage = {
  id: string;
  pageNumber: number;
  title: string | null;
  extractedText: string | null;
};

export default function LecturePageSelector({ pages }: { pages: LecturePage[] }) {
  const fieldId = useId();
  const [selectedId, setSelectedId] = useState(pages[0]?.id ?? "");
  const selected = pages.find(page => page.id === selectedId) ?? pages[0];

  if (!selected) return <p className="em-muted">لم تُجهّز صفحات هذه المحاضرة بعد.</p>;

  return <div className="em-stack">
    <label htmlFor={fieldId}>اختر صفحة المحاضرة</label>
    <select id={fieldId} className="em-share lecture-page-select" value={selected.id}
      onChange={event => setSelectedId(event.target.value)}>
      {pages.map(page => <option key={page.id} value={page.id}>
        صفحة {page.pageNumber}{page.title ? ` — ${page.title}` : ""}
      </option>)}
    </select>
    <section className="em-glass em-pad" aria-labelledby={`${fieldId}-heading`}>
      <h3 id={`${fieldId}-heading`}>صفحة {selected.pageNumber}{selected.title ? ` — ${selected.title}` : ""}</h3>
      <p className="lecture-text">{selected.extractedText?.trim() ? selected.extractedText : "لم يُستخرج نص لهذه الصفحة بعد."}</p>
    </section>
  </div>;
}
