/**
 * gum spin — Display spinner while running a command.
 * Port of charmbracelet/gum/spin
 */

import { Program, WithOutput, KeyPressMsg, KeyCode, KeyMod, Quit, Batch } from '@oakoliver/bubbletea';
import type { Model, Cmd, Msg } from '@oakoliver/bubbletea';
import { newSpinner, Line, Dot, MiniDot, Jump, Pulse, Points, Globe, Moon, Monkey, Meter, Hamburger } from '@oakoliver/bubbles';
import type { SpinnerModel, Spinner } from '@oakoliver/bubbles';
import { newStyle } from '@oakoliver/lipgloss';
import type { Style } from '@oakoliver/lipgloss';
import { flagStr, flagBool } from '../parser.js';
import type { ParsedArgs } from '../parser.js';
import { extractStyleOptions, toLipgloss } from '../style.js';
import { STATUS_ABORTED } from '../internal/exit.js';
import { spawn } from 'node:child_process';

const spinnerMap: Record<string, Spinner> = {
  line: Line,
  dot: Dot,
  minidot: MiniDot,
  jump: Jump,
  pulse: Pulse,
  points: Points,
  globe: Globe,
  moon: Moon,
  monkey: Monkey,
  meter: Meter,
  hamburger: Hamburger,
};

class FinishCommandMsg {
  readonly _tag = 'FinishCommandMsg';
  constructor(
    public readonly output: string,
    public readonly exitCode: number,
  ) {}
}

interface SpinModel extends Model {
  spinner: SpinnerModel;
  title: string;
  titleStyle: Style;
  spinnerStyle: Style;
  command: string[];
  aborted: boolean;
  quitting: boolean;
  output: string;
  exitCode: number;
  showOutput: boolean;
  align: 'left' | 'right';
}

function runCommand(command: string[]): Cmd {
  return () => new Promise<Msg>((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      resolve(new FinishCommandMsg(stdout || stderr, code ?? 1));
    });

    child.on('error', (err: Error) => {
      resolve(new FinishCommandMsg(err.message, 1));
    });
  });
}

function createModel(parsed: ParsedArgs): SpinModel {
  const flags = parsed.flags;

  const spinnerName = flagStr(flags, 'spinner', 'dot');
  const spinnerType = spinnerMap[spinnerName] || Dot;
  const spinner = newSpinner();
  spinner.spinner = spinnerType;

  const title = flagStr(flags, 'title', 'Loading...');
  const showOutput = flagBool(flags, 'show-output', false);
  const align = flagStr(flags, 'align', 'left') as 'left' | 'right';

  const titleStyle = toLipgloss(extractStyleOptions(flags, 'title'));
  const spinnerStyle = toLipgloss(extractStyleOptions(flags, 'spinner'));
  spinner.style = spinnerStyle;

  // Build command from everything after --
  const command = parsed.args;

  return {
    spinner,
    title,
    titleStyle,
    spinnerStyle,
    command,
    aborted: false,
    quitting: false,
    output: '',
    exitCode: 0,
    showOutput,
    align,
    init(): Cmd {
      const cmds: Cmd[] = [];
      // Start spinner tick
      cmds.push(() => this.spinner.tickMsg());
      // Run command
      if (this.command.length > 0) {
        cmds.push(runCommand(this.command));
      }
      return Batch(...cmds);
    },
    update(msg: Msg): [Model, Cmd] {
      if (msg instanceof FinishCommandMsg) {
        this.output = msg.output;
        this.exitCode = msg.exitCode;
        this.quitting = true;
        return [this, () => Quit()];
      }

      if (msg instanceof KeyPressMsg) {
        // ctrl+c — abort
        if (msg.mod & KeyMod.Ctrl && msg.text === 'c') {
          this.aborted = true;
          this.quitting = true;
          return [this, () => Quit()];
        }
      }

      const [updatedSpinner, cmd] = this.spinner.update(msg);
      this.spinner = updatedSpinner;
      return [this, cmd];
    },
    view(): string {
      if (this.quitting) return '';

      let line: string;
      const spinView = this.spinner.view();
      const titleView = this.titleStyle.render(this.title);

      if (this.align === 'right') {
        line = titleView + ' ' + spinView;
      } else {
        line = spinView + ' ' + titleView;
      }

      let out = line;
      if (this.showOutput && this.output) {
        out += '\n' + this.output;
      }
      return out;
    },
  };
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const model = createModel(parsed);

  if (model.command.length === 0) {
    console.error('Error: no command provided. Usage: gum spin -- <command>');
    process.exit(1);
  }

  const p = new Program(model, WithOutput(process.stderr));
  const final = await p.run() as SpinModel;

  if (final.aborted) {
    process.exit(STATUS_ABORTED);
  }

  // Output the command output
  if (final.output) {
    process.stdout.write(final.output);
    if (!final.output.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  process.exit(final.exitCode);
}
