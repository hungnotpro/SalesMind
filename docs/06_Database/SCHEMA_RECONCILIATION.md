# Schema Reconciliation: `src/db/schema.sql` vs. Canonical Migrations

This document compares the legacy `src/db/schema.sql` (SM-001 reference
schema, exported as a JavaScript template literal) with the canonical
PostgreSQL migrations under `src/db/migrations/` (introduced in SM-004).

## Source-of-truth decision

- **Canonical schema** = `src/db/migrations/001_base_schema.sql` and
  `src/db/migrations/002_indexes_and_constraints.sql`
- **Legacy reference** = `src/db/schema.sql` (kept for historical
  context; NOT applied at runtime)

For new code, runtime schema, and database operations, follow the
canonical migrations. The legacy file is exported as a JS template
literal but is not fed into PostgreSQL.

## Comparison

| Concern | Legacy `schema.sql` | Canonical migrations | Match? |
|---|---|---|---|
| `messages.conversation_id` | `VARCHAR(255)` (no FK) | `UUID REFERENCES conversations(id) ON DELETE SET NULL` | ❌ Migration is correct; legacy lacks conversation table |
| `conversations` table | **missing** | present with UNIQUE(source, external_conversation_id) | ❌ Legacy missing |
| `customers.normalized_phone` | **missing** | present, indexed | ❌ Migration has it |
| `customers.notes TEXT` | present | **absent** (per spec) | ❌ Removed |
| `customers.verified / confidence` | **missing** | present | ❌ Migration has it |
| `messages` UNIQUE(source, external_message_id) | present | present | ✅ |
| `messages.customer_id` | **missing** | present, FK to customers | ❌ Migration has it |
| `orders.source_message_id` FK to messages | present | present, ON DELETE SET NULL | ✅ |
| `order_items` | present | present, CHECK(quantity > 0) | ✅+ |
| `tasks` `business_key` column | **missing** | present, UNIQUE | ❌ Migration has it |
| `audit_logs` | append-only | append-only | ✅ |
| Indexes on customers, products, orders, etc. | partial | complete per POSTGRESQL_READINESS.md | ⚠ Migration is more thorough |
| `task` `business_key` UNIQUE index | **missing** | present | ❌ Migration has it |
| Schema versioning table | **missing** | present (`schema_migrations`) | ❌ Migration has it |

## Functionally equivalent? No.

`schema.sql` is **functionally divergent** in several important ways:

1. **No conversations table** — the legacy schema has no concept of a
   conversation as a first-class entity. The migration makes it a
   first-class entity with proper FK relationships.

2. **No `customer_id` on messages** — the legacy schema can't link a
   message to a customer at the DB level. The migration adds this.

3. **No `normalized_phone`** — the legacy schema only stores the raw
   phone. The migration adds the normalized form for lookups.

4. **No `verified` / `confidence` on `customers`** — the legacy schema
   has no per-customer confidence or verification state. The migration
   adds both.

5. **No `business_key` UNIQUE on tasks** — the legacy schema only has
   `tasks.id` as a unique key. The migration adds the business-key
   constraint for duplicate task prevention.

6. **`messages.conversation_id` is `VARCHAR(255)`** — Legacy uses a
   string for what should be a UUID FK. Different storage type, no FK.

## Recommendation

1. **Replace `src/db/schema.sql` with a re-export of the canonical
   migrations**, or remove the file entirely. Keeping a divergent
   `schema.sql` is harmful because future contributors may apply it
   to a fresh database and end up with a broken schema.

2. **Migration path**: A fresh database should be created using
   `npm run test:integration` (which runs `runMigrations(pool)`) or
   manually:

   ```bash
   psql -f src/db/migrations/001_base_schema.sql
   psql -f src/db/migrations/002_indexes_and_constraints.sql
   ```

   The migration runner is idempotent and safe to re-run.

3. **Add a CI smoke test** that ensures the migration output is
   functionally equivalent to `src/db/schema.sql` (or removes
   `schema.sql` entirely).

## Status

- ✅ Canonical migrations are the source of truth
- ✅ Migrations applied + verified by 27 integration tests in
  `tests/integration/pg.test.ts`
- ⏳ `src/db/schema.sql` not yet removed (per SM-001 preservation rule)
- ⏳ Reconcile remains a follow-up recommendation