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

export default function SessionLeaderboard({
  sessionId,
  isEnded,
}: {
  sessionId: string;
  isEnded: boolean;
}) {
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [error, setError] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${sessionId}/leaderboard`, {
        cache: "no-store",
      });
      if (!res.ok) { setError(true); return; }
      const data = await res.json();
      setRanking(data.ranking);
      setError(false);
    } catch {
      setError(true);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchLeaderboard();
    if (!isEnded) {
      const id = setInterval(fetchLeaderboard, 8000);
      return () => clearInterval(id);
    }
  }, [fetchLeaderboard, isEnded]);

  if (error) {
    return (
      <div className="tp-bg-white tp-rounded-2xl tp-border tp-border-red-200 tp-p-5 tp-flex tp-items-center tp-justify-between tp-gap-4">
        <p className="tp-text-sm tp-text-red-700">تعذّر تحميل الترتيب.</p>
        <button
          type="button"
          onClick={fetchLeaderboard}
          className="tp-text-xs tp-text-red-600 tp-underline tp-flex-shrink-0 tp-hover-text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (ranking.length === 0) return null;

  return (
    <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5">
      <h2 className="tp-font-semibold tp-mb-3 tp-text-gray-800">
        {isEnded ? "🏆 الترتيب النهائي" : "🏆 الترتيب المباشر"}
      </h2>
      <div className="tp-space-y-1-5 tp-max-h-80 tp-overflow-y-auto">
        {ranking.map((entry) => (
          <div
            key={entry.rank}
            className={`tp-flex tp-items-center tp-gap-3 tp-text-sm tp-rounded-xl tp-px-3 tp-py-2 tp-border ${
              entry.rank <= 3
                ? "tp-border-yellow-200 tp-bg-yellow-50"
                : "tp-border-transparent tp-hover-border-gray-100"
            }`}
          >
            <span className="tp-w-8 tp-text-center tp-flex-shrink-0 tp-font-bold tp-text-gray-400">
              {MEDAL[entry.rank] ?? `#${entry.rank}`}
            </span>
            <span className="tp-flex-1 tp-font-medium tp-text-gray-800 tp-truncate">
              {entry.name}
            </span>
            <span className="tp-text-xs tp-text-gray-500 tp-flex-shrink-0">
              {entry.correctCount}/{entry.answersCount} صحيح
            </span>
            <span className="tp-font-bold tp-text-blue-700 tp-flex-shrink-0 tp-w-16 tp-text-left">
              {entry.score} نقطة
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
