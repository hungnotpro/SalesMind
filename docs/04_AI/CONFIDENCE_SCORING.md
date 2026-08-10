# SalesMind OS — Confidence Scoring

## Purpose
Prevent uncertain AI interpretation from silently becoming business truth.

## Resolution States
- `resolved`
- `needs_review`
- `unresolved`
- `rejected`

## Evidence Hierarchy
Strong evidence should outrank model intuition:

1. exact verified alias
2. exact verified customer mapping
3. deterministic normalized match
4. verified historical mapping
5. fuzzy candidate
6. LLM proposal

## Suggested Thresholds
These are initial hypotheses and must be calibrated with real data:

- 0.95+ may be auto-resolved when supported by strong evidence.
- 0.80–0.949 normally requires review for business-critical fields.
- below 0.80 is unresolved.

Confidence is not a mathematical truth. It is a decision signal.

## Field Criticality
Higher scrutiny applies to:
- product identity
- quantity
- customer identity
- price
- discount
- payment terms

A wrong product mapping is more dangerous than a minor text normalization issue.

## Composite Confidence
Do not blindly average field scores. A critical low-confidence field should force review even when the overall message score is high.

## Audit
Store enough evidence to explain why a value was resolved, including matching method and knowledge-base record when available.
