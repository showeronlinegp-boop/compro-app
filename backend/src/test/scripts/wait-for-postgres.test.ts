/**
 * Unit tests for wait-for-postgres.ts — covers pure parsing/timeout logic.
 * No I/O, no DB connection. The probe function itself is integration-tested
 * implicitly by the ETL and dev workflow.
 */

import { describe, it, expect } from 'vitest';
import { parseArgs, buildConfig, maxAttempts } from '../../../scripts/wait-for-postgres.js';

describe('parseArgs', () => {
  it('returns defaults when no args provided', () => {
    const result = parseArgs([]);
    expect(result.timeoutSec).toBe(60);
    expect(result.intervalSec).toBe(2);
  });

  it('parses --timeout flag', () => {
    const result = parseArgs(['--timeout', '30']);
    expect(result.timeoutSec).toBe(30);
  });

  it('parses -t shorthand', () => {
    const result = parseArgs(['-t', '45']);
    expect(result.timeoutSec).toBe(45);
  });

  it('parses --interval flag', () => {
    const result = parseArgs(['--interval', '5']);
    expect(result.intervalSec).toBe(5);
  });

  it('parses -i shorthand', () => {
    const result = parseArgs(['-i', '3']);
    expect(result.intervalSec).toBe(3);
  });

  it('parses both flags together', () => {
    const result = parseArgs(['--timeout', '120', '--interval', '10']);
    expect(result.timeoutSec).toBe(120);
    expect(result.intervalSec).toBe(10);
  });

  it('ignores NaN values and uses defaults', () => {
    const result = parseArgs(['--timeout', 'abc', '--interval', 'xyz']);
    expect(result.timeoutSec).toBe(60);
    expect(result.intervalSec).toBe(2);
  });

  it('ignores zero values and uses defaults', () => {
    const result = parseArgs(['--timeout', '0', '--interval', '0']);
    expect(result.timeoutSec).toBe(60);
    expect(result.intervalSec).toBe(2);
  });

  it('ignores negative values and uses defaults', () => {
    const result = parseArgs(['--timeout', '-5']);
    expect(result.timeoutSec).toBe(60);
  });
});

describe('maxAttempts', () => {
  it('calculates attempts from timeout and interval', () => {
    expect(maxAttempts({ timeoutSec: 60, intervalSec: 2 })).toBe(30);
  });

  it('rounds up when not evenly divisible', () => {
    expect(maxAttempts({ timeoutSec: 10, intervalSec: 3 })).toBe(4); // ceil(10/3) = 4
  });

  it('handles interval equal to timeout', () => {
    expect(maxAttempts({ timeoutSec: 5, intervalSec: 5 })).toBe(1);
  });

  it('handles timeout smaller than interval', () => {
    // ceil(1/5) = 1 — at least one attempt
    expect(maxAttempts({ timeoutSec: 1, intervalSec: 5 })).toBe(1);
  });
});

describe('buildConfig', () => {
  it('includes connectionString from env', () => {
    const originalUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5433/testdb';
    const cfg = buildConfig([]);
    expect(cfg.connectionString).toBe('postgresql://test:test@localhost:5433/testdb');
    if (originalUrl !== undefined) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it('uses default connectionString when DATABASE_URL is not set', () => {
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const cfg = buildConfig([]);
    expect(cfg.connectionString).toContain('localhost:5433');
    if (originalUrl !== undefined) {
      process.env.DATABASE_URL = originalUrl;
    }
  });

  it('forwards parsed timeout/interval', () => {
    const cfg = buildConfig(['--timeout', '90', '--interval', '3']);
    expect(cfg.timeoutSec).toBe(90);
    expect(cfg.intervalSec).toBe(3);
  });
});
