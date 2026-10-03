/**
 * gum format — Render markdown, code, emoji, or templates.
 * Port of charmbracelet/gum/format
 */

import { TermRenderer, withAutoStyle, withStylePath, withWordWrap } from '@oakoliver/glamour';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';

type FormatType = 'markdown' | 'code' | 'emoji' | 'template';

function formatMarkdown(text: string, theme: string): string {
  return new TermRenderer(withStylePath(theme), withWordWrap(0)).render(text);
}

function formatCode(text: string, language: string): string {
  return new TermRenderer(withAutoStyle(), withWordWrap(0)).render('```' + language + '\n' + text + '\n```');
}

function formatEmoji(text: string): string {
  // Basic emoji shortcode replacement
  return text.replace(/:([a-z0-9_+-]+):/g, (match, name) => {
    const emoji = EMOJI_MAP[name];
    return emoji || match;
  });
}

// ---------------------------------------------------------------------------
// Templates: Go text/template actions with termenv's template functions, as
// upstream (`{{ Bold "Tasty" }} {{ Color "99" "0" " Gum " }}`).
// ---------------------------------------------------------------------------

const SGR: Record<string, string> = {
  Bold: '1', Faint: '2', Italic: '3', Underline: '4', Blink: '5', Reverse: '7', CrossOut: '9', Overline: '53',
};

function colorSequence(color: string, background: boolean): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    return `${background ? 48 : 38};2;${r};${g};${b}`;
  }
  const n = Number(color);
  if (!Number.isInteger(n) || n < 0 || n > 255) return '';
  return `${background ? 48 : 38};5;${n}`;
}

function styled(text: string, ...sequences: string[]): string {
  const seq = sequences.filter(Boolean).join(';');
  return seq ? `\x1b[${seq}m${text}\x1b[0m` : text;
}

const TEMPLATE_FUNCS: Record<string, (...args: string[]) => string> = {
  Color: (fg, bg, text) => styled(text, colorSequence(fg, false), colorSequence(bg, true)),
  Foreground: (color, text) => styled(text, colorSequence(color, false)),
  Background: (color, text) => styled(text, colorSequence(color, true)),
  ...Object.fromEntries(Object.entries(SGR).map(([name, code]) => [name, (text: string) => styled(text, code)])),
};

/** Evaluates one action body: `Func arg (Func arg) "literal"`. */
function evalAction(source: string): string {
  let pos = 0;
  const skipSpace = () => { while (pos < source.length && /\s/.test(source[pos])) pos++; };

  const parseOperand = (): string => {
    skipSpace();
    const ch = source[pos];
    if (ch === '"') {
      const match = /^"(?:[^"\\]|\\.)*"/.exec(source.slice(pos));
      if (!match) throw new Error('unable to parse template: unterminated string');
      pos += match[0].length;
      return JSON.parse(match[0]);
    }
    if (ch === '`') {
      const end = source.indexOf('`', pos + 1);
      if (end === -1) throw new Error('unable to parse template: unterminated raw string');
      const value = source.slice(pos + 1, end);
      pos = end + 1;
      return value;
    }
    if (ch === '(') {
      pos++;
      const value = parseCall();
      skipSpace();
      if (source[pos] !== ')') throw new Error('unable to parse template: missing )');
      pos++;
      return value;
    }
    const match = /^[^\s()"`]+/.exec(source.slice(pos));
    if (!match) throw new Error(`unable to parse template: unexpected ${JSON.stringify(source.slice(pos))}`);
    pos += match[0].length;
    return match[0];
  };

  const parseCall = (): string => {
    skipSpace();
    const name = /^[A-Za-z]\w*/.exec(source.slice(pos))?.[0];
    if (!name || !(name in TEMPLATE_FUNCS)) return parseOperand();
    pos += name.length;
    const args: string[] = [];
    skipSpace();
    while (pos < source.length && source[pos] !== ')') {
      args.push(parseOperand());
      skipSpace();
    }
    const fn = TEMPLATE_FUNCS[name];
    if (args.length !== fn.length) {
      throw new Error(`unable to parse template: ${name} expects ${fn.length} arguments, got ${args.length}`);
    }
    return fn(...args);
  };

  const value = parseCall();
  skipSpace();
  if (pos !== source.length) throw new Error(`unable to parse template: unexpected ${JSON.stringify(source.slice(pos))}`);
  return value;
}

function formatTemplate(text: string): string {
  return text.replace(/\{\{-?([\s\S]*?)-?\}\}/g, (_match, body: string) => evalAction(body.trim()));
}

// Common emoji shortcodes
const EMOJI_MAP: Record<string, string> = {
  'smile': '😄', 'laughing': '😆', 'blush': '😊', 'smiley': '😃',
  'relaxed': '☺️', 'heart_eyes': '😍', 'kissing_heart': '😘',
  'wink': '😉', 'stuck_out_tongue_winking_eye': '😜', 'sunglasses': '😎',
  'thumbsup': '👍', 'thumbsdown': '👎', 'clap': '👏', 'wave': '👋',
  'fire': '🔥', 'heart': '❤️', 'star': '⭐', 'sparkles': '✨',
  'check': '✅', 'x': '❌', 'warning': '⚠️', 'bulb': '💡',
  'rocket': '🚀', 'tada': '🎉', 'party_popper': '🎉',
  'coffee': '☕', 'beer': '🍺', 'pizza': '🍕',
  'bug': '🐛', 'wrench': '🔧', 'hammer': '🔨', 'gear': '⚙️',
  'lock': '🔒', 'key': '🔑', 'link': '🔗', 'package': '📦',
  'memo': '📝', 'book': '📖', 'pencil': '✏️', 'scissors': '✂️',
  'computer': '💻', 'phone': '📱', 'email': '📧', 'globe': '🌍',
  'sun': '☀️', 'moon': '🌙', 'cloud': '☁️', 'rainbow': '🌈',
  'zap': '⚡', 'boom': '💥', 'collision': '💥',
  'eyes': '👀', 'brain': '🧠', 'muscle': '💪',
  'green_circle': '🟢', 'red_circle': '🔴', 'blue_circle': '🔵',
  'white_check_mark': '✅', 'heavy_check_mark': '✔️',
  'arrow_right': '➡️', 'arrow_left': '⬅️', 'arrow_up': '⬆️', 'arrow_down': '⬇️',
  'plus': '➕', 'minus': '➖',
};

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;

  const type = flagStr(flags, 'type', 'markdown') as FormatType;
  const language = flagStr(flags, 'language', '');
  const theme = flagStr(flags, 'theme', 'pink');

  // Get text from args (one per line) or stdin
  let text = '';
  if (parsed.args.length > 0) {
    text = parsed.args.join('\n');
  } else if (!isStdinEmpty()) {
    text = readStdin({ stripAnsi: flagBool(flags, 'strip-ansi', true) });
  }

  let output: string;
  switch (type) {
    case 'code':
      output = formatCode(text, language);
      break;
    case 'emoji':
      output = formatEmoji(text);
      break;
    case 'template':
      output = formatTemplate(text);
      break;
    default:
      output = formatMarkdown(text, theme);
      break;
  }

  process.stdout.write(output);
  if (!output.endsWith('\n')) {
    process.stdout.write('\n');
  }
}
