# SalesMind OS — Project Genesis

**Version:** 1.0.0  
**Status:** Approved baseline  
**Audience:** Founder, Solution Architect, Codex, future engineers  

## 1. Purpose

SalesMind OS is an AI sales assistant designed around a real sales workflow: incoming conversations are transformed into structured orders, products, customers, and actionable work.

The first practical use case is reading incoming Zalo messages and turning them into daily operational work. Zalo is an input channel, not the core of the architecture.

## 2. Core Problem

Sales messages are informal and inconsistent. Customers may use abbreviations, spelling mistakes, shorthand, omitted context, and mixed business instructions.

Example:

```text
3/CHTL CPLUS (10/8)
Đc: 65B đường Hiệp Bình, HCM
Sđt: 0904813024 (a.Long)

50g cay :10 cái
Sw chà bông:10 cái
Sw cá hồi :10 cái
55g so:10 cái
55 bơ :10 cái
Phủ 55g:10 cái
Hoa cúc :10 cái
Ck 5%

Tiền mặt
giao trong ngày
xuất hoá đơn trong ngày
```

The system must understand that product lines such as `55 bơ :10 cái` represent an order item with quantity 10, while `CK 5%`, `Tiền mặt`, `giao trong ngày`, and `xuất hoá đơn trong ngày` represent commercial or operational instructions rather than products.

## 3. Product Vision

SalesMind should evolve from a message parser into a Sales Operating System that understands:

- conversations
- customers
- products and aliases
- orders and order items
- discounts and payment terms
- delivery requirements
- invoice requirements
- operational tasks
- customer history
- business rules

The system must remain useful even if Zalo is replaced by another message source.

## 4. Architecture Principle

The canonical pipeline is:

```text
Message Source
    ↓
Message Collector
    ↓
Message Normalizer
    ↓
Intent Classification
    ↓
Order / Task Extraction
    ↓
Product Alias Resolution
    ↓
Business Rule Engine
    ↓
Validation + Confidence
    ↓
Order / Task / Memory Persistence
    ↓
Dashboard / Notifications
```

AI is responsible for interpretation. Deterministic business rules are responsible for enforcing business decisions.

## 5. MVP Scope

### In scope

1. Accept a raw message payload.
2. Store the original message unchanged.
3. Identify likely customer information.
4. Detect whether the message contains an order.
5. Parse order items and quantities.
6. Resolve product shorthand through a product/alias knowledge base.
7. Detect discount, payment, delivery, and invoice instructions.
8. Generate operational tasks.
9. Store confidence and unresolved fields.
10. Show the result in a dashboard.

### Out of scope for the first MVP

- automatic customer replies
- automatic order confirmation sent to customers
- automatic financial posting
- automatic inventory deduction without validation
- direct control of a personal Zalo account
- autonomous business decisions

## 6. Domain Model

Core entities:

- `Message`
- `Customer`
- `Product`
- `ProductAlias`
- `Order`
- `OrderItem`
- `Task`
- `PaymentTerm`
- `InvoiceRequirement`
- `AuditLog`

Future entities may include:

- `InventoryMovement`
- `Warehouse`
- `PriceList`
- `Delivery`
- `Invoice`
- `Supplier`
- `Employee`

## 7. Product Alias Principle

A customer-facing product name must never be assumed to be a canonical product name merely because an LLM generated a plausible match.

Example:

```text
Input alias: 55 bơ
Canonical product: resolved from ProductAlias/knowledge base
Quantity: 10
```

If no sufficiently confident mapping exists, the system must mark the item as unresolved and request human confirmation.

Aliases may include:

- abbreviations
- missing accents
- common typos
- packaging shorthand
- internal sales shorthand
- customer-specific names

Confirmed corrections may be promoted into the alias knowledge base subject to review rules.

## 8. Order vs Task

An order is commercial data. A task is an operational action.

For example:

```text
55 bơ :10 cái
```

creates an `OrderItem`.

```text
Giao trong ngày
```

may create a delivery task.

```text
Xuất hóa đơn trong ngày
```

may create an invoice task.

```text
Tiền mặt
```

is a payment term, not a task by itself.

```text
CK 5%
```

is a discount instruction, not a product.

## 9. Confidence and Safety

Every AI-derived field should have an explainable confidence value or resolution state.

Minimum states:

- `resolved`
- `needs_review`
- `unresolved`
- `rejected`

The system must prefer asking for confirmation over silently inventing business data.

## 10. Auditability

For every AI transformation, retain enough information to reconstruct:

```text
raw message
→ normalized message
→ extracted entities
→ alias matches
→ rules triggered
→ final persisted result
```

Never destroy the original message merely because a normalized representation exists.

## 11. Codex Contract

