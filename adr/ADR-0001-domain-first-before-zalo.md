# ADR-0001 — Domain First, Zalo Second

## Status
Accepted

## Decision
Build and validate the message-to-order domain pipeline before implementing direct personal Zalo collection.

## Context
Zalo is the initial real-world source, but its personal-message integration can be more fragile than the core domain. Coupling the first implementation to a channel would make testing and future integrations harder.

## Consequences
Positive:
- domain can be tested with real examples without Zalo dependency
- other channels can reuse the pipeline
- Zalo integration can be replaced independently
- failures can be isolated

Negative:
- the first demo requires manual message input or a test collector
- end-to-end Zalo automation arrives later

## Revisit When
The core pipeline meets SM-001 acceptance criteria and a technically appropriate Zalo ingestion strategy is identified.
