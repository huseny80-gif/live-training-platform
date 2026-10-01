"use client";

import { useState, useTransition } from "react";
import { regenerateProgramInArabic } from "@/app/actions/generation";
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
  deleteNonArabicQuestionsAction,
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
  language: string;
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
  DRAFT: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-orange-100 text-orange-800",
  ENDED: "bg-gray-100 text-gray-600",
};

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{text}</span>
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

  function handleDeleteSession(sessionId: string, code: string, status: string) {
    const activeWarning =
      status === "ACTIVE"
        ? "\n\nتنبيه: الجلسة نشطة الآن، وسيتم إنهاؤها فورًا وحذف المشاركين والإجابات والنتائج المرتبطة بها."
        : "";
    if (!confirm(`حذف الجلسة ${code}؟ سيتم حذف جميع بياناتها نهائيًا.${activeWarning}`)) return;
    startTransition(async () => {
      const r = await deleteSessionAction(sessionId);
      if (!r.ok) alert(r.error);
    });
  }

  function handleCleanLegacyQuestions() {
    if (!confirm("فحص بنك الأسئلة العربي وحذف الأسئلة الإنجليزية القديمة غير المرتبطة بجلسات محفوظة؟")) return;
    startTransition(async () => {
      const r = await deleteNonArabicQuestionsAction(program.id);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      const blocked =
        r.data.blocked > 0
          ? `\nبقي ${r.data.blocked} سؤال قديم مرتبط بجلسات محفوظة، ولن يدخل في أي جلسة عربية جديدة. الجلسات: ${r.data.blockedSessionCodes.join("، ") || "غير محدد"}`
          : "";
      alert(`تم حذف ${r.data.deleted} سؤال إنجليزي قديم غير مستخدم.${blocked}`);
    });
  }

  function handleRegenerateArabic() {
    const message =
      program.language === "AR"
        ? "إعادة توليد الأيام والأسئلة بالعربية من آخر ملف تم تحليله بنجاح؟\n\nلن يُستبدل المحتوى الحالي إلا بعد نجاح توليد بنك كامل والتحقق منه."
        : "تحويل البرنامج إلى العربية وإعادة توليد الأيام والأسئلة من آخر ملف تم تحليله بنجاح؟\n\nيجب حذف الجلسات القديمة أولًا.";
    if (!confirm(message)) return;

    startTransition(async () => {
      const result = await regenerateProgramInArabic(program.id);
      if (result.status !== "COMPLETED") {
        alert(result.errorMessage ?? "تعذر إعادة توليد المحتوى بالعربية.");
        return;
      }
      alert(
        `تم إنشاء المحتوى العربي بنجاح: ${result.daysGenerated} أيام و${result.questionsGenerated} سؤالًا.`
      );
    });
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["days", "sessions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "days" ? `الأيام والأسئلة (${program.days.length})` : `الجلسات (${program.sessions.length})`}
          </button>
        ))}
      </div>

      {/* ── Days Tab ──────────────────────────────────────────────────────── */}
      {activeTab === "days" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-gray-800">الأيام والمواضيع والأسئلة</h2>
              {program.language === "AR" ? (
                <p className="text-xs text-gray-500 mt-1">
                  الجلسات العربية الجديدة تستبعد تلقائيًا أي سؤال إنجليزي قديم.
                </p>
              ) : null}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleRegenerateArabic}
                disabled={isPending}
                className="px-3 py-1.5 bg-teal-700 text-white rounded-lg text-sm hover:bg-teal-800 disabled:opacity-50"
              >
                {program.language === "AR" ? "إعادة توليد المحتوى بالعربية" : "تحويل وإعادة التوليد بالعربية"}
              </button>
              {program.language === "AR" ? (
                <button
                  onClick={handleCleanLegacyQuestions}
                  disabled={isPending}
                  className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm hover:bg-amber-100"
                >
                  تنظيف الأسئلة الإنجليزية القديمة
                </button>
              ) : null}
              <button
                onClick={() => setShowAddDay(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                + يوم جديد
              </button>
            </div>
          </div>

          {showAddDay && (
            <AddDayForm
              programId={program.id}
              onClose={() => setShowAddDay(false)}
            />
          )}

          {program.days.length === 0 && (
            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border">
              لا توجد أيام بعد.
            </div>
          )}

          {program.days.map((day) => (
            <div key={day.id} className="bg-white rounded-2xl border overflow-hidden">
              {/* Day header */}
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                  className="flex-1 flex items-center gap-3 text-right"
                >
                  <span className="text-lg">{expandedDay === day.id ? "▼" : "▶"}</span>
                  <span className="font-mono text-sm text-gray-400 w-12">يوم {day.dayNumber}</span>
                  <span className="font-semibold text-gray-800 flex-1 text-right">{day.title}</span>
                  <span className="text-xs text-gray-400">{day._count.questions} سؤال</span>
                </button>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setEditingDayId(day.id)}
                    className="text-xs px-2 py-1 border rounded-lg hover:bg-gray-50"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => handleDeleteDay(day.id, day.title)}
                    disabled={isPending}
                    className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100"
                  >
                    حذف
                  </button>
                </div>
              </div>

              {editingDayId === day.id && (
                <div className="px-4 pb-4">
                  <EditDayForm day={day} onClose={() => setEditingDayId(null)} />
                </div>
              )}

              {expandedDay === day.id && (
                <div className="border-t px-4 py-4 space-y-4 bg-gray-50">
                  {/* Topics */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-700">المواضيع</h3>
                      <button
                        onClick={() => setShowAddTopicFor(showAddTopicFor === day.id ? null : day.id)}
                        className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-100"
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
                      <p className="text-xs text-gray-400">لا توجد مواضيع.</p>
                    ) : (
                      <div className="space-y-1">
                        {day.topics.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between text-sm bg-white rounded-lg border px-3 py-2"
                          >
                            <span className="text-gray-700">{t.title}</span>
                            <div className="flex gap-1">
                              <EditTopicInline topic={t} />
                              <button
                                onClick={() => handleDeleteTopic(t.id, t.title)}
                                disabled={isPending}
                                className="text-xs px-2 py-0.5 text-red-500 hover:bg-red-50 rounded"
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
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-700">الأسئلة</h3>
                      <button
                        onClick={() => setShowAddQFor(showAddQFor === day.id ? null : day.id)}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100"
                      >
                        + سؤال
                      </button>
                    </div>

                    {showAddQFor === day.id && (
                      <AddQuestionForm dayId={day.id} onClose={() => setShowAddQFor(null)} />
                    )}

                    {day.questions.length === 0 ? (
                      <p className="text-xs text-gray-400">لا توجد أسئلة.</p>
                    ) : (
                      <div className="space-y-2">
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
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-800">الجلسات</h2>
          {program.sessions.length === 0 && (
            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border">
              لا توجد جلسات بعد.
            </div>
          )}
          {program.sessions.map((s) => (
            <div
              key={s.id}
              className="bg-white rounded-2xl border p-4 flex items-center gap-3"
            >
              <span className="font-mono font-bold text-blue-700 w-20">{s.sessionCode}</span>
              <span className="flex-1 text-sm text-gray-700 truncate">
                {s.title ?? `يوم ${s.dayNumber}`}
              </span>
              <span className="text-xs text-gray-400">{s._count.participants} مشارك</span>
              <Badge
                text={SESSION_STATUS_AR[s.status] ?? s.status}
                color={SESSION_STATUS_COLOR[s.status] ?? "bg-gray-100 text-gray-600"}
              />
              <button
                onClick={() => handleDeleteSession(s.id, s.sessionCode, s.status)}
                disabled={isPending}
                className="text-xs px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100"
              >
                حذف
              </button>
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
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-blue-800">إضافة يوم جديد</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600 mb-1 block">رقم اليوم</label>
          <input name="dayNumber" type="number" min={1} max={30} required
            className="w-full rounded-lg border px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-600 mb-1 block">العنوان</label>
          <input name="title" required
            className="w-full rounded-lg border px-2 py-1.5 text-sm" />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 py-1.5 rounded-lg border text-sm">إلغاء</button>
        <button type="submit" disabled={isPending} className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">
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
    <form onSubmit={handleSubmit} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-amber-800">تعديل اليوم</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-600 mb-1 block">رقم اليوم</label>
          <input name="dayNumber" type="number" min={1} max={30} defaultValue={day.dayNumber}
            className="w-full rounded-lg border px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-600 mb-1 block">العنوان</label>
          <input name="title" defaultValue={day.title}
            className="w-full rounded-lg border px-2 py-1.5 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 py-1.5 rounded-lg border text-sm">إلغاء</button>
        <button type="submit" disabled={isPending} className="flex-1 py-1.5 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50">
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
    <div className="flex gap-2 mb-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="عنوان الموضوع"
        className="flex-1 rounded-lg border px-2 py-1 text-sm"
      />
      <button onClick={handle} disabled={isPending} className="px-3 py-1 bg-indigo-600 text-white text-xs rounded-lg">
        إضافة
      </button>
      <button onClick={onClose} className="px-2 py-1 border text-xs rounded-lg">×</button>
    </div>
  );
}

function EditTopicInline({ topic }: { topic: Topic }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(topic.title);
  const [isPending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs px-2 py-0.5 text-blue-500 hover:bg-blue-50 rounded">
        تعديل
      </button>
    );
  }

  return (
    <span className="flex gap-1">
      <input value={val} onChange={(e) => setVal(e.target.value)} className="rounded border px-1 py-0.5 text-xs w-32" />
      <button
        onClick={() => startTransition(async () => { await updateTopicAction(topic.id, val); setEditing(false); })}
        disabled={isPending}
        className="text-xs px-1.5 py-0.5 bg-blue-600 text-white rounded"
      >
        ✓
      </button>
      <button onClick={() => setEditing(false)} className="text-xs px-1.5 py-0.5 border rounded">×</button>
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
    <div className="bg-white border rounded-xl px-3 py-2.5 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <span className="font-mono text-xs text-gray-400 ml-1">Q{question.questionOrder}</span>
          <span className="text-sm text-gray-800">{question.questionText}</span>
          {question.topic && (
            <span className="mr-2 text-xs bg-purple-50 text-purple-600 px-1.5 rounded">{question.topic}</span>
          )}
        </div>
        <button
          onClick={onDelete}
          disabled={isPending}
          className="text-xs px-2 py-0.5 text-red-500 hover:bg-red-50 rounded flex-shrink-0"
        >
          حذف
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {question.options.map((o) => (
          <span
            key={o.id}
            className={`text-xs px-2 py-0.5 rounded-full border ${
              o.id === question.correctOptionId
                ? "bg-green-100 border-green-300 text-green-800 font-bold"
                : "bg-gray-50 text-gray-600"
            }`}
          >
            {o.optionLabel}: {o.optionText}
          </span>
        ))}
        {!correctOpt && (
          <span className="text-xs text-red-500">⚠ لم تُحدد الإجابة الصحيحة</span>
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
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3 mb-3">
      <h3 className="text-sm font-semibold text-blue-800">إضافة سؤال</h3>
      <div>
        <label className="text-xs text-gray-600 mb-1 block">نص السؤال *</label>
        <textarea name="questionText" required rows={2}
          className="w-full rounded-lg border px-2 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {["A", "B", "C", "D"].map((label, i) => (
          <div key={label}>
            <label className="text-xs text-gray-600 mb-1 block">
              خيار {label}{i < 2 ? " *" : ""}
            </label>
            <input name={`option${label}`} required={i < 2}
              className="w-full rounded-lg border px-2 py-1.5 text-sm" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-600 mb-1 block">الإجابة الصحيحة *</label>
          <select name="correctLabel" required
            className="w-full rounded-lg border px-2 py-1.5 text-sm">
            {["A", "B", "C", "D"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600 mb-1 block">الموضوع</label>
          <input name="topic" className="w-full rounded-lg border px-2 py-1.5 text-sm" />
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="flex-1 py-1.5 rounded-lg border text-sm">إلغاء</button>
        <button type="submit" disabled={isPending} className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">
          {isPending ? "…" : "إضافة"}
        </button>
      </div>
    </form>
  );
}
