"use client";

import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { REALTIME_EVENTS } from "@/lib/realtime/socket-events";
import type { ParticipantJoinedPayload } from "@/lib/realtime/types";

interface Participant {
  id: string;
  name: string;
  joinedAt: string;
  status: "JOINED" | "OFFLINE" | "COMPLETED";
}

const STATUS_LABEL: Record<string, string> = {
  JOINED:    "منضم",
  OFFLINE:   "غير متصل",
  COMPLETED: "أكمل",
};

const STATUS_COLOR: Record<string, string> = {
  JOINED:    "tp-bg-blue-100 tp-text-blue-700",
  OFFLINE:   "tp-bg-gray-100 tp-text-gray-500",
  COMPLETED: "tp-bg-emerald-100 tp-text-emerald-700",
};

export default function SessionParticipantsList({
  sessionId,
  sessionCode,
}: {
  sessionId: string;
  sessionCode?: string;
}) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState(false);

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${sessionId}/participants`, { cache: "no-store" });
      if (!res.ok) { setError(true); return; }
      const data = await res.json();
      setParticipants(data.participants);
      setError(false);
    } catch {
      setError(true);
    }
  }, [sessionId]);

  // Polling fallback — always active
  useEffect(() => {
    fetchParticipants();
    const id = setInterval(fetchParticipants, 5000);
    return () => clearInterval(id);
  }, [fetchParticipants]);

  // Socket.IO realtime listener — active only when sessionCode is provided
  useEffect(() => {
    if (!sessionCode) return;

    const socket = io({ path: "/api/socket", transports: ["websocket"] });

    socket.emit("participant:join_room", { room: `session:${sessionCode}` });

    socket.on(
      REALTIME_EVENTS.PARTICIPANT_JOINED,
      (_payload: ParticipantJoinedPayload) => {
        // Re-fetch to get accurate list from the source of truth
        fetchParticipants();
      },
    );

    return () => {
      socket.off(REALTIME_EVENTS.PARTICIPANT_JOINED);
      socket.disconnect();
    };
  }, [sessionCode, fetchParticipants]);

  if (error) {
    return (
      <div className="tp-bg-white tp-rounded-2xl tp-border tp-border-red-200 tp-p-5 tp-flex tp-items-center tp-justify-between tp-gap-4">
        <p className="tp-text-sm tp-text-red-700">تعذّر تحميل قائمة المشاركين.</p>
        <button
          type="button"
          onClick={fetchParticipants}
          className="tp-text-xs tp-text-red-600 tp-underline tp-flex-shrink-0 tp-hover-text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5 tp-text-center tp-text-sm tp-text-gray-400">
        لم ينضم أي مشارك بعد.
      </div>
    );
  }

  return (
    <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5">
      <h2 className="tp-font-semibold tp-mb-3 tp-text-gray-800">
        المشاركون ({participants.length})
      </h2>
      <div className="tp-space-y-1-5 tp-max-h-64 tp-overflow-y-auto">
        {participants.map((p) => (
          <div key={p.id} className="tp-flex tp-items-center tp-justify-between tp-text-sm tp-rounded-xl tp-px-3 tp-py-2 tp-border tp-border-transparent tp-hover-border-gray-100">
            <span className="tp-flex-1 tp-font-medium tp-text-gray-800 tp-truncate">{p.name}</span>
            <span className={`tp-text-xs tp-px-2 tp-py-0-5 tp-rounded-full tp-flex-shrink-0 ${STATUS_COLOR[p.status] ?? "tp-bg-gray-100 tp-text-gray-500"}`}>
              {STATUS_LABEL[p.status] ?? p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
