# SalesMind OS — Project Structure

Target structure:

```text
salesmind/
├── .ai/
├── docs/
├── specs/
├── knowledge/
│   ├── products/
│   ├── aliases/
│   └── customers/
├── datasets/
│   ├── messages/
│   └── evaluation/
├── prompts/
├── adr/
├── rfc/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   ├── domain/
│   ├── parser/
│   ├── ai/
│   ├── rules/
│   └── shared/
└── tests/
```

The exact framework layout may evolve through an ADR, but domain boundaries must remain clear.
