"use client";

import { useEffect, useState, useCallback } from "react";

interface Participant {
  id: string;
  name: string;
  joinedAt: string;
  status: "JOINED" | "OFFLINE" | "COMPLETED";
}

const STATUS_LABEL: Record<string, string> = {
  JOINED: "منضم",
  OFFLINE: "غير متصل",
  COMPLETED: "أكمل",
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
    void fetchParticipants();
    const id = setInterval(fetchParticipants, 5000);
    return () => clearInterval(id);
  }, [fetchParticipants]);

  if (error) {
    return (
      <div className="dlp-live-error">
        <p>تعذّر تحميل قائمة المشاركين.</p>
        <button type="button" onClick={fetchParticipants}>إعادة المحاولة</button>
      </div>
    );
  }

  return (
    <section className="brand-card dlp-live-panel">
      <div className="dlp-live-panel-head">
        <h2>المشاركون</h2>
        <span>{participants.length}</span>
      </div>
      {participants.length === 0 ? (
        <p className="dlp-live-empty">لم ينضم أي مشارك بعد.</p>
      ) : (
        <div className="dlp-participant-list">
          {participants.map((participant) => (
            <div key={participant.id} className="dlp-participant-row">
              <span className="dlp-participant-name">{participant.name}</span>
              <span className={`dlp-status-pill status-${participant.status.toLowerCase()}`}>
                {STATUS_LABEL[participant.status] ?? participant.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
