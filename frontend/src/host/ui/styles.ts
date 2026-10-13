/**
 * Shared Tailwind class constants.
 *
 * Import these in components rather than duplicating the string, so the
 * focus-visible ring stays consistent across the entire app and any future
 * change only needs updating in one place.
 */

/**
 * Standard visible focus ring for keyboard navigation.
 * Applies only on :focus-visible (keyboard), not on mouse click.
 * Uses the `--focus` token (docs/design-system.md §6).
 */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

/**
 * Primary CTA button/link appearance — dark (`--ink`) filled block.
 * Compose with FOCUS_RING at call sites: `${PRIMARY_CTA} ${FOCUS_RING}`.
 * New code should prefer `<Button variant="primary">`.
 */
export const PRIMARY_CTA =
  'pressable inline-flex items-center justify-center gap-2 min-h-touch px-4 rounded-m bg-ink text-surface font-display text-button-m';

/**
 * Focus-visible ring for text inputs and selects.
 * Uses focus-visible so mouse users never see an outline.
 * Slightly tighter offset than FOCUS_RING to stay inside the input border.
 */
export const FOCUS_RING_INPUT =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-1';
