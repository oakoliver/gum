/**
 * gum pager — Scroll through content with search.
 * Port of charmbracelet/gum/pager
 */

import { KeyPressMsg, KeyCode, KeyMod, Quit, WithAltScreen, WindowSizeMsg } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newViewport, newTextInput } from '@oakoliver/bubbles';
import type { ViewportModel, TextInputModel } from '@oakoliver/bubbles';
import { newStyle, stringWidth, roundedBorder } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { runProgram, exitTimedOut } from '../internal/program.js';
import { extractStyleOptions, toLipgloss, parsePadding } from '../style.js';
import { readStdin, isStdinEmpty } from '../internal/stdin.js';
import { STATUS_ABORTED } from '../internal/exit.js';

const HELP_VIEW = '  ↑/↓ navigate • / search • n next • N prev • q quit';

interface Search {
  active: boolean;
  input: TextInputModel;
  query: RegExp | null;
  matchIndex: number;
  matchString: string;
  matchHighlightStr: string;
}

interface PagerModel extends Model {
  viewport: ViewportModel;
  content: string;
  origContent: string;
  showLineNumbers: boolean;
  lineNumberStyle: Style;
  softWrap: boolean;
  search: Search;
  matchStyle: Style;
  matchHighlightStyle: Style;
  maxWidth: number;
  aborted: boolean;
  quitting: boolean;
  viewportStyle: Style;
}

function lipglossPadding(style: Style): [number, number] {
  const rendered = style.render(' ');
  const idx = rendered.indexOf(' ');
  return [idx, rendered.length - 1 - idx];
}

function softWrapText(str: string, maxWidth: number, wrap: boolean): string[] {
  if (!wrap || maxWidth <= 0) return [str];
  const lines: string[] = [];
  let remaining = str;
  while (stringWidth(remaining) > maxWidth) {
    // Find break point by visible width
    let cut = 0;
    let w = 0;
    for (let i = 0; i < remaining.length; i++) {
      const ch = remaining[i];
      // Skip ANSI escape sequences
      if (ch === '\x1b') {
        const end = remaining.indexOf('m', i);
        if (end !== -1) { i = end; continue; }
      }
      w++;
      cut = i + 1;
      if (w >= maxWidth) break;
    }
    if (cut === 0) break;
    lines.push(remaining.substring(0, cut));
    remaining = remaining.substring(cut);
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}

function processText(model: PagerModel): void {
  const lines = model.origContent.split('\n');
  const [padL, padR] = lipglossPadding(model.viewportStyle);
  const lineNumWidth = model.showLineNumbers ? `   ${lines.length} │ `.length : 0;
  model.maxWidth = model.viewport.width() - padL - padR - lineNumWidth;

  const processed: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const prefix = model.showLineNumbers
      ? model.lineNumberStyle.render(`${String(i + 1).padStart(4)} │ `)
      : '';

    if (model.softWrap && model.maxWidth > 0) {
      const wrapped = softWrapText(line, model.maxWidth, true);
      for (let j = 0; j < wrapped.length; j++) {
        processed.push(j === 0 ? prefix + wrapped[j] : ' '.repeat(lineNumWidth) + wrapped[j]);
      }
    } else {
      processed.push(prefix + line);
    }
  }

  // Fill remaining viewport height with empty line-number gutters
  if (model.showLineNumbers) {
    const visible = model.viewport.height();
    while (processed.length < visible) {
      processed.push(model.lineNumberStyle.render('   ~ │ '));
    }
  }

  model.content = processed.join('\n');
  model.viewport.setContent(model.content);
}

function searchBegin(search: Search): void {
  search.active = true;
  search.input = newTextInput();
  search.input.placeholder = 'search...';
  search.input.prompt = '/ ';
  search.input.focus();
}

