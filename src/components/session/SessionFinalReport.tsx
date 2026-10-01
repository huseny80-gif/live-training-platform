"use client";

import { useEffect, useState, useCallback } from "react";

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
  return <div className="dlp-report-row"><span>{label}</span><strong>{value}</strong></div>;
}

export default function SessionFinalReport({ sessionId }: { sessionId: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState(false);

  const fetchReport = useCallback(async () => {
    setError(false);
    try {
      const response = await fetch(`/api/session/${sessionId}/analytics`, { cache: "no-store" });
      if (!response.ok) throw new Error("REPORT_LOAD_FAILED");
      setData(await response.json());
    } catch {
      setError(true);
    }
  }, [sessionId]);

  useEffect(() => { void fetchReport(); }, [fetchReport]);

  if (error) return <div className="dlp-live-error"><p>تعذّر تحميل التقرير النهائي.</p><button type="button" onClick={fetchReport}>إعادة المحاولة</button></div>;
  if (!data || data.totalAnswers === 0) return null;

  return (
    <section className="brand-card dlp-live-panel">
      <div className="dlp-live-panel-head"><h2>📋 التقرير النهائي للجلسة</h2></div>
      <div className="dlp-report-list">
        <Row label="إجمالي المشاركين" value={data.participantCount} />
        <Row label="أكملوا الاختبار" value={data.completedCount} />
        <Row label="نسبة المشاركة" value={`${data.participationRate}%`} />
        <Row label="إجمالي الإجابات" value={data.totalAnswers} />
        <Row label="الإجابات الصحيحة" value={data.correctAnswers} />
        <Row label="نسبة الصحة" value={`${data.correctRate}%`} />
        <Row label="متوسط الدرجة" value={data.averageScore} />
        <Row label="أعلى درجة" value={data.highestScore} />
      </div>
    </section>
  );
}
