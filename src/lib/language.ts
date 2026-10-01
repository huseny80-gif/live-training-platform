export function isPredominantlyArabic(text: string): boolean {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic >= 3 && (latin === 0 || arabic >= latin * 0.4);
}

function isShortTechnicalTerm(text: string): boolean {
  const value = text.trim();
  return value.length > 0 && value.length <= 24 && /^[A-Za-z0-9+.#/()\-_ ]+$/.test(value);
}

export function isArabicQuestionContent(
  questionText: string,
  options: Array<{ text: string }>
): boolean {
  if (!isPredominantlyArabic(questionText)) return false;
  if (options.length < 2) return false;
  return options.every((option) =>
    isPredominantlyArabic(option.text) || isShortTechnicalTerm(option.text)
  );
}
