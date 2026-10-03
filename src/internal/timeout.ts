/**
 * Timeout utilities.
 * Port of charmbracelet/gum/internal/timeout
 */

/**
 * Create a timeout context (returns an AbortController).
 * If timeoutMs is 0, returns a controller that never aborts.
 */
export function createTimeout(timeoutMs: number): { controller: AbortController; cancel: () => void } {
  const controller = new AbortController();
  if (timeoutMs <= 0) {
    return { controller, cancel: () => {} };
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    cancel: () => clearTimeout(timer),
  };
}

/**
 * Parse a Go duration string ("300ms", "5s", "1m30s", "1.5h") into
 * milliseconds. A bare number is seconds, as Kong parses it upstream.
 * Returns 0 for empty or invalid input.
 */
export function parseDuration(s: string): number {
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) * 1000;

  const units: Record<string, number> = { ns: 1e-6, us: 1e-3, 'µs': 1e-3, ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  const re = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h)/gy;
  let total = 0;
  let consumed = 0;
  for (const match of s.matchAll(re)) {
    total += parseFloat(match[1]) * units[match[2]];
    consumed += match[0].length;
  }
  return consumed === s.length ? total : 0;
}
