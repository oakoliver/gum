/**
 * gum input — Single-line text input.
 * Port of charmbracelet/gum/input
 */

import { Program, WithOutput, KeyPressMsg, KeyCode, KeyMod, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newTextInput, EchoMode } from '@oakoliver/bubbles';
import type { TextInputModel } from '@oakoliver/bubbles';
import { newStyle } from '@oakoliver/lipgloss';
import { flagStr, flagInt, flagBool, flagWithEnv } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { extractStyleOptions, toLipgloss } from '../style.js';
import { STATUS_ABORTED } from '../internal/exit.js';

interface InputModel extends Model {
  textInput: TextInputModel;
  aborted: boolean;
  quitting: boolean;
  header: string;
  headerStyle: ReturnType<typeof newStyle>;
  autoWidth: boolean;
  width: number;
}

function createModel(parsed: ParsedArgs): InputModel {
  const flags = parsed.flags;

  const ti = newTextInput();
  ti.placeholder = flagWithEnv(flags, 'placeholder', 'GUM_INPUT_PLACEHOLDER', 'Type something...');
  ti.prompt = flagWithEnv(flags, 'prompt', 'GUM_INPUT_PROMPT', '> ');

  const value = flagStr(flags, 'value', '');
  if (value) ti.setValue(value);

  const charLimit = flagInt(flags, 'char-limit', 400);
  ti.charLimit = charLimit;

  const echoModeStr = flagStr(flags, 'echo-mode', 'normal');
  switch (echoModeStr) {
    case 'password': ti.echoMode = EchoMode.EchoPassword; break;
    case 'none': ti.echoMode = EchoMode.EchoNone; break;
    default: ti.echoMode = EchoMode.EchoNormal; break;
  }

  const password = flagBool(flags, 'password', false);
  if (password) ti.echoMode = EchoMode.EchoPassword;

  const widthFlag = flagInt(flags, 'width', 0);
  const autoWidth = widthFlag === 0;

  if (!autoWidth) {
    ti.setWidth(widthFlag);
  }

  const header = flagStr(flags, 'header', '');
  const headerStyle = toLipgloss(extractStyleOptions(flags, 'header'));

  // Apply prompt style
  const promptStyleOpts = extractStyleOptions(flags, 'prompt');
  const promptStyle = toLipgloss(promptStyleOpts);
  const styles = ti.styles();
  styles.focused.prompt = promptStyle;
  ti.setStyles(styles);

  // Apply cursor style
  const cursorStyleOpts = extractStyleOptions(flags, 'cursor');
  const cursorStyle = toLipgloss(cursorStyleOpts);
  const curStyles = ti.styles();
  // Apply foreground color to cursor if available
  const cursorFg = flagStr(flags, 'cursor.foreground', '');
  if (cursorFg) {
    curStyles.cursor.color = cursorFg;
  }
  ti.setStyles(curStyles);

  ti.focus();

  return {
    textInput: ti,
    aborted: false,
    quitting: false,
    header,
    headerStyle,
    autoWidth,
    width: widthFlag || 80,
    init() {
      return null;
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof WindowSizeMsg) {
        this.width = msg.width;
        if (this.autoWidth) {
          this.textInput.setWidth(msg.width - 1);
        }
        return [this, null];
      }

      if (msg instanceof KeyPressMsg) {
        // ctrl+c — abort
        if (msg.code === KeyCode.Escape || (msg.mod & KeyMod.Ctrl && msg.text === 'c')) {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }

        // esc — quit without submitting
        if (msg.code === KeyCode.Escape) {
          this.quitting = true;
          return [this, () => Quit()];
        }

        // enter — submit
        if (msg.code === KeyCode.Enter) {
          this.quitting = true;
          return [this, () => Quit()];
        }
      }

      const [updatedTi, cmd] = this.textInput.update(msg);
      this.textInput = updatedTi;
      return [this, cmd];
    },
    view(): string {
      if (this.quitting) return '';

      let out = '';
      if (this.header) {
        out += this.headerStyle.render(this.header) + '\n';
      }
      out += this.textInput.view();
      return out;
    },
  };
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const model = createModel(parsed);
  const p = new Program(model, WithOutput(process.stderr));
  const final = await p.run() as InputModel;

  if (final.aborted) {
    process.exit(STATUS_ABORTED);
  }

  process.stdout.write(final.textInput.value() + '\n');
}
