/**
 * Thin console wrapper with a [tag] prefix.
 * Structured logging is deferred (non-goal for this migration).
 */

export function createLogger(tag: string) {
  return {
    log: (...args: unknown[]) => console.log(`[${tag}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[${tag}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${tag}]`, ...args),
  };
}

/** Default module-level logger */
export const logger = createLogger('app');
