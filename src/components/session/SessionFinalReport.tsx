"use client";

import { useEffect, useState } from "react";

interface ReportData {
  participantCount: number;
  completedCount: number;
  participationRate: number;
  averageScore: number;
  highestScore: number;
  correctAnswers: number;
  totalAnswers: number;
  correctRate: number;
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="tp-flex tp-justify-between tp-text-sm tp-py-2 tp-border-b tp-last-border-0">
      <span className="tp-text-gray-600">{label}</span>
      <span className="tp-font-semibold tp-text-gray-800">{value}</span>
    </div>
  );
}

export default function SessionFinalReport({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState(false);

  const fetchReport = () => {
    setError(false);
    fetch(`/api/session/${sessionId}/analytics`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setData(d))
      .catch(() => setError(true));
  };

  useEffect(() => { fetchReport(); }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="tp-bg-white tp-rounded-2xl tp-border tp-border-red-200 tp-p-5 tp-flex tp-items-center tp-justify-between tp-gap-4">
        <p className="tp-text-sm tp-text-red-700">تعذّر تحميل التقرير النهائي.</p>
        <button
          type="button"
          onClick={fetchReport}
          className="tp-text-xs tp-text-red-600 tp-underline tp-flex-shrink-0 tp-hover-text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!data || data.totalAnswers === 0) return null;

  return (
    <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5">
      <h2 className="tp-font-semibold tp-text-gray-800 tp-mb-3">📋 التقرير النهائي للجلسة</h2>
      <div className="tp-divide-y">
        <Row label="إجمالي المشاركين" value={data.participantCount} />
        <Row label="أكملوا الاختبار" value={data.completedCount} />
        <Row label="نسبة المشاركة" value={`${data.participationRate}%`} />
        <Row label="إجمالي الإجابات" value={data.totalAnswers} />
        <Row label="الإجابات الصحيحة" value={data.correctAnswers} />
        <Row label="نسبة الصحة" value={`${data.correctRate}%`} />
        <Row label="متوسط الدرجة" value={data.averageScore} />
        <Row label="أعلى درجة" value={data.highestScore} />
      </div>
    </div>
  );
}
