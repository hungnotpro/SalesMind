# SalesMind OS — Review Checklist

## Architecture
- [ ] Change follows documented dependency direction.
- [ ] No business logic leaked into controllers/UI.
- [ ] No unnecessary framework coupling.
- [ ] No undocumented architecture change.

## Domain
- [ ] Domain terminology matches the Domain Model.
- [ ] State transitions are valid.
- [ ] Financial/business-critical fields are validated.

## AI
- [ ] LLM output is schema validated.
- [ ] Prompt/model version is recorded where required.
- [ ] Unknown/ambiguous values produce review states.
- [ ] No prompt-only business rule was introduced.

## Data
- [ ] Raw messages remain immutable.
- [ ] Idempotency is preserved.
- [ ] Transactions are used where required.
- [ ] Migration exists for schema changes.
- [ ] Auditability is preserved.

## Security
- [ ] No secrets committed.
- [ ] User/customer data is not unnecessarily logged.
- [ ] External input is validated.

## Testing
- [ ] Unit tests cover business rules.
- [ ] Parser has normal and edge cases.
- [ ] Regression dataset is updated where behavior changed.
- [ ] Build/typecheck/lint pass.

## Product
- [ ] Acceptance criteria are satisfied.
- [ ] No out-of-scope behavior was added.
- [ ] Documentation matches implementation.
