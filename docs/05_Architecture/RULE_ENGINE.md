# SalesMind OS — Rule Engine

## Purpose
Apply deterministic business rules after AI extraction and before trusted persistence.

## Rule Categories
- order classification
- task creation
- payment handling
- discount interpretation
- delivery deadlines
- invoice requirements
- duplicate protection
- cancellation/update
- review requirements

## Example Rules

### Delivery
If the extracted instruction means same-day delivery, create or update a `delivery` task with a due target based on the business timezone.

### Invoice
If invoice is required, create or update an `invoice` task.

### Payment
If payment method is cash, record the payment method. Do not create a debt-follow-up task unless another rule requires it.

### Discount
If a valid percentage discount is extracted, store it as a normalized percentage and preserve the source phrase.

## Rule Input
Rules operate on validated domain candidates, not raw unvalidated LLM output.

## Rule Output
Rules may:
- create a task candidate
- update an order candidate
- request review
- reject invalid data

Rules must not call an LLM directly.

## Versioning
Critical rules require a version identifier and regression tests.

## Determinism
Given the same validated input, rule execution must produce the same result.
