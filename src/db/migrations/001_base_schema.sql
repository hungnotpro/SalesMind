-- SalesMind OS Migration 001: Base Schema
-- Author: SM-004
-- Purpose: Introduce canonical base schema per docs/06_Database/POSTGRESQL_READINESS.md
--
-- Tables:
--   customers
--   conversations
--   products
--   product_aliases
--   messages
--   orders
--   order_items
--   tasks
--   audit_logs
--
-- Migration order respects foreign keys:
--   customers (no FK)
--   conversations (FK -> customers)
--   products (no FK)
--   product_aliases (FK -> products, customers)
--   messages (FK -> conversations, customers)
--   orders (FK -> customers, messages)
--   order_items (FK -> orders, products)
--   tasks (FK -> orders, messages)
--   audit_logs (FK -> messages)

-- ============================================================
-- customers
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    normalized_phone VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    verified BOOLEAN NOT NULL DEFAULT false,
    confidence DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source VARCHAR(50) NOT NULL,
    external_conversation_id VARCHAR(255) NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    title VARCHAR(255),
    metadata_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT conversations_source_external_unique UNIQUE (source, external_conversation_id)
);

-- ============================================================
-- products
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    default_unit VARCHAR(50) NOT NULL DEFAULT 'cái',
    packaging VARCHAR(100),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- product_aliases
-- ============================================================
CREATE TABLE IF NOT EXISTS product_aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    alias VARCHAR(255) NOT NULL,
    normalized_alias VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'global',
    verified BOOLEAN NOT NULL DEFAULT false,
    confidence DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source VARCHAR(50) NOT NULL,
    external_message_id VARCHAR(255) NOT NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    sender_name VARCHAR(255),
    sender_phone VARCHAR(50),
    received_at TIMESTAMPTZ NOT NULL,
    raw_text TEXT NOT NULL,
    metadata_json JSONB,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT messages_source_external_unique UNIQUE (source, external_message_id)
);

-- ============================================================
-- orders
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    order_number VARCHAR(50),
    order_date DATE NOT NULL,
    requested_delivery_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    discount_rate DECIMAL(5,4),
    discount_source VARCHAR(255),
    payment_method VARCHAR(50),
    payment_source VARCHAR(255),
    invoice_required BOOLEAN NOT NULL DEFAULT false,
    invoice_due_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- order_items
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    raw_product_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    normalized_unit VARCHAR(50),
    resolution_status VARCHAR(50) NOT NULL DEFAULT 'needs_review',
    resolution_confidence DECIMAL(5,4),
    match_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT order_items_positive_quantity CHECK (quantity > 0)
);

-- ============================================================
-- tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id VARCHAR(100),
    priority VARCHAR(20) NOT NULL DEFAULT 'normal',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    due_at TIMESTAMPTZ,
    business_key VARCHAR(255) NOT NULL,
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_type VARCHAR(50) NOT NULL,
    actor_id VARCHAR(100),
    before_data JSONB,
    after_data JSONB,
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Schema version
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(20) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    description TEXT
);

INSERT INTO schema_migrations (version, description)
VALUES ('001', 'Base schema (customers, conversations, products, product_aliases, messages, orders, order_items, tasks, audit_logs)')
ON CONFLICT (version) DO NOTHING;
