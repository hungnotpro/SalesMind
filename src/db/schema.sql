/**
 * Database schema for SalesMind.
 * 
 * This defines the core tables needed for SM-001 Message-to-Order Extraction.
 */

export const SCHEMA_VERSION = '001';

/**
 * SQL statements for creating the schema.
 */
export const CREATE_SCHEMA_SQL = `
-- SalesMind OS Database Schema v${SCHEMA_VERSION}
-- For SM-001 Message-to-Order Extraction

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source VARCHAR(50) NOT NULL,
    external_message_id VARCHAR(255) NOT NULL,
    conversation_id VARCHAR(255),
    sender_name VARCHAR(255),
    sender_phone VARCHAR(20),
    received_at TIMESTAMPTZ NOT NULL,
    raw_text TEXT NOT NULL,
    metadata_json JSONB,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint for idempotency
    CONSTRAINT messages_source_external_unique UNIQUE (source, external_message_id)
);

-- Index for message lookups
CREATE INDEX IF NOT EXISTS idx_messages_source_external ON messages (source, external_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages (received_at);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for customer lookups
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_normalized_name ON customers (normalized_name);

-- Products table
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

-- Index for product lookups
CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku);
CREATE INDEX IF NOT EXISTS idx_products_normalized_name ON products (normalized_name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- Product aliases table
CREATE TABLE IF NOT EXISTS product_aliases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    alias VARCHAR(255) NOT NULL,
    normalized_alias VARCHAR(255) NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'global',
    verified BOOLEAN NOT NULL DEFAULT false,
    confidence DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for alias lookups
CREATE INDEX IF NOT EXISTS idx_product_aliases_alias ON product_aliases (alias);
CREATE INDEX IF NOT EXISTS idx_product_aliases_normalized ON product_aliases (normalized_alias);
CREATE INDEX IF NOT EXISTS idx_product_aliases_product_id ON product_aliases (product_id);
CREATE INDEX IF NOT EXISTS idx_product_aliases_customer_id ON product_aliases (customer_id);

-- Orders table
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

-- Index for order lookups
CREATE INDEX IF NOT EXISTS idx_orders_source_message ON orders (source_message_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders (order_date);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    raw_product_name VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,3) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    resolution_status VARCHAR(50) NOT NULL DEFAULT 'needs_review',
    resolution_confidence DECIMAL(3,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure positive quantity
    CONSTRAINT order_items_positive_quantity CHECK (quantity > 0)
);

-- Index for order item lookups
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);

-- Tasks table
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
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for task lookups
CREATE INDEX IF NOT EXISTS idx_tasks_order_id ON tasks (order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks (type);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks (due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);

-- Audit logs table
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

-- Index for audit log lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_source_message ON audit_logs (source_message_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_aliases_updated_at BEFORE UPDATE ON product_aliases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

/**
 * Seed data for testing and development.
 */
export const SEED_DATA_SQL = `
-- Insert sample products for "55 bơ" and similar
INSERT INTO products (id, sku, name, normalized_name, category, default_unit, active)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'BUN01', 'Bánh bao nhân bơ', 'banh bao nhan bo', 'bánh bao', 'cái', true),
    ('22222222-2222-2222-2222-222222222222', 'BUN02', 'Bánh bao nhân thịt', 'banh bao nhan thit', 'bánh bao', 'cái', true),
    ('33333333-3333-3333-3333-333333333333', 'BUN03', 'Bánh bao nhân đậu xanh', 'banh bao nhan dau xanh', 'bánh bao', 'cái', true)
ON CONFLICT (sku) DO NOTHING;

-- Insert sample product aliases
INSERT INTO product_aliases (product_id, alias, normalized_alias, source, verified, confidence)
VALUES
    ('11111111-1111-1111-1111-111111111111', '55 bơ', '55 bo', 'global', true, 1.0),
    ('11111111-1111-1111-1111-111111111111', 'banh 55 bo', 'banh 55 bo', 'global', true, 0.95),
    ('22222222-2222-2222-2222-222222222222', '55 thịt', '55 thit', 'global', true, 1.0),
    ('33333333-3333-3333-3333-333333333333', '55 đậu', '55 dau', 'global', true, 1.0)
ON CONFLICT DO NOTHING;
`;
