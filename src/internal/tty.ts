/**
 * TTY-aware output utilities.
 * Port of charmbracelet/gum/internal/tty
 */

import * as fs from 'node:fs';
import * as tty from 'node:tty';
import { WithInput, WithOutput } from '@oakoliver/bubbletea';
import type { ProgramOption } from '@oakoliver/bubbletea';
import { ColorProfileWriter, detectColorProfile } from '@oakoliver/lipgloss';

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
 * Upstream's `tty.Writer()` (v2): stdout behind a color profile writer, which
 * downgrades colors to what the terminal supports, honors NO_COLOR, CLICOLOR
 * and CLICOLOR_FORCE, and strips every sequence when stdout is not a terminal.
 */
export function writer(): ColorProfileWriter {
  return new ColorProfileWriter(process.stdout, detectColorProfile(process.stdout, process.env));
}

/**
 * Like `writer()`, but styles survive a pipe or a command substitution. It
 * still downgrades colors, honors NO_COLOR and CLICOLOR_FORCE and strips
 * everything for TERM=dumb. Upstream v2 strips here as well, which breaks
 * `$(gum style ...)` and `gum format | less -R` (charmbracelet/gum#1127, #1131),
 * so styled output keeps what v0.17.0 did: color follows the environment, not
 * whether stdout is a pipe.
 */
export function styledWriter(): ColorProfileWriter {
  return new ColorProfileWriter(process.stdout, detectColorProfile({ isTTY: true }, process.env));
}

/** Print a line to stdout, stripping ANSI when stdout is not a TTY (upstream `tty.Println`). */
export function println(s: string): void {
  const w = writer();
  w.write(s + '\n');
  w.close();
}

/** Print rendered text to stdout, keeping its styles when stdout is not a TTY. */
export function printStyled(s: string, newline = true): void {
  const w = styledWriter();
  w.write(newline ? s + '\n' : s);
  w.close();
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
  } else if (!ttyInput && !tty.isatty(0)) {
    // Nothing reads keys, and a terminal reply to the startup probes would
    // land in the shell instead (the raw sequences upstream v2.0.1 and
    // v2.0.2 stopped leaking), so run without input: no query is sent.
    options.push(WithInput(null));
  }
  return {
    options,
    close: () => {
      if (!input) return;
      input.destroy();
      // Bun 1.4 keeps the process alive while a controlling terminal that
      // stays open has been read from, even after the stream is destroyed.
      // Node exits on its own and never gets here.
      setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref();
    },
  };
}
