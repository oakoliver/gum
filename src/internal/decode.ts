/**
 * Alignment and border decode utilities.
 * Port of charmbracelet/gum/internal/decode and charmbracelet/gum/style
 */

import { doubleBorder, hiddenBorder, noBorder, normalBorder, roundedBorder, thickBorder } from '@oakoliver/lipgloss';
import type { Border } from '@oakoliver/lipgloss';

/** Map alignment strings to lipgloss Position values. */
export const alignMap: Record<string, number> = {
  center: 0.5,
  left: 0,
  top: 0,
  bottom: 1,
  right: 1,
  middle: 0.5,
};

/** Map border style names to lipgloss borders. */
export const borderMap: Record<string, Border> = {
  double: doubleBorder(),
  hidden: hiddenBorder(),
  none: noBorder,
  normal: normalBorder(),
  rounded: roundedBorder(),
  thick: thickBorder(),
};

/** Map cursor mode strings. */
export const cursorModes: Record<string, string> = {
  blink: 'blink',
  hide: 'hide',
  static: 'static',
};
