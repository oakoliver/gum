/**
 * gum format — Render markdown, code, emoji, or templates.
 * Port of charmbracelet/gum/format
 */

import { render as renderMarkdown } from '@oakoliver/glamour';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';

type FormatType = 'markdown' | 'code' | 'emoji' | 'template';

function detectFormatType(flags: Record<string, string | boolean>): FormatType {
  if (flagBool(flags, 'type', false)) {
    const t = flagStr(flags, 'type', 'markdown');
    if (['markdown', 'code', 'emoji', 'template'].includes(t)) {
      return t as FormatType;
    }
  }
  // Check positional type flags
  if (flags['code'] === true) return 'code';
  if (flags['emoji'] === true) return 'emoji';
  if (flags['template'] === true) return 'template';
  if (flags['markdown'] === true) return 'markdown';
  return 'markdown';
}

function formatCode(text: string, language: string): string {
  // Wrap in markdown code block and render with glamour
  const wrapped = '```' + language + '\n' + text + '\n```';
  return renderMarkdown(wrapped, 'dark');
}

function formatEmoji(text: string): string {
  // Basic emoji shortcode replacement
  return text.replace(/:([a-z0-9_+-]+):/g, (match, name) => {
    const emoji = EMOJI_MAP[name];
    return emoji || match;
  });
}

function formatTemplate(text: string, _flags: Record<string, string | boolean>): string {
  // Basic template support — Go templates use {{.Env.VAR}} etc.
  // We support {{ .Env.KEY }} patterns by replacing with env vars
  return text.replace(/\{\{\s*\.Env\.(\w+)\s*\}\}/g, (_match, key) => {
    return process.env[key] || '';
  });
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

  // Get format type
  const formatType = detectFormatType(flags);
  const language = flagStr(flags, 'language', '') || flagStr(flags, 'lang', '');
  const theme = flagStr(flags, 'theme', 'dark');

  // Get text from args or stdin
  let text: string;
  if (parsed.args.length > 0) {
    text = parsed.args.join('\n');
  } else if (!isStdinEmpty()) {
    text = readStdin();
  } else {
    text = '';
  }

  if (!text) return;

  let output: string;

  switch (formatType) {
    case 'code':
      output = formatCode(text, language);
      break;
    case 'emoji':
      output = formatEmoji(text);
      break;
    case 'template':
      output = formatTemplate(text, flags);
      break;
    case 'markdown':
    default:
      output = renderMarkdown(text, theme);
      break;
  }

  process.stdout.write(output);
  if (!output.endsWith('\n')) {
    process.stdout.write('\n');
  }
}
