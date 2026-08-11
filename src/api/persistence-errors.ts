/**
 * Database persistence error helpers.
 *
 * The API layer detects PostgreSQL UNIQUE constraint violations
 * (SQLSTATE 23505) without depending on the `pg` library directly.
 * This keeps the API layer free of database-specific imports while
 * still being able to detect the idempotency race condition.
 *
 * `pg` errors carry:
 *   - code:        '23505' (SQLSTATE)
 *   - constraint:  the constraint name (e.g. 'messages_source_external_unique')
 *   - table:       the table name (e.g. 'messages')
 *   - detail:      human-readable detail string
 *
 * Other adapters (e.g. a future pooler) should expose the same fields.
 */

export interface UniqueConstraintError {
  code: string;
  constraint?: string;
  table?: string;
  detail?: string;
}

/**
 * Predicate: does the given error represent a PostgreSQL UNIQUE
 * constraint violation?
 */
export function isUniqueViolation(err: unknown): err is UniqueConstraintError {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  // PostgreSQL standard SQLSTATE
  if (e.code === '23505') return true;
  // Some pg-like libraries nest code inside `code` or expose it directly
  const nested = (e as { cause?: { code?: string } }).cause;
  if (nested?.code === '23505') return true;
  return false;
}