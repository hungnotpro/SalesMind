# SM-001 — Message-to-Order Extraction

## Status
Ready for implementation after architecture review.

## Goal
Convert a normalized inbound message into a validated order candidate and operational task candidates.

## Input
```json
{
  "source": "manual",
  "external_message_id": "example-001",
  "conversation_id": "chat-001",
  "sender": {
    "name": "a.Long",
    "phone": "0904813024"
  },
  "received_at": "2026-08-10T09:00:00+07:00",
  "text": "55 bơ:10 cái\nCK 5%\nTiền mặt\ngiao trong ngày\nxuất hoá đơn trong ngày"
}
```

## Expected Result

The system must identify:

- order intent
- order item candidate `55 bơ`
- quantity `10`
- unit `cái`
- discount `5%`
- payment method `cash`
- same-day delivery requirement
- same-day invoice requirement

The canonical product for `55 bơ` must only be populated when ProductAlias resolution succeeds.

## Acceptance Criteria

### AC-001
The original message is persisted unchanged.

### AC-002
The same input processed twice does not create duplicate business records.

### AC-003
`55 bơ:10 cái` creates one OrderItem candidate with quantity 10 and unit `cái`.

### AC-004
`CK 5%` is classified as a discount and never as an OrderItem.

### AC-005
`Tiền mặt` is classified as payment information.

### AC-006
`giao trong ngày` produces a delivery requirement/task candidate.

### AC-007
`xuất hoá đơn trong ngày` produces an invoice requirement/task candidate.

### AC-008
Unknown product aliases are marked `needs_review` or `unresolved`; no product is invented.

### AC-009
Invalid quantity such as zero or negative quantity is rejected by validation.

### AC-010
The processing result includes enough audit metadata to identify the message, parser/prompt version, and resolution state.

## Non-Goals

- Zalo automation
- customer-facing response
- inventory deduction
- accounting posting
- automatic price calculation

## Suggested Implementation Boundaries

```text
message-ingestion
message-parser
product-resolver
customer-resolver
rule-engine
order-service
task-service
audit-service
```

Do not place all logic in one controller/function.

## Tests Required

1. normal order
2. multiple product lines
3. abbreviation
4. missing accents
5. typo
6. unknown product
7. mixed order + instructions
8. duplicate message
9. cancellation/update
10. invalid quantity
11. ambiguous customer
12. same-day date calculation

## Definition of Done

- implementation follows architecture docs
- schema validation exists
- deterministic rules are tested
- parser has golden test cases
- duplicate processing is idempotent
- unresolved entities enter review
- lint/typecheck/tests pass
- no secrets committed
- documentation updated if implementation changes behavior
