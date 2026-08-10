# SalesMind OS — Message Pipeline

## Purpose
Define the deterministic stages through which an inbound sales message becomes structured business data.

## Pipeline
```text
Collector
  ↓
Ingestion
  ↓
Normalization
  ↓
Intent Classification
  ↓
Entity Extraction
  ↓
Product Resolution
  ↓
Customer Resolution
  ↓
Business Rules
  ↓
Validation
  ↓
Persistence
  ↓
Tasks / Review Queue
```

## Stage 1 — Collector
A channel adapter emits a normalized `IncomingMessage`.
The domain must not depend on Zalo-specific objects.

## Stage 2 — Ingestion
- validate envelope
- calculate idempotency key
- persist raw message
- reject malformed payloads

## Stage 3 — Normalization
Normalize text for comparison only. Preserve raw text separately.

Operations may include Unicode normalization, whitespace normalization, and comparison-friendly casing.

## Stage 4 — Intent Classification
Initial intents:
- order
- task
- order_update
- order_cancellation
- information
- unknown

A message may contain more than one intent.

## Stage 5 — Entity Extraction
Extract candidates:
- customer name
- phone
- address
- products
- quantities
- units
- discount
- payment
- delivery
- invoice
- dates

## Stage 6 — Product Resolution
Use `PRODUCT_ALIAS_ENGINE.md`.
Unknown or ambiguous products enter review rather than being invented.

## Stage 7 — Customer Resolution
Use phone, conversation mapping, and verified names where available. Conflicts require review.

## Stage 8 — Business Rules
Apply `BUSINESS_RULES.md` and create/update operational requirements.

## Stage 9 — Validation
Validate schema, quantities, dates, conflicts, required fields, and duplicate keys.

## Stage 10 — Persistence
Persist order and related entities transactionally.
Persist audit evidence for AI-derived fields.

## Stage 11 — Output
Produce:
- order
- order items
- tasks
- review items
- audit records

## Failure Strategy
A failure in one stage must not silently produce partially trusted business data. Use explicit processing states and retry policies.

## Observability
Each processing run should have a correlation ID and stage-level status.
