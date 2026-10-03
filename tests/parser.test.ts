/**
 * Tests for CLI argument parsing.
 */
import { describe, test, expect } from "bun:test";
import { parseArgs } from "../src/parser.js";

describe("parseArgs", () => {
  test("string flags take the next argument even when another command treats the name as boolean", () => {
    expect(parseArgs(["confirm", "--affirmative", "Sure", "--negative", "Nope", "Proceed?"])).toEqual({
      command: "confirm",
      flags: { affirmative: "Sure", negative: "Nope" },
      args: ["Proceed?"],
    });
    expect(parseArgs(["log", "--file", "out.log", "hello"]).flags.file).toBe("out.log");
    expect(parseArgs(["file", "--file", "src"])).toMatchObject({ flags: { file: true }, args: ["src"] });
  });

  test("boolean flags do not consume the next argument", () => {
    expect(parseArgs(["spin", "--show-output", "sleep", "1"]).args).toEqual(["sleep", "1"]);
    expect(parseArgs(["table", "--print", "--separator", ";"]).flags).toEqual({ print: true, separator: ";" });
    expect(parseArgs(["choose", "--cursor.bold", "a", "b"]).args).toEqual(["a", "b"]);
  });

  test("--no-X negates a boolean flag", () => {
    expect(parseArgs(["choose", "--no-show-help", "a"]).flags).toEqual({ "show-help": false });
    expect(parseArgs(["format", "--no-strip-ansi", "x"]).flags).toEqual({ "strip-ansi": false });
    expect(parseArgs(["choose", "--no-limit", "a"]).flags).toEqual({ "no-limit": true });
  });

  test("short flags resolve per command", () => {
    expect(parseArgs(["format", "-t", "code", "-l", "go"]).flags).toEqual({ type: "code", language: "go" });
    expect(parseArgs(["table", "-s", ";", "-p"]).flags).toEqual({ separator: ";", print: true });
    expect(parseArgs(["spin", "-s", "line", "--", "sleep", "1"])).toMatchObject({ flags: { spinner: "line" }, args: ["sleep", "1"] });
    expect(parseArgs(["log", "-s", "-l", "info", "msg"]).flags).toEqual({ structured: true, level: "info" });
    expect(parseArgs(["file", "-ap"]).flags).toEqual({ all: true, permissions: true });
  });

  test("unknown short flags and negative numbers stay positional", () => {
    expect(parseArgs(["choose", "-x", "-1"]).args).toEqual(["-x", "-1"]);
  });

  test("repeated list flags accumulate", () => {
    expect(parseArgs(["choose", "--selected", "a", "--selected", "b"]).flags.selected).toBe("a,b");
  });

  test("everything after -- is positional", () => {
    expect(parseArgs(["spin", "--title", "Wait", "--", "sh", "-c", "echo --title"]).args).toEqual(["sh", "-c", "echo --title"]);
  });
});
