# SalesMind OS — State Machines

## Order States

```text
received
  ↓
processing
  ↓
needs_review ──→ confirmed
  ↓                ↓
rejected          preparing
                    ↓
                 delivering
                    ↓
                 completed
```

Cancellation may transition an eligible order to `cancelled`.

### Rules
- `processing` means the pipeline is working.
- `needs_review` means a human decision is required.
- `confirmed` means required business data is sufficiently resolved.
- `completed` means configured completion conditions are satisfied.

## Task States

```text
pending → in_progress → completed
   │           │
   └──────────→cancelled
```

A task may also be `blocked` when an explicit dependency prevents execution.

## Review State

Review is not equivalent to rejection. A review item may be resolved and return the entity to a normal state.

## Transition Safety

Every state transition must be validated. Invalid transitions must fail explicitly and be logged.

## Audit

Important transitions should produce audit records with actor/source and timestamps.
