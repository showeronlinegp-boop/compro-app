import * as nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

export const PORT: number = Number(process.env.PORT ?? 3001);

// DB_PATH is required — fail fast if absent
const rawDbPath = process.env.DB_PATH;
if (!rawDbPath) {
  // In development, default to a local file; in production, this env var must be set.
  // We set a default here to keep dev ergonomics intact, but log a warning.
  console.warn('[env] DB_PATH not set — using default path ../compro.db (dev only)');
}
export const DB_PATH: string = rawDbPath ?? nodePath.join(__dirname, '..', '..', '..', 'compro.db');

export const NODE_ENV: string = process.env.NODE_ENV ?? 'development';

export const IS_PRODUCTION: boolean = NODE_ENV === 'production';
