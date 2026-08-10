# SalesMind OS — Customer Memory

## Purpose
Represent verified customer context useful for order processing and daily operations.

## Stored Context
Potential fields:
- canonical customer identity
- verified phone numbers
- delivery addresses
- verified product aliases
- payment preferences
- recurring delivery preferences
- invoice preferences
- notes explicitly entered by the user

## Precedence
Current explicit order instructions > verified customer preference > historical pattern > AI guess.

## Example
If a customer historically uses cash but a new order says bank transfer, the new order uses bank transfer. The historical cash preference remains historical context.

## Alias Memory
A customer-specific alias can be stored only after sufficient evidence or human confirmation.

## No Automatic Learning of Critical Facts
Do not automatically learn prices, discounts, tax treatment, credit limits, or financial terms from a single ambiguous message.

## Retrieval
Customer memory should be retrieved using stable identity, not merely a similar name.

## Audit
Changes to durable customer memory must be traceable to source evidence or human action.
