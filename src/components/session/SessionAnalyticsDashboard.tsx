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

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="tp-text-center">
      <p className={`tp-text-2xl tp-font-bold ${color}`}>{value}</p>
      <p className="tp-text-xs tp-text-gray-500 tp-mt-0-5">{label}</p>
    </div>
  );
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
      const res = await fetch(`/api/session/${sessionId}/analytics`, {
        cache: "no-store",
      });
      if (!res.ok) { setError(true); return; }
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchAnalytics();
    if (!isEnded) {
      const id = setInterval(fetchAnalytics, 8000);
      return () => clearInterval(id);
    }
  }, [fetchAnalytics, isEnded]);

  if (error) {
    return (
      <div className="tp-bg-white tp-rounded-2xl tp-border tp-border-red-200 tp-p-5 tp-flex tp-items-center tp-justify-between tp-gap-4">
        <p className="tp-text-sm tp-text-red-700">تعذّر تحميل التحليلات.</p>
        <button
          type="button"
          onClick={fetchAnalytics}
          className="tp-text-xs tp-text-red-600 tp-underline tp-flex-shrink-0 tp-hover-text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!data) return null;
  if (data.totalAnswers === 0 && data.participantCount === 0) return null;

  return (
    <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5 tp-space-y-5">
      <h2 className="tp-font-semibold tp-text-gray-800">
        {isEnded ? "📊 تحليلات الجلسة النهائية" : "📊 تحليلات مباشرة"}
      </h2>

      {/* Top stats */}
      <div className="tp-grid tp-grid-cols-2 tp-sm-grid-cols-4 tp-gap-4 tp-pb-4 tp-border-b">
        <StatCard
          label="نسبة المشاركة"
          value={`${data.participationRate}%`}
          color="tp-text-blue-700"
        />
        <StatCard
          label="نسبة الإجابات الصحيحة"
          value={`${data.correctRate}%`}
          color="tp-text-emerald-700"
        />
        <StatCard
          label="متوسط الدرجة"
          value={data.averageScore}
          color="tp-text-purple-700"
        />
        <StatCard
          label="أعلى درجة"
          value={data.highestScore}
          color="tp-text-amber-600"
        />
      </div>

      {/* Answer totals */}
      <div className="tp-flex tp-gap-6 tp-text-sm tp-text-gray-600">
        <span>
          إجمالي الإجابات:{" "}
          <strong className="tp-text-gray-800">{data.totalAnswers}</strong>
        </span>
        <span>
          صحيح:{" "}
          <strong className="tp-text-emerald-700">{data.correctAnswers}</strong>
        </span>
        <span>
          خطأ:{" "}
          <strong className="tp-text-red-600">
            {data.totalAnswers - data.correctAnswers}
          </strong>
        </span>
      </div>

      {/* Per-question breakdown */}
      {data.questions.length > 0 && (
        <div>
          <p className="tp-text-sm tp-font-medium tp-text-gray-600 tp-mb-2">
            صعوبة الأسئلة (نسبة الإجابات الخاطئة)
          </p>
          <div className="tp-space-y-2">
            {data.questions.map((q) => (
              <div key={q.questionId} className="tp-flex tp-items-center tp-gap-3 tp-text-sm">
                <span className="tp-font-mono tp-text-gray-400 tp-w-10 tp-flex-shrink-0">
                  س{q.questionOrder}
                </span>
                <div className="tp-flex-1 tp-bg-gray-100 tp-rounded-full tp-h-2 tp-overflow-hidden">
                  <div
                    className="tp-h-2 tp-rounded-full tp-bg-red-400 tp-transition-all"
                    style={{ width: `${q.difficultyRate}%` }}
                  />
                </div>
                <span className="tp-w-12 tp-text-left tp-text-gray-500">
                  {q.difficultyRate}%
                </span>
                <span className="tp-text-gray-400 tp-text-xs">
                  {q.correct}✓ {q.wrong}✗
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
