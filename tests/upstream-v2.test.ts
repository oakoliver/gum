/**
 * What changed between upstream gum v0.17.0 and v2.0.2.
 *
 * The goldens in fixtures/upstream-v2.0.2-output.json were printed by the real
 * gum v2.0.2 (see scripts/gen-upstream-fixtures.ts). Everything else here
 * covers a v2 change the port takes over, or an upstream v2 regression it
 * deliberately does not.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripAnsi } from "@oakoliver/lipgloss";
import { inPty, hasScript } from "./pty";
import { normalizeSgr } from "./sgr";

const ROOT = `${import.meta.dir}/..`;

/** An environment without the variables that change color output. */
function cleanEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  for (const k of ["COLORTERM", "NO_COLOR", "CLICOLOR", "CLICOLOR_FORCE", "GLAMOUR_STYLE", "TERM"]) delete env[k];
  return { ...env, ...extra };
}

function gum(env: Record<string, string>, ...args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(["bun", "src/cli.ts", ...args], { cwd: ROOT, env: cleanEnv(env), stdin: "ignore" });
  return { stdout: proc.stdout.toString(), stderr: proc.stderr.toString(), exitCode: proc.exitCode ?? -1 };
}

const TERM256 = { TERM: "xterm-256color" };

type Fixture = { args: string[]; env: Record<string, string>; expected: string };
const fixtures: Fixture[] = JSON.parse(readFileSync(`${import.meta.dir}/fixtures/upstream-v2.0.2-output.json`, "utf8"));

describe("output matches upstream v2.0.2 byte for byte", () => {
  test("the fixtures cover style, join, format and every color depth", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
    expect(new Set(fixtures.map((f) => f.args[0]))).toEqual(new Set(["style", "join", "format"]));
    expect(new Set(fixtures.map((f) => f.env.COLORTERM ?? f.env.TERM)).size).toBeGreaterThanOrEqual(3);
  });

  for (const fixture of fixtures) {
    const label = `${JSON.stringify(fixture.env)} gum ${fixture.args.map((a) => JSON.stringify(a)).join(" ").slice(0, 90)}`;
    test(label, () => {
      const { stdout } = gum(fixture.env, ...fixture.args);
      expect(normalizeSgr(stdout).replace(/\n+$/, "")).toBe(fixture.expected);
    });
  }
});

