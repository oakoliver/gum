/**
 * gum choose — Choose option(s) from a list.
 * Port of charmbracelet/gum/choose (v0.17.0)
 */

import { KeyPressMsg, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newPaginator, PaginatorType, newHelp, newBinding, withKeys, withHelp, withDisabled, matches } from '@oakoliver/bubbles';
import type { PaginatorModel, HelpModel, Binding } from '@oakoliver/bubbles';
import { newStyle, joinVertical, stringWidth, Left } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { flagStr, flagInt, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { runProgram, exitTimedOut } from '../internal/program.js';
import { extractStyleOptions, toLipgloss, parsePadding } from '../style.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';
import { println } from '../internal/tty.js';
import { STATUS_ABORTED } from '../internal/exit.js';

interface Item {
  text: string;
  selected: boolean;
  order: number;
}

interface Keymap {
  down: Binding;
  up: Binding;
  right: Binding;
  left: Binding;
  home: Binding;
  end: Binding;
  toggleAll: Binding;
  toggle: Binding;
  abort: Binding;
  quit: Binding;
  submit: Binding;
  navigate: Binding;
}

function defaultKeymap(): Keymap {
  return {
    down: newBinding(withKeys('down', 'j', 'ctrl+j', 'ctrl+n')),
    up: newBinding(withKeys('up', 'k', 'ctrl+k', 'ctrl+p')),
    right: newBinding(withKeys('right', 'l', 'ctrl+f')),
    left: newBinding(withKeys('left', 'h', 'ctrl+b')),
    home: newBinding(withKeys('g', 'home')),
    end: newBinding(withKeys('G', 'end')),
    toggleAll: newBinding(withKeys('a', 'A', 'ctrl+a'), withHelp('ctrl+a', 'select all'), withDisabled()),
    toggle: newBinding(withKeys('space', ' ', 'tab', 'x', 'ctrl+@'), withHelp('x', 'toggle'), withDisabled()),
    abort: newBinding(withKeys('ctrl+c'), withHelp('ctrl+c', 'abort')),
    quit: newBinding(withKeys('esc'), withHelp('esc', 'quit')),
    submit: newBinding(withKeys('enter', 'ctrl+q'), withHelp('enter', 'submit')),
    navigate: newBinding(withKeys('up', 'down', 'right', 'left'), withHelp('←↓↑→', 'navigate')),
  };
}

interface ChooseModel extends Model {
  items: Item[];
  index: number;
  currentOrder: number;
  height: number;
  limit: number;
  numSelected: number;
  paginator: PaginatorModel;
  quitting: boolean;
  submitted: boolean;
  aborted: boolean;
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;
  const subdued = newStyle().foreground('#979797');
  const verySubdued = newStyle().foreground('#3C3C3C');

  const inputDelimiter = flagStr(flags, 'input-delimiter', '\n');
  const outputDelimiter = flagStr(flags, 'output-delimiter', '\n');
  const labelDelimiter = flagStr(flags, 'label-delimiter', '');
  let limit = flagInt(flags, 'limit', 1);
  const noLimit = flagBool(flags, 'no-limit', false);
  const height = flagInt(flags, 'height', 10);
  const ordered = flagBool(flags, 'ordered', false);
  let selectedPrefix = flagStr(flags, 'selected-prefix', '✓ ');
  let unselectedPrefix = flagStr(flags, 'unselected-prefix', '• ');
  let cursorPrefix = flagStr(flags, 'cursor-prefix', '• ');
  const cursor = flagStr(flags, 'cursor', '> ');
  const header = flagStr(flags, 'header', 'Choose:');
  const showHelp = flagBool(flags, 'show-help', true);
  const [top, right, bottom, left] = parsePadding(flagStr(flags, 'padding', '0 0'));
  let selected = flagStr(flags, 'selected', '').split(',').filter(Boolean);

  // Options come from arguments or stdin; with arguments, stdin preselects.
  let options = parsed.args;
  const input = isStdinEmpty() ? '' : readStdin({ stripAnsi: flagBool(flags, 'strip-ansi', true) });
  if (options.length > 0 && selected.length === 0 && input) {
    selected = input.split(inputDelimiter);
  } else if (options.length === 0) {
    if (input === '') {
      console.error('no options provided, see `gum choose --help`');
      process.exit(1);
    }
    options = input.split(inputDelimiter);
  }

  // --label-delimiter: "label<delim>value" shows label, prints value
  const values = new Map<string, string>();
  if (labelDelimiter) {
    const labels: string[] = [];
    for (const opt of options) {
      const at = opt.indexOf(labelDelimiter);
      if (at === -1) {
        console.error(`invalid option format: ${JSON.stringify(opt)}`);
        process.exit(1);
      }
      const label = opt.slice(0, at);
      labels.push(label);
      values.set(label, opt.slice(at + labelDelimiter.length));
    }
    options = labels;
  } else {
    for (const opt of options) values.set(opt, opt);
  }

  if (flagBool(flags, 'select-if-one', false) && options.length === 1) {
    println(values.get(options[0]) ?? options[0]);
    return;
  }

  // Picking one option needs no prefixes; the cursor is enough.
  if (limit === 1 && !noLimit) {
    selectedPrefix = '';
    unselectedPrefix = '';
    cursorPrefix = '';
  }
  if (noLimit) limit = options.length + 1;
  if (ordered) options = [...options].sort();

  const selectAll = selected.length === 1 && selected[0] === '*';
  let startingIndex = 0;
  let currentSelected = 0;
  let currentOrder = 0;
  const items: Item[] = options.map((text, i) => {
    let isSelected = selected.length > 0 && currentSelected < limit && (selectAll || selected.includes(text));
    let order = 0;
    if (isSelected) {
      if (limit === 1) {
        // Single choice: start with the cursor on it instead of selecting it.
        startingIndex = i;
        isSelected = false;
      } else {
        currentSelected++;
        order = currentOrder++;
      }
    }
    return { text, selected: isSelected, order };
  });

  const paginator = newPaginator();
  paginator.type = PaginatorType.Dots;
  paginator.perPage = height;
  paginator.totalPages = Math.max(1, Math.ceil(items.length / height));
  paginator.activeDot = subdued.render('•');
  paginator.inactiveDot = verySubdued.render('•');
  paginator.page = Math.floor(startingIndex / height);

  const keymap = defaultKeymap();
  if (noLimit || limit > 1) keymap.toggle.setEnabled(true);
  if (noLimit) keymap.toggleAll.setEnabled(true);

  const cursorStyle = toLipgloss(extractStyleOptions(flags, 'cursor', { foreground: '212' }));
  const headerStyle = toLipgloss(extractStyleOptions(flags, 'header', { foreground: '99' }));
  const itemStyle = toLipgloss(extractStyleOptions(flags, 'item'));
  const selectedItemStyle = toLipgloss(extractStyleOptions(flags, 'selected', { foreground: '212' }));
  const help: HelpModel = newHelp();

  const model: ChooseModel = {
    items,
    index: startingIndex,
    currentOrder,
    height,
    limit,
    numSelected: currentSelected,
    paginator,
    quitting: false,
    submitted: false,
    aborted: false,
    init() {
      return null;
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof WindowSizeMsg || !(msg instanceof KeyPressMsg)) return [this, null];

      const [start, end] = this.paginator.getSliceBounds(this.items.length);
      const n = this.items.length;
      if (matches(msg, keymap.down)) {
        this.index++;
        if (this.index >= n) {
          this.index = 0;
          this.paginator.page = 0;
        }
        if (this.index >= end) this.paginator.nextPage();
      } else if (matches(msg, keymap.up)) {
        this.index--;
        if (this.index < 0) {
          this.index = n - 1;
          this.paginator.page = this.paginator.totalPages - 1;
        }
        if (this.index < start) this.paginator.prevPage();
      } else if (matches(msg, keymap.right)) {
        this.index = Math.min(Math.max(this.index + this.height, 0), n - 1);
        this.paginator.nextPage();
      } else if (matches(msg, keymap.left)) {
        this.index = Math.min(Math.max(this.index - this.height, 0), n - 1);
        this.paginator.prevPage();
      } else if (matches(msg, keymap.end)) {
        this.index = n - 1;
        this.paginator.page = this.paginator.totalPages - 1;
      } else if (matches(msg, keymap.home)) {
        this.index = 0;
        this.paginator.page = 0;
      } else if (matches(msg, keymap.toggleAll)) {
        if (this.limit > 1) {
          const selectAllNow = this.numSelected < n && this.numSelected < this.limit;
          for (const item of this.items) {
            if (selectAllNow && !item.selected && this.numSelected < this.limit) {
              item.selected = true;
              item.order = this.currentOrder++;
              this.numSelected++;
            } else if (!selectAllNow) {
              item.selected = false;
            }
          }
          if (!selectAllNow) this.numSelected = 0;
        }
      } else if (matches(msg, keymap.quit)) {
        this.quitting = true;
        return [this, () => Quit()];
      } else if (matches(msg, keymap.abort)) {
        this.quitting = true;
        this.aborted = true;
        return [this, () => Quit()];
      } else if (matches(msg, keymap.toggle)) {
        if (this.limit > 1) {
          const item = this.items[this.index];
          if (item.selected) {
            item.selected = false;
            this.numSelected--;
          } else if (this.numSelected < this.limit) {
            item.selected = true;
            item.order = this.currentOrder++;
            this.numSelected++;
          }
        }
      } else if (matches(msg, keymap.submit)) {
        this.quitting = true;
        if (this.limit <= 1 && this.numSelected < 1) this.items[this.index].selected = true;
        this.submitted = true;
        return [this, () => Quit()];
      }
      return [this, null];
    },
    view(): string {
      if (this.quitting) return '';

      let s = '';
      const [start, end] = this.paginator.getSliceBounds(this.items.length);
      this.items.slice(start, end).forEach((item, i) => {
        const isCursor = i === this.index % this.height;
        s += isCursor ? cursorStyle.render(cursor) : ' '.repeat(stringWidth(cursor));
        if (item.selected) s += selectedItemStyle.render(selectedPrefix + item.text);
        else if (isCursor) s += cursorStyle.render(cursorPrefix + item.text);
        else s += itemStyle.render(unselectedPrefix + item.text);
        if (i !== this.height) s += '\n';
      });

      if (this.paginator.totalPages > 1) {
        s += '\n'.repeat(this.height - this.paginator.itemsOnPage(this.items.length) + 1);
        s += '  ' + this.paginator.view();
      }

      const parts: string[] = [];
      if (header) parts.push(headerStyle.render(header));
      parts.push(s);
      if (showHelp) {
        parts.push('', help.shortHelpView([keymap.toggle, keymap.navigate, keymap.submit, keymap.toggleAll]));
      }
      return newStyle().padding(top, right, bottom, left).render(joinVertical(Left, ...parts));
    },
  };

  const { model: final, timedOut } = await runProgram(model, flags);
  if (timedOut) exitTimedOut();

  if (final.aborted) process.exit(STATUS_ABORTED);
  if (!final.submitted) {
    console.error('nothing selected');
    process.exit(1);
  }

  let chosen = final.items.filter((item) => item.selected);
  if (ordered && limit > 1) chosen = [...chosen].sort((a, b) => a.order - b.order);
  println(chosen.map((item) => values.get(item.text) ?? item.text).join(outputDelimiter));
}
