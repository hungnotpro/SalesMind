# SalesMind OS — ERD

```text
Customer 1 ─── N Conversation
Customer 1 ─── N Order
Conversation 1 ─── N Message
Message 1 ─── 0..N Order
Order 1 ─── N OrderItem
Product 1 ─── N ProductAlias
Product 1 ─── N OrderItem
Order 1 ─── N Task
Message 1 ─── N AuditLog
```

## Cardinality Notes
- An Order may exist before customer resolution is complete.
- An OrderItem may exist without a Product while review is pending.
- A ProductAlias always points to a canonical Product when verified.
- Tasks may exist without an Order for explicitly requested standalone work.

## Integrity
Foreign keys must be enforced where supported. Review states are preferred over invalid references.
