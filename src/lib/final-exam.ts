// Round-robin selection gives each training day a place in the final assessment.
export function selectFinalQuestions<T>(days: { questions: T[] }[], count: number): T[] {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("INVALID_QUESTION_COUNT");
  const result: T[] = [];
  for (let offset = 0; result.length < count; offset++) {
    let added = false;
    for (const day of days) {
      if (offset < day.questions.length) { result.push(day.questions[offset]); added = true; }
      if (result.length === count) break;
    }
    if (!added) break;
  }
  if (result.length !== count) throw new Error("NOT_ENOUGH_APPROVED_QUESTIONS");
  return result;
}