function searchExecute(model: PagerModel): void {
  const value = model.search.input.value();
  if (!value) return;

  let pattern: RegExp;
  try {
    pattern = new RegExp(value, 'gi');
  } catch {
    return;
  }

  // Highlight all matches in the processed content
  const highlighted = model.content.replace(pattern, (m) => model.matchStyle.render(m));
  model.content = highlighted;
  model.viewport.setContent(model.content);

  // Recompile to match the styled version for navigation
  const styledSample = model.matchStyle.render(value);
  try {
    model.search.query = new RegExp(escapeRegex(styledSample), 'gi');
  } catch {
    model.search.query = null;
  }
  model.search.matchIndex = -1;
}

function searchDone(search: Search): void {
  search.active = false;
  search.query = null;
  search.matchIndex = -1;
  search.matchString = '';
  search.matchHighlightStr = '';
}

function searchNextMatch(model: PagerModel): void {
  if (!model.search.query) return;
  const matches = [...model.content.matchAll(model.search.query)];
  if (matches.length === 0) return;

  // Undo previous highlight
  if (model.search.matchHighlightStr && model.search.matchString) {
    model.content = model.content.replace(model.search.matchHighlightStr, model.search.matchString);
  }

  model.search.matchIndex = (model.search.matchIndex + 1) % matches.length;
  const match = matches[model.search.matchIndex];
  model.search.matchString = match[0];
  model.search.matchHighlightStr = model.matchHighlightStyle.render(
    model.search.input.value(),
  );

  model.content = model.content.substring(0, match.index!)
    + model.search.matchHighlightStr
    + model.content.substring(match.index! + match[0].length);
  model.viewport.setContent(model.content);

  // Scroll to match line
  const beforeMatch = model.content.substring(0, match.index!);
  const line = beforeMatch.split('\n').length - 1;
  model.viewport.setYOffset(Math.max(0, line - Math.floor(model.viewport.height() / 2)));
}

