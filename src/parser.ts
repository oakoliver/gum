/**
 * CLI argument parser.
 * Replaces alecthomas/kong for the gum CLI.
 * Handles: gum <subcommand> [--flag value] [--flag=value] [--bool-flag] [args...]
 */

export interface ParsedArgs {
  /** The subcommand (e.g., "choose", "confirm", "input") */
  command: string;
  /** Named flags (--key value or --key=value) */
  flags: Record<string, string | boolean>;
  /** Positional arguments (everything after flags, or after --) */
  args: string[];
}

/** Known boolean flags that never take a value argument. */
const BOOL_FLAGS = new Set([
  'no-limit', 'no-show-help', 'no-strip-ansi', 'ordered', 'reverse',
  'no-strict', 'strict', 'select-if-one', 'sort', 'no-sort',
  'affirmative', 'negative', 'default', 'bold', 'faint', 'italic',
  'strikethrough', 'underline', 'horizontal', 'vertical',
  'show-line-numbers', 'soft-wrap', 'show-help', 'strip-ansi',
  'cursor.bold', 'cursor.faint', 'cursor.italic', 'cursor.strikethrough', 'cursor.underline',
  'header.bold', 'header.faint', 'header.italic', 'header.strikethrough', 'header.underline',
  'selected.bold', 'selected.faint', 'selected.italic', 'selected.strikethrough', 'selected.underline',
  'unselected.bold', 'unselected.faint', 'unselected.italic', 'unselected.strikethrough', 'unselected.underline',
  'text.bold', 'text.faint', 'text.italic', 'text.strikethrough', 'text.underline',
  'match.bold', 'match.faint', 'match.italic', 'match.strikethrough', 'match.underline',
  'indicator.bold', 'indicator.faint', 'indicator.italic', 'indicator.strikethrough', 'indicator.underline',
  'prompt.bold', 'prompt.faint', 'prompt.italic', 'prompt.strikethrough', 'prompt.underline',
  'item.bold', 'item.faint', 'item.italic', 'item.strikethrough', 'item.underline',
  'fuzzy', 'exact',
]);

/**
 * Parse argv into a structured command + flags + args.
 * Expects argv WITHOUT the first two entries (node binary + script path).
 */
export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return { command: '', flags: {}, args: [] };
  }

  const command = argv[0];

  // Special case: --help, --version at top level
  if (command === '--help' || command === '-h') {
    return { command: 'help', flags: {}, args: [] };
  }
  if (command === '--version' || command === '-v') {
    return { command: 'version', flags: {}, args: [] };
  }

  const flags: Record<string, string | boolean> = {};
  const args: string[] = [];
  let i = 1;
  let pastFlags = false;

  while (i < argv.length) {
    const arg = argv[i];

    if (pastFlags) {
      args.push(arg);
      i++;
      continue;
    }

    // -- signals end of flags
    if (arg === '--') {
      pastFlags = true;
      i++;
      continue;
    }

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');

      if (eqIndex !== -1) {
        // --flag=value
        const key = arg.substring(2, eqIndex);
        const value = arg.substring(eqIndex + 1);
        flags[key] = value;
        i++;
      } else {
        const key = arg.substring(2);

        // Handle --no-X negation pattern
        if (key.startsWith('no-') && !BOOL_FLAGS.has(key)) {
          const positiveKey = key.substring(3);
          flags[positiveKey] = false;
          i++;
          continue;
        }

        // Check if this is a known boolean flag
        if (isBoolFlag(key)) {
          flags[key] = true;
          i++;
        } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
          // Next arg is the value
          flags[key] = argv[i + 1];
          i += 2;
        } else {
          // No value — treat as boolean
          flags[key] = true;
          i++;
        }
      }
    } else {
      // Positional argument
      args.push(arg);
      i++;
    }
  }

  return { command, flags, args };
}

function isBoolFlag(key: string): boolean {
  if (BOOL_FLAGS.has(key)) return true;

  // Style boolean suffixes
  const parts = key.split('.');
  if (parts.length === 2) {
    const suffix = parts[1];
    if (['bold', 'faint', 'italic', 'strikethrough', 'underline'].includes(suffix)) {
      return true;
    }
  }

  return false;
}

/**
 * Get a flag value as a string, with a default.
 */
export function flagStr(flags: Record<string, string | boolean>, key: string, defaultValue: string): string {
  const v = flags[key];
  if (v === undefined) return defaultValue;
  if (typeof v === 'boolean') return String(v);
  return v;
}

/**
 * Get a flag value as a number, with a default.
 */
export function flagInt(flags: Record<string, string | boolean>, key: string, defaultValue: number): number {
  const v = flags[key];
  if (v === undefined) return defaultValue;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? defaultValue : n;
}

/**
 * Get a flag value as a boolean.
 */
export function flagBool(flags: Record<string, string | boolean>, key: string, defaultValue = false): boolean {
  const v = flags[key];
  if (v === undefined) return defaultValue;
  if (typeof v === 'boolean') return v;
  return v === 'true' || v === '1' || v === 'yes';
}

/**
 * Get a flag value, checking env var fallback.
 * Kong uses env:"GUM_INPUT_VALUE" pattern — we check env vars with GUM_ prefix.
 */
export function flagWithEnv(
  flags: Record<string, string | boolean>,
  key: string,
  envKey: string,
  defaultValue: string,
): string {
  const v = flags[key];
  if (v !== undefined) return typeof v === 'boolean' ? String(v) : v;
  const envVal = process.env[envKey];
  if (envVal !== undefined) return envVal;
  return defaultValue;
}
