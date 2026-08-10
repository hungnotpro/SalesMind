# SalesMind OS — AI Specification

## Role
The AI layer interprets natural-language sales communication. It is not the system of record and is not the final authority for business rules.

## Responsibilities
- intent classification
- candidate entity extraction
- natural-language date interpretation
- candidate product resolution
- candidate customer resolution
- update/cancellation interpretation

## Non-responsibilities
- direct database writes
- financial calculation without authoritative data
- inventory mutation
- autonomous customer messaging
- inventing missing business facts

## Structured Output
Every model call used for business extraction must produce schema-validated structured output.

Conceptual response:
```json
{
  "intent": "order",
  "confidence": 0.93,
  "items": [],
  "instructions": [],
  "review_required": false,
  "uncertainties": []
}
```

## Model Boundary
LLM provider calls must be isolated behind a provider interface so model vendors can be changed without changing domain logic.

## Prompt Versioning
Every production AI invocation must identify the prompt version and model configuration used.

## Human-in-the-loop
When confidence or ambiguity crosses configured thresholds, return `needs_review` rather than forcing a value.

## Evaluation
AI changes require regression evaluation against the golden dataset before promotion.
