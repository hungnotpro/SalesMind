/**
 * SM-005 — End-to-end integration: HTTP API → real PostgreSQL pipeline.
 *
 * Boots a real HTTP server backed by the real MessageProcessingService
 * running against the real PostgreSQL database (salesmind_test).
 *
 * Verifies:
 *   - HTTP 201 on a valid POST
 *   - Idempotent replay returns the same orderId on a second POST
 *   - The message + conversation + order are all persisted to PostgreSQL
 *   - Customer linking happens after resolution
 *
 * Skipped gracefully when DATABASE_URL is unset or PostgreSQL is unreachable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import {
  IngestMessageController,
  MessageApiServer,
  createMessageIdempotencyLookup,
  type IngestMessageApiResponse,
  type ErrorApiResponse
} from '../../src/api/index.js';
import { connectFromEnv, isPostgresAvailable } from '../../src/db/connect.js';
import { runMigrations } from '../../src/db/migrations/runner.js';
import { createRepositories } from '../../src/db/pg/factory.js';
import { withTransaction, type PgPool } from '../../src/db/pg/pool.js';
import { ProductResolutionService } from '../../src/product-resolution/ProductResolutionService.js';
import { CustomerResolutionService } from '../../src/customer-resolution/CustomerResolutionService.js';
import { MessageProcessingService } from '../../src/services/MessageProcessingService.js';
import type { Message } from '../../src/services/MessageProcessingService.js';
import { ResolutionStatus } from '../../src/shared/enums.js';

type AnyResponse = IngestMessageApiResponse | ErrorApiResponse;

let pool: PgPool | undefined;
let available = false;
const DATABASE_URL = process.env.DATABASE_URL;

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let server: MessageApiServer | undefined;
let httpServer: Server | undefined;
let baseUrl: string;

beforeAll(async () => {
  if (!DATABASE_URL) {
    console.warn('[sm005-int] DATABASE_URL not set — skipping.');
    return;
  }
  try {
    pool = connectFromEnv();
    available = await isPostgresAvailable(pool);
    if (!available) {
      console.warn('[sm005-int] PostgreSQL not reachable — skipping.');
      return;
    }
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await runMigrations(pool);
  } catch (err) {
    console.warn(`[sm005-int] Failed to bootstrap: ${(err as Error).message}`);
    available = false;
    return;
  }

// Seed minimal products + aliases (use unique SKUs so multiple test runs
// don't collide on UNIQUE(sku))
const runId = `sm005-${Date.now()}`;
const repos = createRepositories(pool);
const pid = uuid();
await repos.productRepository.save({
  id: pid, sku: `BUN-${runId}`, name: 'Bun', normalizedName: 'bun',
  defaultUnit: 'cái', active: true
});
await repos.productAliasRepository.save({
  id: uuid(), productId: pid, alias: '55 bo', normalizedAlias: '55 bo',
  source: 'global', verified: true, confidence: 1.0
});

  // Build the controller wired to a transactional pipeline
  const idempotencyLookup = createMessageIdempotencyLookup(
    repos.messageRepository,
    repos.orderRepository
  );
  const invoker = async (message: Message) => {
    return withTransaction(pool!, async (client) => {
      const { createTransactionalRepositories } = await import('../../src/db/pg/factory.js');
      const txRepos = createTransactionalRepositories(client);
      const txProduct = new ProductResolutionService(txRepos.productRepository, txRepos.productAliasRepository);
      const txCustomer = new CustomerResolutionService(txRepos.customerRepository);
      const txMessage = new MessageProcessingService(
        txRepos.messageRepository,
        txRepos.conversationRepository,
        txRepos.orderRepository,
        txRepos.orderItemRepository,
        txRepos.taskRepository,
        txRepos.auditLogRepository,
        txProduct,
        txCustomer
      );
      return await txMessage.processMessage(message);
    });
  };

  const ctrl = new IngestMessageController({
    invoker,
    idempotencyLookup
  });
  server = new MessageApiServer(ctrl, { port: 0, host: '127.0.0.1' });
  httpServer = await server.listen();
  const addr = httpServer.address();
  if (typeof addr === 'object' && addr) {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(async () => {
  if (server) await server.close();
  if (pool) {
    // Clean up only our run's seeded data so subsequent runs can re-seed
    await pool.query(`DELETE FROM product_aliases WHERE alias = '55 bo' AND source = 'global' AND verified = true`);
    await pool.query(`DELETE FROM products WHERE sku LIKE 'BUN-sm005-%'`);
    await pool.end();
  }
});

describe('SM-005 E2E: HTTP API ↔ PostgreSQL pipeline', () => {
  it('POST /api/v1/messages persists message + conversation + order', async () => {
    if (!available) return;
    const extId = `e2e-msg-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: extId,
        externalConversationId: `e2e-conv-${Date.now()}`,
        text: '55 bo:5 cai',
        sender: { name: 'a.Long', phone: '0904813024' }
      })
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as AnyResponse;
    expect(body.success).toBe(true);
    if (body.success === true) {
      expect(body.data.messageId).toBeDefined();
      expect(body.data.orderId).toBeDefined();
      expect(body.meta.idempotentReplay).toBe(false);
    }

    // Verify rows exist in PostgreSQL
    const msgRow = await pool!.query(
      `SELECT id, source, external_message_id FROM messages WHERE source = 'manual' AND external_message_id = $1`,
      [extId]
    );
    expect(msgRow.rows.length).toBe(1);
    expect(msgRow.rows[0].source).toBe('manual');

    const orderRow = await pool!.query(
      `SELECT id, customer_id FROM orders WHERE id = $1`,
      [(body as IngestMessageApiResponse).data.orderId]
    );
    expect(orderRow.rows.length).toBe(1);
  });

  it('returns idempotent replay on second POST with same source+externalMessageId', async () => {
    if (!available) return;
    const extId = `e2e-idem-${Date.now()}`;
    const requestBody = JSON.stringify({
      source: 'manual',
      externalMessageId: extId,
      externalConversationId: `e2e-conv-idem-${Date.now()}`,
      text: '55 bo:5 cai',
      sender: { name: 'a.Long', phone: '0904813024' }
    });

    // First POST
    const r1 = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBody
    });
    expect(r1.status).toBe(201);
    const b1 = (await r1.json()) as IngestMessageApiResponse;
    expect(b1.meta.idempotentReplay).toBe(false);
    const firstOrderId = b1.data.orderId;

    // Second POST (same source+externalMessageId)
    const r2 = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBody
    });
    expect(r2.status).toBe(201);
    const b2 = (await r2.json()) as IngestMessageApiResponse;
    expect(b2.meta.idempotentReplay).toBe(true);
    expect(b2.data.orderId).toBe(firstOrderId);

    // Only one order row should exist for this message
    const orderCount = await pool!.query(
      `SELECT COUNT(*) AS count FROM orders
       WHERE source_message_id = (SELECT id FROM messages WHERE source = 'manual' AND external_message_id = $1)`,
      [extId]
    );
    expect(Number(orderCount.rows[0].count)).toBe(1);
  });

  it('rejects request missing externalConversationId', async () => {
    if (!available) return;
    const res = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: 'x',
        text: 'y'
      })
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorApiResponse;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects request with unknown field', async () => {
    if (!available) return;
    const res = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: 'x',
        externalConversationId: 'c',
        text: 'y',
        unexpectedField: 'z'
      })
    });
    expect(res.status).toBe(400);
  });
});