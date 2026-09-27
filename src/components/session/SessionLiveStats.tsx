"use client";

import { useEffect, useState, useCallback } from "react";

interface Stats {
  sessionId: string;
  status: string;
  participantCount: number;
  completedCount: number;
  lastUpdated: string;
}

const STATUS_DOT: Record<string, string> = {
  DRAFT:  "🟡",
  ACTIVE: "🟢",
  PAUSED: "🟠",
  ENDED:  "⚫",
};

const STATUS_AR: Record<string, string> = {
  DRAFT:  "في الانتظار",
  ACTIVE: "نشط",
  PAUSED: "موقوف مؤقتاً",
  ENDED:  "منتهي",
};

const STATUS_BG: Record<string, string> = {
  DRAFT:  "bg-yellow-50 border-yellow-200",
  ACTIVE: "bg-green-50 border-green-200",
  PAUSED: "bg-orange-50 border-orange-200",
  ENDED:  "bg-gray-50 border-gray-200",
};

export default function SessionLiveStats({ sessionId }: { sessionId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${sessionId}/stats`, { cache: "no-store" });
      if (!res.ok) { setError(true); return; }
      setStats(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 5000);
    return () => clearInterval(id);
  }, [fetchStats]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
        <p className="text-sm text-red-700">تعذّر تحميل إحصائيات الجلسة.</p>
        <button
          type="button"
          onClick={fetchStats}
          className="text-xs text-red-600 underline flex-shrink-0 hover:text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="bg-white rounded-2xl border p-4 animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-1/3" />
      </div>
    );
  }

  const bgClass = STATUS_BG[stats.status] ?? "bg-gray-50 border-gray-200";

  return (
    <div className={`rounded-2xl border p-4 ${bgClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{STATUS_DOT[stats.status] ?? "⚪"}</span>
          <span className="font-semibold text-gray-800 text-sm">
            {STATUS_AR[stats.status] ?? stats.status}
          </span>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-700">{stats.participantCount}</p>
            <p className="text-xs text-gray-500">المشاركون</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-700">{stats.completedCount}</p>
            <p className="text-xs text-gray-500">أكملوا الاختبار</p>
          </div>
          {stats.participantCount > 0 && (
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-700">
                {Math.round((stats.completedCount / stats.participantCount) * 100)}%
              </p>
              <p className="text-xs text-gray-500">نسبة الإكمال</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