describe("colors follow the environment, not the pipe", () => {
  // Upstream v2 writes through colorprofile's NewWriter(os.Stdout), which
  // strips every sequence when stdout is not a terminal. That breaks
  // `$(gum style ...)` and `gum format | less -R` (charmbracelet/gum#1127 and
  // #1131, still open on v2.0.2), and joining captured blocks was this port's
  // documented use. The port keeps what v0.17.0 did and takes the rest of
  // the writer: depth downgrade, NO_COLOR, CLICOLOR_FORCE and TERM=dumb.
  test("a captured gum style keeps its color", () => {
    expect(gum(TERM256, "style", "--foreground", "212", "x").stdout).toMatch(/^\x1b\[38;5;212mx\x1b\[0?m\n$/);
  });

  test("gum format and gum join keep theirs", () => {
    expect(gum(TERM256, "format", "# Hi").stdout).toContain("\x1b[");
    expect(gum(TERM256, "join", gum(TERM256, "style", "--foreground", "212", "x").stdout.trimEnd(), "y").stdout).toContain("\x1b[38;5;212m");
  });

  test("NO_COLOR removes colors and keeps attributes", () => {
    expect(gum({ ...TERM256, NO_COLOR: "1" }, "style", "--foreground", "212", "--bold", "x").stdout).toMatch(/^\x1b\[1mx\x1b\[0?m\n$/);
  });

  test("TERM=dumb prints plain text", () => {
    expect(gum({ TERM: "dumb" }, "style", "--foreground", "212", "--bold", "x").stdout).toBe("x\n");
    expect(gum({ TERM: "dumb" }, "format", "# Hi").stdout).not.toContain("\x1b");
  });

  test("CLICOLOR_FORCE keeps colors where there is no TERM", () => {
    expect(gum({ CLICOLOR_FORCE: "1" }, "style", "--foreground", "212", "x").stdout).toContain("\x1b[");
  });

  test("colors are downgraded to the terminal's depth", () => {
    const truecolor = gum({ ...TERM256, COLORTERM: "truecolor" }, "style", "--foreground", "#ff8800", "x").stdout;
    expect(truecolor).toContain("\x1b[38;2;255;136;0m");
    expect(gum(TERM256, "style", "--foreground", "#ff8800", "x").stdout).toContain("\x1b[38;5;208m");
    expect(gum({ TERM: "xterm" }, "style", "--foreground", "#ff8800", "x").stdout).toContain("\x1b[91m");
  });
});

describe("gum format templates (Lip Gloss functions in v2)", () => {
  const template = (body: string) => normalizeSgr(gum(TERM256, "format", "-t", "template", body).stdout).trimEnd();

  test("Color takes a foreground, or a foreground and a background, before the text", () => {
    expect(template('{{ Color "99" "x" }}')).toBe("\x1b[38;5;99mx\x1b[m");
    expect(template('{{ Color "99" "0" "x" }}')).toBe("\x1b[38;5;99;40mx\x1b[m");
  });

  test("a lone value is printed as it is", () => {
    expect(template('{{ Color "x" }}')).toBe("x");
    expect(template('{{ Foreground "x" }}')).toBe("x");
  });

  test("Overline leaves the text alone, as upstream v2 does", () => {
    expect(template('{{ Overline "o" }}')).toBe("o");
  });

  test("an attribute function styles its first value", () => {
    expect(template('{{ Bold "a" "b" }}')).toBe("\x1b[1ma\x1b[m");
  });

  test("a function without a value is an error", () => {
    const { stderr, exitCode } = gum(TERM256, "format", "-t", "template", "{{ Bold }}");
    expect(exitCode).toBe(1);
    expect(stderr).toContain("unable to parse template: Bold expects at least 1 argument");
  });
});

describe("gum format --type code reads GLAMOUR_STYLE", () => {
  const code = (style?: string) => gum({ ...TERM256, ...(style ? { GLAMOUR_STYLE: style } : {}) }, "format", "-t", "code", "-l", "go", "x := 1").stdout;

  test("notty draws no colors, the default style does", () => {
    expect(code("notty")).not.toContain("\x1b");
    expect(code()).toContain("\x1b[");
  });
});

describe.skipIf(!hasScript)("interactive commands in a terminal", () => {
  const errFile = () => join(mkdtempSync(join(tmpdir(), "gum-v2-")), "stderr");
  const frames = (file: string) => readFileSync(file, "utf8");

  // Upstream v2 binds Space with the literal " " while Bubble Tea v2 names the
  // key "space", so multi-select stopped toggling on Space (gum#1143). The
  // port binds both.
  test("choose --no-limit toggles the highlighted item with Space", async () => {
    const err = errFile();
    const out = await inPty(`printf 'a\\nb\\n' | bun src/cli.ts choose --no-limit 2>${err}; echo "[exit=$?]"`, [" ", "\r"]);
    expect(out).toMatch(/^a$/m);
    expect(out).not.toMatch(/^b$/m);
    expect(out).toContain("[exit=0]");
  }, 20000);

  test("choose asks the terminal for its background and colors the page dots by the answer", async () => {
    const dark = errFile();
    await inPty(`bun src/cli.ts choose --height 3 a b c d e f g 2>${dark}; echo "[exit=$?]"`, ["\x1b]11;rgb:0000/0000/0000\x07", "\r"]);
    expect(frames(dark)).toContain("\x1b]11;?");
    expect(frames(dark)).toContain("\x1b[38;2;151;151;151m•");

    const light = errFile();
    await inPty(`bun src/cli.ts choose --height 3 a b c d e f g 2>${light}; echo "[exit=$?]"`, ["\x1b]11;rgb:ffff/ffff/ffff\x07", "\r"]);
    expect(frames(light)).toContain("\x1b[38;2;132;122;133m•");
    expect(frames(light)).not.toContain("\x1b[38;2;151;151;151m");
  }, 40000);

  test("--cursor.mode hide draws no cursor in input and write, static and blink do", async () => {
    for (const [command, key] of [["input", "\r"], ["write", "\r"]] as const) {
      const shown = errFile();
      await inPty(`bun src/cli.ts ${command} --cursor.mode static --value abc 2>${shown}; echo "[exit=$?]"`, [key]);
      expect(frames(shown)).toContain("\x1b[38;5;212m");

      const hidden = errFile();
      await inPty(`bun src/cli.ts ${command} --cursor.mode hide --value abc 2>${hidden}; echo "[exit=$?]"`, [key]);
      expect(stripAnsi(frames(hidden))).toContain("abc");
      expect(frames(hidden)).not.toContain("\x1b[38;5;212m");
    }
  }, 60000);

  // v2.0.1 and v2.0.2 bump Bubble Tea so a program without input stops
  // sending capability queries whose replies would land in the shell.
  test("spin sends no terminal query when it has no input to read replies from", async () => {
    const piped = errFile();
    await inPty(`echo hi | bun src/cli.ts spin --title Working -- sleep 0.3 2>${piped}; echo "[exit=$?]"`, []);
    expect(stripAnsi(frames(piped))).toContain("Working");
    expect(frames(piped)).not.toMatch(/\x1b\[\?\d+\$p|\x1b\]\d+;\?|\x1b\[\?u/);
  }, 20000);
});
