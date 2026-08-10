# SalesMind OS — Project Context

## Purpose
SalesMind OS is an AI-assisted sales operations system. Its first real-world workflow is converting informal sales messages, initially from Zalo, into structured orders and actionable daily work.

## Current Product Focus
The MVP is message ingestion and order/work extraction. Do not expand into autonomous customer messaging, financial posting, or inventory mutation until explicitly specified.

## Core Domain
- Message: immutable source communication.
- Customer: buyer/contact represented by one or more conversations.
- Product: canonical catalog item.
- ProductAlias: shorthand, abbreviation, typo, or customer-specific product name.
- Order: commercial transaction inferred from one or more messages.
- OrderItem: product + quantity + unit belonging to an order.
- Task: operational action generated from an order or explicit request.
- AuditLog: trace of important system/AI transformations.

## Critical Business Example
`55 bơ :10 cái` means the customer wants 10 units of the product represented by the alias `55 bơ`. The system must resolve that alias against the Product Knowledge Base. It must not invent a canonical product name when no sufficiently confident mapping exists.

Other example instructions:
- `CK 5%` => discount instruction.
- `Tiền mặt` => payment method/term.
- `giao trong ngày` => same-day delivery requirement.
- `xuất hoá đơn trong ngày` => same-day invoice requirement.

These are not product lines.

## Architectural Principles
1. Business rules are deterministic whenever practical.
2. LLMs interpret ambiguous natural language but do not silently invent business facts.
3. Original messages are retained for auditability.
4. Every AI-derived important field should expose resolution/confidence information.
5. Source channels are adapters; domain logic must not depend on Zalo.
6. New features require a written Feature Spec before implementation.
7. Architecture changes require an ADR/RFC.

## AI Responsibilities
AI may:
- classify intent
- extract candidate entities
- normalize informal language
- identify likely task requirements
- propose product/customer matches

AI must not:
- invent SKUs
- invent prices
- invent quantities
- invent customer identities
- finalize financial decisions without validation
- send customer-facing messages autonomously in MVP

## Codex Working Contract
Before coding:
1. Read this file.
2. Read `.ai/coding_rules.md` when available.
3. Read the relevant domain and architecture documents.
4. Read the Feature Spec.
5. State assumptions and identify ambiguity.

During coding:
- stay within feature scope
- prefer small, testable changes
- preserve existing contracts
- do not silently change architecture
- do not add dependencies without justification

After coding:
- run tests/lint/build where available
- document changed files
- document unresolved issues
- update relevant docs/tests

## Repository Documentation Strategy
Markdown is the source of truth. DOCX/PDF exports are secondary artifacts.

Required knowledge areas:
- `.ai/` for agent operating context
- `docs/` for durable product and technical documentation
- `specs/` for executable feature requirements
- `knowledge/` for business vocabulary and product aliases
- `datasets/` for evaluation examples
- `prompts/` for versioned AI prompts
- `adr/` and `rfc/` for architectural decisions

## Initial Implementation Strategy
Build the domain and message-to-order extraction pipeline before integrating direct personal Zalo automation. This isolates AI/domain correctness from the fragility of UI automation or unofficial integrations.

## Definition of Success
A user can provide a real sales message and reliably obtain:
- identified customer information when available
- structured order items
- product resolution or a review request
- payment/discount instructions
- delivery/invoice tasks
- an auditable record of how the result was produced
