# @oakoliver/gum

A tool for glamorous shell scripts. A TypeScript port of [charmbracelet/gum](https://github.com/charmbracelet/gum).

Built on [@oakoliver/bubbletea](https://www.npmjs.com/package/@oakoliver/bubbletea), [@oakoliver/bubbles](https://www.npmjs.com/package/@oakoliver/bubbles), [@oakoliver/lipgloss](https://www.npmjs.com/package/@oakoliver/lipgloss), and [@oakoliver/glamour](https://www.npmjs.com/package/@oakoliver/glamour). Runs on Node.js and Bun.

## Install

```bash
npm install -g @oakoliver/gum
# or run it without installing
npx @oakoliver/gum choose "Yes" "No"
```

## Commands

| Command | Description |
|---------|-------------|
| [`choose`](#choose) | Choose option(s) from a list |
| [`confirm`](#confirm) | Ask a user to confirm an action |
| [`file`](#file) | Pick a file from a folder |
| [`format`](#format) | Format text as markdown, code, emoji, or a template |
| [`input`](#input) | Prompt for a single line of input |
| [`join`](#join) | Join text vertically or horizontally |
| [`log`](#log) | Log a message with a level |
| [`pager`](#pager) | Scroll through content |
| [`spin`](#spin) | Display a spinner while running a command |
| [`style`](#style) | Apply colors, borders, and spacing to text |
| [`table`](#table) | Display and select rows from CSV data |
| [`write`](#write) | Prompt for multi-line input |

`filter` from upstream gum is not implemented yet.

Interactive commands print the result to stdout, so they compose with shell scripts. Pressing `Ctrl+C` or `Esc` aborts with exit code `130`.

### choose

Choose one option, or several with `--limit` / `--no-limit`. Options come from arguments or from stdin, one per line.

```bash
gum choose "fix" "feat" "docs" "refactor"
gum choose --limit 2 Bubbletea Lipgloss Glamour Huh
ls | gum choose --no-limit --header "Files to delete"
```

Flags: `--limit` (default `1`), `--no-limit`, `--ordered`, `--height` (default `10`), `--cursor` (default `"> "`), `--header`, `--selected` (preselected options, comma-separated), `--selected.prefix`, `--unselected.prefix`, `--select-if-one`, plus style flags for `cursor`, `header`, `item`, and `selected` (for example `--cursor.foreground 212`).

### confirm

Exits `0` for the affirmative answer and `1` for the negative one.

```bash
gum confirm "Commit changes?" && git commit -m "$SUMMARY"
```

Flags: `--affirmative` (default `Yes`), `--negative` (default `No`), `--default` (default `true`), `--prompt`.

### file

Browse a directory and print the chosen path.

```bash
$EDITOR "$(gum file ./src)"
```

Flags: `--path` (default `.`), `--all` (show hidden files), `--file` (default `true`), `--directory`, `--height` (default `10`), `--cursor`, `--header`, `--padding`, `--permissions` (default `true`), `--size` (default `true`), `--show-help` (default `true`).

### format

Render text from arguments or stdin.

```bash
gum format -- "# Release notes" "- Faster *rendering*" "- Fewer bugs"
echo 'Hello {{ .Env.USER }}' | gum format --type template
echo "Shipped :rocket:" | gum format --type emoji
cat main.go | gum format --type code --language go
```

Flags: `--type` (`markdown` (default), `code`, `emoji`, `template`), `--theme` (default `dark`), `--language`. Templates support `{{ .Env.NAME }}` substitution; emoji covers common shortcodes.

### input

```bash
NAME=$(gum input --placeholder "Your name")
TOKEN=$(gum input --password)
```

Flags: `--placeholder` (env `GUM_INPUT_PLACEHOLDER`), `--prompt` (env `GUM_INPUT_PROMPT`), `--value`, `--char-limit` (default `400`), `--width`, `--password`, `--header`, `--cursor.foreground`.

### join

```bash
gum join --horizontal "$(gum style --padding "1 2" Left)" "$(gum style --padding "1 2" Right)"
```

Flags: `--horizontal` (default is vertical), `--align` (`left`, `center`, `right`, `top`, `bottom`).

### log

```bash
gum log --level error "Deploy failed" region eu-west-1 attempt 3
gum log --structured --formatter json --level info "Started" port 8080
```

Flags: `--level` (`debug`, `info` (default), `warn`, `error`, `fatal`, `none`), `--formatter` (`text` (default), `json`, `logfmt`), `--structured`, `--prefix`, `--time` (a time format), `--file` (append to a file).

### pager

```bash
gum pager < CHANGELOG.md
```

Flags: `--show-line-numbers` (default `true`), `--soft-wrap` (default `true`), `--border-foreground` (default `212`), `--line-number.foreground`, `--match-highlight.*` style flags.

### spin

Runs the command after `--` and shows a spinner until it exits.

```bash
gum spin --spinner moon --title "Installing..." -- npm install
gum spin --show-output --title "Testing..." -- bun test
```

Flags: `--spinner` (`dot` (default), `line`, `minidot`, `jump`, `pulse`, `points`, `globe`, `moon`, `monkey`, `meter`, `hamburger`), `--title` (default `Loading...`), `--align`, `--show-output`.

### style

```bash
gum style --foreground 212 --border-foreground 212 --border double \
  --align center --width 50 --margin "1 2" --padding "2 4" \
  "Bubble Gum (1¢)" "So sweet and so fresh!"
```

Flags: `--foreground`, `--background`, `--border` (`normal`, `rounded`, `double`, `thick`, `hidden`, `none`), `--border-foreground`, `--border-background`, `--align`, `--width`, `--height`, `--margin`, `--padding`, `--bold`, `--faint`, `--italic`, `--strikethrough`, `--underline`.

### table

Shows CSV from stdin or `--file`, and prints the selected row.

```bash
gum table --file flavors.csv --widths 12,8
cat data.csv | gum table --print
```

Flags: `--file`, `--separator` (default `,`), `--columns`, `--widths`, `--height`, `--print` (print the table without selecting), `--return-column`, `--show-help` (default `true`).

### write

```bash
gum write --placeholder "Details of this change" > body.txt
```

Flags: `--placeholder` (env `GUM_WRITE_PLACEHOLDER`), `--value`, `--char-limit` (default `400`), `--width`, `--height` (default `10`), `--show-line-numbers`, `--prompt`, `--header`, `--cursor.foreground`.

## Known issues in 1.0.2

- The CLI drops the first argument after the command name (`src/cli.ts` passes `args.slice(1)` to a parser that also skips the command), so `gum join A B C` prints only `B` and `C`, and a leading flag like `gum style --foreground 212 ...` is ignored.
- `gum style --border` draws no border (`src/style.ts` passes the border name instead of a border).
- `gum format --type` is ignored and input is always rendered as markdown.
- `gum log` drops key/value pairs, and `gum table --print` prints only the header row.
- Interactive commands (`choose`, `input`, `confirm`, `spin`, …) leave stale lines when they redraw, because of an off-by-one in the inline renderer of @oakoliver/bubbletea.

## Library use

Each command is also exported as a function that takes parsed arguments:

```typescript
import { parseArgs, runStyle } from '@oakoliver/gum';

await runStyle(parseArgs(['style', '--foreground', '212', 'Hello']));
```

## Part of the Charm Ecosystem for TypeScript

| Package | Description |
|---------|-------------|
| [@oakoliver/lipgloss](https://www.npmjs.com/package/@oakoliver/lipgloss) | CSS-like terminal styling |
| [@oakoliver/bubbletea](https://www.npmjs.com/package/@oakoliver/bubbletea) | Elm Architecture TUI framework |
| [@oakoliver/bubbles](https://www.npmjs.com/package/@oakoliver/bubbles) | TUI components |
| [@oakoliver/glamour](https://www.npmjs.com/package/@oakoliver/glamour) | Terminal markdown rendering |
| [@oakoliver/huh](https://www.npmjs.com/package/@oakoliver/huh) | Terminal forms and prompts |
| [@oakoliver/glow](https://www.npmjs.com/package/@oakoliver/glow) | Terminal markdown reader |
| [@oakoliver/vhs](https://www.npmjs.com/package/@oakoliver/vhs) | Terminal recordings from `.tape` files |

## License

MIT
