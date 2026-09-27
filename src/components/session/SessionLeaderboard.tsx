"use client";

import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { REALTIME_EVENTS } from "@/lib/realtime/socket-events";

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
  sessionCode,
}: {
  sessionId: string;
  isEnded: boolean;
  sessionCode?: string;
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

  // Polling fallback — always active while session is live
  useEffect(() => {
    fetchLeaderboard();
    if (!isEnded) {
      const id = setInterval(fetchLeaderboard, 8000);
      return () => clearInterval(id);
    }
  }, [fetchLeaderboard, isEnded]);

  // Socket.IO realtime listener — re-fetches on relevant events
  useEffect(() => {
    if (!sessionCode || isEnded) return;

    const socket = io({ path: "/api/socket", transports: ["websocket"] });

    socket.emit("participant:join_room", { room: `session:${sessionCode}` });

    const refresh = () => { fetchLeaderboard(); };

    socket.on(REALTIME_EVENTS.LEADERBOARD_UPDATED, refresh);
    socket.on(REALTIME_EVENTS.ANSWER_SUBMITTED, refresh);
    socket.on(REALTIME_EVENTS.SESSION_ENDED, refresh);

    return () => {
      socket.off(REALTIME_EVENTS.LEADERBOARD_UPDATED, refresh);
      socket.off(REALTIME_EVENTS.ANSWER_SUBMITTED, refresh);
      socket.off(REALTIME_EVENTS.SESSION_ENDED, refresh);
      socket.disconnect();
    };
  }, [sessionCode, isEnded, fetchLeaderboard]);

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-5 flex items-center justify-between gap-4">
        <p className="text-sm text-red-700">تعذّر تحميل الترتيب.</p>
        <button
          type="button"
          onClick={fetchLeaderboard}
          className="text-xs text-red-600 underline flex-shrink-0 hover:text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (ranking.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border p-5">
      <h2 className="font-semibold mb-3 text-gray-800">
        {isEnded ? "🏆 الترتيب النهائي" : "🏆 الترتيب المباشر"}
      </h2>
      <div className="space-y-1.5 max-h-80 overflow-y-auto">
        {ranking.map((entry) => (
          <div
            key={entry.rank}
            className={`flex items-center gap-3 text-sm rounded-xl px-3 py-2 border ${
              entry.rank <= 3
                ? "border-yellow-200 bg-yellow-50"
                : "border-transparent hover:border-gray-100"
            }`}
          >
            <span className="w-8 text-center flex-shrink-0 font-bold text-gray-400">
              {MEDAL[entry.rank] ?? `#${entry.rank}`}
            </span>
            <span className="flex-1 font-medium text-gray-800 truncate">
              {entry.name}
            </span>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {entry.correctCount}/{entry.answersCount} صحيح
            </span>
            <span className="font-bold text-blue-700 flex-shrink-0 w-16 text-left">
              {entry.score} نقطة
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
