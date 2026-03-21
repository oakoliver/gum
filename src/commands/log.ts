/**
 * gum log — Log messages with levels and styling.
 * Port of charmbracelet/gum/log
 */

import { newStyle } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { extractStyleOptions, toLipgloss } from '../style.js';
import * as fs from 'node:fs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'none';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
  none: 5,
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '#6c757d',
  info: '#0d6efd',
  warn: '#ffc107',
  error: '#dc3545',
  fatal: '#dc3545',
  none: '',
};

function formatTimestamp(format: string): string {
  const now = new Date();
  // Simple time format — Go uses "2006-01-02T15:04:05" reference time
  if (format === 'TimeOnly' || format === 'timeonly') {
    return now.toLocaleTimeString();
  }
  if (format === 'DateTime' || format === 'datetime') {
    return now.toLocaleString();
  }
  if (format === 'DateOnly' || format === 'dateonly') {
    return now.toLocaleDateString();
  }
  if (format === 'Kitchen' || format === 'kitchen') {
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (format === 'RFC3339' || format === 'rfc3339') {
    return now.toISOString();
  }
  // Default: short timestamp
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatText(
  level: LogLevel,
  message: string,
  kvPairs: Record<string, string>,
  prefix: string,
  timeFormat: string,
  levelStyle: Style,
  keyStyle: Style,
  valueStyle: Style,
  separatorStyle: Style,
  prefixStyle: Style,
  timeStyle: Style,
  messageStyle: Style,
): string {
  const parts: string[] = [];

  // Timestamp
  if (timeFormat) {
    parts.push(timeStyle.render(formatTimestamp(timeFormat)));
  }

  // Level
  const levelStr = level.toUpperCase().padEnd(5);
  parts.push(levelStyle.render(levelStr));

  // Prefix
  if (prefix) {
    parts.push(prefixStyle.render(prefix));
  }

  // Message
  parts.push(messageStyle.render(message));

  // KV pairs
  for (const [key, value] of Object.entries(kvPairs)) {
    parts.push(
      keyStyle.render(key) +
      separatorStyle.render('=') +
      valueStyle.render(value)
    );
  }

  return parts.join(' ');
}

function formatJSON(
  level: LogLevel,
  message: string,
  kvPairs: Record<string, string>,
  prefix: string,
  timeFormat: string,
): string {
  const obj: Record<string, string> = {};
  if (timeFormat) obj['time'] = formatTimestamp(timeFormat);
  obj['level'] = level.toUpperCase();
  if (prefix) obj['prefix'] = prefix;
  obj['msg'] = message;
  Object.assign(obj, kvPairs);
  return JSON.stringify(obj);
}

function formatLogfmt(
  level: LogLevel,
  message: string,
  kvPairs: Record<string, string>,
  prefix: string,
  timeFormat: string,
): string {
  const parts: string[] = [];
  if (timeFormat) parts.push(`time=${formatTimestamp(timeFormat)}`);
  parts.push(`level=${level.toUpperCase()}`);
  if (prefix) parts.push(`prefix=${prefix}`);
  parts.push(`msg="${message}"`);
  for (const [key, value] of Object.entries(kvPairs)) {
    if (value.includes(' ')) {
      parts.push(`${key}="${value}"`);
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.join(' ');
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;

  const level = (flagStr(flags, 'level', 'info') as LogLevel);
  const formatter = flagStr(flags, 'formatter', 'text') || flagStr(flags, 'format', 'text');
  const prefix = flagStr(flags, 'prefix', '');
  const timeFormat = flagStr(flags, 'time', '');
  const structured = flagBool(flags, 'structured', false);

  // Get message from first positional arg
  const message = parsed.args.length > 0 ? parsed.args[0] : '';

  // Parse structured key=value pairs from remaining args
  const kvPairs: Record<string, string> = {};
  for (let i = 1; i < parsed.args.length; i++) {
    const arg = parsed.args[i];
    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      kvPairs[arg.substring(0, eqIdx)] = arg.substring(eqIdx + 1);
    }
  }

  // Styles
  const levelColor = LOG_LEVEL_COLORS[level] || '';
  const levelStyle = levelColor ? newStyle().foreground(levelColor).bold(true) : newStyle();
  const keyStyle = toLipgloss(extractStyleOptions(flags, 'key'));
  const valueStyle = toLipgloss(extractStyleOptions(flags, 'value'));
  const separatorStyle = toLipgloss(extractStyleOptions(flags, 'separator'));
  const prefixStyle = toLipgloss(extractStyleOptions(flags, 'prefix'));
  const timeStyle = toLipgloss(extractStyleOptions(flags, 'time'));
  const messageStyle = toLipgloss(extractStyleOptions(flags, 'message'));

  let output: string;

  switch (formatter) {
    case 'json':
      output = formatJSON(level, message, kvPairs, prefix, timeFormat);
      break;
    case 'logfmt':
      output = formatLogfmt(level, message, kvPairs, prefix, timeFormat);
      break;
    default:
      output = formatText(level, message, kvPairs, prefix, timeFormat,
        levelStyle, keyStyle, valueStyle, separatorStyle, prefixStyle,
        timeStyle, messageStyle);
      break;
  }

  // File output
  const file = flagStr(flags, 'file', '');
  if (file) {
    fs.appendFileSync(file, output + '\n');
  }

  // Write to stderr (logs typically go to stderr)
  process.stderr.write(output + '\n');
}
