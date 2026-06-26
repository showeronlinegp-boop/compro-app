/** Round a number to at most 2 decimal places (half-up). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
