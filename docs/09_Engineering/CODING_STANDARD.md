# SalesMind OS — Coding Standard

## Language
TypeScript strict mode for application code.

## Structure
Keep transport, application, domain, and infrastructure concerns separated.

## Formatting
Use project formatter and linter. Do not mix formatting-only changes with unrelated feature changes.

## Naming
Use domain terms consistently and prefer explicit names.

## Functions
Prefer small pure functions for parsing and rules.

## Errors
Use typed/domain errors where useful. Never swallow unexpected errors.

## AI
Validate every model response against a schema. Keep prompts versioned.

## Tests
Business rules require deterministic tests. AI features require golden regression cases.

## Security
Never commit secrets, tokens, session cookies, customer exports, or production credentials.
