/**
 * Generates tests/fixtures/upstream-v2.0.2-output.json: what the real gum
 * v2.0.2 prints for styled output (style, join, format) in each color depth.
 *
 *   GOBIN=/tmp/gum-upstream go install charm.land/gum/v2@v2.0.2
 *   GUM_UPSTREAM=/tmp/gum-upstream/gum bun scripts/gen-upstream-fixtures.ts
 *
 * Upstream runs with CLICOLOR_FORCE=1 because its output goes through a pipe
 * here, where v2 would otherwise strip every sequence. A case is written only
 * where the port prints the same bytes today, so a fixture that stops passing
 * is a regression. Sequences are normalized the way tests/upstream-v2.test.ts
 * does (`ESC[0m` is `ESC[m`, and neighbouring SGRs are merged).
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeSgr } from '../tests/sgr.ts';

const ROOT = join(import.meta.dir, '..');
const UPSTREAM = process.env.GUM_UPSTREAM;
if (!UPSTREAM) throw new Error('set GUM_UPSTREAM to a gum v2.0.2 binary');

type Env = Record<string, string>;
const DEPTHS: Env[] = [
  { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  { TERM: 'xterm-256color' },
  { TERM: 'xterm' },
];
const code = 'package main\nfunc main() {}\n';

const CASES: { args: string[]; envs?: Env[] }[] = [
  { args: ['style', '--foreground', '212', '--border', 'rounded', '--border-foreground', '#ff8800', '--padding', '0 1', 'Hello'] },
  { args: ['style', '--foreground', '#ff8800', '--bold', '--italic', 'x'] },
  { args: ['style', '--background', '#00ff00', '--width', '6', '--align', 'right', 'x'] },
  { args: ['style', '--border', 'double', '--border-foreground', '99', '--margin', '1 2', 'a', 'b'] },
  { args: ['join', '--horizontal', 'a', 'b'] },
  { args: ['format', '# Title\n\nSome **bold** and *italic* and `code` and a list:\n\n- one\n- two\n\n> quote'] },
  { args: ['format', '--theme', 'dark', '# Title\n\nSome **bold**'] },
  { args: ['format', '--theme', 'light', '# Title\n\n[link](https://example.com)'] },
  { args: ['format', '-t', 'template', '{{ Bold "Tasty" }} {{ Color "99" "0" " Gum " }}'] },
  { args: ['format', '-t', 'template', '{{ Italic (Foreground "212" "x") }}'] },
  { args: ['format', '-t', 'template', '{{ Color "#ff8800" "hi" }}'] },
  { args: ['format', '-t', 'template', '{{ Color "99" "fg only" }}'] },
  { args: ['format', '-t', 'template', '{{ Foreground "#00ff00" "g" }} {{ Background "212" "bg" }}'] },
  { args: ['format', '-t', 'template', '{{ Bold "first" "ignored" }}'] },
  { args: ['format', '-t', 'template', '{{ Overline "o" }}{{ Blink "b" }}{{ Reverse "r" }}{{ CrossOut "c" }}{{ Faint "f" }}'] },
  // `format --type code` reads GLAMOUR_STYLE (WithEnvironmentConfig) in v2.
  { args: ['format', '-t', 'code', '-l', 'go', code], envs: [{ TERM: 'xterm-256color', GLAMOUR_STYLE: 'notty' }] },
  { args: ['format', '-t', 'code', '-l', 'go', code], envs: [{ TERM: 'xterm-256color', GLAMOUR_STYLE: 'ascii' }] },
];

const CLEAN = ['COLORTERM', 'NO_COLOR', 'CLICOLOR', 'CLICOLOR_FORCE', 'GLAMOUR_STYLE'];
function run(cmd: string[], env: Env): string {
  const e: Record<string, string | undefined> = { ...process.env };
  for (const k of CLEAN) delete e[k];
  const proc = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, env: { ...e, ...env } as NodeJS.ProcessEnv });
  return normalizeSgr(proc.stdout.toString()).replace(/\n+$/, '');
}

const fixtures: { args: string[]; env: Env; expected: string }[] = [];
for (const c of CASES) {
  for (const env of c.envs ?? DEPTHS) {
    const expected = run([UPSTREAM, ...c.args], { ...env, CLICOLOR_FORCE: '1' });
    const actual = run(['bun', 'src/cli.ts', ...c.args], env);
    if (expected === actual) fixtures.push({ args: c.args, env, expected });
    else console.warn('skipped (port differs):', env, c.args);
  }
}
writeFileSync(join(ROOT, 'tests/fixtures/upstream-v2.0.2-output.json'), JSON.stringify(fixtures, null, 1) + '\n');
console.log(`wrote ${fixtures.length} fixtures`);
