import * as XLSX from "xlsx";

export interface ParticipantRow {
  rank: number | null;
  displayName: string;
  joinedAt?: Date | string | null;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  answersCount: number;
  percentage: number;
}

export interface QuestionRow {
  questionOrder: number;
  questionText: string;
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;
}

export interface SessionSummary {
  title: string | null;
  sessionCode: string;
  instructorName?: string;
  date?: string;
  participationRate?: number;
  totalParticipants: number;
  totalQuestions: number;
  averageScore: number;
  highestScore: number;
  correctRate: number;
}

function fmtDate(d?: Date | string | null): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" });
}

export function buildSessionExcel(
  summary: SessionSummary,
  participants: ParticipantRow[],
  questions: QuestionRow[]
): Buffer {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: ملخص الاختبار ──────────────────────────────
  const summaryData = [
    ["ملخص الاختبار — الحقيبة التدريبية"],
    [],
    ["اسم الجلسة", summary.title ?? `جلسة ${summary.sessionCode}`],
    ["المدرب", summary.instructorName ?? ""],
    ["التاريخ", summary.date ?? ""],
    ["رمز الجلسة", summary.sessionCode],
    ["عدد المشاركين", summary.totalParticipants],
    ["نسبة المشاركة", summary.participationRate != null ? `${summary.participationRate}%` : ""],
    ["عدد الأسئلة", summary.totalQuestions],
    ["متوسط الدرجات", summary.averageScore],
    ["أعلى درجة", summary.highestScore],
    ["نسبة الإجابات الصحيحة", `${summary.correctRate}%`],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "ملخص الاختبار");

  // ── Sheet 2: المشاركون ────────────────────────────────────
  const participantHeaders = [
    "الترتيب",
    "الاسم الثلاثي",
    "وقت الدخول",
    "الدرجة",
    "النسبة %",
    "صحيح",
    "خطأ",
  ];
  const participantRows = participants.map((p) => [
    p.rank ?? "-",
    p.displayName,
    fmtDate(p.joinedAt),
    p.totalScore,
    p.percentage,
    p.correctCount,
    p.wrongCount,
  ]);
  const wsParticipants = XLSX.utils.aoa_to_sheet([
    participantHeaders,
    ...participantRows,
  ]);
  wsParticipants["!cols"] = [
    { wch: 8 },
    { wch: 30 },
    { wch: 18 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, wsParticipants, "المشاركون");

  // ── Sheet 3: تحليل الأسئلة ───────────────────────────────
  const questionHeaders = [
    "رقم السؤال",
    "نص السؤال",
    "عدد الإجابات",
    "الصحيح",
    "النسبة %",
  ];
  const questionRows = questions.map((q) => [
    q.questionOrder,
    q.questionText,
    q.totalAnswers,
    q.correctAnswers,
    q.accuracy,
  ]);
  const wsQuestions = XLSX.utils.aoa_to_sheet([
    questionHeaders,
    ...questionRows,
  ]);
  wsQuestions["!cols"] = [
    { wch: 10 },
    { wch: 60 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsQuestions, "تحليل الأسئلة");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
