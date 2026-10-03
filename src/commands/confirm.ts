/**
 * gum confirm — Ask user to confirm an action.
 * Port of charmbracelet/gum/confirm (v0.17.0)
 */

import { KeyPressMsg, Quit } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newHelp, newBinding, withKeys, withHelp, matches } from '@oakoliver/bubbles';
import type { Binding } from '@oakoliver/bubbles';
import { newStyle, joinHorizontal, joinVertical, Left } from '@oakoliver/lipgloss';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { runProgram } from '../internal/program.js';
import { extractStyleOptions, toLipgloss, parsePadding } from '../style.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';
import { STATUS_ABORTED } from '../internal/exit.js';

interface ConfirmModel extends Model {
  confirmation: boolean;
  quitting: boolean;
  aborted: boolean;
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;

  // Piped answer: "yes"/"y" confirms, anything else declines, no UI.
  if (!isStdinEmpty()) {
    const line = readStdin({ singleLine: true });
    process.exit(line === 'yes' || line === 'y' ? 0 : 1);
  }

  const prompt = parsed.args.length > 0 ? parsed.args.join(' ') : 'Are you sure?';
  const affirmative = flagStr(flags, 'affirmative', 'Yes');
  const negative = flagStr(flags, 'negative', 'No');
  const showHelp = flagBool(flags, 'show-help', true);
  const [top, right, bottom, left] = parsePadding(flagStr(flags, 'padding', '0 0'));

  const promptStyle = toLipgloss(extractStyleOptions(flags, 'prompt', { margin: '0 0 0 1', foreground: '#7571F9', bold: true }));
  const selectedStyle = toLipgloss(extractStyleOptions(flags, 'selected', { background: '212', foreground: '230', padding: '0 3', margin: '0 1' }));
  const unselectedStyle = toLipgloss(extractStyleOptions(flags, 'unselected', { background: '235', foreground: '254', padding: '0 3', margin: '0 1' }));

  const keys: Record<string, Binding> = {
    abort: newBinding(withKeys('ctrl+c'), withHelp('ctrl+c', 'cancel')),
    quit: newBinding(withKeys('esc'), withHelp('esc', 'quit')),
    negative: newBinding(withKeys('n', 'N', 'q'), withHelp('n', negative)),
    affirmative: newBinding(withKeys('y', 'Y'), withHelp('y', affirmative)),
    toggle: newBinding(withKeys('left', 'h', 'ctrl+n', 'shift+tab', 'right', 'l', 'ctrl+p', 'tab'), withHelp('←→', 'toggle')),
    submit: newBinding(withKeys('enter'), withHelp('enter', 'submit')),
  };
  const help = newHelp();

  const model: ConfirmModel = {
    confirmation: flagBool(flags, 'default', true),
    quitting: false,
    aborted: false,
    init() {
      return null;
    },
    update(msg: Msg): [Model, Cmd] {
      if (!(msg instanceof KeyPressMsg)) return [this, null];
      if (matches(msg, keys.abort)) {
        this.confirmation = false;
        this.aborted = true;
        return [this, () => Quit()];
      }
      if (matches(msg, keys.quit) || matches(msg, keys.negative)) {
        this.confirmation = false;
        this.quitting = true;
        return [this, () => Quit()];
      }
      if (matches(msg, keys.toggle)) {
        if (negative !== '') this.confirmation = !this.confirmation;
        return [this, null];
      }
      if (matches(msg, keys.submit)) {
        this.quitting = true;
        return [this, () => Quit()];
      }
      if (matches(msg, keys.affirmative)) {
        this.confirmation = true;
        this.quitting = true;
        return [this, () => Quit()];
      }
      return [this, null];
    },
    view(): string {
      if (this.quitting || this.aborted) return '';
      const aff = (this.confirmation ? selectedStyle : unselectedStyle).render(affirmative);
      // An intentionally empty negative option is not shown.
      const neg = negative === '' ? '' : (this.confirmation ? unselectedStyle : selectedStyle).render(negative);
      const parts = [promptStyle.render(prompt) + '\n', joinHorizontal(Left, aff, neg)];
      if (showHelp) {
        parts.push('', help.shortHelpView([keys.toggle, keys.submit, keys.affirmative, keys.negative]));
      }
      return newStyle().padding(top, right, bottom, left).render(joinVertical(Left, ...parts));
    },
  };

  // On timeout the current (default) choice stands, as upstream.
  const { model: final } = await runProgram(model, flags);
  if (final.aborted) process.exit(STATUS_ABORTED);

  if (flagBool(flags, 'show-output', false)) {
    console.log(prompt, final.confirmation ? affirmative : negative);
  }
  process.exit(final.confirmation ? 0 : 1);
}