Codex must treat the documentation repository as the source of truth.

Before implementing a feature, Codex must:

1. Read the relevant project context.
2. Read architecture and domain rules.
3. Identify the applicable Feature Spec.
4. State assumptions.
5. Implement only the requested scope.
6. Add or update tests.
7. Run validation commands.
8. Report changed files and unresolved issues.

Codex must not silently redesign the architecture.

## 12. Required Repository Knowledge Structure

Future documentation should follow:

```text
.ai/
  project_context.md
  architecture.md
  business.md
  coding_rules.md
  glossary.md
  prompt_rules.md
  decision_log.md

 docs/
  00_Project/
  01_Product/
  02_Business/
  03_Domain/
  04_AI/
  05_Architecture/
  06_Database/
  07_API/
  08_Frontend/
  09_Engineering/
  10_Deployment/

 specs/
  epics/
  features/
  sprints/

 knowledge/
  products/
  aliases/
  customers/

 datasets/
  messages/
  orders/
  evaluation/

 prompts/
 adr/
 rfc/
```

## 13. Documentation Roadmap

The following specification families must be created before major implementation work:

### Product & Business

- VISION.md
- PRODUCT_REQUIREMENTS.md
- BUSINESS_RULES.md
- USER_PERSONAS.md
- USER_STORIES.md

### Architecture

- SYSTEM_ARCHITECTURE.md
- DOMAIN_MODEL.md
- MESSAGE_PIPELINE.md
- MEMORY_ENGINE.md
- RULE_ENGINE.md
- EVENT_FLOW.md
- STATE_MACHINE.md

### AI

- AI_SPEC.md
- PROMPTS.md
- PRODUCT_ALIAS_ENGINE.md
- TASK_EXTRACTION_ENGINE.md
- CUSTOMER_MEMORY.md
- CONFIDENCE_SCORING.md
- AI_EVALUATION.md

### Data/API/UI/Engineering

- DATABASE.md
- ERD.md
- MIGRATION_PLAN.md
- API_SPEC.md
- EVENT_SPEC.md
- ERROR_CODES.md
- DASHBOARD_SPEC.md
- UI_COMPONENTS.md
- DESIGN_SYSTEM.md
- CODING_STANDARD.md
- GIT_WORKFLOW.md
- PROJECT_STRUCTURE.md
- TESTING_STRATEGY.md
- DEPLOYMENT.md

### AI Coding

- CODEX_PLAYBOOK.md
- FEATURE_TEMPLATE.md
- REVIEW_CHECKLIST.md

## 14. Dataset Strategy

The target dataset is not a model-training requirement for the MVP. It is first an evaluation and knowledge resource.

The planned dataset should eventually contain:

- real anonymized order examples
- product abbreviations
- spelling variations
- ambiguous product names
- customer-specific shorthand
- mixed order/instruction messages
- corrections made by humans
- expected structured outputs

The initial goal is to build a high-quality golden evaluation set before attempting fine-tuning.

## 15. First Feature

**Feature ID:** `SM-001`  
**Name:** Message-to-Order Extraction  

Input:

```json
{
  "source": "manual",
  "sender": "a.Long",
  "text": "55 bơ:10 cái, giao trong ngày, xuất hóa đơn trong ngày"
}
```

Expected conceptual output:

```json
{
  "intent": "order",
  "items": [
    {
      "raw_name": "55 bơ",
      "quantity": 10,
      "unit": "cái",
      "resolution_status": "needs_review"
    }
  ],
  "delivery": {
    "same_day": true
  },
  "invoice": {
    "required": true,
    "same_day": true
  }
}
```

The exact canonical product must come from the product knowledge base, not from an unsupported model guess.

## 16. Definition of Done for Genesis

Genesis is complete when:

- project vision is documented
- domain vocabulary is documented
- core architecture is documented
- AI responsibilities are separated from deterministic rules
- product alias strategy is documented
- dataset strategy is documented
- Codex workflow is documented
- feature specifications can be written consistently

## 17. Next Documentation Sequence

The next files should be created in this order:

1. `.ai/project_context.md`
2. `.ai/coding_rules.md`
3. `docs/01_Product/PRODUCT_REQUIREMENTS.md`
4. `docs/02_Business/BUSINESS_RULES.md`
5. `docs/03_Domain/DOMAIN_MODEL.md`
6. `docs/04_AI/PRODUCT_ALIAS_ENGINE.md`
7. `docs/04_AI/TASK_EXTRACTION_ENGINE.md`
8. `docs/05_Architecture/MESSAGE_PIPELINE.md`
9. `docs/06_Database/DATABASE.md`
10. `specs/features/SM-001-message-to-order-extraction.md`

These documents become the immediate implementation contract for the first Codex sprint.
