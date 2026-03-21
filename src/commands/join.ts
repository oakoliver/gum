/**
 * gum join — Join text vertically or horizontally.
 * Port of charmbracelet/gum/join
 */

import { joinHorizontal, joinVertical, Left, Center, Right, Top, Bottom } from '@oakoliver/lipgloss';
import type { Position } from '@oakoliver/lipgloss';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';

function parseAlign(s: string): Position {
  switch (s.toLowerCase()) {
    case 'center': return Center;
    case 'right': case 'bottom': return Right;
    case 'left': case 'top': default: return Left;
  }
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;
  const horizontal = flagBool(flags, 'horizontal', false);
  const align = flagStr(flags, 'align', 'left');

  const texts = parsed.args;
  if (texts.length === 0) {
    process.stdout.write('');
    return;
  }

  const pos = parseAlign(align);

  let result: string;
  if (horizontal) {
    result = joinHorizontal(pos, ...texts);
  } else {
    result = joinVertical(pos, ...texts);
  }

  process.stdout.write(result + '\n');
}
