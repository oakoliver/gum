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

/**
 * Boolean flags per command, from upstream gum v0.17.0. A boolean flag never
 * consumes the next argument as its value. Style flags ending in .bold,
 * .faint, .italic, .strikethrough or .underline are boolean everywhere.
 */
const BOOL_FLAGS: Record<string, ReadonlySet<string>> = {
  choose: new Set(['no-limit', 'ordered', 'show-help', 'select-if-one', 'strip-ansi']),
  confirm: new Set(['default', 'show-output', 'show-help']),
  file: new Set(['all', 'permissions', 'size', 'file', 'directory', 'show-help']),
  format: new Set(['strip-ansi']),
  input: new Set(['password', 'show-help', 'strip-ansi']),
  join: new Set(['horizontal', 'vertical']),
  log: new Set(['format', 'structured']),
  pager: new Set(['show-line-numbers', 'soft-wrap']),
  spin: new Set(['show-output', 'show-error', 'show-stdout', 'show-stderr']),
  style: new Set(['trim', 'strip-ansi', 'bold', 'faint', 'italic', 'strikethrough', 'underline']),
  table: new Set(['print', 'show-help', 'hide-count', 'lazy-quotes']),
  write: new Set(['show-cursor-line', 'show-line-numbers', 'show-help', 'strip-ansi']),
};

/** Short flag aliases per command, from upstream gum v0.17.0. */
const SHORT_FLAGS: Record<string, Readonly<Record<string, string>>> = {
  file: { c: 'cursor', a: 'all', p: 'permissions', s: 'size' },
  format: { l: 'language', t: 'type' },
  log: { o: 'file', f: 'format', l: 'level', s: 'structured', t: 'time' },
  spin: { s: 'spinner', a: 'align' },
  table: { s: 'separator', c: 'columns', w: 'widths', p: 'print', f: 'file', b: 'border', r: 'return-column' },
};

/** List flags that may be repeated; repeated values are joined with commas. */
const LIST_FLAGS = new Set(['selected', 'columns', 'widths']);

const STYLE_BOOL_SUFFIXES = ['bold', 'faint', 'italic', 'strikethrough', 'underline'];

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

  const boolFlags = BOOL_FLAGS[command] ?? new Set<string>();
  const shortFlags = SHORT_FLAGS[command] ?? {};
  const isBool = (key: string) =>
    boolFlags.has(key) || (key.includes('.') && STYLE_BOOL_SUFFIXES.includes(key.split('.').pop() ?? ''));

  const flags: Record<string, string | boolean> = {};
  const args: string[] = [];
  const set = (key: string, value: string | boolean) => {
    const prev = flags[key];
    flags[key] = LIST_FLAGS.has(key) && typeof prev === 'string' && typeof value === 'string'
      ? `${prev},${value}`
      : value;
  };

  let i = 1;
  while (i < argv.length) {
    const arg = argv[i];

    // -- signals end of flags
    if (arg === '--') {
      args.push(...argv.slice(i + 1));
      break;
    }

    let key: string | undefined;
    let inlineValue: string | undefined;

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      key = eqIndex === -1 ? arg.substring(2) : arg.substring(2, eqIndex);
      inlineValue = eqIndex === -1 ? undefined : arg.substring(eqIndex + 1);

      // --no-X negates the boolean flag X (Kong's negatable flags)
      if (inlineValue === undefined && key.startsWith('no-') && !isBool(key)) {
        flags[key.substring(3)] = false;
        i++;
        continue;
      }
    } else if (/^-[a-zA-Z]/.test(arg)) {
      const eqIndex = arg.indexOf('=');
      const letters = eqIndex === -1 ? arg.substring(1) : arg.substring(1, eqIndex);
      inlineValue = eqIndex === -1 ? undefined : arg.substring(eqIndex + 1);
      // Clustered boolean shorts: -ap means -a -p
      const names = [...letters].map((c) => shortFlags[c]);
      if (names.some((n) => n === undefined)) {
        args.push(arg);
        i++;
        continue;
      }
      for (const name of names.slice(0, -1)) set(name, true);
      key = names[names.length - 1];
    }

    if (key === undefined) {
      args.push(arg);
      i++;
      continue;
    }

    if (inlineValue !== undefined) {
      set(key, isBool(key) ? inlineValue === 'true' || inlineValue === '1' : inlineValue);
      i++;
    } else if (isBool(key)) {
      set(key, true);
      i++;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      set(key, argv[i + 1]);
      i += 2;
    } else {
      // No value — treat as boolean
      set(key, true);
      i++;
    }
  }

  return { command, flags, args };
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
