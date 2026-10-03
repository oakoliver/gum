/**
 * Tests for the CLI entry point.
 */
import { describe, test, expect } from "bun:test";
import { stripAnsi } from "@oakoliver/lipgloss";

function gum(...args: string[]): string {
  const proc = Bun.spawnSync(["bun", "src/cli.ts", ...args], { cwd: `${import.meta.dir}/..` });
  return stripAnsi(proc.stdout.toString());
}

describe("CLI", () => {
  test("passes the first argument after the subcommand", () => {
    expect(gum("join", "A", "B", "C").trim().split("\n")).toEqual(["A", "B", "C"]);
    expect(gum("join", "--horizontal", "A", "B", "C").trim()).toBe("ABC");
  });
});

describe("CLI version", () => {
  test("matches package.json", async () => {
    const pkg = await Bun.file(`${import.meta.dir}/../package.json`).json();
    expect(gum("--version").trim()).toBe(`gum version ${pkg.version}`);
  });
});

describe("CLI output streams", () => {
  test("interactive UIs draw on stderr so $(gum …) captures only the result", () => {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", "spin", "--title", "Working", "--", "sleep", "0.3"], {
      cwd: `${import.meta.dir}/..`,
    });
    expect(proc.stdout.toString()).toBe("");
    expect(stripAnsi(proc.stderr.toString())).toContain("Working");
  });
});

describe("gum style", () => {
  test("--border draws the named border around the text", () => {
    expect(gum("style", "--border", "rounded", "--padding", "0 1", "Hi").trim().split("\n")).toEqual([
      "╭────╮",
      "│ Hi │",
      "╰────╯",
    ]);
    expect(gum("style", "--border", "double", "Hi").trim().split("\n")[0]).toBe("╔══╗");
  });

  test("arguments are joined one per line, and --trim trims each line", () => {
    expect(gum("style", "a", "b").trim().split("\n")).toEqual(["a", "b"]);
    expect(gum("style", "--trim", "  a  ", "  b").trimEnd().split("\n").map((l) => l.trimEnd())).toEqual(["a", "b"]);
  });

  test("fails without input", () => {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", "style"], { cwd: `${import.meta.dir}/..` });
    expect(proc.exitCode).toBe(1);
    expect(proc.stderr.toString()).toContain("no input provided");
  });
});
