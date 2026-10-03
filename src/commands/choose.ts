/**
 * gum choose — Choose option(s) from a list.
 * Port of charmbracelet/gum/choose
 */

import { Program, WithOutput, KeyPressMsg, KeyCode, KeyMod, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newPaginator, PaginatorType } from '@oakoliver/bubbles';
import type { PaginatorModel } from '@oakoliver/bubbles';
import { newStyle, stringWidth } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { flagStr, flagInt, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { extractStyleOptions, toLipgloss } from '../style.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';
import { println } from '../internal/tty.js';
import { STATUS_ABORTED } from '../internal/exit.js';

interface Item {
  text: string;
  selected: boolean;
  order: number;
}

interface ChooseModel extends Model {
  items: Item[];
  cursor: number;
  paginator: PaginatorModel;
  limit: number;
  noLimit: boolean;
  numSelected: number;
  aborted: boolean;
  quitting: boolean;
  header: string;
  cursorPrefix: string;
  selectedPrefix: string;
  unselectedPrefix: string;
  cursorStyle: Style;
  itemStyle: Style;
  selectedItemStyle: Style;
  headerStyle: Style;
  height: number;
  selectIfOne: boolean;
}

function createModel(parsed: ParsedArgs): ChooseModel {
  const flags = parsed.flags;

  // Get items from args or stdin
  let items: string[] = [];
  if (parsed.args.length > 0) {
    items = parsed.args;
  } else if (!isStdinEmpty()) {
    const stdinContent = readStdin();
    items = stdinContent.split('\n').filter(line => line.length > 0);
  }

  if (items.length === 0) {
    console.error('Error: no items provided');
    process.exit(1);
  }

  const limit = flagInt(flags, 'limit', 1);
  const noLimit = flagBool(flags, 'no-limit', false);
  const height = flagInt(flags, 'height', 10);
  const header = flagStr(flags, 'header', '');
  const cursorPrefix = flagStr(flags, 'cursor', '> ');
  const selectedPrefix = flagStr(flags, 'selected.prefix', '[✓] ');
  const unselectedPrefix = flagStr(flags, 'unselected.prefix', '[ ] ');
  const selectIfOne = flagBool(flags, 'select-if-one', false);
  const ordered = flagBool(flags, 'ordered', false);

  // Pre-select items
  const selectedItems = flagStr(flags, 'selected', '').split(',').filter(Boolean);

  const cursorStyle = toLipgloss(extractStyleOptions(flags, 'cursor'));
  const itemStyle = toLipgloss(extractStyleOptions(flags, 'item'));
  const selectedItemStyle = toLipgloss(extractStyleOptions(flags, 'selected'));
  const headerStyle = toLipgloss(extractStyleOptions(flags, 'header'));

  const choiceItems: Item[] = items.map(text => ({
    text,
    selected: selectedItems.includes(text),
    order: 0,
  }));

  const numSelected = choiceItems.filter(i => i.selected).length;

  // Paginator
  const paginator = newPaginator();
  paginator.type = PaginatorType.Dots;
  paginator.perPage = height;
  paginator.setTotalPages(choiceItems.length);

  // Select-if-one: if only one item and flag set, auto-select
  if (selectIfOne && choiceItems.length === 1) {
    choiceItems[0].selected = true;
  }

  const isMulti = noLimit || limit > 1;

  return {
    items: choiceItems,
    cursor: 0,
    paginator,
    limit: noLimit ? 0 : limit,
    noLimit,
    numSelected,
    aborted: false,
    quitting: false,
    header,
    cursorPrefix,
    selectedPrefix: isMulti ? selectedPrefix : cursorPrefix,
    unselectedPrefix: isMulti ? unselectedPrefix : '  ',
    cursorStyle,
    itemStyle,
    selectedItemStyle,
    headerStyle,
    height,
    selectIfOne,
    init() {
      return null;
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof WindowSizeMsg) {
        this.paginator.perPage = msg.height - 1;
        if (this.header) this.paginator.perPage--;
        this.paginator.setTotalPages(this.items.length);
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
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }

        // enter — submit
        if (msg.code === KeyCode.Enter) {
          this.quitting = true;
          // In single-select, if nothing toggled, select cursor item
          if (!this.noLimit && this.limit === 1 && this.numSelected === 0) {
            this.items[this.cursor].selected = true;
          }
          return [this, () => Quit()];
        }

        // down / j / ctrl+n
        if (msg.code === KeyCode.Down || msg.text === 'j' ||
            (msg.mod & KeyMod.Ctrl && msg.text === 'n')) {
          this.cursor = Math.min(this.cursor + 1, this.items.length - 1);
          // Handle pagination
          const [start, end] = this.paginator.getSliceBounds(this.items.length);
          if (this.cursor >= end) this.paginator.nextPage();
          return [this, null];
        }

        // up / k / ctrl+p
        if (msg.code === KeyCode.Up || msg.text === 'k' ||
            (msg.mod & KeyMod.Ctrl && msg.text === 'p')) {
          this.cursor = Math.max(this.cursor - 1, 0);
          const [start] = this.paginator.getSliceBounds(this.items.length);
          if (this.cursor < start) this.paginator.prevPage();
          return [this, null];
        }

        // home / g
        if (msg.code === KeyCode.Home || msg.text === 'g') {
          this.cursor = 0;
          this.paginator.page = 0;
          return [this, null];
        }

        // end / G
        if (msg.code === KeyCode.End || msg.text === 'G') {
          this.cursor = this.items.length - 1;
          this.paginator.page = this.paginator.totalPages - 1;
          return [this, null];
        }

        // right / left — page navigation
        if (msg.code === KeyCode.Right || msg.text === 'l') {
          this.paginator.nextPage();
          const [start] = this.paginator.getSliceBounds(this.items.length);
          this.cursor = start;
          return [this, null];
        }
        if (msg.code === KeyCode.Left || msg.text === 'h') {
          this.paginator.prevPage();
          const [start] = this.paginator.getSliceBounds(this.items.length);
          this.cursor = start;
          return [this, null];
        }

        // space / tab / x — toggle (multi-select)
        if ((this.noLimit || this.limit > 1) &&
            (msg.code === KeyCode.Space || msg.code === KeyCode.Tab || msg.text === 'x')) {
          const item = this.items[this.cursor];
          if (item.selected) {
            item.selected = false;
            this.numSelected--;
          } else if (this.noLimit || this.numSelected < this.limit) {
            item.selected = true;
            this.numSelected++;
            item.order = this.numSelected;
          }
          return [this, null];
        }

        // ctrl+a — toggle all (multi-select)
        if ((this.noLimit || this.limit > 1) && msg.mod & KeyMod.Ctrl && msg.text === 'a') {
          // If all selected, deselect all; otherwise select all
          const allSelected = this.items.every(i => i.selected);
          for (const item of this.items) {
            item.selected = !allSelected;
          }
          this.numSelected = allSelected ? 0 : this.items.length;
          return [this, null];
        }
      }

      return [this, null];
    },
    view(): string {
      if (this.quitting) return '';

      const [start, end] = this.paginator.getSliceBounds(this.items.length);
      const visible = this.items.slice(start, end);

      let out = '';
      if (this.header) {
        out += this.headerStyle.render(this.header) + '\n';
      }

      const isMulti = this.noLimit || this.limit > 1;

      for (let i = 0; i < visible.length; i++) {
        const idx = start + i;
        const item = visible[i];
        const isCursor = idx === this.cursor;

        let prefix: string;
        let style: Style;

        if (isCursor) {
          prefix = isMulti ? (item.selected ? this.selectedPrefix : this.unselectedPrefix) : this.cursorPrefix;
          style = this.cursorStyle;
        } else if (item.selected) {
          prefix = this.selectedPrefix;
          style = this.selectedItemStyle;
        } else {
          prefix = isMulti ? this.unselectedPrefix : '  ';
          style = this.itemStyle;
        }

        out += style.render(prefix + item.text);
        if (i < visible.length - 1) out += '\n';
      }

      if (this.paginator.totalPages > 1) {
        out += '\n' + this.paginator.view();
      }

      return out;
    },
  };
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const model = createModel(parsed);

  // Handle select-if-one
  if (model.selectIfOne && model.items.length === 1) {
    println(model.items[0].text);
    return;
  }

  const p = new Program(model, WithOutput(process.stderr));
  const final = await p.run() as ChooseModel;

  if (final.aborted) {
    process.exit(STATUS_ABORTED);
  }

  // Output selected items
  const selected = final.items.filter(i => i.selected);
  if (selected.length === 0) return;

  for (const item of selected) {
    println(item.text);
  }
}
