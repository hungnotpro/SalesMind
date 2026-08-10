# SalesMind OS — Event Specification

## Envelope
```json
{
  "event_id":"uuid",
  "event_type":"message.received",
  "schema_version":1,
  "occurred_at":"ISO-8601",
  "correlation_id":"uuid",
  "actor_type":"system",
  "payload":{}
}
```

## Rules
- Events are immutable facts.
- Consumers must be idempotent.
- Schema changes require versioning.
- Payloads contain IDs and necessary business facts, not secrets.

## Initial Event Types
`message.received`, `message.processed`, `order.detected`, `order.updated`, `order.cancelled`, `task.created`, `task.updated`, `task.completed`, `review.required`, `review.resolved`.
