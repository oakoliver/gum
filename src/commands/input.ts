/**
 * gum input — Single-line text input.
 * Port of charmbracelet/gum/input (v0.17.0)
 */

import { KeyPressMsg, KeyCode, KeyMod, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newTextInput, EchoMode, newHelp, newBinding, withKeys, withHelp } from '@oakoliver/bubbles';
import type { TextInputModel } from '@oakoliver/bubbles';
import { newStyle, joinVertical, stringWidth, Top } from '@oakoliver/lipgloss';
import { flagStr, flagInt, flagBool, flagWithEnv } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { runProgram, exitTimedOut } from '../internal/program.js';
import { extractStyleOptions, toLipgloss, parsePadding } from '../style.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';
import { STATUS_ABORTED } from '../internal/exit.js';

interface InputModel extends Model {
  textInput: TextInputModel;
  aborted: boolean;
  quitting: boolean;
  submitted: boolean;
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;

  const ti = newTextInput();
  // The initial value comes from --value, else from piped stdin.
  let value = flagStr(flags, 'value', '');
  if (!value && !isStdinEmpty()) value = readStdin({ stripAnsi: flagBool(flags, 'strip-ansi', true) });
  if (value) ti.setValue(value);

  ti.prompt = flagWithEnv(flags, 'prompt', 'GUM_INPUT_PROMPT', '> ');
  ti.placeholder = flagWithEnv(flags, 'placeholder', 'GUM_INPUT_PLACEHOLDER', 'Type something...');
  ti.charLimit = flagInt(flags, 'char-limit', 400);
  if (flagBool(flags, 'password', false)) {
    ti.echoMode = EchoMode.EchoPassword;
    ti.echoCharacter = '•';
  }

  const width = flagInt(flags, 'width', 0);
  const autoWidth = width < 1;
  if (!autoWidth) ti.setWidth(width);

  const styles = ti.styles();
  styles.focused.prompt = toLipgloss(extractStyleOptions(flags, 'prompt'));
  styles.focused.placeholder = toLipgloss(extractStyleOptions(flags, 'placeholder', { foreground: '240' }));
  styles.cursor.color = extractStyleOptions(flags, 'cursor', { foreground: '212' }).foreground ?? null;
  const cursorMode = flagStr(flags, 'cursor.mode', 'blink');
  styles.cursor.blink = cursorMode === 'blink';
  ti.setStyles(styles);
  ti.focus();

  const header = flagStr(flags, 'header', '');
  const headerStyle = toLipgloss(extractStyleOptions(flags, 'header', { foreground: '240' }));
  const showHelp = flagBool(flags, 'show-help', true);
  const padding = parsePadding(flagStr(flags, 'padding', '0 0'));
  const help = newHelp();
  const submitKey = newBinding(withKeys('enter'), withHelp('enter', 'submit'));

  const model: InputModel = {
    textInput: ti,
    aborted: false,
    quitting: false,
    submitted: false,
    init() {
      return null;
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof WindowSizeMsg && autoWidth) {
        this.textInput.setWidth(msg.width - 1 - stringWidth(this.textInput.prompt) - padding[1] - padding[3]);
      }
      if (msg instanceof KeyPressMsg) {
        if (msg.mod & KeyMod.Ctrl && msg.text === 'c') {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }
        if (msg.code === KeyCode.Escape) {
          this.quitting = true;
          return [this, () => Quit()];
        }
        if (msg.code === KeyCode.Enter) {
          this.quitting = true;
          this.submitted = true;
          return [this, () => Quit()];
        }
      }
      const [updated, cmd] = this.textInput.update(msg);
      this.textInput = updated;
      return [this, cmd];
    },
    view(): string {
      if (this.quitting) return '';
      const parts: string[] = [];
      if (header) parts.push(headerStyle.render(header));
      parts.push(this.textInput.view());
      if (showHelp) parts.push('', help.shortHelpView([submitKey]));
      return newStyle().padding(...padding).render(joinVertical(Top, ...parts));
    },
  };

  const { model: final, timedOut } = await runProgram(model, flags);
  if (timedOut) exitTimedOut();
  if (final.aborted) process.exit(STATUS_ABORTED);
  if (!final.submitted) {
    console.error('not submitted');
    process.exit(1);
  }
  process.stdout.write(final.textInput.value() + '\n');
}
