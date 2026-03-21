/**
 * Alignment and border decode utilities.
 * Port of charmbracelet/gum/internal/decode and charmbracelet/gum/style
 */

/** Map alignment strings to lipgloss Position values. */
export const alignMap: Record<string, number> = {
  center: 0.5,
  left: 0,
  top: 0,
  bottom: 1,
  right: 1,
  middle: 0.5,
};

/** Map border style names to lipgloss border getter names. */
export const borderMap: Record<string, string> = {
  double: 'double',
  hidden: 'hidden',
  none: 'none',
  normal: 'normal',
  rounded: 'rounded',
  thick: 'thick',
};

/** Map cursor mode strings. */
export const cursorModes: Record<string, string> = {
  blink: 'blink',
  hide: 'hide',
  static: 'static',
};
