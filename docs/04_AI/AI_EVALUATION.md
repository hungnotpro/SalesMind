# SalesMind OS — AI Evaluation

## Purpose
Measure whether AI changes improve real business accuracy instead of relying on subjective testing.

## Dataset Types
- golden orders
- ambiguous orders
- typo-heavy messages
- shorthand-heavy messages
- mixed order/instruction messages
- cancellations and updates
- unknown products
- customer identity conflicts

## Metrics
### Extraction
- intent accuracy
- item precision/recall
- quantity accuracy
- unit accuracy
- instruction classification accuracy

### Resolution
- product top-1 accuracy
- customer resolution accuracy
- false auto-resolution rate
- review precision

### Operations
- duplicate order rate
- duplicate task rate
- incorrect task creation rate
- human correction rate

## Golden Dataset
The golden dataset must contain expected structured outputs and remain versioned.

Never put unredacted private customer data into a public repository.

## Regression Policy
Every prompt/model/parser change must run against the relevant evaluation suite. A release cannot be considered an improvement merely because one example works.

## Error Taxonomy
Classify failures as:
- extraction
- normalization
- alias resolution
- customer resolution
- rule engine
- date/time
- persistence
- duplicate handling

## Human Review Loop
Corrections should be captured as evaluation candidates. A correction becomes a golden case only after review.
