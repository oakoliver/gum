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
    expect(gum("join", "--vertical", "A", "B", "C").trim().split("\n")).toEqual(["A", "B", "C"]);
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

describe("gum format", () => {
  function raw(...args: string[]): string {
    return Bun.spawnSync(["bun", "src/cli.ts", ...args], { cwd: `${import.meta.dir}/..` }).stdout.toString();
  }

  test("--type and -t select the format", () => {
    expect(raw("format", "--type", "emoji", "I :heart: gum").trim()).toBe("I ❤️ gum");
    expect(raw("format", "-t", "emoji", ":rocket:").trim()).toBe("🚀");
    // Markdown would render the code as a paragraph; code fences it.
    expect(stripAnsi(raw("format", "-t", "code", "-l", "go", "x := 1")).trim()).toBe("x := 1");
  });

  test("markdown uses the pink theme by default, as upstream", () => {
    expect(raw("format", "# Title")).toBe(raw("format", "--theme", "pink", "# Title"));
    expect(raw("format", "# Title")).not.toBe(raw("format", "--theme", "dark", "# Title"));
  });

  test("templates run termenv's template functions", () => {
    expect(raw("format", "-t", "template", '{{ Bold "Tasty" }} {{ Color "99" "0" " Gum " }}').trim()).toBe(
      "\x1b[1mTasty\x1b[0m \x1b[38;5;99;48;5;0m Gum \x1b[0m",
    );
    expect(raw("format", "-t", "template", '{{ Italic (Foreground "212" "x") }}').trim()).toBe(
      "\x1b[3m\x1b[38;5;212mx\x1b[0m\x1b[0m",
    );
  });
});

describe("gum log", () => {
  function log(...args: string[]): { stderr: string; exitCode: number } {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", "log", ...args], { cwd: `${import.meta.dir}/..` });
    return { stderr: stripAnsi(proc.stderr.toString()).trimEnd(), exitCode: proc.exitCode ?? -1 };
  }

  test("--structured takes alternating key and value arguments", () => {
    expect(log("--structured", "--level", "debug", "Creating file...", "name", "file.txt").stderr).toBe(
      "DEBUG Creating file... name=file.txt",
    );
    expect(log("-s", "-l", "info", "Upload", "path", "/tmp/my file", "dangling").stderr).toBe(
      'INFO Upload path="/tmp/my file" dangling="missing value"',
    );
  });

  test("without --structured every argument is part of the message", () => {
    expect(log("--level", "error", "--prefix", "build", "Failed", "to", "compile").stderr).toBe("ERROR build: Failed to compile");
  });

  test("the default level is none, which prints no level", () => {
    expect(log("just", "a", "message").stderr).toBe("just a message");
  });

  test("--format applies printf verbs", () => {
    expect(log("-f", "-l", "info", "%s has %d items", "cart", "3").stderr).toBe("INFO cart has 3 items");
  });

  test("--min-level filters lower levels and fatal exits 1", () => {
    expect(log("--min-level", "warn", "-l", "info", "hidden").stderr).toBe("");
    expect(log("-l", "fatal", "boom")).toEqual({ stderr: "FATAL boom", exitCode: 1 });
  });

  test("json and logfmt formatters", () => {
    expect(log("--formatter", "json", "-s", "-l", "info", "hello", "user", "ann").stderr).toBe(
      '{"level":"info","msg":"hello","user":"ann"}',
    );
    expect(log("--formatter", "logfmt", "-s", "-l", "warn", "hi there", "k", "v v").stderr).toBe('level=warn msg="hi there" k="v v"');
  });

  test("--time accepts Go layouts and named formats", () => {
    expect(log("--time", "2006-01-02", "x").stderr).toMatch(/^\d{4}-\d{2}-\d{2} x$/);
    expect(log("--time", "kitchen", "x").stderr).toMatch(/^\d{1,2}:\d{2}(AM|PM) x$/);
  });
});

describe("gum table --print", () => {
  function table(input: string, ...args: string[]): string {
    const proc = Bun.spawnSync(["bun", "src/cli.ts", "table", ...args], {
      cwd: `${import.meta.dir}/..`,
      stdin: new TextEncoder().encode(input),
    });
    return stripAnsi(proc.stdout.toString() + proc.stderr.toString()).trimEnd();
  }

  test("prints every row in a bordered table", () => {
    expect(table("Name,Age\nAlice,30\nBob,4\n", "--print")).toBe(
      ["╭───────┬─────╮", "│ Name  │ Age │", "├───────┼─────┤", "│ Alice │ 30  │", "│ Bob   │ 4   │", "╰───────┴─────╯"].join("\n"),
    );
  });

  test("-s, -b and --columns", () => {
    expect(table("1;2\n", "-p", "-s", ";", "-b", "double", "--columns", "a,b").split("\n")).toEqual([
      "╔═══╦═══╗",
      "║ a ║ b ║",
      "╠═══╬═══╣",
      "║ 1 ║ 2 ║",
      "╚═══╩═══╝",
    ]);
  });

  test("rejects rows with more fields than columns", () => {
    expect(table("a,b\n1,2,3\n", "--print")).toBe("invalid number of columns");
  });
});

describe("gum join", () => {
  test("joins horizontally by default, as upstream", () => {
    expect(gum("join", "A", "B", "C").trim()).toBe("ABC");
  });

  test("--align middle centers blocks", () => {
    expect(gum("join", "--align", "middle", "x", "a\nb\nc").split("\n")).toEqual([" a", "xb", " c", ""]);
  });
});
