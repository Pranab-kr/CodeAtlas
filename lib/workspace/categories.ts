// The rail's hues. The taxonomy itself lives in lib/roles.ts, which imports
// nothing, so a browser component can read it without pulling in the parser.

const CATEGORY_TONE_ORDER = [9, 10, 11, 7, 8, 6, 4, 5, 2, 3, 0, 1];

export function categoryTone(index: number): number {
  return CATEGORY_TONE_ORDER[index % CATEGORY_TONE_ORDER.length];
}
