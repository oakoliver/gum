/**
 * TTY-aware output utilities.
 * Port of charmbracelet/gum/internal/tty
 */

import * as fs from 'node:fs';
import * as tty from 'node:tty';
import { WithInput, WithOutput } from '@oakoliver/bubbletea';
import type { ProgramOption } from '@oakoliver/bubbletea';
import { stripAnsi } from './stdin.js';

let _isTTY: boolean | undefined;

/**
 * Check if stdout is a TTY.
 */
export function isTTY(): boolean {
  if (_isTTY === undefined) {
    _isTTY = tty.isatty(1);
  }
  return _isTTY;
}

/**
 * Print a line, stripping ANSI if stdout is not a TTY.
 */
export function println(s: string): void {
  if (isTTY()) {
    console.log(s);
  } else {
    console.log(stripAnsi(s));
  }
}

/**
 * Program options for interactive commands: draw on `output` (stderr by
 * default, as upstream) and, when stdin is piped (content read from it), take
 * key presses from the controlling terminal, as upstream Bubble Tea does.
 * Call `close` after the program ends: an open terminal stream keeps the
 * process alive.
 */
export function interactiveOptions(
  output: NodeJS.WriteStream = process.stderr,
  ttyInput = true,
): { options: ProgramOption[]; close: () => void } {
  const options = [WithOutput(output)];
  let input: tty.ReadStream | undefined;
  if (ttyInput && !tty.isatty(0)) {
    try {
      input = new tty.ReadStream(fs.openSync('/dev/tty', 'r'));
      options.push(WithInput(input));
    } catch {
      // No controlling terminal: keep stdin.
    }
  }
  return { options, close: () => input?.destroy() };
}
