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
 * Uses indigo-400 to match the existing indigo interaction palette.
 */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2';

/**
 * Primary CTA button/link appearance — indigo filled pill.
 * Compose with FOCUS_RING at call sites: `${PRIMARY_CTA} ${FOCUS_RING}`
 */
export const PRIMARY_CTA =
  'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors';

/**
 * Focus-visible ring for text inputs and selects.
 * Uses focus-visible so mouse users never see an outline.
 * Slightly tighter offset than FOCUS_RING to stay inside the input border.
 */
export const FOCUS_RING_INPUT =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1';
