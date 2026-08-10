/**
 * Migration runner.
 *
 * Discovers SQL files from src/db/migrations/ in lexicographic order (zero-padded
 * filenames like 001_, 002_) and applies any migration whose version is not
 * already tracked in `schema_migrations`.
 *
 * Migrations are designed to be idempotent (CREATE TABLE IF NOT EXISTS,
 * CREATE INDEX IF NOT EXISTS) so a partially-applied migration can be resumed.
 *
 * Usage:
 *   await runMigrations(pool);
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PgPool } from '../pg/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

export interface MigrationSummary {
  applied: string[];
  skipped: string[];
}

/**
 * Apply any pending migrations to the database.
 */
export async function runMigrations(pool: PgPool): Promise<MigrationSummary> {
  const summary: MigrationSummary = { applied: [], skipped: [] };

  // Find SQL files
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic: 001_... < 002_...

  if (files.length === 0) {
    return summary;
  }

  // Ensure schema_migrations exists before we read it
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(20) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      description TEXT
    );
  `);

  const appliedSet = new Set<string>(await getAppliedVersions(pool));

  for (const file of files) {
    const version = file.split('_')[0] ?? file;
    if (appliedSet.has(version)) {
      summary.skipped.push(file);
      continue;
    }

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await pool.query(sql);
      summary.applied.push(file);
    } catch (err) {
      throw new Error(
        `Migration ${file} failed: ${(err as Error).message}`
      );
    }
  }

  return summary;
}

async function getAppliedVersions(pool: PgPool): Promise<string[]> {
  const result = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC'
  );
  return result.rows.map((r) => r.version);
}
