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
  DRAFT: "🟡",
  ACTIVE: "🟢",
  PAUSED: "🟠",
  ENDED: "⚫",
};

const STATUS_AR: Record<string, string> = {
  DRAFT: "في الانتظار",
  ACTIVE: "نشط",
  PAUSED: "موقوف مؤقتاً",
  ENDED: "منتهي",
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
    void fetchStats();
    const id = setInterval(fetchStats, 5000);
    return () => clearInterval(id);
  }, [fetchStats]);

  if (error) {
    return (
      <div className="dlp-live-error">
        <p>تعذّر تحميل إحصائيات الجلسة.</p>
        <button type="button" onClick={fetchStats}>إعادة المحاولة</button>
      </div>
    );
  }

  if (!stats) return <div className="brand-card dlp-live-loading">جارٍ تحميل إحصائيات الجلسة…</div>;

  const statusClass = stats.status.toLowerCase();
  const completion = stats.participantCount > 0
    ? Math.round((stats.completedCount / stats.participantCount) * 100)
    : 0;

  return (
    <section className={`brand-card dlp-live-stats status-${statusClass}`}>
      <div className="dlp-live-status">
        <span aria-hidden="true">{STATUS_DOT[stats.status] ?? "⚪"}</span>
        <strong>{STATUS_AR[stats.status] ?? stats.status}</strong>
      </div>
      <div className="dlp-live-metrics">
        <div><strong>{stats.participantCount}</strong><span>المشاركون</span></div>
        <div><strong>{stats.completedCount}</strong><span>أكملوا الاختبار</span></div>
        {stats.participantCount > 0 ? <div><strong>{completion}%</strong><span>نسبة الإكمال</span></div> : null}
      </div>
    </section>
  );
}
