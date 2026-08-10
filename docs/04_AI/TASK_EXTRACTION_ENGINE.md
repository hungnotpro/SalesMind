# SalesMind OS — Task Extraction Engine

## 1. Purpose

Convert explicit operational requirements in sales messages into structured Tasks while keeping order data separate.

## 2. Task Categories

Initial categories:
- delivery
- invoice
- payment_followup
- order_review
- product_review
- customer_review
- other

## 3. Extraction Pipeline

```text
message
→ identify operational phrases
→ normalize temporal expressions
→ classify task type
→ associate with Order when possible
→ apply deterministic rules
→ validate
→ create/update task
```

## 4. Example

Input:

```text
giao trong ngày
xuất hoá đơn trong ngày
```

Expected task concepts:

```json
[
  {
    "type": "delivery",
    "due": "same_day"
  },
  {
    "type": "invoice",
    "due": "same_day"
  }
]
```

The actual timestamp must be calculated using the message timestamp and business timezone.

## 5. Task Creation Rules

A task should only be created when:
- an explicit instruction exists, or
- a documented business rule creates the task.

Do not create tasks from vague conversational filler.

## 6. Idempotency

A repeated message must not create duplicate tasks.

Where possible, use a stable business key:

```text
order_id + task_type + target_date
```

## 7. Update Semantics

A later message may update a task.

Example:

```text
Giao trong ngày.
```

creates a delivery requirement.

Later:

```text
Mai giao cũng được.
```

updates the due date rather than creating another delivery task.

## 8. Cancellation

Messages such as:
- `khỏi giao`
- `hủy giao`
- `không cần nữa`

should cancel/update the matching task when the entity can be identified.

If no matching task exists, create a review event rather than inventing a historical task.

## 9. Priority

Priority must be derived from explicit urgency or configured business rules. Do not default every same-day task to critical.

Initial levels:
- low
- normal
- high
- urgent

## 10. Human Review

Create a review task when:
- target order cannot be identified
- date expression is ambiguous
- instruction conflicts with existing order state
- customer identity is uncertain

## 11. Output Contract

The extraction layer should produce a validated structured result before persistence.

Example:

```json
{
  "tasks": [
    {
      "type": "delivery",
      "title": "Giao đơn hàng",
      "due_at": null,
      "resolution_status": "resolved"
    }
  ]
}
```

## 12. Evaluation

Test against:
- explicit tasks
- same-day expressions
- future dates
- cancellation
- updates
- duplicate messages
- ambiguous dates
- mixed order/task messages
