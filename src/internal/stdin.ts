/**
 * Internal stdin utilities for reading piped input.
 * Port of charmbracelet/gum/internal/stdin
 */

import * as fs from 'node:fs';

export interface ReadOptions {
  stripAnsi?: boolean;
  singleLine?: boolean;
}

/**
 * Strip ANSI escape sequences from a string.
 */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Check if stdin has piped data available.
 */
export function isStdinEmpty(): boolean {
  try {
    const stat = fs.fstatSync(0);
    // Check if it's a pipe (FIFO) or has data
    if (stat.isFIFO()) return false;
    if (stat.size > 0) return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Read all data from stdin synchronously.
 */
export function readStdin(opts: ReadOptions = {}): string {
  if (isStdinEmpty()) {
    throw new Error('stdin is empty');
  }

  const chunks: Buffer[] = [];
  const buf = Buffer.alloc(1024);
  let bytesRead: number;

  try {
    while (true) {
      bytesRead = fs.readSync(0, buf, 0, buf.length, null);
      if (bytesRead === 0) break;
      chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
      if (opts.singleLine) {
        // Check if we have a newline
        const combined = Buffer.concat(chunks).toString('utf-8');
        const nlIndex = combined.indexOf('\n');
        if (nlIndex !== -1) {
          const line = combined.substring(0, nlIndex).trim();
          return opts.stripAnsi ? stripAnsi(line) : line;
        }
      }
    }
  } catch {
    // EOF or read error
  }

  let result = Buffer.concat(chunks).toString('utf-8').trim();
  if (opts.singleLine) {
    const nlIndex = result.indexOf('\n');
    if (nlIndex !== -1) {
      result = result.substring(0, nlIndex).trim();
    }
  }

  if (opts.stripAnsi) {
    result = stripAnsi(result);
  }

  return result;
}
