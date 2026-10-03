/**
 * gum table — Render tabular CSV data with optional row selection.
 * Port of charmbracelet/gum/table
 */

import { KeyPressMsg, KeyCode, KeyMod, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import {
  newTable, withColumns, withRows,
  withTableFocused, withTableHeight, withTableStyles,
  tableDefaultStyles,
} from '@oakoliver/bubbles';
import type { TableModel, TableStyles } from '@oakoliver/bubbles';
import { newStyle, stringWidth } from '@oakoliver/lipgloss';
import type { Border, Style } from '@oakoliver/lipgloss';
import { borderMap } from '../internal/decode.js';
import { flagStr, flagInt, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { runProgram, exitTimedOut } from '../internal/program.js';
import { extractStyleOptions, toLipgloss } from '../style.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';
import { println } from '../internal/tty.js';
import { STATUS_ABORTED } from '../internal/exit.js';
import * as fs from 'node:fs';

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180)
// ---------------------------------------------------------------------------

function parseCSV(input: string, separator: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const row: string[] = [];
    while (i < len) {
      if (input[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        let field = '';
        while (i < len) {
          if (input[i] === '"') {
            if (i + 1 < len && input[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += input[i];
            i++;
          }
        }
        row.push(field);
      } else {
        // Unquoted field
        let field = '';
        while (i < len && input[i] !== separator && input[i] !== '\n' && input[i] !== '\r') {
          field += input[i];
          i++;
        }
        row.push(field);
      }

      if (i < len && input[i] === separator) {
        i++; // consume separator
      } else {
        break; // end of row
      }
    }

    // Consume line ending
    if (i < len && input[i] === '\r') i++;
    if (i < len && input[i] === '\n') i++;

    // Skip trailing empty row
    if (row.length === 1 && row[0] === '' && i >= len) break;

    rows.push(row);
  }

  return rows;
}

function writeCSV(row: string[], separator: string): string {
  return row.map(field => {
    if (field.includes(separator) || field.includes('"') || field.includes('\n')) {
      return '"' + field.replace(/"/g, '""') + '"';
    }
    return field;
  }).join(separator);
}

// ---------------------------------------------------------------------------
// Static rendering (--print), as lipgloss/table renders it upstream
// ---------------------------------------------------------------------------

export function renderTable(
  headers: string[],
  rows: string[][],
  border: Border,
  borderStyle: Style,
  headerStyle: Style,
  cellStyle: Style,
): string {
  const hasBorder = border.left !== '' || border.top !== '';
  const header = headers.map((h) => headerStyle.render(h));
  const body = rows.map((row) => headers.map((_, i) => cellStyle.render(row[i] ?? '')));
  const widths = headers.map((_, i) => Math.max(...[header, ...body].map((cells) => stringWidth(cells[i]))));

  const b = (s: string) => (s === '' ? '' : borderStyle.render(s));
  const line = (left: string, fill: string, sep: string, right: string) =>
    b(left) + widths.map((w) => b(fill.repeat(w))).join(b(sep)) + b(right);
  const cells = (row: string[]) =>
    b(border.left) + row.map((cell, i) => cell + ' '.repeat(widths[i] - stringWidth(cell))).join(b(border.left)) + b(border.right);

  const out: string[] = [];
  if (hasBorder && border.top) out.push(line(border.topLeft, border.top, border.middleTop, border.topRight));
  out.push(cells(header));
  if (hasBorder && border.top) out.push(line(border.middleLeft, border.top, border.middle, border.middleRight));
  out.push(...body.map(cells));
  if (hasBorder && border.bottom) out.push(line(border.bottomLeft, border.bottom, border.middleBottom, border.bottomRight));
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Interactive model
// ---------------------------------------------------------------------------

interface TableInteractiveModel extends Model {
  table: TableModel;
  aborted: boolean;
  quitting: boolean;
  showHelp: boolean;
}

function createModel(table: TableModel, showHelp: boolean, hideCount: boolean): TableInteractiveModel {
  return {
    table,
    aborted: false,
    quitting: false,
    showHelp,
    init() {
      this.table.focus();
      return null;
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof WindowSizeMsg) {
        this.table.setWidth(msg.width);
        this.table.setHeight(msg.height - 2);
        this.table.updateViewport();
        return [this, null];
      }

      if (msg instanceof KeyPressMsg) {
        if (msg.mod & KeyMod.Ctrl && msg.text === 'c') {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }

        if (msg.code === KeyCode.Escape || msg.text === 'q' ||
            (msg.mod & KeyMod.Ctrl && msg.text === 'q')) {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }

        if (msg.code === KeyCode.Enter) {
          this.quitting = true;
          return [this, () => Quit()];
        }
      }

      const [updated, cmd] = this.table.update(msg);
      this.table = updated;
      return [this, cmd];
    },
    view(): string {
      if (this.quitting) return '';

      let out = this.table.view();
      const total = this.table.rows().length;
      const current = this.table.cursor() + 1;
      const counter = hideCount ? '' : `  ${current}/${total}`;

      if (this.showHelp) {
        out += '\n' + newStyle().faint(true).render(
          '\u2191/\u2193: navigate \u2022 enter: select \u2022 q/esc: quit',
        ) + counter;
      } else {
        out += '\n' + counter;
      }

      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;

  const separator = flagStr(flags, 'separator', ',');
  const colFlag = flagStr(flags, 'columns', '');
  const widthsFlag = flagStr(flags, 'widths', '');
  const height = flagInt(flags, 'height', 0);
  const printMode = flagBool(flags, 'print', false);
  const filePath = flagStr(flags, 'file', '');
  const showHelp = flagBool(flags, 'show-help', true);
  const returnColumn = flagInt(flags, 'return-column', 0);

  // Read input
  let input = '';
  if (filePath) {
    input = fs.readFileSync(filePath, 'utf-8');
  } else if (!isStdinEmpty()) {
    input = readStdin();
  } else {
    console.error('Error: no input provided (pipe data or use --file)');
    process.exit(1);
  }

  if ([...separator].length !== 1) {
    console.error('separator must be single character');
    process.exit(1);
  }

  // Parse CSV
  const allRows = parseCSV(input, separator);
  if (allRows.length === 0) {
    console.error('Error: no data');
    process.exit(1);
  }

  // Determine column names and data
  let headers: string[];
  let dataRows: string[][];

  if (colFlag) {
    headers = colFlag.split(',');
    dataRows = allRows;
  } else {
    headers = allRows[0];
    dataRows = allRows.slice(1);
  }

  // Determine column widths
  const explicitWidths = widthsFlag
    ? widthsFlag.split(',').map(w => parseInt(w, 10))
    : [];

  const columns = headers.map((title, i) => {
    if (explicitWidths[i] && explicitWidths[i] > 0) {
      return { title, width: explicitWidths[i] };
    }
    let maxW = stringWidth(title);
    for (const row of dataRows) {
      if (row[i] !== undefined) {
        maxW = Math.max(maxW, stringWidth(row[i]));
      }
    }
    return { title, width: maxW + 2 };
  });

  for (const row of dataRows) {
    if (row.length > headers.length) {
      console.error('invalid number of columns');
      process.exit(1);
    }
    while (row.length < headers.length) row.push('');
  }

  // Build styles: the defaults inherit the user's flags, as upstream
  const baseStyles = tableDefaultStyles();
  const cellStyle = baseStyles.cell.inherit(toLipgloss(extractStyleOptions(flags, 'cell')));
  const headerStyle = baseStyles.header.inherit(toLipgloss(extractStyleOptions(flags, 'header')));

  // Print mode — static bordered table, no interaction
  if (printMode) {
    const border = borderMap[flagStr(flags, 'border', 'rounded')] ?? borderMap.rounded;
    const borderStyle = toLipgloss(extractStyleOptions(flags, 'border'));
    println(renderTable(headers, dataRows, border, borderStyle, headerStyle, cellStyle));
    return;
  }

  const styles: TableStyles = {
    cell: cellStyle,
    header: headerStyle,
    selected: toLipgloss(extractStyleOptions(flags, 'selected', { foreground: '212' })),
  };

  // Create table
  const tableHeight = height > 0 ? height : Math.min(dataRows.length, 20);
  const table = newTable(
    withColumns(columns),
    withRows(dataRows),
    withTableFocused(true),
    withTableStyles(styles),
    withTableHeight(tableHeight),
  );

  // Interactive mode
  const model = createModel(table, showHelp, flagBool(flags, 'hide-count', false));
  const { model: final, timedOut } = await runProgram(model, parsed.flags);
  if (timedOut) exitTimedOut();

  if (final.aborted) {
    process.exit(STATUS_ABORTED);
  }

  // Output selected row
  const selected = final.table.selectedRow();
  if (!selected || selected.length === 0) return;

  if (returnColumn > 0 && returnColumn <= selected.length) {
    println(selected[returnColumn - 1]);
  } else {
    println(writeCSV(selected, separator));
  }
}
