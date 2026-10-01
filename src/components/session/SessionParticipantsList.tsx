"use client";

import { useEffect, useState, useCallback } from "react";

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
  JOINED:    "bg-blue-100 text-blue-700",
  OFFLINE:   "bg-gray-100 text-gray-500",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

export default function SessionParticipantsList({ sessionId }: { sessionId: string }) {
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

  useEffect(() => {
    fetchParticipants();
    const id = setInterval(fetchParticipants, 5000);
    return () => clearInterval(id);
  }, [fetchParticipants]);

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-5 flex items-center justify-between gap-4">
        <p className="text-sm text-red-700">تعذّر تحميل قائمة المشاركين.</p>
        <button
          type="button"
          onClick={fetchParticipants}
          className="text-xs text-red-600 underline flex-shrink-0 hover:text-red-800"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="bg-white rounded-2xl border p-5 text-center text-sm text-gray-400">
        لم ينضم أي مشارك بعد.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border p-5">
      <h2 className="font-semibold mb-3 text-gray-800">
        المشاركون ({participants.length})
      </h2>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {participants.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm rounded-xl px-3 py-2 border border-transparent hover:border-gray-100">
            <span className="flex-1 font-medium text-gray-800 truncate">{p.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-500"}`}>
              {STATUS_LABEL[p.status] ?? p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
