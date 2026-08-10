# PostgreSQL Readiness Report (SM-003.4)

This document captures the canonical domain model and the database design
decisions required to persist the SalesMind active domain in PostgreSQL.

The active domain under `src/domain/entities/` is the **single source of
truth**. The legacy contracts under `packages/domain/src/entities/` are
deprecated and MUST NOT be used by new code or by the PostgreSQL implementation.

---

## 1. Canonical Domain Relationships

```
Customer
  1 ─── N Conversation
  1 ─── N Order

Conversation
  1 ─── N Message

Order
  1 ─── N OrderItem
  1 ─── N Task

Product
  1 ─── N ProductAlias

Customer
  1 ─── N ProductAlias  (customer-specific aliases; product_aliases.customer_id
                          is NULL for global aliases)
```

The Customer.conversationIds string[] on the application side is a convenience
projection. **The persistence model uses a proper foreign-key relationship via
the `conversations` table**, not a text[] column on `customers`.

---

## 2. Required Tables

| Table | Entity | Notes |
|---|---|---|
| `customers` | `Customer` | Source of truth for buyers |
| `conversations` | `Conversation` | First-class conversation thread per source |
| `messages` | `Message` | Immutable inbound message record |
| `products` | `Product` | Catalog items |
| `product_aliases` | `ProductAlias` | Aliases; customer-scoped or global |
| `orders` | `Order` | Commercial transaction header |
| `order_items` | `OrderItem` | Order line items |
| `tasks` | `Task` | Operational actions |
| `audit_logs` | `AuditLog` | Append-only change log |

---

## 3. Primary Keys

All tables use UUID primary keys:

```
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
```

This is consistent with the existing `src/db/schema.sql` (SCHEMA_VERSION 001)
which already uses UUID PKs across all tables.

---

## 4. Foreign Keys

| Table | Column | References | On Delete |
|---|---|---|---|
| `conversations` | `customer_id` | `customers(id)` | `SET NULL` |
| `messages` | `conversation_id` | `conversations(id)` | `SET NULL` |
| `product_aliases` | `product_id` | `products(id)` | `CASCADE` |
| `product_aliases` | `customer_id` | `customers(id)` | `SET NULL` (nullable for global) |
| `orders` | `customer_id` | `customers(id)` | `SET NULL` |
| `orders` | `source_message_id` | `messages(id)` | `SET NULL` |
| `order_items` | `order_id` | `orders(id)` | `CASCADE` |
| `order_items` | `product_id` | `products(id)` | `SET NULL` |
| `tasks` | `order_id` | `orders(id)` | `SET NULL` |
| `tasks` | `source_message_id` | `messages(id)` | `SET NULL` |
| `audit_logs` | `source_message_id` | `messages(id)` | `SET NULL` |

The existing schema in `src/db/schema.sql` already has these FKs except:
- `conversations.customer_id` → currently the schema has
  `messages.conversation_id` referencing `VARCHAR(255)` (not a UUID FK to
  conversations). This MUST be migrated:
  - Add `conversations` table.
  - Migrate `messages.conversation_id` from VARCHAR to UUID FK.

---

## 5. Unique Constraints

| Table | Constraint | Purpose |
|---|---|---|
| `messages` | `UNIQUE(source, external_message_id)` | Idempotency on inbound messages |
| `conversations` | `UNIQUE(source, external_conversation_id)` | Idempotency on inbound conversations |
| `products` | `UNIQUE(sku)` | Catalog dedup |
| `customers` | `UNIQUE(normalized_phone)` | Phone-based idempotency (must add) |
| `product_aliases` | `UNIQUE(normalized_alias, COALESCE(customer_id, 0))` | Global/customer alias dedup |

**Message idempotency** is well-defined: `UNIQUE(source, external_message_id)`
where `external_message_id` is provided by the source.

If the source does not provide an external ID, the application must define
another deterministic idempotency strategy (e.g., a content-hash of canonical
message bytes). **Do not invent a weak hash** — document the chosen strategy
before persisting.

**Customer idempotency** currently has no DB-level uniqueness constraint.
Adding `UNIQUE(normalized_phone)` is recommended; backfill before adding
constraint to avoid migration failure.

---

## 6. Indexes

The existing `src/db/schema.sql` provides:

```
idx_messages_source_external   (source, external_message_id) — covered by UNIQUE
idx_messages_conversation      (conversation_id)
idx_messages_received_at       (received_at)

idx_customers_phone            (phone)
idx_customers_normalized_name  (normalized_name)

idx_products_sku               (sku) — covered by UNIQUE
idx_products_normalized_name   (normalized_name)
idx_products_category          (category)

idx_product_aliases_alias      (alias)
idx_product_aliases_normalized (normalized_alias)
idx_product_aliases_product_id (product_id)
idx_product_aliases_customer_id (customer_id)

idx_orders_source_message      (source_message_id)
idx_orders_customer            (customer_id)
idx_orders_status              (status)
idx_orders_order_date          (order_date)

idx_order_items_order_id       (order_id)
idx_order_items_product_id     (product_id)

idx_tasks_order_id             (order_id)
idx_tasks_type                 (type)
idx_tasks_status               (status)
idx_tasks_due_at               (due_at)
idx_tasks_priority             (priority)

idx_audit_logs_entity          (entity_type, entity_id)
idx_audit_logs_source_message  (source_message_id)
idx_audit_logs_created_at      (created_at)
```

**Additional indexes recommended:**

```
idx_conversations_customer_id       (customer_id)         — for Customer.conversationIds lookup
idx_conversations_source_external   (source, external_conversation_id) — covered by UNIQUE
idx_customers_normalized_phone      (normalized_phone)    — for phone-based resolution
```

