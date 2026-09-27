"use client";

import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { REALTIME_EVENTS } from "@/lib/realtime/socket-events";

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
    <div className="text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function SessionAnalyticsDashboard({
  sessionId,
  isEnded,
  sessionCode,
}: {
  sessionId: string;
  isEnded: boolean;
  sessionCode?: string;
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

  // Polling fallback — always active while session is live
  useEffect(() => {
    fetchAnalytics();
    if (!isEnded) {
      const id = setInterval(fetchAnalytics, 8000);
      return () => clearInterval(id);
    }
  }, [fetchAnalytics, isEnded]);

  // Socket.IO realtime listener — re-fetches on relevant events
  useEffect(() => {
    if (!sessionCode || isEnded) return;

    const socket = io({ path: "/api/socket", transports: ["websocket"] });

    socket.emit("participant:join_room", { room: `session:${sessionCode}` });

    const refresh = () => { fetchAnalytics(); };

    socket.on(REALTIME_EVENTS.ANSWER_SUBMITTED, refresh);
    socket.on(REALTIME_EVENTS.QUESTION_CHANGED, refresh);
    socket.on(REALTIME_EVENTS.SESSION_ENDED, refresh);

    return () => {
      socket.off(REALTIME_EVENTS.ANSWER_SUBMITTED, refresh);
      socket.off(REALTIME_EVENTS.QUESTION_CHANGED, refresh);
      socket.off(REALTIME_EVENTS.SESSION_ENDED, refresh);
      socket.disconnect();
    };
  }, [sessionCode, isEnded, fetchAnalytics]);

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-5 flex items-center justify-between gap-4">
        <p className="text-sm text-red-700">تعذّر تحميل التحليلات.</p>
        <button
          type="button"
          onClick={fetchAnalytics}
          className="text-xs text-red-600 underline flex-shrink-0 hover:text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!data) return null;
  if (data.totalAnswers === 0 && data.participantCount === 0) return null;

  return (
    <div className="bg-white rounded-2xl border p-5 space-y-5">
      <h2 className="font-semibold text-gray-800">
        {isEnded ? "📊 تحليلات الجلسة النهائية" : "📊 تحليلات مباشرة"}
      </h2>

      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b">
        <StatCard
          label="نسبة المشاركة"
          value={`${data.participationRate}%`}
          color="text-blue-700"
        />
        <StatCard
          label="نسبة الإجابات الصحيحة"
          value={`${data.correctRate}%`}
          color="text-emerald-700"
        />
        <StatCard
          label="متوسط الدرجة"
          value={data.averageScore}
          color="text-purple-700"
        />
        <StatCard
          label="أعلى درجة"
          value={data.highestScore}
          color="text-amber-600"
        />
      </div>

      {/* Answer totals */}
      <div className="flex gap-6 text-sm text-gray-600">
        <span>
          إجمالي الإجابات:{" "}
          <strong className="text-gray-800">{data.totalAnswers}</strong>
        </span>
        <span>
          صحيح:{" "}
          <strong className="text-emerald-700">{data.correctAnswers}</strong>
        </span>
        <span>
          خطأ:{" "}
          <strong className="text-red-600">
            {data.totalAnswers - data.correctAnswers}
          </strong>
        </span>
      </div>

      {/* Per-question breakdown */}
      {data.questions.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">
            صعوبة الأسئلة (نسبة الإجابات الخاطئة)
          </p>
          <div className="space-y-2">
            {data.questions.map((q) => (
              <div key={q.questionId} className="flex items-center gap-3 text-sm">
                <span className="font-mono text-gray-400 w-10 flex-shrink-0">
                  Q{q.questionOrder}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-red-400 transition-all"
                    style={{ width: `${q.difficultyRate}%` }}
                  />
                </div>
                <span className="w-12 text-left text-gray-500">
                  {q.difficultyRate}%
                </span>
                <span className="text-gray-400 text-xs">
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
