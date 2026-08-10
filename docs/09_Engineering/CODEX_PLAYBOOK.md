# SalesMind OS — Codex Playbook

## Mission
Codex is the implementation engineer. It follows the repository specification and does not replace the architecture decision process.

## Required Reading Order
1. `.ai/project_context.md`
2. `.ai/coding_rules.md`
3. relevant domain document
4. relevant architecture document
5. Feature Spec
6. tests and existing implementation

## Before Coding
Codex must report:
- understanding of the feature
- files likely to change
- dependencies on existing behavior
- assumptions
- ambiguities/blockers

## During Coding
- implement only the requested feature
- preserve existing contracts
- add tests with the implementation
- keep domain logic framework-independent where practical
- validate external/LLM output
- do not commit secrets

## Forbidden Without Approval
- changing core framework
- changing database architecture
- adding a new AI provider
- introducing multi-agent orchestration
- direct personal Zalo automation
- changing business rules without documentation
- deleting source/audit data

## After Coding
Run applicable:
- tests
- typecheck
- lint
- build
- migration validation

Then report:
- files changed
- behavior added
- tests run
- known limitations
- follow-up recommendations

## Feature Completion
A Feature is complete only when its acceptance criteria pass and its Definition of Done is satisfied.

## Prompt Template
```text
You are implementing Feature <ID>.

Read:
- .ai/project_context.md
- .ai/coding_rules.md
- <relevant docs>
- <feature spec>

Do not redesign architecture.
Do not expand scope.
Implement acceptance criteria.
Add required tests.
Run validation.
Report files changed and validation results.
```

## Change Discipline
If Codex discovers that the feature cannot be implemented without an architectural change, stop and propose an ADR/RFC instead of silently changing the architecture.
