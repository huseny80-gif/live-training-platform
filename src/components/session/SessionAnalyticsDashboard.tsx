"use client";

import { useEffect, useState, useCallback } from "react";

interface QuestionStat {
  questionId: string;
  questionOrder: number;
  correct: number;
  wrong: number;
  difficultyRate: number;
}

interface Analytics {
  participantCount: number;
  completedCount: number;
  participationRate: number;
  averageScore: number;
  highestScore: number;
  correctAnswers: number;
  totalAnswers: number;
  correctRate: number;
  questions: QuestionStat[];
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return <div className="dlp-analytics-stat"><strong>{value}</strong><span>{label}</span></div>;
}

export default function SessionAnalyticsDashboard({
  sessionId,
  isEnded,
}: {
  sessionId: string;
  isEnded: boolean;
}) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState(false);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${sessionId}/analytics`, { cache: "no-store" });
      if (!res.ok) { setError(true); return; }
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchAnalytics();
    if (!isEnded) {
      const id = setInterval(fetchAnalytics, 8000);
      return () => clearInterval(id);
    }
  }, [fetchAnalytics, isEnded]);

  if (error) {
    return <div className="dlp-live-error"><p>تعذّر تحميل التحليلات.</p><button type="button" onClick={fetchAnalytics}>إعادة المحاولة</button></div>;
  }
  if (!data || (data.totalAnswers === 0 && data.participantCount === 0)) return null;

  return (
    <section className="brand-card dlp-live-panel">
      <div className="dlp-live-panel-head"><h2>{isEnded ? "تحليلات الجلسة النهائية" : "تحليلات مباشرة"}</h2></div>
      <div className="dlp-analytics-grid">
        <StatCard label="نسبة المشاركة" value={`${data.participationRate}%`} />
        <StatCard label="الإجابات الصحيحة" value={`${data.correctRate}%`} />
        <StatCard label="متوسط الدرجة" value={data.averageScore} />
        <StatCard label="أعلى درجة" value={data.highestScore} />
      </div>
      <div className="dlp-answer-totals">
        <span>إجمالي الإجابات <strong>{data.totalAnswers}</strong></span>
        <span>صحيح <strong>{data.correctAnswers}</strong></span>
        <span>خطأ <strong>{data.totalAnswers - data.correctAnswers}</strong></span>
      </div>
      {data.questions.length > 0 ? (
        <div className="dlp-question-difficulty">
          <p>صعوبة الأسئلة (نسبة الإجابات الخاطئة)</p>
          {data.questions.map((q) => (
            <div key={q.questionId} className="dlp-difficulty-row">
              <span dir="ltr">Q{q.questionOrder}</span>
              <div className="dlp-difficulty-track"><i style={{ width: `${q.difficultyRate}%` }} /></div>
              <strong>{q.difficultyRate}%</strong>
              <small>{q.correct}✓ {q.wrong}✗</small>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
