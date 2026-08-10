# SalesMind OS — Memory Engine

## Purpose
Maintain durable business context without treating every historical message as an instruction.

## Memory Layers
1. Source memory — immutable messages.
2. Entity memory — customers, products, aliases, orders.
3. Preference memory — verified customer habits/preferences.
4. Operational memory — open tasks and unresolved items.

## Memory Rules
- Facts need provenance.
- User corrections outrank model guesses.
- Expired or contradicted facts must be versioned, not silently overwritten.
- Memory retrieval must be scoped to the current business context.

## Customer Memory Example
For a customer, memory may contain:
- preferred payment method
- recurring delivery preference
- verified product aliases
- usual delivery address
- historical order patterns

A preference is not automatically a current order instruction.

## Update Flow
```text
new message
→ candidate fact
→ evidence check
→ conflict check
→ store/version
→ retrieve in future context
```

## Conflict Handling
If a new message contradicts an old preference, the newest explicit instruction applies to the current order. Historical preference remains available as history.

## Privacy
Memory must contain only data required for the product. Sensitive or unnecessary content must not be copied into derived memory fields.

## Evaluation
Test memory for:
- correct retrieval
- stale preference handling
- contradiction
- customer-specific aliases
- update vs duplicate creation
