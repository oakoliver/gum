/**
 * Style system — converts CLI style flags to lipgloss styles.
 * Port of charmbracelet/gum/style
 */

import { newStyle } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { alignMap, borderMap } from './internal/decode.js';

/** Style options matching the Go Styles struct. */
export interface StyleOptions {
  foreground?: string;
  background?: string;
  border?: string;
  borderBackground?: string;
  borderForeground?: string;
  align?: string;
  height?: number;
  width?: number;
  margin?: string;
  padding?: string;
  bold?: boolean;
  faint?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
}

/**
 * Parse padding/margin string "1 2 3 4" into [top, right, bottom, left].
 */
export function parsePadding(s: string): [number, number, number, number] {
  if (!s) return [0, 0, 0, 0];

  const tokens = s.trim().split(/\s+/);
  if (tokens.length > 4) return [0, 0, 0, 0];

  const ints: number[] = [];
  for (const token of tokens) {
    const n = parseInt(token, 10);
    if (isNaN(n)) return [0, 0, 0, 0];
    ints.push(n);
  }

  if (ints.length === 1) return [ints[0], ints[0], ints[0], ints[0]];
  if (ints.length === 2) return [ints[0], ints[1], ints[0], ints[1]];
  if (ints.length === 4) return [ints[0], ints[1], ints[2], ints[3]];

  return [0, 0, 0, 0];
}

/**
 * Convert StyleOptions to a lipgloss Style.
 */
export function toLipgloss(opts: StyleOptions): Style {
  let s = newStyle();

  if (opts.foreground) s = s.foreground(opts.foreground);
  if (opts.background) s = s.background(opts.background);
  if (opts.borderForeground) s = s.borderForeground(opts.borderForeground);
  if (opts.borderBackground) s = s.borderBackground(opts.borderBackground);

  if (opts.align && alignMap[opts.align] !== undefined) {
    s = s.align(alignMap[opts.align]);
  }

  if (opts.border && opts.border !== 'none' && borderMap[opts.border]) {
    s = s.border(borderMap[opts.border]);
  }

  if (opts.height !== undefined && opts.height > 0) s = s.height(opts.height);
  if (opts.width !== undefined && opts.width > 0) s = s.width(opts.width);

  if (opts.margin) {
    const [t, r, b, l] = parsePadding(opts.margin);
    s = s.marginTop(t).marginRight(r).marginBottom(b).marginLeft(l);
  }

  if (opts.padding) {
    const [t, r, b, l] = parsePadding(opts.padding);
    s = s.paddingTop(t).paddingRight(r).paddingBottom(b).paddingLeft(l);
  }

  if (opts.bold) s = s.bold(true);
  if (opts.faint) s = s.faint(true);
  if (opts.italic) s = s.italic(true);
  if (opts.strikethrough) s = s.strikethrough(true);
  if (opts.underline) s = s.underline(true);

  return s;
}

/**
 * Extract style options from CLI flags with a given prefix.
 * e.g., prefix "cursor" reads --cursor.foreground, --cursor.bold, etc.
 * `defaults` are the upstream per-component defaults (Kong's
 * `set:"defaultForeground=212"`), used when the flag is not given.
 */
export function extractStyleOptions(
  flags: Record<string, any>,
  prefix: string,
  defaults: StyleOptions = {},
): StyleOptions {
  const get = (key: string) => flags[`${prefix}.${key}`] ?? flags[`${prefix}-${key}`];
  const str = (key: string, fallback?: string) => {
    const v = get(key);
    return typeof v === 'string' ? v : fallback;
  };
  const int = (key: string, fallback?: number) => {
    const v = get(key);
    return v !== undefined ? parseInt(String(v), 10) : fallback;
  };
  const bool = (key: string, fallback = false) => {
    const v = get(key);
    return v === undefined ? fallback : v === true || v === 'true';
  };

  return {
    foreground: str('foreground', defaults.foreground),
    background: str('background', defaults.background),
    border: str('border', defaults.border),
    borderBackground: str('border-background') ?? str('borderBackground', defaults.borderBackground),
    borderForeground: str('border-foreground') ?? str('borderForeground', defaults.borderForeground),
    align: str('align', defaults.align),
    height: int('height', defaults.height),
    width: int('width', defaults.width),
    margin: str('margin', defaults.margin),
    padding: str('padding', defaults.padding),
    bold: bool('bold', defaults.bold),
    faint: bool('faint', defaults.faint),
    italic: bool('italic', defaults.italic),
    strikethrough: bool('strikethrough', defaults.strikethrough),
    underline: bool('underline', defaults.underline),
  };
}
