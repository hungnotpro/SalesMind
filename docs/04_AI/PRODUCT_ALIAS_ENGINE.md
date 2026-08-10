# SalesMind OS — Product Alias Engine

## 1. Purpose

Resolve informal product expressions such as abbreviations, missing accents, typos, packaging shorthand, and customer-specific names into canonical Products.

## 2. Key Principle

The LLM may propose a candidate. The knowledge base and deterministic resolver decide whether the candidate is safe to use.

## 3. Resolution Pipeline

```text
raw product phrase
→ trim/normalize
→ exact alias lookup
→ customer-specific alias lookup
→ global alias lookup
→ normalized/fuzzy candidate search
→ optional LLM candidate proposal
→ confidence calculation
→ resolved OR needs_review OR unresolved
```

## 4. Normalization

Normalization may include:
- Unicode normalization
- lowercase
- accent normalization for comparison
- whitespace normalization
- punctuation normalization
- common typo normalization

The original phrase must always be retained separately.

## 5. Alias Sources

Supported sources:
- global business alias
- customer-specific alias
- verified human correction
- imported catalog mapping
- model suggestion pending verification

Only verified sources should automatically become authoritative mappings.

## 6. Example

Input:

```text
55 bơ
```

Possible alias record:

```text
alias: 55 bơ
product_id: <canonical product>
verified: true
source: human
```

If this record exists, resolve deterministically.

If it does not exist, do not invent a canonical product.

## 7. Confidence Policy

Suggested initial thresholds:

- `>= 0.95`: auto-resolve when supported by a verified alias/exact match.
- `0.80–0.949`: candidate, review depending on business impact.
- `< 0.80`: needs review/unresolved.

Thresholds must be configurable and evaluated against real data before production.

## 8. Customer-Specific Alias

If customer A consistently uses a verified shorthand that differs from the global catalog, store a customer-specific alias.

Customer-specific mappings must not silently overwrite global aliases.

## 9. Learning Loop

When a user corrects:

```text
55 bo → Product X
```

record:
- original alias
- chosen product
- customer context
- user/action
- timestamp

Promotion to verified alias requires the configured approval policy.

## 10. Safety

Never auto-create a new canonical Product from an alias. Products belong to the catalog, not to the AI parser.

## 11. Evaluation

The resolver must be tested on:
- exact aliases
- typos
- missing accents
- abbreviations
- ambiguous aliases
- unknown products
- customer-specific aliases

Metrics:
- top-1 resolution accuracy
- review precision
- unresolved recall
- false auto-resolution rate
