# SalesMind OS — Database Specification

## Goals
- preserve source evidence
- maintain referential integrity
- support idempotent ingestion
- support auditability
- support future migration from local development to production infrastructure

## Core Tables

### messages
Stores immutable inbound source messages.

Key fields:
`id`, `source`, `external_message_id`, `conversation_id`, `sender_reference`, `received_at`, `raw_text`, `metadata_json`, timestamps.

Unique constraint where possible:
`source + external_message_id`.

### customers
`id`, `display_name`, `normalized_name`, `phone`, `status`, timestamps.

### customer_addresses
Customer delivery addresses with optional labels and verification status.

### products
Canonical catalog records: `id`, `sku`, `name`, `normalized_name`, `category`, `default_unit`, `packaging`, `active`.

### product_aliases
`id`, `product_id`, `customer_id nullable`, `alias`, `normalized_alias`, `source`, `verified`, `confidence`, timestamps.

### orders
`id`, `customer_id`, `source_message_id`, `order_number`, `order_date`, `requested_delivery_at`, `status`, `discount_rate`, `payment_method`, `invoice_required`, `invoice_due_at`, `notes`, timestamps.

### order_items
`id`, `order_id`, `product_id nullable`, `raw_product_name`, `quantity`, `unit`, `resolution_status`, `resolution_confidence`, timestamps.

### tasks
`id`, `order_id nullable`, `type`, `title`, `description`, `owner_id nullable`, `priority`, `status`, `due_at`, `source_message_id nullable`, timestamps.

### audit_logs
Stores entity changes and AI decisions. Include actor type, action, source message, and before/after data where appropriate.

## Data Types

Use decimal-safe numeric types for money and percentages. Do not use binary floating point for financial values.

Quantities should support fractional values if the business later requires them; initial UI may restrict to positive quantities.

## Soft Delete
Use explicit archival/status semantics for business entities. Do not silently delete source messages or audit logs.

## Indexing
Index:
- message external ID/source
- conversation ID
- customer phone
- normalized product alias
- order customer/status/date
- task status/due date

## Transactions
Order creation/update and related OrderItems/Tasks must use a transaction where the database supports it.

## Migration Rule
Every schema change must have a versioned migration and corresponding domain documentation update.
