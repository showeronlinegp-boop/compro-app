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
