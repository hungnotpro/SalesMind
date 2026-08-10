# SalesMind OS — Deployment

## Environments
- local
- staging
- production

## Promotion
```text
feature → PR → tests → staging → validation → production
```

## Secrets
Secrets live in environment/secret management, never Git.

## Observability
Production should expose structured logs, processing correlation IDs, error rates, AI provider failures, and queue/processing latency.

## Backup
Production data requires automated backups and a tested restore procedure before production launch.

## Cloudflare Direction
After the domain pipeline is stable, evaluate migration of stateless APIs/workers and durable agent state to Cloudflare services. Migration requires an ADR and load/compatibility tests.
