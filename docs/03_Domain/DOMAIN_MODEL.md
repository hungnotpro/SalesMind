# SalesMind OS — Domain Model

## 1. Overview

SalesMind is centered around messages, customers, products, orders, and operational tasks.

```text
Message
  ↓
Customer / Conversation
  ↓
Order
  ├── OrderItem → Product
  └── Order requirements
          ├── Delivery Task
          └── Invoice Task
```

## 2. Message

Represents immutable source communication.

Conceptual fields:
- id
- source
- external_message_id
- conversation_id
- sender_reference
- received_at
- raw_text
- attachments
- metadata
- created_at

Invariant: `raw_text` must never be rewritten.

## 3. Customer

Represents a buyer/contact.

Conceptual fields:
- id
- display_name
- normalized_name
- phone
- addresses
- notes
- status
- created_at
- updated_at

A customer may have multiple conversations and orders.

## 4. Product

Canonical catalog entity.

Conceptual fields:
- id
- sku
- name
- normalized_name
- category
- default_unit
- packaging
- active

Product data is authoritative for canonical identity.

## 5. ProductAlias

Maps informal customer/sales language to a canonical Product.

Conceptual fields:
- id
- product_id
- alias
- normalized_alias
- source
- customer_id nullable
- confidence
- verified
- created_at
- updated_at

Customer-specific aliases may override global aliases when explicitly configured.

## 6. Order

Represents the commercial order inferred from one or more messages.

Conceptual fields:
- id
- customer_id
- source_message_id
- order_number
- order_date
- requested_delivery_at
- status
- discount_rate nullable
- payment_method nullable
- invoice_required
- invoice_due_at nullable
- notes
- created_at
- updated_at

## 7. OrderItem

Represents a requested product quantity.

Conceptual fields:
- id
- order_id
- product_id nullable
- raw_product_name
- quantity
- unit
- resolution_status
- resolution_confidence
- notes

`product_id` may be null while awaiting review.

## 8. Task

Represents an operational action.

Conceptual fields:
- id
- order_id nullable
- type
- title
- description
- owner_id nullable
- priority
- status
- due_at nullable
- source_message_id nullable
- created_at
- updated_at

Suggested task types:
- delivery
- invoice
- payment_followup
- review_order
- resolve_product
- resolve_customer
- other

## 9. AuditLog

Records significant system decisions and mutations.

Conceptual fields:
- id
- entity_type
- entity_id
- action
- actor_type
- actor_id nullable
- before_data nullable
- after_data nullable
- source_message_id nullable
- created_at

## 10. Relationships

```text
Customer 1 ─── N Conversation
Customer 1 ─── N Order
Message  1 ─── 0..N Order
Order    1 ─── N OrderItem
Product  1 ─── N ProductAlias
Product  1 ─── N OrderItem
Order    1 ─── N Task
Message  1 ─── N AuditLog
```

## 11. Invariants

- An OrderItem must have a positive quantity.
- A resolved OrderItem must reference a canonical Product.
- A Task must have a type.
- A cancellation cannot be represented as a normal positive delivery task.
- Raw message content remains immutable.
- Financial values require authoritative source data.
