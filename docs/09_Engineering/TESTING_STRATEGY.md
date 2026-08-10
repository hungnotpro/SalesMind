# SalesMind OS — Testing Strategy

## Test Layers

### Unit
Pure parsers, normalizers, product resolution, business rules, state transitions.

### Integration
Message ingestion through persistence, order creation, task generation, review flow.

### AI Regression
Versioned golden dataset with expected structured outputs and acceptable variants.

### End-to-End
Critical user journeys through dashboard/API.

## Golden Dataset
The initial dataset should cover:
- shorthand
- typos
- missing accents
- mixed instructions
- ambiguous products
- customer-specific aliases
- updates/cancellations
- duplicate messages
- dates

## Metrics
Track:
- product resolution accuracy
- quantity accuracy
- customer resolution accuracy
- task precision/recall
- false auto-resolution rate
- review rate
- duplicate rate

## Release Gate
No AI prompt/model change reaches production without regression evaluation and documented result.
