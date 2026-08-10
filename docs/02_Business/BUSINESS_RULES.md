# SalesMind OS — Business Rules

## BR-001 Order item recognition
A line containing a product-like phrase and quantity is an order item candidate.

Example:

`55 bơ :10 cái`

means quantity `10`, unit `cái`, raw product name `55 bơ`.

## BR-002 Commercial instructions are not products
The following must not become OrderItems:
- discount instructions
- payment terms
- delivery instructions
- invoice instructions
- customer contact details
- address details

## BR-003 Discount
`CK 5%` means a discount rate of 5% unless the message context explicitly defines another meaning.

The system must preserve the original expression and normalized value.

## BR-004 Payment
`Tiền mặt` maps to cash payment intent.

Other payment terms must be modeled explicitly rather than inferred from unrelated context.

## BR-005 Same-day delivery
`giao trong ngày`, `giao hôm nay`, and equivalent phrases may map to a same-day delivery requirement when the message date is known.

The exact date/time must be calculated by deterministic date rules using the message timestamp and configured timezone.

## BR-006 Same-day invoice
`xuất hoá đơn trong ngày` creates an invoice requirement with same-day target.

## BR-007 Product resolution
A product can be considered resolved only when a deterministic/knowledge-base match or sufficiently validated match exists.

Otherwise:

```text
needs_review
```

## BR-008 Customer resolution
Customer identity may be resolved using configured identifiers such as phone number, known customer name, or conversation mapping.

If conflicting identities exist, require review.

## BR-009 Duplicate messages
Processing the same source message more than once must be idempotent.

Use source + external message ID when available.

## BR-010 Duplicate tasks
Do not create duplicate operational tasks for the same order requirement. Prefer a unique business key such as:

`order_id + task_type + target_date`

when applicable.

## BR-011 Cancellation/update
A message such as `khỏi giao`, `hủy`, `không lấy nữa`, or equivalent must be treated as a potential update/cancellation when a matching order/task exists.

Never create a new positive task from a cancellation message.

## BR-012 Ambiguity
When multiple products or customers match with similar confidence, the system must not silently choose one if the ambiguity can affect business correctness.

## BR-013 Human correction
A user correction is a high-value signal. Corrections should be recorded and may become knowledge-base updates after validation.

## BR-014 Financial safety
The system must not invent price, tax, total, or accounting values from a message unless the corresponding product price data and business rules are explicitly available.

## BR-015 Inventory safety
The MVP does not automatically deduct inventory. Inventory mutation requires a dedicated, validated workflow.

## BR-016 Task ownership
A generated task must have an explicit owner or default queue defined by configuration. Never invent a staff member.

## BR-017 Timezone
All business date/time calculations must use the configured business timezone. For the initial deployment, default to `Asia/Ho_Chi_Minh` unless overridden by configuration.

## BR-018 Source precedence
Original customer message is the source evidence. Normalized fields are derived data and must be traceable to source evidence.

## BR-019 No autonomous customer reply in MVP
The system may prepare suggestions in the future, but MVP must not send customer-facing replies autonomously.

## BR-020 Rule changes
Changes to critical business rules require a documented change and regression tests.
