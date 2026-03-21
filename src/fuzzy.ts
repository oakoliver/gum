/**
 * Fuzzy matching implementation.
 * Port of sahilm/fuzzy for use by the filter command.
 */

export interface FuzzyMatch {
  /** The original string that matched. */
  str: string;
  /** The index of the match in the original list. */
  index: number;
  /** Byte positions of matched characters in the original string. */
  matchedIndexes: number[];
  /** Score for ranking. */
  score: number;
}

/**
 * Find fuzzy matches for a pattern in a list of choices.
 * Returns matches sorted by score (best first).
 */
export function fuzzyFind(pattern: string, choices: string[]): FuzzyMatch[] {
  if (!pattern) return matchAll(choices);

  const matches: FuzzyMatch[] = [];
  const lowerPattern = pattern.toLowerCase();

  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const result = fuzzyMatch(lowerPattern, choice);
    if (result) {
      matches.push({
        str: choice,
        index: i,
        matchedIndexes: result.indexes,
        score: result.score,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches;
}

/**
 * Find fuzzy matches without sorting.
 */
export function fuzzyFindNoSort(pattern: string, choices: string[]): FuzzyMatch[] {
  if (!pattern) return matchAll(choices);

  const matches: FuzzyMatch[] = [];
  const lowerPattern = pattern.toLowerCase();

  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const result = fuzzyMatch(lowerPattern, choice);
    if (result) {
      matches.push({
        str: choice,
        index: i,
        matchedIndexes: result.indexes,
        score: result.score,
      });
    }
  }

  return matches;
}

/**
 * Create matches for all items (no filter).
 */
export function matchAll(choices: string[]): FuzzyMatch[] {
  return choices.map((str, index) => ({
    str,
    index,
    matchedIndexes: [],
    score: 0,
  }));
}

/**
 * Exact substring match.
 */
export function exactMatches(search: string, choices: string[]): FuzzyMatch[] {
  if (!search) return matchAll(choices);

  const lowerSearch = search.toLowerCase();
  const matches: FuzzyMatch[] = [];

  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const lowerChoice = choice.toLowerCase();
    const index = lowerChoice.indexOf(lowerSearch);

    if (index >= 0) {
      const matchedIndexes: number[] = [];
      for (let s = 0; s < lowerSearch.length; s++) {
        matchedIndexes.push(index + s);
      }
      matches.push({
        str: choice,
        index: i,
        matchedIndexes,
        score: 0,
      });
    }
  }

  return matches;
}

/**
 * Attempt fuzzy match of pattern against str.
 */
function fuzzyMatch(lowerPattern: string, str: string): { indexes: number[]; score: number } | null {
  const lowerStr = str.toLowerCase();
  const indexes: number[] = [];
  let score = 0;
  let patternIdx = 0;
  let prevMatchIdx = -1;

  for (let i = 0; i < lowerStr.length && patternIdx < lowerPattern.length; i++) {
    if (lowerStr[i] === lowerPattern[patternIdx]) {
      indexes.push(i);

      // Bonus for consecutive matches
      if (prevMatchIdx !== -1 && i === prevMatchIdx + 1) {
        score += 4;
      }

      // Bonus for matching at start of word
      if (i === 0 || str[i - 1] === ' ' || str[i - 1] === '/' || str[i - 1] === '.' || str[i - 1] === '-' || str[i - 1] === '_') {
        score += 2;
      }

      // Bonus for case match
      if (str[i] === lowerPattern[patternIdx]) {
        score += 1;
      }

      prevMatchIdx = i;
      patternIdx++;
    }
  }

  if (patternIdx !== lowerPattern.length) return null;

  return { indexes, score };
}

/**
 * Convert array of matched indexes to ranges [start, end].
 */
export function matchedRanges(indexes: number[]): [number, number][] {
  if (indexes.length === 0) return [];

  let current: [number, number] = [indexes[0], indexes[0]];

  if (indexes.length === 1) return [current];

  const out: [number, number][] = [];

  for (let i = 1; i < indexes.length; i++) {
    if (indexes[i] === current[1] + 1) {
      current[1] = indexes[i];
    } else {
      out.push(current);
      current = [indexes[i], indexes[i]];
    }
  }

  out.push(current);
  return out;
}
