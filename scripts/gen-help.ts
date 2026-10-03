/**
 * Generates src/help-data.ts: per-command help built from upstream gum
 * v0.17.0's kong option structs, limited to what this port implements.
 *
 *   bun scripts/gen-help.ts
 *
 * A flag is listed only if its command's source reads it, an env var only if
 * the source reads that variable, and a default comes from the port's own
 * flagStr/flagInt/flagBool/flagWithEnv call when it is a literal, else from
 * upstream.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TAG = 'v0.17.0';
const ROOT = join(import.meta.dir, '..');
const COMMANDS = ['choose', 'confirm', 'file', 'format', 'input', 'join', 'log', 'pager', 'spin', 'style', 'table', 'write'];

// kong.Vars from upstream main.go.
const VARS: Record<string, string> = {
  defaultHeight: '0', defaultWidth: '0', defaultAlign: 'left', defaultBorder: 'none',
  defaultBorderForeground: '', defaultBorderBackground: '', defaultBackground: '',
  defaultForeground: '', defaultMargin: '0 0', defaultPadding: '0 0', defaultUnderline: 'false',
  defaultBold: 'false', defaultFaint: 'false', defaultItalic: 'false', defaultStrikethrough: 'false',
};

const fetchText = async (path: string) => {
  const res = await fetch(`https://raw.githubusercontent.com/charmbracelet/gum/${TAG}/${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
};

const kebab = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();

const tag = (tags: string, key: string) => tags.match(new RegExp(`(?:^|\\s)${key}:"((?:[^"\\\\]|\\\\.)*)"`))?.[1];

interface Field { name: string; type: string; tags: string }

function structFields(go: string, struct: string): Field[] {
  const body = go.match(new RegExp(`type ${struct} struct \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
  const fields: Field[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(\w+)\s+([\w.[\]]+)\s+`([^`]*)`/);
    if (m) fields.push({ name: m[1], type: m[2], tags: m[3] });
  }
  return fields;
}

const source = readdirSync(join(ROOT, 'src'), { recursive: true })
  .filter((f) => String(f).endsWith('.ts'))
  .map((f) => readFileSync(join(ROOT, 'src', String(f)), 'utf8'))
  .join('\n');

function portDefault(cmdSource: string, flag: string): string | undefined {
  const m = cmdSource.match(new RegExp(`flag(?:Str|Int|Bool)\\(flags, '${flag.replace('.', '\\.')}', ([^)]+)\\)`))
    ?? cmdSource.match(new RegExp(`flagWithEnv\\(flags, '${flag.replace('.', '\\.')}', '[^']*', ([^)]+)\\)`));
  if (!m) return undefined;
  const lit = m[1].trim();
  if (/^'.*'$/.test(lit)) return lit.slice(1, -1);
  if (/^(true|false|-?\d+)$/.test(lit)) return lit;
  return undefined;
}

const valueName = (type: string) =>
  type === 'bool' ? undefined
    : type === 'int' ? 'INT'
    : type === 'time.Duration' ? 'DURATION'
    : type.startsWith('[]') ? 'STRING,...'
    : 'STRING';

const top = await fetchText('gum.go');
const styleFlags = structFields(await fetchText('style/options.go'), 'Styles').map((f) => ({
  name: kebab(f.name),
  value: valueName(f.type),
  help: tag(f.tags, 'help') ?? '',
  default: tag(f.tags, 'default')?.replace(/\$\{(\w+)\}/g, (_, v) => VARS[v] ?? '') || undefined,
  enum: tag(f.tags, 'enum'),
}));
const out: Record<string, unknown> = {};

for (const cmd of COMMANDS) {
  const go = await fetchText(`${cmd}/options.go`);
  const cmdSource = readFileSync(join(ROOT, 'src', 'commands', `${cmd}.ts`), 'utf8');
  const summary = top.match(new RegExp(`\\b\\w+\\s+${cmd}\\.Options\\s+\`[^\`]*help:"([^"]*)"`))?.[1] ?? '';
  const args: { name: string; help: string }[] = [];
  const flags: Record<string, unknown>[] = [];
  const styles: string[] = [];

  for (const f of structFields(go, 'Options')) {
    if (tag(f.tags, 'embed') !== undefined) {
      const prefix = tag(f.tags, 'prefix');
      if (tag(f.tags, 'hidden') !== undefined) continue;
      // Listed only if the command really reads them: unprefixed style flags
      // directly, prefixed ones through extractStyleOptions.
      if (!prefix) {
        if (/flag\w*\(flags, 'foreground'|flags\['foreground'\]/.test(cmdSource)) styles.push('');
      } else if (cmdSource.includes(`extractStyleOptions(flags, '${prefix.replace(/\.$/, '')}'`)) {
        styles.push(prefix);
      }
      continue;
    }
    if (tag(f.tags, 'hidden') !== undefined) continue;
    const help = tag(f.tags, 'help') ?? '';
    if (tag(f.tags, 'arg') !== undefined) {
      const name = tag(f.tags, 'name') ?? kebab(f.name);
      const many = f.type.startsWith('[]') ? ' ...' : '';
      const optional = tag(f.tags, 'optional') !== undefined;
      args.push({ name: optional ? `[<${name}>${many}]` : `<${name}>${many}`, help });
      continue;
    }
    const name = (tag(f.tags, 'prefix') ?? '') + (tag(f.tags, 'name') ?? kebab(f.name));
    const read = cmdSource.includes(`'${name}'`)
      || (name === 'timeout' && /runProgram|'timeout'/.test(cmdSource));
    if (!read) continue;
    const env = tag(f.tags, 'env');
    const upstreamDefault = tag(f.tags, 'default')?.replace(/\$\{(\w+)\}/g, (_, v) => VARS[v] ?? '');
    flags.push({
      name,
      short: tag(f.tags, 'short'),
      value: valueName(f.type),
      help,
      default: portDefault(cmdSource, name) ?? upstreamDefault,
      env: env && source.includes(`'${env}'`) ? env : undefined,
      negatable: tag(f.tags, 'negatable') !== undefined || undefined,
      enum: tag(f.tags, 'enum'),
    });
  }
  out[cmd] = { summary, args, flags, styles };
}

writeFileSync(
  join(ROOT, 'src', 'help-data.ts'),
  `// Generated by scripts/gen-help.ts from gum ${TAG}; do not edit.\n` +
    `import type { CommandHelp, StyleFlagHelp } from './help.js';\n\n` +
    `export const STYLE_FLAGS: StyleFlagHelp[] = ${JSON.stringify(styleFlags, null, 2)};\n\n` +
    `export const COMMAND_HELP: Record<string, CommandHelp> = ${JSON.stringify(out, null, 2)};\n`,
);
console.log('wrote src/help-data.ts');
