/**
 * Interactive commands driven through a pseudo-terminal with `script`.
 */
import { describe, test, expect } from "bun:test";
import { stripAnsi } from "@oakoliver/lipgloss";

/** Runs `shell` in a pty, typing `keys` after the UI has started. */
async function inPty(shell: string, keys: string[]): Promise<string> {
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
});
