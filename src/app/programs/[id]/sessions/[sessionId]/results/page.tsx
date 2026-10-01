"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { getSessionResults } from "@/app/actions/sessions";

interface Participant {
  id: string;
  displayName: string;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  answersCount: number;
  rank: number | null;
  percentage: number;
}

interface Question {
  sessionQuestionId: string;
  questionOrder: number;
  questionText: string;
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;
}

interface Statistics {
  totalParticipants: number;
  totalQuestions: number;
  totalAnswers: number;
  totalCorrect: number;
  correctRate: number;
  averageScore: number;
  highestScore: number;
}

const MEDAL = ["🥇", "🥈", "🥉"];
const BAR_COLORS = ["#0f766e", "#115e59", "#c6a15b", "#be123c", "#123c3a"];

export default function SessionResultsPage() {
  const { id, sessionId } = useParams<{ id: string; sessionId: string }>();
  const [data, setData] = useState<{
    participants: Participant[];
    questions: Question[];
    statistics: Statistics | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getSessionResults(sessionId);
      setData(result);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/session/${sessionId}/export`);
      if (!res.ok) throw new Error("تعذّر تصدير النتائج");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Training_Portfolio_Results.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Fallback: open in new tab
      window.open(`/api/session/${sessionId}/export`, "_blank");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <main dir="rtl" lang="ar" className="tp-min-h-screen tp-bg-gray-50 tp-flex tp-items-center tp-justify-center">
        <div className="tp-text-gray-500 tp-text-sm tp-animate-pulse">جاري تحميل النتائج…</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main dir="rtl" lang="ar" className="tp-min-h-screen tp-bg-gray-50 tp-flex tp-items-center tp-justify-center">
        <div className="tp-text-red-500 tp-text-sm">فشل تحميل بيانات الجلسة.</div>
      </main>
    );
  }

  const { participants, questions, statistics } = data;

  const scoreDistribution = (() => {
    const buckets: Record<string, number> = {
      "0–20%": 0,
      "21–40%": 0,
      "41–60%": 0,
      "61–80%": 0,
      "81–100%": 0,
    };
    participants.forEach((p) => {
      const pct = p.percentage;
      if (pct <= 20) buckets["0–20%"]++;
      else if (pct <= 40) buckets["21–40%"]++;
      else if (pct <= 60) buckets["41–60%"]++;
      else if (pct <= 80) buckets["61–80%"]++;
      else buckets["81–100%"]++;
    });
    return Object.entries(buckets).map(([range, count]) => ({ range, count }));
  })();

  const participationPct =
    statistics && statistics.totalParticipants > 0
      ? Math.round(
          (participants.filter((p) => p.answersCount > 0).length /
            statistics.totalParticipants) *
            100
        )
      : 0;

  return (
    <main dir="rtl" lang="ar" className="tp-min-h-screen tp-bg-gray-50 tp-p-6">
      <div className="tp-max-w-5xl tp-mx-auto tp-space-y-6">
        {/* Header */}
        <div className="tp-flex tp-items-center tp-justify-between">
          <div className="tp-flex tp-items-center tp-gap-3">
            <Link
              href={`/programs/${id}/sessions/${sessionId}`}
              className="tp-text-sm tp-text-gray-500 tp-hover-text-gray-800"
            >
              → الجلسة
            </Link>
            <span className="tp-text-gray-300">/</span>
            <h1 className="tp-font-bold tp-text-gray-900">تحليلات الاختبار</h1>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="tp-px-4 tp-py-2 tp-bg-emerald-600 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-emerald-700 tp-disabled-opacity-60 tp-transition-colors"
          >
            {exporting ? "جاري التصدير…" : "⬇ تصدير النتائج Excel"}
          </button>
        </div>

        {/* KPI Cards */}
        {statistics && (
          <div className="tp-grid tp-grid-cols-2 tp-md-grid-cols-4 tp-gap-4">
            {[
              {
                label: "المشاركون",
                value: statistics.totalParticipants,
                sub: "",
                color: "tp-bg-blue-50 tp-border-blue-100",
                text: "tp-text-blue-700",
              },
              {
                label: "نسبة المشاركة",
                value: `${participationPct}%`,
                sub: "أجاب على سؤال واحد على الأقل",
                color: "tp-bg-emerald-50 tp-border-emerald-100",
                text: "tp-text-emerald-700",
              },
              {
                label: "متوسط الدرجات",
                value: statistics.averageScore.toFixed(1),
                sub: "نقطة",
                color: "tp-bg-amber-50 tp-border-amber-100",
                text: "tp-text-amber-700",
              },
              {
                label: "أعلى درجة",
                value: statistics.highestScore,
                sub: "نقطة",
                color: "tp-bg-purple-50 tp-border-purple-100",
                text: "tp-text-purple-700",
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className={`tp-rounded-2xl tp-border tp-p-5 ${kpi.color} tp-flex tp-flex-col tp-gap-1`}
              >
                <p className="tp-text-xs tp-text-gray-500 tp-font-medium tp-uppercase tp-tracking-wide">
                  {kpi.label}
                </p>
                <p className={`tp-text-3xl tp-font-bold ${kpi.text}`}>{kpi.value}</p>
                {kpi.sub && (
                  <p className="tp-text-xs tp-text-gray-400">{kpi.sub}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Charts row */}
        <div className="tp-grid tp-grid-cols-1 tp-md-grid-cols-2 tp-gap-4">
          {/* Score Distribution */}
          <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5">
            <h2 className="tp-font-semibold tp-text-gray-800 tp-mb-4 tp-text-sm">
              توزيع الدرجات
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scoreDistribution} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {scoreDistribution.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Question Accuracy */}
          <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5">
            <h2 className="tp-font-semibold tp-text-gray-800 tp-mb-4 tp-text-sm">
              دقة الأسئلة
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={questions.map((q) => ({
                  name: `Q${q.questionOrder}`,
                  accuracy: q.accuracy,
                }))}
                barSize={28}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="accuracy" fill="#0f766e" radius={[4, 4, 0, 0]}>
                  {questions.map((q) => (
                    <Cell
                      key={q.sessionQuestionId}
                      fill={
                        q.accuracy >= 70
                          ? "#10b981"
                          : q.accuracy >= 40
                          ? "#f59e0b"
                          : "#ef4444"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Leaderboard */}
        <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5">
          <h2 className="tp-font-semibold tp-text-gray-800 tp-mb-4">
            🏆 المتصدرون ({participants.length})
          </h2>
          <div className="tp-space-y-2">
            {participants.map((p, idx) => (
              <div
                key={p.id}
                className="tp-flex tp-items-center tp-gap-3 tp-text-sm tp-border tp-rounded-xl tp-px-3 tp-py-2-5"
              >
                <span className="tp-w-8 tp-text-center tp-text-lg">
                  {idx < 3 ? MEDAL[idx] : `#${p.rank ?? idx + 1}`}
                </span>
                <span className="tp-flex-1 tp-font-medium tp-text-gray-800 tp-truncate">
                  {p.displayName}
                </span>
                <span className="tp-text-xs tp-text-gray-400 tp-mr-2">
                  {p.correctCount}/{p.answersCount} صحيح
                </span>
                <span className="tp-text-xs tp-text-gray-400 tp-mr-2">
                  {p.percentage}%
                </span>
                <span className="tp-font-bold tp-text-blue-700 tp-min-w-52px tp-text-right">
                  {p.totalScore} نقطة
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Question Analysis Table */}
        <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5">
          <h2 className="tp-font-semibold tp-text-gray-800 tp-mb-4">
            تحليل الأسئلة
          </h2>
          <div className="tp-overflow-x-auto">
            <table className="tp-w-full tp-text-sm">
              <thead>
                <tr className="tp-text-right tp-text-xs tp-text-gray-500 tp-border-b">
                  <th className="tp-pb-2 tp-pr-3 tp-w-10">رقم</th>
                  <th className="tp-pb-2 tp-pr-3">السؤال</th>
                  <th className="tp-pb-2 tp-pr-3 tp-text-right tp-w-24">الإجابات</th>
                  <th className="tp-pb-2 tp-pr-3 tp-text-right tp-w-20">الصحيح</th>
                  <th className="tp-pb-2 tp-text-right tp-w-20">الدقة</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.sessionQuestionId} className="tp-border-b tp-last-border-0">
                    <td className="tp-py-2 tp-pr-3 tp-font-mono tp-text-gray-400">
                      س{q.questionOrder}
                    </td>
                    <td className="tp-py-2 tp-pr-3 tp-text-gray-700 tp-max-w-xs tp-truncate">
                      {q.questionText}
                    </td>
                    <td className="tp-py-2 tp-pr-3 tp-text-right tp-text-gray-600">
                      {q.totalAnswers}
                    </td>
                    <td className="tp-py-2 tp-pr-3 tp-text-right tp-text-gray-600">
                      {q.correctAnswers}
                    </td>
                    <td className="tp-py-2 tp-text-right tp-font-medium">
                      <span
                        className={
                          q.accuracy >= 70
                            ? "tp-text-emerald-600"
                            : q.accuracy >= 40
                            ? "tp-text-amber-600"
                            : "tp-text-red-500"
                        }
                      >
                        {q.accuracy}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
