/**
 * gum write — Multi-line text editor.
 * Port of charmbracelet/gum/write
 */

import { Program, WithOutput, KeyPressMsg, KeyCode, KeyMod, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newTextarea } from '@oakoliver/bubbles';
import type { TextareaModel } from '@oakoliver/bubbles';
import { newStyle } from '@oakoliver/lipgloss';
import { flagStr, flagInt, flagBool, flagWithEnv } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { extractStyleOptions, toLipgloss } from '../style.js';
import { STATUS_ABORTED } from '../internal/exit.js';

interface WriteModel extends Model {
  textarea: TextareaModel;
  aborted: boolean;
  quitting: boolean;
  header: string;
  headerStyle: ReturnType<typeof newStyle>;
  autoWidth: boolean;
  autoHeight: boolean;
  width: number;
}

function createModel(parsed: ParsedArgs): WriteModel {
  const flags = parsed.flags;

  const ta = newTextarea();
  ta.placeholder = flagWithEnv(flags, 'placeholder', 'GUM_WRITE_PLACEHOLDER', 'Write something...');
  ta.prompt = flagStr(flags, 'prompt', '┃ ');

  const value = flagStr(flags, 'value', '');
  if (value) ta.setValue(value);

  const charLimit = flagInt(flags, 'char-limit', 400);
  ta.charLimit = charLimit > 0 ? charLimit : 0;

  const showLineNumbers = flagBool(flags, 'show-line-numbers', false);
  ta.showLineNumbers = showLineNumbers;

  const widthFlag = flagInt(flags, 'width', 0);
  const heightFlag = flagInt(flags, 'height', 10);
  const autoWidth = widthFlag === 0;
  const autoHeight = heightFlag === 0;

  if (!autoWidth) {
    ta.setWidth(widthFlag);
  }
  if (!autoHeight) {
    ta.setHeight(heightFlag);
  }

  const header = flagStr(flags, 'header', '');
  const headerStyle = toLipgloss(extractStyleOptions(flags, 'header'));

  // Apply cursor style
  const cursorFg = flagStr(flags, 'cursor.foreground', '');
  if (cursorFg) {
    const styles = ta.getStyles();
    styles.cursor.color = cursorFg;
    ta.setStyles(styles);
  }

  // Apply base style
  const baseStyleOpts = extractStyleOptions(flags, 'base');
  if (Object.values(baseStyleOpts).some(v => v !== undefined && v !== false && v !== '')) {
    const styles = ta.getStyles();
    const baseStyle = toLipgloss(baseStyleOpts);
    styles.focused.base = baseStyle;
    ta.setStyles(styles);
  }

  ta.focus();

  return {
    textarea: ta,
    aborted: false,
    quitting: false,
    header,
    headerStyle,
    autoWidth,
    autoHeight,
    width: widthFlag || 80,
    init() {
      return null;
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof WindowSizeMsg) {
        this.width = msg.width;
        if (this.autoWidth) {
          this.textarea.setWidth(msg.width);
        }
        if (this.autoHeight) {
          this.textarea.setHeight(msg.height - 2);
        }
        return [this, null];
      }

      if (msg instanceof KeyPressMsg) {
        // ctrl+c — abort
        if (msg.mod & KeyMod.Ctrl && msg.text === 'c') {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }

        // esc — quit
        if (msg.code === KeyCode.Escape) {
          this.quitting = true;
          return [this, () => Quit()];
        }

        // ctrl+d — submit (submit on ctrl+d for multi-line, since enter is newline)
        if (msg.mod & KeyMod.Ctrl && msg.text === 'd') {
          this.quitting = true;
          return [this, () => Quit()];
        }
      }

      const [updatedTa, cmd] = this.textarea.update(msg);
      this.textarea = updatedTa;
      return [this, cmd];
    },
    view(): string {
      if (this.quitting) return '';

      let out = '';
      if (this.header) {
        out += this.headerStyle.render(this.header) + '\n';
      }
      out += this.textarea.view();
      return out;
    },
  };
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const model = createModel(parsed);
  const p = new Program(model, WithOutput(process.stderr));
  const final = await p.run() as WriteModel;

  if (final.aborted) {
    process.exit(STATUS_ABORTED);
  }

  process.stdout.write(final.textarea.value() + '\n');
}
