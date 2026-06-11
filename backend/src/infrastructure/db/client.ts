import Database from 'better-sqlite3';
import { registerDbFunctions } from './functions.js';

let _closeHandlersInstalled = false;

/**
 * Create and configure a better-sqlite3 Database instance.
 * - Enables WAL journal mode for better concurrent read performance.
 * - Enables foreign key enforcement.
 * - Registers custom SQL functions (e.g. norm() for accent/punctuation-insensitive search).
 * - Registers SIGINT/SIGTERM/exit close handlers exactly once per process.
 */
export function createDb(path: string): Database.Database {
  const db = new Database(path);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  registerDbFunctions(db);

  if (!_closeHandlersInstalled) {
    _closeHandlersInstalled = true;

    const closeDb = () => {
      try {
        db.close();
      } catch {
        // ignore — already closed
      }
    };

    process.once('exit', closeDb);
    process.once('SIGINT', () => {
      closeDb();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      closeDb();
      process.exit(0);
    });
  }

  return db;
}
