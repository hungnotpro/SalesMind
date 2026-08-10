# SalesMind OS — API Specification

## API Principles
- JSON over HTTPS for the initial API.
- Validate all input at the boundary.
- Domain logic lives in application services.
- Return stable error codes.
- Never expose provider secrets or internal stack traces.

## POST /messages
Ingest one normalized message.

Request:
```json
{
  "source":"manual",
  "external_message_id":"msg-1",
  "conversation_id":"chat-1",
  "sender":{"name":"a.Long","phone":"0904813024"},
  "received_at":"2026-08-10T09:00:00+07:00",
  "text":"55 bơ:10 cái"
}
```

Response concept:
```json
{
  "message_id":"...",
  "processing_status":"completed",
  "order_id":"...",
  "review_required":true
}
```

## GET /orders
List orders with filters for status, date, customer, and review state.

## GET /orders/:id
Return order, items, tasks, source message references, and review status.

## PATCH /orders/:id
Update explicitly editable order fields. Mutations must be validated and audited.

## GET /tasks
List tasks by status, due date, owner, type, and order.

## PATCH /tasks/:id
Update task status, owner, priority, or due date subject to state-machine rules.

## GET /customers/:id
Return customer profile and relevant verified memory.

## GET /products
List canonical products and resolution metadata where authorized.

## POST /product-aliases/resolve
Resolve a raw product phrase against candidate knowledge and return resolution state. It must not create a product.

## POST /product-aliases
Create a verified alias only through an explicit user/admin action or configured learning workflow.

## Error Envelope
```json
{
  "error": {
    "code":"VALIDATION_ERROR",
    "message":"Human-readable message",
    "request_id":"..."
  }
}
```

## Idempotency
Message ingestion should support an idempotency key based on source/external message ID. Repeated submissions must return the existing processing result when possible.