function searchPrevMatch(model: PagerModel): void {
  if (!model.search.query) return;
  const matches = [...model.content.matchAll(model.search.query)];
  if (matches.length === 0) return;

  // Undo previous highlight
  if (model.search.matchHighlightStr && model.search.matchString) {
    model.content = model.content.replace(model.search.matchHighlightStr, model.search.matchString);
  }

  model.search.matchIndex = model.search.matchIndex <= 0 ? matches.length - 1 : model.search.matchIndex - 1;
  const match = matches[model.search.matchIndex];
  model.search.matchString = match[0];
  model.search.matchHighlightStr = model.matchHighlightStyle.render(
    model.search.input.value(),
  );

  model.content = model.content.substring(0, match.index!)
    + model.search.matchHighlightStr
    + model.content.substring(match.index! + match[0].length);
  model.viewport.setContent(model.content);

  const beforeMatch = model.content.substring(0, match.index!);
  const line = beforeMatch.split('\n').length - 1;
  model.viewport.setYOffset(Math.max(0, line - Math.floor(model.viewport.height() / 2)));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createModel(parsed: ParsedArgs): PagerModel {
  const flags = parsed.flags;

  // Get content from args or stdin
  let content = '';
  if (parsed.args.length > 0) {
    content = parsed.args[0];
  } else if (!isStdinEmpty()) {
    content = readStdin();
    content = content.replace(/.\x08/g, '');
  }

  const showLineNumbers = flagBool(flags, 'show-line-numbers', true);
  const softWrap = flagBool(flags, 'soft-wrap', true);

  const lineNumberStyle = toLipgloss(extractStyleOptions(flags, 'line-number'));
  const lineNumberFg = flagStr(flags, 'line-number.foreground', '237');
  const lnStyle = lineNumberFg === '237' && !flags['line-number.foreground']
    ? newStyle().foreground('237')
    : lineNumberStyle;

  const matchOpts = extractStyleOptions(flags, 'match');
  const matchStyle = matchOpts.foreground || matchOpts.bold
    ? toLipgloss(matchOpts)
    : newStyle().foreground('212').bold(true);

  const mhOpts = extractStyleOptions(flags, 'match-highlight');
  const matchHighlightStyle = mhOpts.foreground || mhOpts.background || mhOpts.bold
    ? toLipgloss(mhOpts)
    : newStyle().foreground('235').background('225').bold(true);

  // Viewport style: default rounded border, padding "0 1", borderForeground 212
  const borderFg = flagStr(flags, 'border-foreground', '212');
  const vpStyle = newStyle()
    .border(roundedBorder())
    .borderForeground(borderFg)
    .paddingRight(1)
    .paddingLeft(1);

  const viewport = newViewport();
  viewport.softWrap = softWrap;
  viewport.style = vpStyle;

  const search: Search = {
    active: false,
    input: newTextInput(),
    query: null,
    matchIndex: -1,
    matchString: '',
    matchHighlightStr: '',
  };

  return {
    viewport,
    content,
    origContent: content,
    showLineNumbers,
    lineNumberStyle: lnStyle,
    softWrap,
    search,
    matchStyle,
    matchHighlightStyle,
    maxWidth: 0,
    aborted: false,
    quitting: false,
    viewportStyle: vpStyle,

    init() { return null; },

    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof WindowSizeMsg) {
        this.viewport.setWidth(msg.width);
        this.viewport.setHeight(msg.height - 2);
        processText(this as PagerModel);
        return [this, null];
      }

      if (msg instanceof KeyPressMsg) {
        // Search-active key handling
        if (this.search.active) {
          if (msg.code === KeyCode.Enter) {
            if (this.search.input.value()) {
              searchExecute(this as PagerModel);
              this.search.active = false;
            } else {
              searchDone(this.search);
              // Restore original content
              this.content = this.origContent;
              processText(this as PagerModel);
            }
            return [this, null];
          }
          if (msg.code === KeyCode.Escape
            || (msg.mod & KeyMod.Ctrl && msg.text === 'c')
            || (msg.mod & KeyMod.Ctrl && msg.text === 'd')) {
            searchDone(this.search);
            this.content = this.origContent;
            processText(this as PagerModel);
            return [this, null];
          }
          const [updatedInput] = this.search.input.update(msg);
          this.search.input = updatedInput;
          return [this, null];
        }

        // Normal mode keys
        if (msg.text === 'g' || msg.code === KeyCode.Home) {
          this.viewport.gotoTop();
          return [this, null];
        }
        if (msg.text === 'G' || msg.code === KeyCode.End) {
          this.viewport.gotoBottom();
          return [this, null];
        }
        if (msg.text === '/') {
          searchBegin(this.search);
          return [this, null];
        }
        if (msg.text === 'n') {
          searchNextMatch(this as PagerModel);
          return [this, null];
        }
        if (msg.text === 'p' || msg.text === 'N') {
          searchPrevMatch(this as PagerModel);
          return [this, null];
        }
        if (msg.text === 'q' || msg.code === KeyCode.Escape) {
          this.quitting = true;
          return [this, () => Quit()];
        }
        if (msg.mod & KeyMod.Ctrl && msg.text === 'c') {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }

        // Forward to viewport for scrolling
        const [updatedVp, vpCmd] = this.viewport.update(msg);
        this.viewport = updatedVp;
        return [this, vpCmd];
      }

      return [this, null];
    },

    view(): string {
      if (this.quitting) return '';
      if (this.search.active) {
        return this.viewport.view() + '\n ' + this.search.input.view();
      }
      return this.viewport.view() + '\n' + HELP_VIEW;
    },
  };
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const model = createModel(parsed);
  const { model: final, timedOut } = await runProgram(model, parsed.flags, { output: process.stdout, extra: [WithAltScreen()] });
  if (timedOut) exitTimedOut();

  if (final.aborted) {
    process.exit(STATUS_ABORTED);
  }
}
