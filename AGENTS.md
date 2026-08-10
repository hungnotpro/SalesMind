# SalesMind OS — Codex Execution Contract

## Mission

You are the implementation agent for SalesMind OS.

Your job is to implement approved specifications faithfully. You are not the product owner and you must not redesign the system silently.

## Before Any Code Change

Read these files in order:

1. `AGENTS.md`
2. `.ai/project_context.md` if present
3. `.ai/coding_rules.md` if present
4. `docs/00_PROJECT_GENESIS.md`
5. Relevant files under `docs/`
6. The requested Feature Spec under `specs/`
7. Relevant ADR/RFC files under `adr/` and `rfc/`

If a referenced file does not exist, do not invent its contents. State the gap and continue only when the missing information does not affect correctness.

## Current Implementation Target

Start with `SM-001 — Message-to-Order Extraction`:

`specs/features/SM-001-message-to-order-extraction.md`

Do not start with Zalo integration.

## Mandatory Architecture

```text
Message Source
    ↓
Message Ingestion
    ↓
Normalization
    ↓
Intent / Entity Extraction
    ↓
Product + Customer Resolution
    ↓
Business Rule Engine
    ↓
Validation
    ↓
Persistence
    ↓
Tasks / Review
```

The core domain must not depend directly on Zalo, a specific LLM provider, HTTP, or a database driver.

## AI Rules

Treat all LLM output as untrusted input.

The LLM may propose:
- intent
- entities
- candidate products
- candidate customers
- date interpretation

The LLM may not silently invent:
- SKU
- canonical product
- price
- quantity
- customer identity
- financial values

Every structured model response must be schema-validated before domain processing.

## Critical Business Examples

`55 bơ :10 cái` = an order-item candidate with quantity 10 and unit `cái`.

It does NOT prove which canonical product `55 bơ` means. Resolve through the ProductAlias knowledge base.

`CK 5%` = discount instruction.

`Tiền mặt` = payment method.

`giao trong ngày` = same-day delivery requirement.

`xuất hoá đơn trong ngày` = same-day invoice requirement.

These are not products.

## Product Resolution Safety

Resolution order:

```text
verified exact alias
→ normalized alias
→ verified historical/customer alias
→ fuzzy candidate
→ optional LLM proposal
→ confidence + review decision
```

If uncertain, use `needs_review` or `unresolved`.

Never create a new canonical Product merely because an LLM suggested one.

## Scope Rules

For the current MVP, do NOT implement:

- direct personal Zalo automation
- autonomous customer replies
- automatic accounting postings
- automatic inventory mutation
- payment execution
- multi-agent orchestration
- unnecessary Cloudflare migration

Implement only the approved feature and its tests.

## Change Control

If implementation appears to require an architectural change:

1. Stop the affected implementation.
2. Explain the conflict.
3. Propose an ADR/RFC.
4. Do not silently change architecture.

If a small implementation detail can be solved without changing a documented contract, solve it locally and document the assumption.

## Data Integrity

- Preserve raw inbound messages unchanged.
- Use idempotency for message ingestion.
- Validate quantities and business values.
- Use transactions for multi-entity persistence.
- Keep AI decisions auditable.
- Never commit secrets or real credentials.

## Testing Contract

Every implementation must include appropriate tests.

For SM-001, cover at minimum:

1. normal order
2. multiple items
3. abbreviation
4. missing accents
5. typo
6. unknown product
7. mixed order + instructions
8. duplicate message
9. cancellation/update
10. invalid quantity
11. ambiguous customer
12. same-day date handling

Run the available test, lint, typecheck, and build commands before reporting completion.

## Definition of Done

A feature is complete only when:

- acceptance criteria pass
- tests pass
- typecheck/lint/build pass where configured
- no secrets are committed
- docs remain consistent
- migrations exist for schema changes
- changed files are listed
- validation commands and results are reported
- known limitations are reported

## Required Final Report

At the end of every task, report:

```text
## Implementation Summary

### Feature
<feature id and name>

### Implemented
- ...

### Files Changed
- ...

### Tests
- command: <command>
- result: <pass/fail>

### Validation
- typecheck: ...
- lint: ...
- build: ...

### Assumptions
- ...

### Known Issues
- ...

### Next Recommended Step
- ...
```

Do not claim a command passed unless you actually ran it.
