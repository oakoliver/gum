/**
 * Interactive commands driven through a pseudo-terminal with `script`.
 */
import { describe, test, expect } from "bun:test";
import { stripAnsi } from "@oakoliver/lipgloss";

/**
 * Runs `shell` in a pty, typing `keys` after the UI has started. A watchdog
 * kills the pty's process group after 8s so a hung program fails the test
 * instead of hanging the suite.
 */
async function inPty(command: string, keys: string[]): Promise<string> {
  const quiet = ">/dev/null 2>&1 </dev/null";
  const shell = `stty rows 24 cols 100; (sleep 8 ${quiet}; kill 0) ${quiet} & W=$!; ${command}; kill $W 2>/dev/null`;
  const quoted = `'${shell.replace(/'/g, `'\\''`)}'`;
  const script = process.platform === "darwin"
    ? `script -q /dev/null sh -c ${quoted}`
    : `script -qec ${quoted} /dev/null`;
  // Bun's pipes are sockets, which script rejects as stdin; cat hands it a pipe.
  const proc = Bun.spawn(["sh", "-c", `cat | ${script}`], { cwd: `${import.meta.dir}/..`, stdin: "pipe", stdout: "pipe" });
  await Bun.sleep(1500);
  for (const key of keys) {
    proc.stdin.write(key);
    await Bun.sleep(300);
  }
  proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return stripAnsi(out).replace(/\x1b\[[0-9;?<>=]*[a-zA-Z]/g, "").replace(/\r/g, "");
}

const hasScript = Bun.which("script") !== null;

describe.skipIf(!hasScript)("interactive commands with piped input", () => {
  test("choose reads options from stdin and keys from the terminal", async () => {
    const out = await inPty("printf 'apple\\nbanana\\n' | bun src/cli.ts choose 2>/dev/null; echo \"[exit=$?]\"", ["\x1b[B", "\r"]);
    expect(out).toMatch(/^banana$/m);
    expect(out).toContain("[exit=0]");
  }, 20000);

  const DOWN = "\x1b[B";
  const run = (cmd: string) => `${cmd} 2>/tmp/gum-tty-stderr; echo "[exit=$?]"`;

  test("choose --no-limit selects with x and prints in list order with --output-delimiter", async () => {
    const out = await inPty(run("bun src/cli.ts choose --no-limit --output-delimiter , a b c"), ["x", DOWN, DOWN, "x", "\r"]);
    expect(out).toMatch(/^a,c$/m);
  }, 20000);

  test("choose --ordered --limit 2 prints in selection order", async () => {
    const out = await inPty(run("bun src/cli.ts choose --ordered --limit 2 c b a"), [DOWN, "x", "\x1b[A", "x", "\r"]);
    // options are sorted (a b c): select b, then a
    expect(out).toMatch(/^b\na$/m);
  }, 20000);

  test("choose --label-delimiter shows labels and prints values", async () => {
    const out = await inPty(run("bun src/cli.ts choose --label-delimiter : 'Apple:a' 'Banana:b'"), [DOWN, "\r"]);
    expect(out).toMatch(/^b$/m);
  }, 20000);

  test("choose --selected starts the cursor on the selected option", async () => {
    const out = await inPty(run("bun src/cli.ts choose --selected banana apple banana cherry"), ["\r"]);
    expect(out).toMatch(/^banana$/m);
  }, 20000);

  test("choose: esc quits without a selection and exits 1", async () => {
    const out = await inPty(run("bun src/cli.ts choose a b"), ["\x1b"]);
    expect(out).toContain("[exit=1]");
  }, 20000);

  test("confirm: enter keeps the default, n declines, toggling switches", async () => {
    expect(await inPty(run("bun src/cli.ts confirm Proceed?"), ["\r"])).toContain("[exit=0]");
    expect(await inPty(run("bun src/cli.ts confirm Proceed?"), ["n"])).toContain("[exit=1]");
    expect(await inPty(run("bun src/cli.ts confirm Proceed?"), ["\t", "\r"])).toContain("[exit=1]");
  }, 30000);

  test("confirm --show-output prints the prompt and the answer", async () => {
    const out = await inPty(run("bun src/cli.ts confirm --show-output --affirmative Sure Proceed?"), ["y"]);
    expect(out).toMatch(/^Proceed\? Sure$/m);
  }, 20000);

  test("--timeout ends the program with exit 124", async () => {
    expect(await inPty(run("bun src/cli.ts choose --timeout 500ms a b"), [])).toContain("[exit=124]");
  }, 20000);

  test("confirm --timeout keeps the default", async () => {
    expect(await inPty(run("bun src/cli.ts confirm --timeout 500ms --default=false Proceed?"), [])).toContain("[exit=1]");
    expect(await inPty(run("bun src/cli.ts confirm --timeout 500ms Proceed?"), [])).toContain("[exit=0]");
  }, 30000);

  test("input: piped stdin is the initial value; esc exits 1 without output", async () => {
    expect(await inPty(run("echo hello | bun src/cli.ts input"), [" world", "\r"])).toMatch(/^hello world$/m);
    const out = await inPty(run("bun src/cli.ts input --value draft"), ["\x1b"]);
    expect(out).not.toMatch(/^draft$/m);
    expect(out).toContain("[exit=1]");
  }, 30000);

  test("write: ctrl+j inserts a newline, enter submits, piped stdin is the value", async () => {
    expect(await inPty(run("bun src/cli.ts write"), ["one", "\n", "two", "\r"])).toMatch(/^one\ntwo$/m);
    expect(await inPty(run("printf 'from stdin' | bun src/cli.ts write"), ["\r"])).toMatch(/^from stdin$/m);
    expect(await inPty(run("bun src/cli.ts write"), ["x", "\x1b"])).toContain("[exit=1]");
  }, 40000);

  test("table: selects a row inline without taking over the screen", async () => {
    const out = await inPty(
      // stderr (the UI) stays on the terminal so the frame is captured
      "echo before; printf 'n,v\\na,1\\nb,2\\n' | bun src/cli.ts table --return-column 1; echo \"[exit=$?]\"",
      [DOWN, "\r"],
    );
    expect(out).toMatch(/^before$/m);
    expect(out).toMatch(/^b$/m);
    // The table is as tall as its rows, not padded to the terminal height
    expect(out.split("\n").filter((line) => line.trim() === "").length).toBeLessThan(6);
    expect(out).toContain("[exit=0]");
  }, 20000);

  test("table: q quits without a selection and exits 0", async () => {
    const out = await inPty(run("printf 'n\\na\\n' | bun src/cli.ts table"), ["q"]);
    expect(out).toContain("[exit=0]");
    expect(out).not.toMatch(/^a$/m);
  }, 20000);
});

