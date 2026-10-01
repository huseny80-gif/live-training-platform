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
  DRAFT:  "tp-bg-yellow-50 tp-border-yellow-200",
  ACTIVE: "tp-bg-green-50 tp-border-green-200",
  PAUSED: "tp-bg-orange-50 tp-border-orange-200",
  ENDED:  "tp-bg-gray-50 tp-border-gray-200",
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
      <div className="tp-rounded-2xl tp-border tp-border-red-200 tp-bg-red-50 tp-p-4 tp-flex tp-items-center tp-justify-between tp-gap-4">
        <p className="tp-text-sm tp-text-red-700">تعذّر تحميل إحصائيات الجلسة.</p>
        <button
          type="button"
          onClick={fetchStats}
          className="tp-text-xs tp-text-red-600 tp-underline tp-flex-shrink-0 tp-hover-text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-4 tp-animate-pulse">
        <div className="tp-h-4 tp-bg-gray-100 tp-rounded tp-w-1-3" />
      </div>
    );
  }

  const bgClass = STATUS_BG[stats.status] ?? "tp-bg-gray-50 tp-border-gray-200";

  return (
    <div className={`tp-rounded-2xl tp-border tp-p-4 ${bgClass}`}>
      <div className="tp-flex tp-flex-wrap tp-items-center tp-justify-between tp-gap-4">
        <div className="tp-flex tp-items-center tp-gap-2">
          <span className="tp-text-lg">{STATUS_DOT[stats.status] ?? "⚪"}</span>
          <span className="tp-font-semibold tp-text-gray-800 tp-text-sm">
            {STATUS_AR[stats.status] ?? stats.status}
          </span>
        </div>

        <div className="tp-flex tp-gap-6 tp-text-sm">
          <div className="tp-text-center">
            <p className="tp-text-2xl tp-font-bold tp-text-blue-700">{stats.participantCount}</p>
            <p className="tp-text-xs tp-text-gray-500">المشاركون</p>
          </div>
          <div className="tp-text-center">
            <p className="tp-text-2xl tp-font-bold tp-text-emerald-700">{stats.completedCount}</p>
            <p className="tp-text-xs tp-text-gray-500">أكملوا الاختبار</p>
          </div>
          {stats.participantCount > 0 && (
            <div className="tp-text-center">
              <p className="tp-text-2xl tp-font-bold tp-text-purple-700">
                {Math.round((stats.completedCount / stats.participantCount) * 100)}%
              </p>
              <p className="tp-text-xs tp-text-gray-500">نسبة الإكمال</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
