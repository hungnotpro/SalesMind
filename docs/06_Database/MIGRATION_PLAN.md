# SalesMind OS — Migration Plan

## Phase 0
Create baseline schema for messages, customers, conversations, products, aliases, orders, order items, tasks, audit logs, and processing runs.

## Phase 1
Add indexes and constraints after golden-path tests confirm access patterns.

## Phase 2
Add user/ownership and review workflow tables.

## Phase 3
Add inventory, pricing, invoices, and delivery entities only when their feature specs are approved.

## Rules
- Every schema change has a migration.
- Never edit a previously applied production migration.
- Destructive changes require an explicit migration plan and backup strategy.
- Data transformations must be reversible or have a documented rollback strategy.
