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
 */
export function interactiveOptions(output: NodeJS.WriteStream = process.stderr): ProgramOption[] {
  const options = [WithOutput(output)];
  if (!tty.isatty(0)) {
    try {
      options.push(WithInput(new tty.ReadStream(fs.openSync('/dev/tty', 'r'))));
    } catch {
      // No controlling terminal: keep stdin.
    }
  }
  return options;
}
