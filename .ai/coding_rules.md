# SalesMind OS — Coding Rules

## 1. General

- TypeScript strict mode is the default for application code.
- Prefer explicit types at domain boundaries.
- Keep business logic independent from transport/framework code.
- Use small functions with one clear responsibility.
- Avoid hidden global state.
- Avoid speculative abstractions.

## 2. Architecture

Use the dependency direction:

```text
UI / Transport
      ↓
Application Services
      ↓
Domain
      ↓
Infrastructure adapters
```

Domain code must not depend on Zalo, HTTP, database drivers, or an LLM SDK.

## 3. AI Boundary

LLM calls must be isolated behind an application/service interface. Do not scatter model calls through controllers or UI components.

Every structured LLM result must be validated against a schema before entering domain logic.

A model response is untrusted input.

## 4. Business Rules

Deterministic rules must be implemented as code and tested independently from prompts.

Do not encode critical business rules only in an LLM prompt.

Examples:
- discount parsing
- payment classification
- task creation rules
- duplicate detection
- required human review

## 5. Data Integrity

- Preserve raw inbound messages.
- Never overwrite source text with normalized text.
- Use stable IDs.
- Store timestamps explicitly.
- Use transactions for multi-entity order persistence.
- Validate quantities and monetary values before persistence.

## 6. Product Resolution

Product resolution must follow:

```text
exact alias
→ normalized alias
→ known fuzzy candidate
→ human review
```

Do not directly map an unknown phrase to a product merely because an LLM believes it is plausible.

## 7. Error Handling

Errors must be classified as:
- validation error
- integration error
- AI/provider error
- business rule error
- persistence error
- unknown/internal error

Do not swallow errors.

User-facing errors should not expose secrets, stack traces, prompts, or provider credentials.

## 8. Testing

Every business rule gets deterministic unit tests.

Every parser gets:
- normal examples
- shorthand examples
- typo examples
- ambiguous examples
- malformed examples

AI extraction gets a golden dataset and regression tests.

## 9. Dependencies

Do not add a dependency merely for convenience. Before adding one:
- explain why native functionality is insufficient
- check maintenance/security implications
- keep the dependency scoped to the correct package

## 10. Naming

Use domain terminology consistently:
- `Customer`, not `Client` unless the product spec says otherwise.
- `OrderItem`, not `OrderProduct`.
- `ProductAlias`, not `Nickname`.
- `Task`, not `Todo` for operational work.

Use clear names over short names.

## 11. API

API handlers should validate input and delegate to application services. They should not contain complex business logic.

Return stable error codes defined in `ERROR_CODES.md` when that document exists.

## 12. Commits

Use Conventional Commits:

```text
feat: add order parser
fix: handle missing quantity
refactor: isolate product resolver
 test: add alias regression cases
 docs: update domain model
```

## 13. Scope Control

Codex must not:
- rewrite unrelated files
- change the database schema without the relevant spec/migration
- replace frameworks without an ADR
- introduce multi-agent orchestration before the corresponding architecture spec
- connect directly to personal Zalo accounts as an MVP shortcut

## 14. Security

Never commit:
- API keys
- OAuth tokens
- session cookies
- Zalo authentication data
- production credentials
- personal customer exports

Use `.env.example` with placeholders.

## 15. Documentation

If implementation changes behavior, update the relevant documentation in the same feature change.

Code and documentation must not intentionally disagree.

## 16. Definition of Done

A feature is done only when:
- acceptance criteria pass
- tests pass
- lint/type checks pass where configured
- no known critical regression exists
- documentation is updated
- migration is included when schema changes
- the Codex report identifies files changed and validation performed
