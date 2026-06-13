/**
 * wait-for-postgres.ts — Poll PostgreSQL until it accepts connections.
 *
 * Windows-safe: no bash/pg_isready dependency. Uses @prisma/adapter-pg + pg
 * directly so the same driver stack as the app is exercised.
 *
 * Usage:
 *   npx tsx scripts/wait-for-postgres.ts [--timeout 60] [--interval 2]
 *
 * Exit codes:
 *   0 — Postgres accepted a connection within the timeout
 *   1 — Timed out
 */

import pg from 'pg';

// ---------------------------------------------------------------------------
// Configuration (pure functions — testable without I/O)
// ---------------------------------------------------------------------------

export interface WaitConfig {
  /** Maximum time to wait in seconds. Default: 60 */
  timeoutSec: number;
  /** Poll interval in seconds. Default: 2 */
  intervalSec: number;
  /** PostgreSQL connection string */
  connectionString: string;
}

export function parseArgs(argv: string[]): Pick<WaitConfig, 'timeoutSec' | 'intervalSec'> {
  let timeoutSec = 60;
  let intervalSec = 2;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--timeout' || arg === '-t') {
      const val = Number(argv[i + 1]);
      if (!Number.isNaN(val) && val > 0) timeoutSec = val;
      i++;
    } else if (arg === '--interval' || arg === '-i') {
      const val = Number(argv[i + 1]);
      if (!Number.isNaN(val) && val > 0) intervalSec = val;
      i++;
    }
  }

  return { timeoutSec, intervalSec };
}

export function buildConfig(argv: string[]): WaitConfig {
  const { timeoutSec, intervalSec } = parseArgs(argv);
  const connectionString =
    process.env.DATABASE_URL ??
    'postgresql://compro:compro@localhost:5433/compro?connection_limit=1';

  return { timeoutSec, intervalSec, connectionString };
}

/** Returns the maximum number of attempts given timeout and interval. */
export function maxAttempts(cfg: Pick<WaitConfig, 'timeoutSec' | 'intervalSec'>): number {
  return Math.ceil(cfg.timeoutSec / cfg.intervalSec);
}

// ---------------------------------------------------------------------------
// I/O — database probe
// ---------------------------------------------------------------------------

async function probe(connectionString: string): Promise<boolean> {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    try {
      await client.end();
    } catch {
      // ignore
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

export async function waitForPostgres(cfg: WaitConfig): Promise<boolean> {
  const attempts = maxAttempts(cfg);
  console.log(
    `[wait-for-postgres] Polling ${cfg.connectionString.replace(/:\/\/[^@]+@/, '://<credentials>@')} — timeout ${cfg.timeoutSec}s (${attempts} attempts at ${cfg.intervalSec}s interval)`,
  );

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ok = await probe(cfg.connectionString);
    if (ok) {
      console.log(`[wait-for-postgres] Ready after ${attempt} attempt(s).`);
      return true;
    }
    console.log(`[wait-for-postgres] Attempt ${attempt}/${attempts} failed — retrying in ${cfg.intervalSec}s...`);
    if (attempt < attempts) {
      await sleep(cfg.intervalSec * 1000);
    }
  }

  console.error(`[wait-for-postgres] ERROR: Postgres not ready after ${cfg.timeoutSec}s.`);
  return false;
}

// ---------------------------------------------------------------------------
// Entry point (only runs when executed directly, not when imported in tests)
// ---------------------------------------------------------------------------

// detect direct execution in ESM
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('wait-for-postgres.ts') ||
    process.argv[1].endsWith('wait-for-postgres.js'));

if (isMain) {
  const cfg = buildConfig(process.argv.slice(2));
  const ok = await waitForPostgres(cfg);
  process.exit(ok ? 0 : 1);
}
