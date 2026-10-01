/**
 * Returns all page numbers in a deterministic order that samples the whole PDF
 * before falling back to the remaining pages.
 *
 * Large course PDFs should not be judged only by the first pages (covers,
 * contents, separators). We sample up to 30 evenly distributed pages first,
 * then append every unsampled page in natural order for resumable recovery.
 */
export function representativePageOrder(totalPages: number, sampleSize = 30): number[] {
  const total = Math.max(1, Math.floor(totalPages));
  const sample = Math.min(total, Math.max(1, Math.floor(sampleSize)));

  const selected = new Set<number>();

  if (sample === 1) {
    selected.add(1);
  } else {
    for (let index = 0; index < sample; index++) {
      const ratio = index / (sample - 1);
      const page = 1 + Math.round(ratio * (total - 1));
      selected.add(Math.min(total, Math.max(1, page)));
    }
  }

  // Rounding can collapse nearby positions for small PDFs. Fill any gaps using
  // natural order until the requested sample size is reached.
  for (let page = 1; selected.size < sample && page <= total; page++) {
    selected.add(page);
  }

  const sampled = [...selected].sort((a, b) => a - b);
  const rest: number[] = [];
  for (let page = 1; page <= total; page++) {
    if (!selected.has(page)) rest.push(page);
  }

  return [...sampled, ...rest];
}
