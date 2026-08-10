# SalesMind OS — Product Requirements Document

**Version:** 1.0.0

## 1. Product Goal

Turn informal sales conversations into reliable, reviewable sales operations.

The first measurable outcome is:

> A salesperson should not have to manually reread conversations to discover what was ordered and what must be done today.

## 2. Primary User

A salesperson/operator receiving customer orders through chat applications.

## 3. MVP User Journey

```text
Receive message
→ ingest message
→ identify order intent
→ parse items
→ resolve products
→ identify commercial instructions
→ generate operational tasks
→ review uncertain fields
→ save order
→ view daily work
```

## 4. Functional Requirements

### FR-001 Message ingestion
The system must accept a normalized message object independent of source platform.

Required concepts:
- source
- external message ID when available
- sender
- conversation ID when available
- text
- timestamp
- attachments metadata when available

### FR-002 Raw message preservation
The original text must be stored unchanged.

### FR-003 Intent detection
The system must distinguish at minimum:
- order
- task/request
- information
- cancellation/update
- irrelevant/unknown

### FR-004 Order extraction
For an order message, extract:
- customer candidate
- order date
- requested delivery date/time
- items
- quantities
- units
- discount
- payment method/term
- invoice requirement
- notes

### FR-005 Product resolution
Each item must resolve to a canonical Product or be marked for review.

### FR-006 Task generation
The system must generate operational tasks from explicit instructions and configured business rules.

### FR-007 Duplicate protection
Repeated processing of the same external message must not create duplicate orders/tasks.

### FR-008 Conversation updates
A later message may update or cancel an existing order/task. The system must prefer updating an identified entity over creating a duplicate.

### FR-009 Human review
Users must be able to review and correct unresolved product/customer mappings.

### FR-010 Daily dashboard
The user must be able to see:
- today's tasks
- overdue tasks
- orders requiring review
- unresolved product aliases
- orders received today

## 5. Non-Functional Requirements

### NFR-001 Auditability
Every AI-derived order must be traceable to the original message and extraction result.

### NFR-002 Reliability
Deterministic validation must reject invalid quantities, malformed data, and impossible states.

### NFR-003 Extensibility
Message source adapters must be replaceable without changing domain logic.

### NFR-004 Privacy
Customer data and message content must be treated as private business data.

### NFR-005 Observability
Failures in ingestion, AI extraction, product resolution, and persistence must be diagnosable.

## 6. MVP Boundaries

The MVP will not:
- send customer messages automatically
- automatically finalize uncertain product mappings
- automatically post accounting entries
- mutate inventory without an explicit inventory feature
- bypass human review for low-confidence financial data

## 7. Success Metrics

Initial metrics:
- order extraction accuracy
- product resolution accuracy
- quantity extraction accuracy
- task generation precision
- percentage of messages requiring human correction
- duplicate order rate
- processing failure rate

The team must measure these on a versioned evaluation dataset rather than relying on subjective impressions.

## 8. Acceptance Example

Input:

```text
55 bơ:10 cái
CK 5%
Tiền mặt
giao trong ngày
xuất hoá đơn trong ngày
```

Expected concepts:

```text
Order
├── Item: alias `55 bơ`
│   └── quantity: 10 cái
├── discount: 5%
├── payment: cash
├── delivery: same day
└── invoice: required same day
```

The product identity remains unresolved unless `55 bơ` exists in the ProductAlias knowledge base with sufficient confidence.

## 9. Release Strategy

### Release 0.1
Manual message input + extraction + dashboard.

### Release 0.2
Product/customer knowledge base + review workflow.

### Release 0.3
Zalo collector adapter after domain pipeline is stable.

### Release 0.4
Reminders and daily summaries.

### Release 0.5
Inventory/accounting integrations.

### Release 1.0
Production-ready SalesMind OS with extensible channel adapters and mature evaluation/observability.
