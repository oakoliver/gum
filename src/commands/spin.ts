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
    public readonly stdout: string,
    public readonly stderr: string,
    /** stdout and stderr interleaved in arrival order */
    public readonly output: string,
    public readonly exitCode: number,
    /** set when the command could not be started */
    public readonly error?: string,
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
  result: FinishCommandMsg | null;
  align: 'left' | 'right';
}

function runCommand(command: string[]): Cmd {
  return () => new Promise<Msg>((resolve) => {
    // Run the command directly, without a shell, as upstream's exec.Command
    const child = spawn(command[0], command.slice(1), {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let output = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      output += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      output += data.toString();
    });

    child.on('close', (code: number | null) => {
      resolve(new FinishCommandMsg(stdout, stderr, output, code ?? 1));
    });

    child.on('error', (err: Error) => {
      resolve(new FinishCommandMsg('', '', '', 1, err.message));
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
  const align = flagStr(flags, 'align', 'left') as 'left' | 'right';

  const titleStyle = toLipgloss(extractStyleOptions(flags, 'title'));
  const spinnerStyle = toLipgloss(extractStyleOptions(flags, 'spinner', { foreground: '212' }));
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
    result: null,
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
        this.result = msg;
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

      return line;
    },
  };
}

export async function run(parsed: ParsedArgs): Promise<void> {
  const flags = parsed.flags;
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

  const result = final.result;
  if (!result) process.exit(1);
  if (result.error) {
    process.stderr.write(result.error + '\n');
    process.exit(1);
  }

  // Like upstream: output is hidden unless asked for. On success print what
  // --show-output/--show-stdout/--show-stderr select; on failure print
  // everything with --show-error.
  const showOutput = flagBool(flags, 'show-output', false);
  const showStdout = flagBool(flags, 'show-stdout', false);
  const showStderr = flagBool(flags, 'show-stderr', false);
  let output = '';
  if (result.exitCode === 0) {
    if (showOutput || (showStdout && showStderr)) output = result.output;
    else if (showStdout) output = result.stdout;
    else if (showStderr) output = result.stderr;
  } else if (flagBool(flags, 'show-error', false)) {
    output = result.output;
  }
  if (output) process.stdout.write(output);

  process.exit(result.exitCode);
}
