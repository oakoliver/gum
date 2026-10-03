/**
 * gum join — Join text vertically or horizontally.
 * Port of charmbracelet/gum/join
 */

import { joinHorizontal, joinVertical } from '@oakoliver/lipgloss';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { alignMap } from '../internal/decode.js';

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;
  const align = alignMap[flagStr(flags, 'align', 'left')] ?? alignMap.left;

  // Horizontal unless --vertical, as upstream (--horizontal is the default)
  const join = flagBool(flags, 'vertical', false) ? joinVertical : joinHorizontal;
  process.stdout.write(join(align, ...parsed.args) + '\n');
}
