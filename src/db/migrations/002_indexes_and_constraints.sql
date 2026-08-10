-- SalesMind OS Migration 002: Indexes and Constraints
-- Author: SM-004
-- Purpose: Add all required indexes from POSTGRESQL_READINESS.md
--
-- Indexes:
--   customers.normalized_phone
--   customers.normalized_name
--   conversations.external_conversation_id  (covered by UNIQUE)
--   conversations.customer_id
--   messages.external_message_id            (covered by UNIQUE)
--   messages.conversation_id
--   messages.customer_id
--   orders.customer_id
--   order_items.order_id
--   order_items.product_id
--   tasks.order_id
--   tasks.business_key (UNIQUE composite)
--   tasks.customer_id (derived from order_id)

-- ============================================================
-- customers indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_customers_normalized_phone ON customers (normalized_phone);
CREATE INDEX IF NOT EXISTS idx_customers_normalized_name ON customers (normalized_name);

-- ============================================================
-- conversations indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations (customer_id);
-- (source, external_conversation_id) covered by UNIQUE constraint

-- ============================================================
-- products indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_normalized_name ON products (normalized_name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- ============================================================
-- product_aliases indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_product_aliases_alias ON product_aliases (alias);
CREATE INDEX IF NOT EXISTS idx_product_aliases_normalized ON product_aliases (normalized_alias);
CREATE INDEX IF NOT EXISTS idx_product_aliases_product_id ON product_aliases (product_id);
CREATE INDEX IF NOT EXISTS idx_product_aliases_customer_id ON product_aliases (customer_id);

-- ============================================================
-- messages indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_customer_id ON messages (customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages (received_at);
-- (source, external_message_id) covered by UNIQUE constraint

-- ============================================================
-- orders indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_source_message_id ON orders (source_message_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders (order_date);

-- ============================================================
-- order_items indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);

-- ============================================================
-- tasks indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_order_id ON tasks (order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks (type);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks (due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);
-- Business key uniqueness prevents duplicate task creation on re-processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_business_key_unique ON tasks (business_key);

-- ============================================================
-- audit_logs indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_source_message ON audit_logs (source_message_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);

-- ============================================================
-- Schema version
-- ============================================================
INSERT INTO schema_migrations (version, description)
VALUES ('002', 'Indexes and uniqueness constraints')
ON CONFLICT (version) DO NOTHING;
