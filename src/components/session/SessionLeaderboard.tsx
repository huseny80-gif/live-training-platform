"use client";

import { useEffect, useState, useCallback } from "react";

interface RankEntry {
  rank: number;
  name: string;
  score: number;
  correctCount: number;
  answersCount: number;
  completedAt: string;
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function SessionLeaderboard({ sessionId, isEnded }: { sessionId: string; isEnded: boolean }) {
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [error, setError] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${sessionId}/leaderboard`, { cache: "no-store" });
      if (!res.ok) { setError(true); return; }
      const data = await res.json();
      setRanking(data.ranking);
      setError(false);
    } catch {
      setError(true);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchLeaderboard();
    if (!isEnded) {
      const id = setInterval(fetchLeaderboard, 8000);
      return () => clearInterval(id);
    }
  }, [fetchLeaderboard, isEnded]);

  if (error) return <div className="dlp-live-error"><p>تعذّر تحميل الترتيب.</p><button type="button" onClick={fetchLeaderboard}>إعادة المحاولة</button></div>;
  if (ranking.length === 0) return null;

  return (
    <section className="brand-card dlp-live-panel">
      <div className="dlp-live-panel-head"><h2>{isEnded ? "🏆 الترتيب النهائي" : "🏆 الترتيب المباشر"}</h2></div>
      <div className="dlp-ranking-list">
        {ranking.map((entry) => (
          <div key={entry.rank} className={`dlp-ranking-row${entry.rank <= 3 ? " top" : ""}`}>
            <span className="dlp-rank">{MEDAL[entry.rank] ?? `#${entry.rank}`}</span>
            <strong>{entry.name}</strong>
            <small>{entry.correctCount}/{entry.answersCount} صحيح</small>
            <b>{entry.score} نقطة</b>
          </div>
        ))}
      </div>
    </section>
  );
}
