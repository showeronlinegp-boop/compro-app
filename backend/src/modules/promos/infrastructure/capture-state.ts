/** Module-level running guard for promo capture operations. */

const running = new Set<string>();

export function isCaptureRunning(superKey: string): boolean {
  return running.has(superKey);
}

export function markCaptureRunning(superKey: string): void {
  running.add(superKey);
}

export function markCaptureDone(superKey: string): void {
  running.delete(superKey);
}
