/**
 * Minimal PostgreSQL connection abstraction used by the API bootstrap.
 *
 * `PgPool` re-exports the type from `db/pg/pool.ts` so callers don't
 * need to know the internal location.
 *
 * The API bootstrap exposes a small structural type (`PgPoolLike`)
 * ONLY for advanced wiring scenarios where a substitute connection
 * is desired. Production wiring uses the concrete `pg.Pool`.
 */

import type { Pool as PgPool } from 'pg';
export type { PgPool };

/**
 * Subset of the `pg.Pool` API used for advanced wiring scenarios
 * (e.g. test doubles). Production wiring uses the concrete `pg.Pool`.
 */
export interface PgPoolLike {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  connect?: () => Promise<unknown>;
  end?: () => Promise<void>;
}

/**
 * Type guard: is the given value a `PgPoolLike`?
 */
export function isPgPoolLike(value: unknown): value is PgPoolLike {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.query === 'function';
}

/**
 * Helper: convert a `pg.Pool` to a `PgPoolLike`. The full `pg.Pool`
 * already satisfies the structural interface; this helper exists
 * primarily for readability.
 */
export function asPgPoolLike(pool: PgPool): PgPoolLike {
  return pool as unknown as PgPoolLike;
}

/**
 * Connect to PostgreSQL from environment variables and return a
 * concrete `pg.Pool`. Production code MUST use this to obtain the
 * real database pool.
 *
 * Re-exported here so the API bootstrap has a single import path.
 */
export { connectFromEnv } from '../db/connect.js';