"use client";

import { errorLabel } from "@/lib/labels";
import { useState, useTransition } from "react";
import {
  createDayAction,
  updateDayAction,
  deleteDayAction,
  createTopicAction,
  updateTopicAction,
  deleteTopicAction,
  createQuestionAction,
  deleteQuestionAction,
  deleteSessionAction,
} from "@/app/actions/content";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Option {
  id: string;
  optionLabel: string;
  optionText: string;
}

interface Question {
  id: string;
  questionText: string;
  questionOrder: number;
  topic: string | null;
  status: string;
  correctOptionId: string | null;
  options: Option[];
}

interface Topic {
  id: string;
  title: string;
  topicOrder: number;
}

interface Day {
  id: string;
  dayNumber: number;
  title: string;
  status: string;
  topics: Topic[];
  questions: Question[];
  _count: { questions: number };
}

interface Session {
  id: string;
  sessionCode: string;
  title: string | null;
  status: string;
  dayNumber: number;
  _count: { participants: number };
}

interface Program {
  id: string;
  title: string;
  days: Day[];
  sessions: Session[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SESSION_STATUS_AR: Record<string, string> = {
  DRAFT: "مسودة",
  ACTIVE: "نشط",
  PAUSED: "موقوف",
  ENDED: "منتهي",
};

const SESSION_STATUS_COLOR: Record<string, string> = {
  DRAFT: "tp-bg-yellow-100 tp-text-yellow-800",
  ACTIVE: "tp-bg-green-100 tp-text-green-800",
  PAUSED: "tp-bg-orange-100 tp-text-orange-800",
  ENDED: "tp-bg-gray-100 tp-text-gray-600",
};

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`tp-text-xs tp-px-2 tp-py-0-5 tp-rounded-full tp-font-medium ${color}`}>{text}</span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ManageClient({ program }: { program: Program }) {
  const [activeTab, setActiveTab] = useState<"days" | "sessions">("days");
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [showAddDay, setShowAddDay] = useState(false);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [showAddQFor, setShowAddQFor] = useState<string | null>(null);
  const [showAddTopicFor, setShowAddTopicFor] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Day actions ────────────────────────────────────────────────────────────

  function handleDeleteDay(dayId: string, dayTitle: string) {
    if (!confirm(`حذف اليوم "${dayTitle}"؟ سيتم حذف جميع أسئلته ومواضيعه.`)) return;
    startTransition(async () => {
      await deleteDayAction(dayId);
    });
  }

  // ── Topic actions ──────────────────────────────────────────────────────────

  function handleDeleteTopic(topicId: string, title: string) {
    if (!confirm(`حذف الموضوع "${title}"؟`)) return;
    startTransition(async () => {
      await deleteTopicAction(topicId);
    });
  }

  // ── Question actions ───────────────────────────────────────────────────────

  function handleDeleteQuestion(questionId: string) {
    if (!confirm("حذف هذا السؤال؟")) return;
    startTransition(async () => {
      await deleteQuestionAction(questionId);
    });
  }

  // ── Session actions ────────────────────────────────────────────────────────

  function handleDeleteSession(sessionId: string, code: string) {
    if (!confirm(`حذف الجلسة ${code}؟ سيتم حذف جميع بياناتها.`)) return;
    startTransition(async () => {
      const r = await deleteSessionAction(sessionId);
      if (!r.ok) alert(r.error === "CANNOT_DELETE_ACTIVE" ? "لا يمكن حذف جلسة نشطة." : errorLabel(r.error));
    });
  }

  return (
    <div className="tp-space-y-4">
      {/* Tabs */}
      <div className="tp-flex tp-gap-1 tp-bg-gray-100 tp-p-1 tp-rounded-xl tp-w-fit">
        {(["days", "sessions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tp-px-4 tp-py-1-5 tp-rounded-lg tp-text-sm tp-font-medium tp-transition-colors ${
              activeTab === tab ? "tp-bg-white tp-shadow tp-text-gray-900" : "tp-text-gray-500 tp-hover-text-gray-700"
            }`}
          >
            {tab === "days" ? `الأيام والأسئلة (${program.days.length})` : `الجلسات (${program.sessions.length})`}
          </button>
        ))}
      </div>

      {/* ── Days Tab ──────────────────────────────────────────────────────── */}
      {activeTab === "days" && (
        <div className="tp-space-y-3">
          <div className="tp-flex tp-items-center tp-justify-between">
            <h2 className="tp-font-semibold tp-text-gray-800">الأيام والمواضيع والأسئلة</h2>
            <button
              onClick={() => setShowAddDay(true)}
              className="tp-px-3 tp-py-1-5 tp-bg-blue-600 tp-text-white tp-rounded-lg tp-text-sm tp-hover-bg-blue-700"
            >
              + يوم جديد
            </button>
          </div>

          {showAddDay && (
            <AddDayForm
              programId={program.id}
              onClose={() => setShowAddDay(false)}
            />
          )}

          {program.days.length === 0 && (
            <div className="tp-text-center tp-py-10 tp-text-gray-400 tp-bg-white tp-rounded-2xl tp-border">
              لا توجد أيام بعد.
            </div>
          )}

          {program.days.map((day) => (
            <div key={day.id} className="tp-bg-white tp-rounded-2xl tp-border tp-overflow-hidden">
              {/* Day header */}
              <div className="tp-flex tp-items-center tp-gap-3 tp-p-4">
                <button
                  onClick={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                  className="tp-flex-1 tp-flex tp-items-center tp-gap-3 tp-text-right"
                >
                  <span className="tp-text-lg">{expandedDay === day.id ? "▼" : "▶"}</span>
                  <span className="tp-font-mono tp-text-sm tp-text-gray-400 tp-w-12">يوم {day.dayNumber}</span>
                  <span className="tp-font-semibold tp-text-gray-800 tp-flex-1 tp-text-right">{day.title}</span>
                  <span className="tp-text-xs tp-text-gray-400">{day._count.questions} سؤال</span>
                </button>
                <div className="tp-flex tp-gap-2 tp-flex-shrink-0">
                  <button
                    onClick={() => setEditingDayId(day.id)}
                    className="tp-text-xs tp-px-2 tp-py-1 tp-border tp-rounded-lg tp-hover-bg-gray-50"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => handleDeleteDay(day.id, day.title)}
                    disabled={isPending}
                    className="tp-text-xs tp-px-2 tp-py-1 tp-bg-red-50 tp-text-red-600 tp-border tp-border-red-200 tp-rounded-lg tp-hover-bg-red-100"
                  >
                    حذف
                  </button>
                </div>
              </div>

              {editingDayId === day.id && (
                <div className="tp-px-4 tp-pb-4">
                  <EditDayForm day={day} onClose={() => setEditingDayId(null)} />
                </div>
              )}

              {expandedDay === day.id && (
                <div className="tp-border-t tp-px-4 tp-py-4 tp-space-y-4 tp-bg-gray-50">
                  {/* Topics */}
                  <div>
                    <div className="tp-flex tp-items-center tp-justify-between tp-mb-2">
                      <h3 className="tp-text-sm tp-font-semibold tp-text-gray-700">المواضيع</h3>
                      <button
                        onClick={() => setShowAddTopicFor(showAddTopicFor === day.id ? null : day.id)}
                        className="tp-text-xs tp-px-2 tp-py-1 tp-bg-indigo-50 tp-text-indigo-600 tp-border tp-border-indigo-200 tp-rounded-lg tp-hover-bg-indigo-100"
                      >
                        + موضوع
                      </button>
                    </div>

                    {showAddTopicFor === day.id && (
                      <AddTopicInline
                        dayId={day.id}
                        onClose={() => setShowAddTopicFor(null)}
                      />
                    )}

                    {day.topics.length === 0 ? (
                      <p className="tp-text-xs tp-text-gray-400">لا توجد مواضيع.</p>
                    ) : (
                      <div className="tp-space-y-1">
                        {day.topics.map((t) => (
                          <div
                            key={t.id}
                            className="tp-flex tp-items-center tp-justify-between tp-text-sm tp-bg-white tp-rounded-lg tp-border tp-px-3 tp-py-2"
                          >
                            <span className="tp-text-gray-700">{t.title}</span>
                            <div className="tp-flex tp-gap-1">
                              <EditTopicInline topic={t} />
                              <button
                                onClick={() => handleDeleteTopic(t.id, t.title)}
                                disabled={isPending}
                                className="tp-text-xs tp-px-2 tp-py-0-5 tp-text-red-500 tp-hover-bg-red-50 tp-rounded"
                              >
                                حذف
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Questions */}
                  <div>
                    <div className="tp-flex tp-items-center tp-justify-between tp-mb-2">
                      <h3 className="tp-text-sm tp-font-semibold tp-text-gray-700">الأسئلة</h3>
                      <button
                        onClick={() => setShowAddQFor(showAddQFor === day.id ? null : day.id)}
                        className="tp-text-xs tp-px-2 tp-py-1 tp-bg-blue-50 tp-text-blue-600 tp-border tp-border-blue-200 tp-rounded-lg tp-hover-bg-blue-100"
                      >
                        + سؤال
                      </button>
                    </div>

                    {showAddQFor === day.id && (
                      <AddQuestionForm dayId={day.id} onClose={() => setShowAddQFor(null)} />
                    )}

                    {day.questions.length === 0 ? (
                      <p className="tp-text-xs tp-text-gray-400">لا توجد أسئلة.</p>
                    ) : (
                      <div className="tp-space-y-2">
                        {day.questions.map((q) => (
                          <QuestionRow
                            key={q.id}
                            question={q}
                            onDelete={() => handleDeleteQuestion(q.id)}
                            isPending={isPending}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Sessions Tab ────────────────────────────────────────────────────── */}
      {activeTab === "sessions" && (
        <div className="tp-space-y-3">
          <h2 className="tp-font-semibold tp-text-gray-800">الجلسات</h2>
          {program.sessions.length === 0 && (
            <div className="tp-text-center tp-py-10 tp-text-gray-400 tp-bg-white tp-rounded-2xl tp-border">
              لا توجد جلسات بعد.
            </div>
          )}
          {program.sessions.map((s) => (
            <div
              key={s.id}
              className="tp-bg-white tp-rounded-2xl tp-border tp-p-4 tp-flex tp-items-center tp-gap-3"
            >
              <span className="tp-font-mono tp-font-bold tp-text-blue-700 tp-w-20">{s.sessionCode}</span>
              <span className="tp-flex-1 tp-text-sm tp-text-gray-700 tp-truncate">
                {s.title ?? `يوم ${s.dayNumber}`}
              </span>
              <span className="tp-text-xs tp-text-gray-400">{s._count.participants} مشارك</span>
              <Badge
                text={SESSION_STATUS_AR[s.status] ?? s.status}
                color={SESSION_STATUS_COLOR[s.status] ?? "tp-bg-gray-100 tp-text-gray-600"}
              />
              {s.status !== "ACTIVE" && (
                <button
                  onClick={() => handleDeleteSession(s.id, s.sessionCode)}
                  disabled={isPending}
                  className="tp-text-xs tp-px-2 tp-py-1 tp-bg-red-50 tp-text-red-600 tp-border tp-border-red-200 tp-rounded-lg tp-hover-bg-red-100"
                >
                  حذف
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AddDayForm({ programId, onClose }: { programId: string; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createDayAction(programId, null, fd);
      if (r.ok) onClose();
      else setError(errorLabel(r.error));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="tp-bg-blue-50 tp-border tp-border-blue-200 tp-rounded-xl tp-p-4 tp-space-y-3">
      <h3 className="tp-text-sm tp-font-semibold tp-text-blue-800">إضافة يوم جديد</h3>
      <div className="tp-grid tp-grid-cols-2 tp-gap-3">
        <div>
          <label className="tp-text-xs tp-text-gray-600 tp-mb-1 tp-block">رقم اليوم</label>
          <input name="dayNumber" type="number" min={1} max={30} required
            className="tp-w-full tp-rounded-lg tp-border tp-px-2 tp-py-1-5 tp-text-sm" />
        </div>
        <div>
          <label className="tp-text-xs tp-text-gray-600 tp-mb-1 tp-block">العنوان</label>
          <input name="title" required
            className="tp-w-full tp-rounded-lg tp-border tp-px-2 tp-py-1-5 tp-text-sm" />
        </div>
      </div>
      {error && <p className="tp-text-xs tp-text-red-600">{error}</p>}
      <div className="tp-flex tp-gap-2">
        <button type="button" onClick={onClose} className="tp-flex-1 tp-py-1-5 tp-rounded-lg tp-border tp-text-sm">إلغاء</button>
        <button type="submit" disabled={isPending} className="tp-flex-1 tp-py-1-5 tp-rounded-lg tp-bg-blue-600 tp-text-white tp-text-sm tp-disabled-opacity-50">
          {isPending ? "…" : "إضافة"}
        </button>
      </div>
    </form>
  );
}

function EditDayForm({ day, onClose }: { day: Day; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateDayAction(day.id, null, fd);
      onClose();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="tp-bg-amber-50 tp-border tp-border-amber-200 tp-rounded-xl tp-p-4 tp-space-y-3">
      <h3 className="tp-text-sm tp-font-semibold tp-text-amber-800">تعديل اليوم</h3>
      <div className="tp-grid tp-grid-cols-2 tp-gap-3">
        <div>
          <label className="tp-text-xs tp-text-gray-600 tp-mb-1 tp-block">رقم اليوم</label>
          <input name="dayNumber" type="number" min={1} max={30} defaultValue={day.dayNumber}
            className="tp-w-full tp-rounded-lg tp-border tp-px-2 tp-py-1-5 tp-text-sm" />
        </div>
        <div>
          <label className="tp-text-xs tp-text-gray-600 tp-mb-1 tp-block">العنوان</label>
          <input name="title" defaultValue={day.title}
            className="tp-w-full tp-rounded-lg tp-border tp-px-2 tp-py-1-5 tp-text-sm" />
        </div>
      </div>
      <div className="tp-flex tp-gap-2">
        <button type="button" onClick={onClose} className="tp-flex-1 tp-py-1-5 tp-rounded-lg tp-border tp-text-sm">إلغاء</button>
        <button type="submit" disabled={isPending} className="tp-flex-1 tp-py-1-5 tp-rounded-lg tp-bg-amber-600 tp-text-white tp-text-sm tp-disabled-opacity-50">
          {isPending ? "…" : "حفظ"}
        </button>
      </div>
    </form>
  );
}

function AddTopicInline({ dayId, onClose }: { dayId: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handle() {
    if (!title.trim()) return;
    startTransition(async () => {
      await createTopicAction(dayId, title);
      onClose();
    });
  }

  return (
    <div className="tp-flex tp-gap-2 tp-mb-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="عنوان الموضوع"
        className="tp-flex-1 tp-rounded-lg tp-border tp-px-2 tp-py-1 tp-text-sm"
      />
      <button onClick={handle} disabled={isPending} className="tp-px-3 tp-py-1 tp-bg-indigo-600 tp-text-white tp-text-xs tp-rounded-lg">
        إضافة
      </button>
      <button onClick={onClose} className="tp-px-2 tp-py-1 tp-border tp-text-xs tp-rounded-lg">×</button>
    </div>
  );
}

function EditTopicInline({ topic }: { topic: Topic }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(topic.title);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="tp-text-xs tp-px-2 tp-py-0-5 tp-text-blue-500 tp-hover-bg-blue-50 tp-rounded">
        تعديل
      </button>
    );
  }

  return (
    <span className="tp-flex tp-gap-1">
      <input value={val} onChange={(e) => setVal(e.target.value)} className="tp-rounded tp-border tp-px-1 tp-py-0-5 tp-text-xs tp-w-32" />
      <button
        onClick={() => startTransition(async () => { await updateTopicAction(topic.id, val); setEditing(false); })}
        disabled={isPending}
        className="tp-text-xs tp-px-1-5 tp-py-0-5 tp-bg-blue-600 tp-text-white tp-rounded"
      >
        ✓
      </button>
      <button onClick={() => setEditing(false)} className="tp-text-xs tp-px-1-5 tp-py-0-5 tp-border tp-rounded">×</button>
    </span>
  );
}

function QuestionRow({
  question, onDelete, isPending,
}: {
  question: Question;
  onDelete: () => void;
  isPending: boolean;
}) {
  const correctOpt = question.options.find((o) => o.id === question.correctOptionId);
  return (
    <div className="tp-bg-white tp-border tp-rounded-xl tp-px-3 tp-py-2-5 tp-space-y-1">
      <div className="tp-flex tp-items-start tp-justify-between tp-gap-2">
        <div className="tp-flex-1">
          <span className="tp-font-mono tp-text-xs tp-text-gray-400 tp-ml-1">س{question.questionOrder}</span>
          <span className="tp-text-sm tp-text-gray-800">{question.questionText}</span>
          {question.topic && (
            <span className="tp-mr-2 tp-text-xs tp-bg-purple-50 tp-text-purple-600 tp-px-1-5 tp-rounded">{question.topic}</span>
          )}
        </div>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="tp-text-xs tp-px-2 tp-py-0-5 tp-text-red-500 tp-hover-bg-red-50 tp-rounded tp-flex-shrink-0"
        >
          حذف
        </button>
      </div>
      <div className="tp-flex tp-flex-wrap tp-gap-1-5">
        {question.options.map((o) => (
          <span
            key={o.id}
            className={`tp-text-xs tp-px-2 tp-py-0-5 tp-rounded-full tp-border ${
              o.id === question.correctOptionId
                ? "tp-bg-green-100 tp-border-green-300 tp-text-green-800 tp-font-bold"
                : "tp-bg-gray-50 tp-text-gray-600"
            }`}
          >
            {o.optionLabel}: {o.optionText}
          </span>
        ))}
        {!correctOpt && (
          <span className="tp-text-xs tp-text-red-500">⚠ لم تُحدد الإجابة الصحيحة</span>
        )}
      </div>
    </div>
  );
}

function AddQuestionForm({ dayId, onClose }: { dayId: string; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await createQuestionAction(dayId, null, fd);
      if (r.ok) onClose();
      else setError(errorLabel(r.error));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="tp-bg-blue-50 tp-border tp-border-blue-200 tp-rounded-xl tp-p-4 tp-space-y-3 tp-mb-3">
      <h3 className="tp-text-sm tp-font-semibold tp-text-blue-800">إضافة سؤال</h3>
      <div>
        <label className="tp-text-xs tp-text-gray-600 tp-mb-1 tp-block">نص السؤال *</label>
        <textarea name="questionText" required rows={2}
          className="tp-w-full tp-rounded-lg tp-border tp-px-2 tp-py-1-5 tp-text-sm" />
      </div>
      <div className="tp-grid tp-grid-cols-2 tp-gap-2">
        {["A", "B", "C", "D"].map((label, i) => (
          <div key={label}>
            <label className="tp-text-xs tp-text-gray-600 tp-mb-1 tp-block">
              خيار {label}{i < 2 ? " *" : ""}
            </label>
            <input name={`option${label}`} required={i < 2}
              className="tp-w-full tp-rounded-lg tp-border tp-px-2 tp-py-1-5 tp-text-sm" />
          </div>
        ))}
      </div>
      <div className="tp-grid tp-grid-cols-2 tp-gap-2">
        <div>
          <label className="tp-text-xs tp-text-gray-600 tp-mb-1 tp-block">الإجابة الصحيحة *</label>
          <select name="correctLabel" required
            className="tp-w-full tp-rounded-lg tp-border tp-px-2 tp-py-1-5 tp-text-sm">
            {["A", "B", "C", "D"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="tp-text-xs tp-text-gray-600 tp-mb-1 tp-block">الموضوع</label>
          <input name="topic" className="tp-w-full tp-rounded-lg tp-border tp-px-2 tp-py-1-5 tp-text-sm" />
        </div>
      </div>
      {error && <p className="tp-text-xs tp-text-red-600">{error}</p>}
      <div className="tp-flex tp-gap-2">
        <button type="button" onClick={onClose} className="tp-flex-1 tp-py-1-5 tp-rounded-lg tp-border tp-text-sm">إلغاء</button>
        <button type="submit" disabled={isPending} className="tp-flex-1 tp-py-1-5 tp-rounded-lg tp-bg-blue-600 tp-text-white tp-text-sm tp-disabled-opacity-50">
          {isPending ? "…" : "إضافة"}
        </button>
      </div>
    </form>
  );
}
