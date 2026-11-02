# Changelog

## 1.2.0 (parity with gum v2.0.2)

Syncs with upstream [v2.0.0](https://github.com/charmbracelet/gum/releases/tag/v2.0.0), [v2.0.1](https://github.com/charmbracelet/gum/releases/tag/v2.0.1) and [v2.0.2](https://github.com/charmbracelet/gum/releases/tag/v2.0.2), 35 commits after v0.17.0.

This is a minor release. No flag, default, exit code or exported function changed, and `gum <command> --help` is identical (it is regenerated from v2.0.2's option structs and comes out the same). Output changes only where the environment asks for it (`NO_COLOR`, `TERM=dumb`, a terminal with fewer colors), or in the corners listed below.

Upstream says v2.0.0 has "no UX changes". The diff has a few: the writer that downgrades or strips colors, the template functions, `GLAMOUR_STYLE`, the pagination dot colors and the cursor modes. Two others are bugs that upstream has opened issues for, and the port does not copy them.

### Dependencies

- `@oakoliver/bubbletea` 1.2.2 (was 1.2.0): crash reports survive the alternate screen, and `alt+letter` keys match their bindings.
- `@oakoliver/lipgloss` 1.1.3 (was 1.1.2): no required `typescript` peer dependency.
- `@oakoliver/bubbles` 1.2.2 and `@oakoliver/glamour` 2.0.0 are already the latest. The port does not use `@oakoliver/huh`, as upstream gum does not.

### Every upstream change and what happened to it

Applied:

| Upstream | Change | In this port |
|---|---|---|
| `f6dd28e` | `format --type code` renders with `glamour.WithEnvironmentConfig()` instead of `WithAutoStyle()` | `GLAMOUR_STYLE` now selects the style (default `dark`). Checked against the real binary for `notty` and `ascii`. |
| `f6dd28e` | Template functions are defined on Lip Gloss instead of termenv's `TemplateFuncs`: `Color` takes one or two colors before the text, `Foreground`/`Background` take one, attributes take the first value, `Overline` does nothing | Same functions, built on `@oakoliver/lipgloss`. `Color "99" "text"` (foreground only) works now, a call with no value is an error, `Overline` no longer writes SGR 53. Byte for byte against upstream in truecolor, 256 and 16 colors. |
| `f6dd28e` | `style`, `join` and `format` write through `tty.Writer()`, a colorprofile writer: colors are downgraded to the terminal's depth, `NO_COLOR`, `CLICOLOR` and `CLICOLOR_FORCE` apply, and everything is stripped when stdout is not a terminal. `main` no longer forces the profile of stderr. | Taken over except the last part, see "Not copied". The port used to emit full-depth colors whatever the terminal. |
| `f6dd28e` | `join`, `style`, `table --print` and `format` print through `tty.Println` / `tty.Writer` | `join`, `style` and `format` use the new writer. `choose` and `table` already printed through a function that strips when stdout is not a terminal; it now also follows `NO_COLOR` and the terminal's depth. |
| `f6dd28e` | `choose`: pagination dots follow the terminal background, asked for with `RequestBackgroundColor` at start (`#847A85`/`#DDDADA` on light, `#979797`/`#3C3C3C` on dark, light until the terminal answers) | Same. The port used the dark colors on every terminal. Tested in a pty with both answers. |
| `f6dd28e` | `input` and `write`: `cursor.TextInput`/`cursor.TextArea` set the cursor color and blink, and `--cursor.mode hide` turns the virtual cursor off | The color and blink were already v2's. `hide` now draws no cursor. Tested in a pty. |
| `e35b18d`, `070426c` (v2.0.1, v2.0.2) | Bubble Tea bumps: a program without input no longer sends capability queries whose replies leak into the shell as raw sequences | `@oakoliver/bubbletea` already has the fix (its 1.2.0 is v2.0.10). `spin` did not use it: with piped stdin it still sent the startup queries. It now runs without input then. Tested in a pty. |

Already equivalent (the port is built on the v2 libraries):

| Upstream | Change | Why nothing was needed |
|---|---|---|
| `f6dd28e` | `tea.KeyMsg` is `tea.KeyPressMsg`; `View()` returns a `tea.View` | The port's Bubble Tea is the v2 API. |
| `f6dd28e` | `WithReportFocus`/`WithAltScreen` move from program options into `View` (`filter`, `input`, `write`, `pager`) | The port sets them on the program already; `filter` is not ported. |
| `f6dd28e` | `textinput`, `textarea`, `viewport`: `SetWidth`, `Height()`, `Styles()`/`SetStyles`, `DefaultKeyMap()` | The port uses Bubbles 1.2.2, which has them. |
| `f6dd28e` | `write`: `OpenInEditor` line number is an `int` | Go typing only; `Ctrl+E` is not ported (see below). |
| `f6dd28e` | `log`: the level-style check compares against `NoColor` instead of `Color("")` | Go typing only. The port's `log` already falls back to the level color. |
| `f6dd28e` | `options.go` of every command: import path only | Confirmed by regenerating `src/help-data.ts` from v2.0.2: only the version in the header changed. |

Go only, nothing to port:

- `4f90464`, `02d6f06`, `4d089f9`, `5adfa5b`: the module is now `charm.land/gum/v2`, Go 1.25.13, v2 releases.
- `b0471e8`, `f3a3f53`, `057099c` (`write` did not compile), lint changes (`//nolint`, preallocation, `fmt.Fprintf` in `completion/zsh.go`): Go build and lint.
- `e7ded30`, `0e98776`, `4a5553e`, `7fafddf`, `dfe6199`, `bff0c85`, `06d72ec`, `b19fc5e`, `ed78cff`, `e4377ba`, `18333af`, `5258988`, `716d8b5`: dependency bumps.
- `845f6b2`, `0ad76ee`, `7423ddf`, `8502bbd`, `30cc516`: dependabot, golangci-lint, issue templates, CODEOWNERS.
- `7871625`, `4409974`, `fc8e9a5`, `dd35798`, `591ded2`: README text (Fedora, `go install`, wording) and comment typos. The port's README has none of the affected lines.

### Not copied

- **Stripping colors when stdout is not a terminal** (from `tty.Writer()`). In upstream v2.0.2 it breaks `$(gum style …)` and `gum format | less -R` ([gum#1127](https://github.com/charmbracelet/gum/issues/1127), [gum#1131](https://github.com/charmbracelet/gum/issues/1131), both open, with a fix proposed in #1134), and composing captured blocks with `gum join` is what this port documents and has examples for. `style`, `join` and `format` keep their colors in a pipe, and follow `NO_COLOR`, `CLICOLOR_FORCE`, `TERM=dumb` and the terminal's depth.
- **`choose` Space key.** Upstream v2.0.2 binds a literal `" "` where Bubble Tea v2 names the key `space`, so Space does not toggle in multi-select ([gum#1143](https://github.com/charmbracelet/gum/issues/1143)). The port binds both; a pty test covers it.

Another upstream v2 bug the port does not have: `table` showing blank rows in interactive mode ([gum#1126](https://github.com/charmbracelet/gum/issues/1126)). The existing pty test checks that every row is drawn.

### Still not ported

- `filter`, which upstream changed only for the v2 API (`ReportFocus` and `AltScreen` in `View`, viewport accessors). Nothing in v2 makes it easier.
- Opening `$EDITOR` with `Ctrl+E` in `write`.
- The `completion`, `man` and `version` subcommands.

### Also fixed

- On Bun 1.4, a command that reads keys from the terminal while its stdin is piped (`printf … | gum choose`) did not exit when the terminal stayed open. It exits now.
- The "keeps its colors" test and the template test no longer depend on the `TERM`/`COLORTERM`/`NO_COLOR` of whoever runs them.

### Tests

64 new tests in `tests/upstream-v2.test.ts`, of which 47 compare against output printed by the real gum v2.0.2 (`tests/fixtures/upstream-v2.0.2-output.json`, from `scripts/gen-upstream-fixtures.ts`). Total 136 (was 72). `scripts/gen-help.ts` now reads v2.0.2.

### Found in the sibling ports, not fixed here

Comparing against the real binary showed where `@oakoliver/lipgloss` 1.1.3 differs from Lip Gloss v2 and colorprofile. Both draw the same, but the bytes differ, so they are for a Lip Gloss sync:

- Downgrading a truecolor to 256 or 16 colors picks the nearest color by RGB distance; Go's picks differently for dark colors (`#112233` becomes 17 in Go, 235 here).
- The profile writer writes `ESC[0m` and one sequence per color; Go writes `ESC[m` and merges them (`38;5;99;40`).
- Go writes the underline attribute twice (`4;4`) for a style with underline.

## 1.1.0

Per-command `--help`, `Ctrl+C` in `input` and `write` exits 130, interactive UIs draw on stderr so `$(gum choose …)` works, keys are read from the terminal when stdin is piped, `format --type` and `style --border` work, `log` keeps key/value pairs, `table --print` prints the table, and `join` is horizontal by default. 1.0.2 dropped the first argument of every command.
