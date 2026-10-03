/**
 * gum confirm — Ask user to confirm an action.
 * Port of charmbracelet/gum/confirm
 */

import { Program, KeyPressMsg, KeyCode, KeyMod, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newStyle } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { interactiveOptions } from '../internal/tty.js';
import { extractStyleOptions, toLipgloss } from '../style.js';
import { STATUS_ABORTED } from '../internal/exit.js';
import { parseDuration, createTimeout } from '../internal/timeout.js';

interface ConfirmModel extends Model {
  affirmative: string;
  negative: string;
  confirmation: boolean;
  defaultValue: boolean;
  quitting: boolean;
  aborted: boolean;
  hasTimeout: boolean;
  prompt: string;
  selectedStyle: Style;
  unselectedStyle: Style;
  promptStyle: Style;
}

function createModel(parsed: ParsedArgs): ConfirmModel {
  const flags = parsed.flags;

  const prompt = parsed.args.length > 0 ? parsed.args.join(' ') : flagStr(flags, 'prompt', 'Are you sure?');
  const affirmative = flagStr(flags, 'affirmative', 'Yes');
  const negative = flagStr(flags, 'negative', 'No');
  const defaultValue = flagBool(flags, 'default', true);

  const selectedStyle = toLipgloss(extractStyleOptions(flags, 'selected'));
  const unselectedStyle = toLipgloss(extractStyleOptions(flags, 'unselected'));
  const promptStyle = toLipgloss(extractStyleOptions(flags, 'prompt'));

  return {
    affirmative,
    negative,
    confirmation: defaultValue,
    defaultValue,
    quitting: false,
    aborted: false,
    hasTimeout: false,
    prompt,
    selectedStyle: selectedStyle.padding(0, 3),
    unselectedStyle: unselectedStyle.padding(0, 3),
    promptStyle,
    init() {
      return null;
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof KeyPressMsg) {
        // ctrl+c — abort
        if (msg.mod & KeyMod.Ctrl && msg.text === 'c') {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }

        // esc — quit
        if (msg.code === KeyCode.Escape) {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }

        // enter — submit
        if (msg.code === KeyCode.Enter) {
          this.quitting = true;
          return [this, () => Quit()];
        }

        // left/right, h/l, tab — toggle
        if (msg.code === KeyCode.Left || msg.code === KeyCode.Right ||
            msg.text === 'h' || msg.text === 'l' ||
            msg.code === KeyCode.Tab) {
          this.confirmation = !this.confirmation;
          return [this, null];
        }

        // y/Y — yes
        if (msg.text === 'y' || msg.text === 'Y') {
          this.confirmation = true;
          this.quitting = true;
          return [this, () => Quit()];
        }

        // n/N — no
        if (msg.text === 'n' || msg.text === 'N') {
          this.confirmation = false;
          this.quitting = true;
          return [this, () => Quit()];
        }
      }

      return [this, null];
    },
    view(): string {
      if (this.quitting) return '';

      let out = '';
      out += this.promptStyle.render(this.prompt) + '\n\n';

      if (this.confirmation) {
        out += this.selectedStyle.render(this.affirmative) + ' ';
        out += this.unselectedStyle.render(this.negative);
      } else {
        out += this.unselectedStyle.render(this.affirmative) + ' ';
        out += this.selectedStyle.render(this.negative);
      }

      return out;
    },
  };
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const model = createModel(parsed);

  const timeoutStr = flagStr(parsed.flags, 'timeout', '0');
  const timeoutMs = parseDuration(timeoutStr);

  const p = new Program(model, ...interactiveOptions());
  const final = await p.run() as ConfirmModel;

  if (final.aborted) {
    process.exit(STATUS_ABORTED);
  }

  // Exit code: 0 for yes, 1 for no (matches Go behavior)
  process.exit(final.confirmation ? 0 : 1);
}
