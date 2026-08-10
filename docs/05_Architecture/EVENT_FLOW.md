# SalesMind OS — Event Flow

## Event-driven principle
Domain events communicate meaningful state changes without coupling producers to consumers.

## Initial Events
- `message.received`
- `message.processed`
- `order.detected`
- `order.updated`
- `order.cancelled`
- `product.review_required`
- `customer.review_required`
- `task.created`
- `task.updated`
- `task.completed`

## Example

```text
message.received
  ↓
message.processed
  ↓
order.detected
  ↓
product.review_required
  ↓
task.created
```

## Rules
Events describe facts that happened. They are not commands.

Consumers must be idempotent.

Events should carry entity IDs, event ID, timestamp, schema version, and correlation ID.

## Reliability
Event publishing should support retry without creating duplicate side effects.
