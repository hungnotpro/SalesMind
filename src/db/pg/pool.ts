/**
 * PostgreSQL connection pool factory.
 *
 * Uses the `pg` driver. The application and domain layers must NOT depend
 * on this module directly — they get a `pg.Pool` injected at the
 * repository factory level.
 *
 * Env vars:
 *   DATABASE_URL — PostgreSQL connection string (required)
 *                  e.g. postgres://user:pass@localhost:5432/salesmind
 *   PG_POOL_MAX  — max pool size (default 10)
 */

import pg from 'pg';

export type PgPool = pg.Pool;
export type PgClient = pg.PoolClient;

export interface CreatePoolOptions {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export function createPool(options: CreatePoolOptions): PgPool {
  const { Pool } = pg;
  return new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5000,
  });
}

/**
 * Run a callback inside a transaction. Commits on success, rolls back on failure.
 *
 * The application/domain layer must use this via repository implementations,
 * not directly. This is the single transaction boundary for persistence.
 */
export async function withTransaction<T>(
  pool: PgPool,
  fn: (client: PgClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors; the original error is more informative
    }
    throw err;
  } finally {
    client.release();
  }
}