---

## 7. Idempotency Constraints

| Concern | Constraint | Notes |
|---|---|---|
| Inbound message dedup | `messages.UNIQUE(source, external_message_id)` | Primary path; well-defined |
| Inbound message dedup (no external_id) | Application-side deterministic hash | **Document strategy before implementing** |
| Inbound conversation dedup | `conversations.UNIQUE(source, external_conversation_id)` | Required |
| Customer dedup | `customers.UNIQUE(normalized_phone)` | Recommended; backfill required |
| Product dedup | `products.UNIQUE(sku)` | Already in schema |
| Alias dedup | partial UNIQUE on (normalized_alias) WHERE customer_id IS NULL plus UNIQUE (normalized_alias, customer_id) WHERE customer_id IS NOT NULL | Recommended |

---

## 8. Check Constraints

| Table | Constraint | Notes |
|---|---|---|
| `order_items` | `quantity > 0` | Already in schema |
| `products` | `default_unit NOT NULL` (length > 0) | Recommended |
| `customer_addresses` | (reserved for future) | When address table is added |

The active domain does not introduce additional check constraints at this stage.
Address-related checks will be added when a dedicated `customer_addresses` table
is introduced (currently addresses live inside the application-side
`Customer.addresses[]` field).

---

## 9. Timestamps

All canonical entities carry `createdAt` / `updatedAt` (Date in TS, TIMESTAMPTZ
in PostgreSQL). The existing schema already provides:

- `messages.created_at`, `messages.updated_at`
- `customers.created_at`, `customers.updated_at`
- `products.created_at`, `products.updated_at`
- `product_aliases.created_at`, `product_aliases.updated_at`
- `orders.created_at`, `orders.updated_at`
- `order_items.created_at`, `order_items.updated_at`
- `tasks.created_at`, `tasks.updated_at`
- `audit_logs.created_at` (no `updated_at` — append-only)

The `update_updated_at_column()` trigger already updates `updated_at` on row
modification across all mutable tables.

The new `conversations` table MUST include `created_at` and `updated_at`
TIMESTAMPTZ columns with the same trigger.

---

## 10. Transaction Boundaries

Recommended transaction boundaries for SM-004 implementation:

| Operation | Boundary |
|---|---|
| Ingest a single message | Begin; INSERT message; INSERT conversation (if new); COMMIT |
| Resolve customer for a message | Same txn as ingest; UPDATE customer or INSERT customer + UPDATE conversations |
| Create order from a processed message | Begin; INSERT order; INSERT order_items; INSERT tasks; COMMIT |
| Resolve product alias | Read-only — no txn required |
| Audit log entry | Same txn as the entity mutation it records |
| Idempotent re-ingest of same message | Single SELECT-by-UNIQUE; no INSERTs; COMMIT |

Each transaction should be as small as possible — avoid holding transactions
across external API calls.

---

## 11. Unresolved Decisions

The following are **explicitly deferred** to SM-004 or later:

1. **`notes` field** — Present in legacy `packages/domain/src/entities/Customer.ts`
   but absent in canonical. **Decision: do NOT add** unless a real use case appears.
2. **CustomerStatus enum** — Active contract uses free-form `string` for `status`.
   **Decision: keep as `string`/`varchar(50)`** until a real enum constraint is required.
3. **Customer.addresses[]** — Currently an in-memory field on the canonical
   Customer. **Decision: defer `customer_addresses` table** until address CRUD is
   actually needed. For MVP, address is captured as a raw value (`rawAddress`) on
   the parsing result.
4. **CustomerAddress FK to Customer** — When the dedicated table is added, it
   MUST FK to `customers(id)` and include its own `is_verified` flag.
5. **Conversation creation flow** — Who creates conversations: the message
   ingest path (auto-create on first message) or an explicit API? **Decision:**
   auto-create in the ingest path for MVP.
6. **Customer ↔ Conversation link** — When does the FK get populated?
   **Decision:** when `CustomerResolutionService` resolves a customer for a
   message, set `conversations.customer_id` in the same transaction.
7. **Customer address persistence** — When the table is added, will it be
   `customer_addresses` separate from `Customer.addresses[]`? **Decision:** yes,
   separate table; in-memory `addresses[]` is a projection.
8. **Message idempotency without external_message_id** — Application-side
   deterministic hash. **Decision: defer** — the canonical model requires
   `external_message_id`; sources that don't provide one are out of MVP scope.

---

## 12. Migration Steps for SM-004

1. Add `conversations` table to `src/db/schema.sql`.
2. Migrate `messages.conversation_id` from VARCHAR to UUID FK to `conversations(id)`.
3. Add `customers.normalized_phone` column (currently only `phone` exists).
4. Backfill `customers.normalized_phone` from `phone` using `normalizePhone()`.
5. Add `UNIQUE(customers.normalized_phone)` after backfill.
6. Add `conversations.customer_id` UUID FK to `customers(id)`.
7. Backfill `conversations.customer_id` from existing conversation data.
8. Add `idx_conversations_customer_id` and `idx_conversations_source_external`.
9. Add update trigger for `conversations.updated_at`.
10. Implement repository classes that consume the canonical domain entities.

---

## 13. What This Document Does NOT Cover

- Connection pooling configuration
- Migration tooling choice (drizzle, prisma, knex, raw SQL)
- Connection string management
- Performance / partitioning decisions
- Backup / replication strategy

These are infrastructure concerns that belong in `docs/06_Database/` once the
infrastructure is chosen.