/**
 * gum file — Pick a file from a folder tree.
 * Port of charmbracelet/gum/file
 */

import { Program, KeyPressMsg, KeyCode, KeyMod, Quit, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newFilePicker } from '@oakoliver/bubbles';
import type { FilePickerModel } from '@oakoliver/bubbles';
import { newStyle, joinVertical, Left } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { flagStr, flagInt, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { interactiveOptions } from '../internal/tty.js';
import { extractStyleOptions, toLipgloss, parsePadding } from '../style.js';
import { STATUS_ABORTED } from '../internal/exit.js';
import { resolve } from 'node:path';

interface FileModel extends Model {
  filepicker: FilePickerModel;
  header: string;
  headerStyle: Style;
  selectedPath: string;
  quitting: boolean;
  showHelp: boolean;
  padding: [number, number, number, number];
}

function helpView(): string {
  return '  ↓↑ navigate • esc close • enter select';
}

function createModel(parsed: ParsedArgs): FileModel {
  const flags = parsed.flags;

  const startPath = resolve(parsed.args[0] ?? flagStr(flags, 'path', '.'));
  const cursor = flagStr(flags, 'cursor', '>');
  const showHidden = flagBool(flags, 'all', false);
  const showPermissions = flagBool(flags, 'permissions', true);
  const showSize = flagBool(flags, 'size', true);
  const fileAllowed = flagBool(flags, 'file', true);
  const dirAllowed = flagBool(flags, 'directory', false);
  const showHelp = flagBool(flags, 'show-help', true);
  const header = flagStr(flags, 'header', '');
  const height = flagInt(flags, 'height', 10);
  const paddingStr = flagStr(flags, 'padding', '0 0');
  const padding = parsePadding(paddingStr);

  if (!fileAllowed && !dirAllowed) {
    console.error('Error: at least one of --file or --directory must be enabled');
    process.exit(1);
  }

  const fp = newFilePicker();
  fp.currentDirectory = startPath;
  fp.cursor = cursor;
  fp.showHidden = showHidden;
  fp.showPermissions = showPermissions;
  fp.showSize = showSize;
  fp.fileAllowed = fileAllowed;
  fp.dirAllowed = dirAllowed;

  if (height > 0) {
    fp.autoHeight = false;
    fp.setHeight(height);
  } else {
    fp.autoHeight = true;
  }

  // Apply styles from flags
  const cursorOpts = extractStyleOptions(flags, 'cursor');
  if (!cursorOpts.foreground) cursorOpts.foreground = '212';
  fp.styles.cursor = toLipgloss(cursorOpts);

  const symlinkOpts = extractStyleOptions(flags, 'symlink');
  if (!symlinkOpts.foreground) symlinkOpts.foreground = '36';
  fp.styles.symlink = toLipgloss(symlinkOpts);

  const directoryOpts = extractStyleOptions(flags, 'directory');
  if (!directoryOpts.foreground) directoryOpts.foreground = '99';
  fp.styles.directory = toLipgloss(directoryOpts);

  const fileOpts = extractStyleOptions(flags, 'file');
  fp.styles.file = toLipgloss(fileOpts);

  const permOpts = extractStyleOptions(flags, 'permissions');
  if (!permOpts.foreground) permOpts.foreground = '244';
  fp.styles.permission = toLipgloss(permOpts);

  const selectedOpts = extractStyleOptions(flags, 'selected');
  if (!selectedOpts.foreground) selectedOpts.foreground = '212';
  if (!selectedOpts.bold) selectedOpts.bold = true;
  fp.styles.selected = toLipgloss(selectedOpts);

  const fileSizeOpts = extractStyleOptions(flags, 'file-size');
  if (!fileSizeOpts.foreground) fileSizeOpts.foreground = '240';
  fp.styles.fileSize = toLipgloss(fileSizeOpts);

  const headerStyle = toLipgloss((() => {
    const opts = extractStyleOptions(flags, 'header');
    if (!opts.foreground) opts.foreground = '99';
    return opts;
  })());

  return {
    filepicker: fp,
    header,
    headerStyle,
    selectedPath: '',
    quitting: false,
    showHelp,
    padding,
    init(): Cmd {
      return this.filepicker.init();
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof WindowSizeMsg) {
        const usable = msg.height - this.padding[0] - this.padding[2];
        this.filepicker.setHeight(Math.max(usable, 1));
        return [this, null];
      }

      if (msg instanceof KeyPressMsg) {
        if (msg.mod & KeyMod.Ctrl && msg.text === 'c') {
          this.quitting = true;
          return [this, () => Quit()];
        }
        if (msg.code === KeyCode.Escape || msg.text === 'q') {
          this.quitting = true;
          return [this, () => Quit()];
        }
      }

      const [updatedFp, cmd] = this.filepicker.update(msg);
      this.filepicker = updatedFp;

      // Check if a file was selected
      const result: any = this.filepicker.didSelectFile(msg);
      const didSelect = Array.isArray(result) ? result[0] : result?.selected;
      const selectedPath = Array.isArray(result) ? result[1] : result?.path;

      if (didSelect && selectedPath) {
        this.selectedPath = selectedPath;
        this.quitting = true;
        return [this, () => Quit()];
      }

      return [this, cmd];
    },
    view(): string {
      if (this.quitting) return '';

      const parts: string[] = [];

      if (this.header) {
        parts.push(this.headerStyle.render(this.header));
      }

      parts.push(this.filepicker.view());

      if (this.showHelp) {
        parts.push(helpView());
      }

      let content = joinVertical(Left, ...parts);

      const [pt, pr, pb, pl] = this.padding;
      if (pt || pr || pb || pl) {
        const padStyle = newStyle()
          .paddingTop(pt)
          .paddingRight(pr)
          .paddingBottom(pb)
          .paddingLeft(pl);
        content = padStyle.render(content);
      }

      return content;
    },
  };
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const model = createModel(parsed);

  const p = new Program(model, ...interactiveOptions());
  const final = await p.run() as FileModel;

  if (final.quitting && !final.selectedPath) {
    process.exit(STATUS_ABORTED);
  }

  if (final.selectedPath) {
    console.log(final.selectedPath);
  } else {
    console.error('Error: no file selected');
    process.exit(1);
  }
}
