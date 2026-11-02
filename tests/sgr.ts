/**
 * Compares styled output without depending on how SGR sequences are packed.
 * Lip Gloss v2 ends a style with `ESC[m` and writes one sequence per run of
 * attributes; the color profile writer in @oakoliver/lipgloss writes `ESC[0m`
 * and one per color. Both draw the same, so tests compare the merged form.
 */
export function normalizeSgr(s: string): string {
  let out = s.replaceAll("\x1b[0m", "\x1b[m");
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(/\x1b\[([0-9;]+)m\x1b\[([0-9;]+)m/, "\x1b[$1;$2m");
  }
  return out;
}
