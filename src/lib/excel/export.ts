import * as XLSX from "xlsx";

interface ParticipantRow {
  rank: number | null;
  displayName: string;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  answersCount: number;
  percentage: number;
}

interface QuestionRow {
  questionOrder: number;
  questionText: string;
  totalAnswers: number;
  correctAnswers: number;
  accuracy: number;
}

interface SessionSummary {
  title: string | null;
  sessionCode: string;
  totalParticipants: number;
  totalQuestions: number;
  averageScore: number;
  highestScore: number;
  correctRate: number;
}

export function buildSessionExcel(
  summary: SessionSummary,
  participants: ParticipantRow[],
  questions: QuestionRow[]
): Buffer {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Session Summary ─────────────────────────────
  const summaryData = [
    ["Session Summary"],
    [],
    ["Title", summary.title ?? `Session ${summary.sessionCode}`],
    ["Code", summary.sessionCode],
    ["Total Participants", summary.totalParticipants],
    ["Total Questions", summary.totalQuestions],
    ["Average Score", summary.averageScore],
    ["Highest Score", summary.highestScore],
    ["Correct Answer Rate", `${summary.correctRate}%`],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 24 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Session Summary");

  // ── Sheet 2: Participants ────────────────────────────────
  const participantHeaders = [
    "Rank",
    "Name",
    "Score",
    "Correct",
    "Wrong",
    "Answered",
    "Accuracy %",
  ];
  const participantRows = participants.map((p) => [
    p.rank ?? "-",
    p.displayName,
    p.totalScore,
    p.correctCount,
    p.wrongCount,
    p.answersCount,
    p.percentage,
  ]);
  const wsParticipants = XLSX.utils.aoa_to_sheet([
    participantHeaders,
    ...participantRows,
  ]);
  wsParticipants["!cols"] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsParticipants, "Participants");

  // ── Sheet 3: Question Analysis ───────────────────────────
  const questionHeaders = [
    "Q#",
    "Question",
    "Total Answers",
    "Correct",
    "Accuracy %",
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
    { wch: 6 },
    { wch: 60 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsQuestions, "Question Analysis");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
