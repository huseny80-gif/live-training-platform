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
const BAR_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

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
      if (!res.ok) throw new Error("Export failed");
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
      <main dir="rtl" lang="ar" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500 text-sm animate-pulse">جاري تحميل النتائج…</div>
      </main>
    );
  }

  if (!data) {
    return (
      <main dir="rtl" lang="ar" className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500 text-sm">فشل تحميل بيانات الجلسة.</div>
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
    <main dir="rtl" lang="ar" className="dlp-simple-page p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/programs/${id}/sessions/${sessionId}`}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              → الجلسة
            </Link>
            <span className="text-gray-300">/</span>
            <h1 className="font-bold text-gray-900">تحليلات الاختبار</h1>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            {exporting ? "جاري التصدير…" : "⬇ تصدير النتائج Excel"}
          </button>
        </div>

        {/* KPI Cards */}
        {statistics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                label: "المشاركون",
                value: statistics.totalParticipants,
                sub: "",
                color: "bg-blue-50 border-blue-100",
                text: "text-blue-700",
              },
              {
                label: "نسبة المشاركة",
                value: `${participationPct}%`,
                sub: "أجاب على سؤال واحد على الأقل",
                color: "bg-emerald-50 border-emerald-100",
                text: "text-emerald-700",
              },
              {
                label: "متوسط الدرجات",
                value: statistics.averageScore.toFixed(1),
                sub: "نقطة",
                color: "bg-amber-50 border-amber-100",
                text: "text-amber-700",
              },
              {
                label: "أعلى درجة",
                value: statistics.highestScore,
                sub: "نقطة",
                color: "bg-purple-50 border-purple-100",
                text: "text-purple-700",
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className={`rounded-2xl border p-5 ${kpi.color} flex flex-col gap-1`}
              >
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  {kpi.label}
                </p>
                <p className={`text-3xl font-bold ${kpi.text}`}>{kpi.value}</p>
                {kpi.sub && (
                  <p className="text-xs text-gray-400">{kpi.sub}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Score Distribution */}
          <div className="bg-white rounded-2xl border p-5">
            <h2 className="font-semibold text-gray-800 mb-4 text-sm">
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
          <div className="bg-white rounded-2xl border p-5">
            <h2 className="font-semibold text-gray-800 mb-4 text-sm">
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
                <Bar dataKey="accuracy" fill="#3b82f6" radius={[4, 4, 0, 0]}>
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
        <div className="bg-white rounded-2xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">
            🏆 المتصدرون ({participants.length})
          </h2>
          <div className="space-y-2">
            {participants.map((p, idx) => (
              <div
                key={p.id}
                className="flex items-center gap-3 text-sm border rounded-xl px-3 py-2.5"
              >
                <span className="w-8 text-center text-lg">
                  {idx < 3 ? MEDAL[idx] : `#${p.rank ?? idx + 1}`}
                </span>
                <span className="flex-1 font-medium text-gray-800 truncate">
                  {p.displayName}
                </span>
                <span className="text-xs text-gray-400 mr-2">
                  {p.correctCount}/{p.answersCount} صحيح
                </span>
                <span className="text-xs text-gray-400 mr-2">
                  {p.percentage}%
                </span>
                <span className="font-bold text-blue-700 min-w-[52px] text-right">
                  {p.totalScore} نقطة
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Question Analysis Table */}
        <div className="bg-white rounded-2xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">
            تحليل الأسئلة
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-xs text-gray-500 border-b">
                  <th className="pb-2 pr-3 w-10">رقم</th>
                  <th className="pb-2 pr-3">السؤال</th>
                  <th className="pb-2 pr-3 text-right w-24">الإجابات</th>
                  <th className="pb-2 pr-3 text-right w-20">الصحيح</th>
                  <th className="pb-2 text-right w-20">الدقة</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.sessionQuestionId} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-gray-400">
                      Q{q.questionOrder}
                    </td>
                    <td className="py-2 pr-3 text-gray-700 max-w-xs truncate">
                      {q.questionText}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-600">
                      {q.totalAnswers}
                    </td>
                    <td className="py-2 pr-3 text-right text-gray-600">
                      {q.correctAnswers}
                    </td>
                    <td className="py-2 text-right font-medium">
                      <span
                        className={
                          q.accuracy >= 70
                            ? "text-emerald-600"
                            : q.accuracy >= 40
                            ? "text-amber-600"
                            : "text-red-500"
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
