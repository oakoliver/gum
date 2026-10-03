/**
 * gum log — Log messages with levels and styling.
 * Port of charmbracelet/gum/log, which configures charmbracelet/log v0.4.2.
 */

import type { Style } from '@oakoliver/lipgloss';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { extractStyleOptions, toLipgloss } from '../style.js';
import * as fs from 'node:fs';

type LogLevel = 'none' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Level order; "none" logs unconditionally, like math.MaxInt32 upstream. */
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: -4,
  info: 0,
  warn: 4,
  error: 8,
  fatal: 12,
  none: Number.MAX_SAFE_INTEGER,
};

/** charmbracelet/log default level colors (ANSI 256). */
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '63',
  info: '86',
  warn: '192',
  error: '204',
  fatal: '134',
  none: '',
};

function parseLevel(s: string, flag: string): LogLevel {
  const level = s.toLowerCase();
  if (level in LEVEL_ORDER) return level as LogLevel;
  throw new Error(`invalid ${flag} "${s}": expected one of none, debug, info, warn, error, fatal`);
}

// ---------------------------------------------------------------------------
// Time formatting with Go reference layouts
// ---------------------------------------------------------------------------

/** Named layouts accepted by --time, as upstream. */
const TIME_FORMATS: Record<string, string> = {
  layout: '01/02 03:04:05PM \'06 -0700',
  ansic: 'Mon Jan _2 15:04:05 2006',
  unixdate: 'Mon Jan _2 15:04:05 MST 2006',
  rubydate: 'Mon Jan 02 15:04:05 -0700 2006',
  rfc822: '02 Jan 06 15:04 MST',
  rfc822z: '02 Jan 06 15:04 -0700',
  rfc850: 'Monday, 02-Jan-06 15:04:05 MST',
  rfc1123: 'Mon, 02 Jan 2006 15:04:05 MST',
  rfc1123z: 'Mon, 02 Jan 2006 15:04:05 -0700',
  rfc3339: '2006-01-02T15:04:05Z07:00',
  rfc3339nano: '2006-01-02T15:04:05.999999999Z07:00',
  kitchen: '3:04PM',
  stamp: 'Jan _2 15:04:05',
  stampmilli: 'Jan _2 15:04:05.000',
  stampmicro: 'Jan _2 15:04:05.000000',
  stampnano: 'Jan _2 15:04:05.000000000',
  datetime: '2006-01-02 15:04:05',
  dateonly: '2006-01-02',
  timeonly: '15:04:05',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function zone(d: Date, colon: boolean, z: boolean): string {
  const offset = -d.getTimezoneOffset();
  if (z && offset === 0) return 'Z';
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${sign}${pad(Math.floor(abs / 60))}${colon ? ':' : ''}${pad(abs % 60)}`;
}

/** Formats a date with a Go reference-time layout (Mon Jan 2 15:04:05 MST 2006). */
export function formatGoTime(d: Date, layout: string): string {
  const hour12 = d.getHours() % 12 || 12;
  const fraction = (digits: number, trim: boolean) => {
    const nanos = String(d.getMilliseconds()).padStart(3, '0').padEnd(9, '0').slice(0, digits);
    const value = trim ? nanos.replace(/0+$/, '') : nanos;
    return value ? `.${value}` : '';
  };
  const tokens: Array<[RegExp, () => string]> = [
    [/^January/, () => MONTHS[d.getMonth()]],
    [/^Jan/, () => MONTHS[d.getMonth()].slice(0, 3)],
    [/^Monday/, () => DAYS[d.getDay()]],
    [/^Mon/, () => DAYS[d.getDay()].slice(0, 3)],
    [/^MST/, () => Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? ''],
    [/^2006/, () => String(d.getFullYear())],
    [/^Z07:00/, () => zone(d, true, true)],
    [/^Z0700/, () => zone(d, false, true)],
    [/^-07:00/, () => zone(d, true, false)],
    [/^-0700/, () => zone(d, false, false)],
    [/^15/, () => pad(d.getHours())],
    [/^01/, () => pad(d.getMonth() + 1)],
    [/^02/, () => pad(d.getDate())],
    [/^_2/, () => String(d.getDate()).padStart(2, ' ')],
    [/^03/, () => pad(hour12)],
    [/^04/, () => pad(d.getMinutes())],
    [/^05/, () => pad(d.getSeconds())],
    [/^06/, () => pad(d.getFullYear() % 100)],
    [/^PM/, () => (d.getHours() < 12 ? 'AM' : 'PM')],
    [/^pm/, () => (d.getHours() < 12 ? 'am' : 'pm')],
    [/^1/, () => String(d.getMonth() + 1)],
    [/^2/, () => String(d.getDate())],
    [/^3/, () => String(hour12)],
    [/^4/, () => String(d.getMinutes())],
    [/^5/, () => String(d.getSeconds())],
  ];

  let out = '';
  let rest = layout;
  outer: while (rest.length > 0) {
    // Fractional seconds: .000 (fixed) or .999 (trailing zeros trimmed)
    const frac = /^[.,](0+|9+)(?!\d)/.exec(rest);
    if (frac) {
      out += fraction(frac[1].length, frac[1][0] === '9');
      rest = rest.slice(frac[0].length);
      continue;
    }
    for (const [re, fn] of tokens) {
      const m = re.exec(rest);
      if (m) {
        out += fn();
        rest = rest.slice(m[0].length);
        continue outer;
      }
    }
    out += rest[0];
    rest = rest.slice(1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Printf with Go verbs (%s %v %d %q %%)
// ---------------------------------------------------------------------------

function sprintf(format: string, args: string[]): string {
  let i = 0;
  const out = format.replace(/%([+#]?)([svdqf%])/g, (match, _flag, verb: string) => {
    if (verb === '%') return '%';
    if (i >= args.length) return `%!${verb}(MISSING)`;
    const arg = args[i++];
    return verb === 'q' ? JSON.stringify(arg) : arg;
  });
  if (i < args.length) {
    return `${out}%!(EXTRA ${args.slice(i).map((a) => `string=${a}`).join(', ')})`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

interface Entry {
  time?: string;
  level: LogLevel;
  prefix: string;
  message: string;
  keyvals: string[];
}

interface Styles {
  level: Style;
  time: Style;
  prefix: Style;
  message: Style;
  key: Style;
  value: Style;
  separator: Style;
}

/** Characters that make a value need quoting: whitespace, controls, = and ". */
function needsQuoting(s: string): boolean {
  return /[\s"=\p{Cc}�]/u.test(s);
}

function escape(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

function formatText(e: Entry, st: Styles): string {
  const parts: string[] = [];
  if (e.time !== undefined) parts.push(st.time.render(e.time));
  if (e.level !== 'none') parts.push(st.level.render(e.level.toUpperCase()));
  if (e.prefix) parts.push(st.prefix.render(`${e.prefix}:`));
  if (e.message) parts.push(st.message.render(e.message));

  let out = parts.join(' ');
  for (let i = 0; i < e.keyvals.length; i += 2) {
    const key = e.keyvals[i];
    if (key === '') continue;
    const value = e.keyvals[i + 1];
    const sep = st.separator.render('=');
    if (value.includes('\n')) {
      out += `\n  ${st.key.render(key)}${sep}\n`;
      out += value.split('\n').map((line) => `${st.separator.render('  │ ')}${st.value.render(line)}`).join('\n');
      continue;
    }
    const shown = value === '' ? '""' : needsQuoting(value) ? `"${escape(value)}"` : value;
    out += `${out ? ' ' : ''}${st.key.render(key)}${sep}${st.value.render(shown)}`;
  }
  return out;
}

function formatJSON(e: Entry): string {
  const obj: Record<string, string> = {};
  if (e.time !== undefined) obj.time = e.time;
  obj.level = e.level === 'none' ? '' : e.level;
  if (e.prefix) obj.prefix = e.prefix;
  if (e.message) obj.msg = e.message;
  for (let i = 0; i < e.keyvals.length; i += 2) obj[e.keyvals[i]] = e.keyvals[i + 1];
  return JSON.stringify(obj);
}

function logfmtValue(v: string): string {
  return v === '' || /[\s"=\p{Cc}]/u.test(v) ? JSON.stringify(v) : v;
}

function formatLogfmt(e: Entry): string {
  const pairs: Array<[string, string]> = [];
  if (e.time !== undefined) pairs.push(['time', e.time]);
  pairs.push(['level', e.level === 'none' ? '' : e.level]);
  if (e.prefix) pairs.push(['prefix', e.prefix]);
  if (e.message) pairs.push(['msg', e.message]);
  for (let i = 0; i < e.keyvals.length; i += 2) pairs.push([e.keyvals[i], e.keyvals[i + 1]]);
  return pairs.map(([k, v]) => `${k}=${logfmtValue(v)}`).join(' ');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;
  const text = parsed.args;

  const level = parseLevel(flagStr(flags, 'level', 'none'), '--level');
  const minLevel = flagStr(flags, 'min-level', '');
  if (minLevel && LEVEL_ORDER[level] < LEVEL_ORDER[parseLevel(minLevel, '--min-level')]) {
    return;
  }

  let message: string;
  let keyvals: string[] = [];
  if (flagBool(flags, 'format', false)) {
    message = sprintf(text[0] ?? '', text.slice(1));
  } else if (flagBool(flags, 'structured', false)) {
    message = text[0] ?? '';
    keyvals = text.slice(1);
    if (keyvals.length % 2 !== 0) keyvals.push('missing value');
  } else {
    message = text.join(' ');
  }

  const timeFlag = flagStr(flags, 'time', '');
  const entry: Entry = {
    time: timeFlag ? formatGoTime(new Date(), TIME_FORMATS[timeFlag.toLowerCase()] ?? timeFlag) : undefined,
    level,
    prefix: flagStr(flags, 'prefix', ''),
    message,
    keyvals,
  };

  const levelOpts = extractStyleOptions(flags, 'level', { bold: true });
  if (!levelOpts.foreground) levelOpts.foreground = LEVEL_COLORS[level] || undefined;
  const styles: Styles = {
    level: toLipgloss(levelOpts),
    time: toLipgloss(extractStyleOptions(flags, 'time')),
    prefix: toLipgloss(extractStyleOptions(flags, 'prefix', { bold: true, faint: true })),
    message: toLipgloss(extractStyleOptions(flags, 'message')),
    key: toLipgloss(extractStyleOptions(flags, 'key', { faint: true })),
    value: toLipgloss(extractStyleOptions(flags, 'value')),
    separator: toLipgloss(extractStyleOptions(flags, 'separator', { faint: true })),
  };

  let output: string;
  switch (flagStr(flags, 'formatter', 'text')) {
    case 'json':
      output = formatJSON(entry);
      break;
    case 'logfmt':
      output = formatLogfmt(entry);
      break;
    default:
      output = formatText(entry, styles);
      break;
  }

  // Upstream writes to --file instead of stderr when it is given
  const file = flagStr(flags, 'file', '');
  if (file) {
    fs.appendFileSync(file, output + '\n');
  } else {
    process.stderr.write(output + '\n');
  }

  if (level === 'fatal') process.exit(1);
}
