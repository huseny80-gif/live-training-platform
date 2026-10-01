export const MIN_REAL_SOURCE_RATIO_SMALL = 0.7;
export const MIN_REAL_SOURCE_RATIO_LARGE = 0.5;
export const MAX_REQUIRED_REAL_PAGES = 30;
export const MIN_REQUIRED_REAL_PAGES_LARGE = 20;

export function requiredReadablePages(totalPages: number): number {
  const total = Math.max(1, Math.floor(totalPages));

  if (total <= 20) {
    return Math.max(1, Math.ceil(total * MIN_REAL_SOURCE_RATIO_SMALL));
  }

  return Math.min(
    MAX_REQUIRED_REAL_PAGES,
    Math.max(
      MIN_REQUIRED_REAL_PAGES_LARGE,
      Math.ceil(total * MIN_REAL_SOURCE_RATIO_LARGE),
    ),
  );
}
