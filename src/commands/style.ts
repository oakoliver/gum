/**
 * gum style — Apply styling to text.
 * Port of charmbracelet/gum/style
 */

import { flagStr } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { StyleOptions, toLipgloss, extractStyleOptions } from '../style.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';
import { println } from '../internal/tty.js';

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;

  // Build style options from top-level flags (no prefix)
  const opts: StyleOptions = {
    foreground: flagStr(flags, 'foreground', '') || undefined,
    background: flagStr(flags, 'background', '') || undefined,
    border: flagStr(flags, 'border', '') || undefined,
    borderForeground: flagStr(flags, 'border-foreground', '') || flagStr(flags, 'border.foreground', '') || undefined,
    borderBackground: flagStr(flags, 'border-background', '') || flagStr(flags, 'border.background', '') || undefined,
    align: flagStr(flags, 'align', '') || undefined,
    height: flags['height'] !== undefined ? parseInt(String(flags['height']), 10) : undefined,
    width: flags['width'] !== undefined ? parseInt(String(flags['width']), 10) : undefined,
    margin: flagStr(flags, 'margin', '') || undefined,
    padding: flagStr(flags, 'padding', '') || undefined,
    bold: flags['bold'] === true || flags['bold'] === 'true',
    faint: flags['faint'] === true || flags['faint'] === 'true',
    italic: flags['italic'] === true || flags['italic'] === 'true',
    strikethrough: flags['strikethrough'] === true || flags['strikethrough'] === 'true',
    underline: flags['underline'] === true || flags['underline'] === 'true',
  };

  const style = toLipgloss(opts);

  // Get text from args or stdin
  let text: string;
  if (parsed.args.length > 0) {
    text = parsed.args.join(' ');
  } else if (!isStdinEmpty()) {
    text = readStdin();
  } else {
    text = '';
  }

  const result = style.render(text);
  println(result);
}
