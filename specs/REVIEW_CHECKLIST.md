# SalesMind OS — Review Checklist

## Product
- Does the implementation match the Feature Spec?
- Are non-goals respected?

## Domain
- Are business rules deterministic where appropriate?
- Are invalid states prevented?

## AI
- Is model output schema-validated?
- Are uncertain values reviewable?
- Is the prompt versioned?
- Was the golden dataset evaluated?

## Data
- Are migrations present?
- Are source messages preserved?
- Is processing idempotent?

## Security
- No secrets committed.
- No unnecessary customer data in logs.
- Authorization enforced for protected mutations.

## Quality
- Tests pass.
- Typecheck/lint/build pass.
- No unrelated changes.
- Documentation matches behavior.

## Operational
- Errors are observable.
- Rollback path exists for risky changes.
