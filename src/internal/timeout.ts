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
 * Parse a duration string like "5s", "100ms", "2m" into milliseconds.
 * Returns 0 for "0s" or "0".
 */
export function parseDuration(s: string): number {
  if (!s || s === '0' || s === '0s' || s === '0ms') return 0;

  const match = s.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2] || 'ms';

  switch (unit) {
    case 'ms': return value;
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    default: return 0;
  }
}
