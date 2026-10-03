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
