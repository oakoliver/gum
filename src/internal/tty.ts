/**
 * TTY-aware output utilities.
 * Port of charmbracelet/gum/internal/tty
 */

import * as tty from 'node:tty';
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
