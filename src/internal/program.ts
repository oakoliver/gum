/**
 * Runs an interactive command's Bubble Tea program the way upstream does:
 * output on stderr (or the given stream), keys from the terminal when stdin
 * is piped, and --timeout applied as a deadline.
 */

import { Program, WithAbortSignal } from '@oakoliver/bubbletea';
import type { Model, ProgramOption } from '@oakoliver/bubbletea';
import { flagStr } from '../parser.js';
import { interactiveOptions } from './tty.js';
import { parseDuration, createTimeout } from './timeout.js';
import { STATUS_TIMEOUT } from './exit.js';

export interface ProgramResult<M> {
  model: M;
  timedOut: boolean;
}

export async function runProgram<M extends Model>(
  model: M,
  flags: Record<string, string | boolean>,
  {
    output = process.stderr,
    extra = [],
    ttyInput = true,
  }: { output?: NodeJS.WriteStream; extra?: ProgramOption[]; ttyInput?: boolean } = {},
): Promise<ProgramResult<M>> {
  const timeoutMs = parseDuration(flagStr(flags, 'timeout', '0'));
  const { controller, cancel } = createTimeout(timeoutMs);
  const io = interactiveOptions(output, ttyInput);
  const options = [...extra, ...io.options];
  if (timeoutMs > 0) options.push(WithAbortSignal(controller.signal));

  try {
    const final = (await new Program(model, ...options).run()) as M;
    return { model: final, timedOut: false };
  } catch (error) {
    // The models mutate in place, so `model` holds the state at the deadline.
    if (controller.signal.aborted) return { model, timedOut: true };
    throw error;
  } finally {
    cancel();
    io.close();
  }
}

/** Upstream's handling of a timed-out command: report it and exit 124. */
export function exitTimedOut(): never {
  console.error('timed out');
  process.exit(STATUS_TIMEOUT);
}
