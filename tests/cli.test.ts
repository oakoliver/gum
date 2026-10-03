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
