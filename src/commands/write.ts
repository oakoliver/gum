/**
 * gum write — Multi-line text input.
 * Port of charmbracelet/gum/write (v0.17.0)
 */

import { KeyPressMsg, KeyCode, KeyMod, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newTextarea, newHelp, newBinding, withKeys, withHelp } from '@oakoliver/bubbles';
import type { TextareaModel } from '@oakoliver/bubbles';
import { newStyle, joinVertical, Left } from '@oakoliver/lipgloss';
import { flagStr, flagInt, flagBool, flagWithEnv } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { runProgram, exitTimedOut } from '../internal/program.js';
import { extractStyleOptions, toLipgloss, parsePadding } from '../style.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';
import { STATUS_ABORTED } from '../internal/exit.js';

interface WriteModel extends Model {
  textarea: TextareaModel;
  aborted: boolean;
  quitting: boolean;
  submitted: boolean;
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;
  const [top, right, bottom, left] = parsePadding(flagStr(flags, 'padding', '0 0'));

  // The initial value comes from --value, else from piped stdin.
  let value = flagStr(flags, 'value', '');
  if (!value && !isStdinEmpty()) {
    value = readStdin({ stripAnsi: flagBool(flags, 'strip-ansi', true) }).replace(/\r/g, '');
  }

  const ta = newTextarea();
  ta.focus();
  ta.prompt = flagStr(flags, 'prompt', '┃ ');
  ta.placeholder = flagWithEnv(flags, 'placeholder', 'GUM_WRITE_PLACEHOLDER', 'Write something...');
  ta.showLineNumbers = flagBool(flags, 'show-line-numbers', false);
  ta.charLimit = flagInt(flags, 'char-limit', 0);
  ta.maxHeight = flagInt(flags, 'max-lines', 0);

  // Upstream's styles, the same focused and blurred
  const styles = ta.getStyles();
  const state = {
    ...styles.focused,
    base: toLipgloss(extractStyleOptions(flags, 'base')),
    placeholder: toLipgloss(extractStyleOptions(flags, 'placeholder', { foreground: '240' })),
    cursorLine: toLipgloss(extractStyleOptions(flags, 'cursor-line')),
    cursorLineNumber: toLipgloss(extractStyleOptions(flags, 'cursor-line-number', { foreground: '7' })),
    endOfBuffer: toLipgloss(extractStyleOptions(flags, 'end-of-buffer', { foreground: '0' })),
    lineNumber: toLipgloss(extractStyleOptions(flags, 'line-number', { foreground: '7' })),
    prompt: toLipgloss(extractStyleOptions(flags, 'prompt', { foreground: '7' })),
  };
  styles.focused = state;
  styles.blurred = { ...state };
  styles.cursor.color = extractStyleOptions(flags, 'cursor', { foreground: '212' }).foreground ?? styles.cursor.color;
  styles.cursor.blink = flagStr(flags, 'cursor.mode', 'blink') === 'blink';
  ta.setStyles(styles);

  const width = flagInt(flags, 'width', 0);
  const autoWidth = width < 1;
  ta.setWidth(Math.max(0, width - left - right));
  ta.setHeight(Math.max(0, flagInt(flags, 'height', 5) - top - bottom));
  ta.setValue(value);

  // Enter submits; ctrl+j inserts a newline, as upstream.
  ta.keyMap.insertNewline = newBinding(withKeys('ctrl+j'), withHelp('ctrl+j', 'insert newline'));

  const header = flagStr(flags, 'header', '');
  const headerStyle = toLipgloss(extractStyleOptions(flags, 'header', { foreground: '240' }));
  const showHelp = flagBool(flags, 'show-help', true);
  const help = newHelp();
  const helpKeys = [ta.keyMap.insertNewline, newBinding(withKeys('enter'), withHelp('enter', 'submit'))];

  const model: WriteModel = {
    textarea: ta,
    aborted: false,
    quitting: false,
    submitted: false,
    init() {
      return null;
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof WindowSizeMsg && autoWidth) {
        this.textarea.setWidth(msg.width - right - left);
      }
      if (msg instanceof KeyPressMsg) {
        // Terminals send Ctrl+C with no text, so match the key, not msg.text.
        if (msg.toString() === 'ctrl+c') {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }
        if (msg.code === KeyCode.Escape) {
          this.quitting = true;
          return [this, () => Quit()];
        }
        if (msg.code === KeyCode.Enter && !(msg.mod & KeyMod.Ctrl)) {
          this.quitting = true;
          this.submitted = true;
          return [this, () => Quit()];
        }
      }
      const [updated, cmd] = this.textarea.update(msg);
      this.textarea = updated;
      return [this, cmd];
    },
    view(): string {
      if (this.quitting) return '';
      const parts: string[] = [];
      if (header) parts.push(headerStyle.render(header));
      parts.push(this.textarea.view());
      if (showHelp) parts.push('', help.shortHelpView(helpKeys));
      return newStyle().padding(top, right, bottom, left).render(joinVertical(Left, ...parts));
    },
  };

  const { model: final, timedOut } = await runProgram(model, flags);
  if (timedOut) exitTimedOut();
  if (final.aborted) process.exit(STATUS_ABORTED);
  if (!final.submitted) {
    console.error('not submitted');
    process.exit(1);
  }
  process.stdout.write(final.textarea.value() + '\n');
}
