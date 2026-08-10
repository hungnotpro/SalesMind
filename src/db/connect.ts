/**
 * PostgreSQL connection helper.
 *
 * Reads DATABASE_URL from environment and creates a connection pool.
 * Provides a `checkConnection` helper that returns true if the database
 * is reachable, used by integration tests to skip gracefully.
 */

import { createPool, type PgPool } from './pg/pool.js';
import { runMigrations } from './migrations/runner.js';

export interface ConnectOptions {
  runMigrations?: boolean;
}

export function connectFromEnv(options: ConnectOptions = {}): PgPool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and configure the connection string.'
    );
  }
  const pool = createPool({
    connectionString: url,
    max: process.env.PG_POOL_MAX ? parseInt(process.env.PG_POOL_MAX, 10) : 10,
    idleTimeoutMillis: process.env.PG_POOL_IDLE_TIMEOUT_MS
      ? parseInt(process.env.PG_POOL_IDLE_TIMEOUT_MS, 10)
      : 30000,
    connectionTimeoutMillis: process.env.PG_POOL_CONNECTION_TIMEOUT_MS
      ? parseInt(process.env.PG_POOL_CONNECTION_TIMEOUT_MS, 10)
      : 5000
  });
  return pool;
}

export async function connectAndMigrateFromEnv(): Promise<PgPool> {
  const pool = connectFromEnv();
  await runMigrations(pool);
  return pool;
}

/**
 * Check if PostgreSQL is reachable. Returns false on any connection error.
 * Used by integration tests to skip gracefully when PostgreSQL is unavailable.
 */
export async function isPostgresAvailable(pool: PgPool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
