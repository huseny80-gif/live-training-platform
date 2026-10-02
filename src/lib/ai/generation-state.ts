export type GenerationState =
  | { status: "idle" }
  | { status: "processing"; completedDays: number }
  | { status: "completed"; days: number; questions: number }
  | { status: "failed"; error: string };

export function generationState(notes: string | null | undefined): GenerationState {
  const processing = notes?.match(/^GENERATION_PROCESSING:[a-f0-9-]+:(\d+)$/);
  if (processing) return { status: "processing", completedDays: Math.min(10, Number(processing[1])) };
  const completed = notes?.match(/^GENERATION_COMPLETED:(\d+):(\d+)$/);
  if (completed) return { status: "completed", days: Number(completed[1]), questions: Number(completed[2]) };
  if (notes?.startsWith("GENERATION_FAILED:")) return { status: "failed", error: notes.slice("GENERATION_FAILED:".length) };
  return { status: "idle" };
}
