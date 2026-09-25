// ─────────────────────────────────────────────────────────────────────────────
// AI Content Generation — provider-agnostic types
// ─────────────────────────────────────────────────────────────────────────────

export type AILanguage = "AR" | "EN";

// ── Source page reference ────────────────────────────────────────────────────

export interface SourcePageRef {
  pageId: string;
  pageNumber: number;
  extractedText: string;
  title?: string | null;
}

// ── Training day plan ────────────────────────────────────────────────────────

export interface GeneratedDayPlan {
  dayNumber: number;          // 1–10
  title: string;
  objectives: string[];
  contentSummary: string;
  topics: string[];           // ordered topic labels for the day
  pageRangeStart: number;
  pageRangeEnd: number;
  sourcePages: number[];      // page numbers covered
}

// ── Question draft ───────────────────────────────────────────────────────────

export interface GeneratedOption {
  label: "A" | "B" | "C" | "D";
  text: string;
}

export interface GeneratedQuestion {
  questionText: string;
  options: GeneratedOption[];            // always 4
  correctLabel: "A" | "B" | "C" | "D";  // NEVER exposed to participant APIs
  explanation: string;
  dayNumber: number;
  questionOrder: number;                 // 1–5
  sourcePageNumber: number;
  topic?: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
}

// ── AI adapter interface ─────────────────────────────────────────────────────

export interface ContentGenerationRequest {
  pages: SourcePageRef[];
  language: AILanguage;
  programTitle: string;
  totalDays: number;           // always 10
  questionsPerDay: number;     // always 5
}

export interface ContentGenerationResult {
  days: GeneratedDayPlan[];
  questions: GeneratedQuestion[];
  modelUsed: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  generatedAt: Date;
}

export interface AIAdapter {
  readonly name: string;
  readonly modelId: string;
  /** Generate 10-day plan + 50 questions from extracted pages */
  generate(req: ContentGenerationRequest): Promise<ContentGenerationResult>;
}
