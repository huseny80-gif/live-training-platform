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
    <div className="flex justify-between text-sm py-2 border-b last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-gray-800">{value}</span>
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
      <div className="bg-white rounded-2xl border border-red-200 p-5 flex items-center justify-between gap-4">
        <p className="text-sm text-red-700">تعذّر تحميل التقرير النهائي.</p>
        <button
          type="button"
          onClick={fetchReport}
          className="text-xs text-red-600 underline flex-shrink-0 hover:text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!data || data.totalAnswers === 0) return null;

  return (
    <div className="bg-white rounded-2xl border p-5">
      <h2 className="font-semibold text-gray-800 mb-3">📋 التقرير النهائي للجلسة</h2>
      <div className="divide-y">
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
