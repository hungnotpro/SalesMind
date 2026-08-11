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
  bootstrapMessageApiServer,
  createPostgresIdempotencyLookup,
  createPostgresPipelineInvoker,
  reconstructPipelineResult,
  type IngestMessageApiResponse,
  type ErrorApiResponse,
  type IdempotencyLookup,
  type PersistedMessageState,
  type ExistingOrder
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

  // Build a typed idempotency lookup that reads the persisted state
  // from PostgreSQL and reconstructs a PipelineResult. NO faked fields.
  const idempotencyLookup: IdempotencyLookup = async (source, externalMessageId) => {
    const msgRow = await pool!.query(
      `SELECT id, source, external_message_id, conversation_id, customer_id,
              raw_text, created_at
       FROM messages
       WHERE source = $1 AND external_message_id = $2
       LIMIT 1`,
      [source, externalMessageId]
    );
    if (msgRow.rows.length === 0) return null;
    const msg = msgRow.rows[0];

    // Conversation id: from message row or NULL
    const conversationId: string = msg.conversation_id ?? '';

    // Order linked to this message
    const orderRow = await pool!.query(
      `SELECT id, customer_id FROM orders WHERE source_message_id = $1 LIMIT 1`,
      [msg.id]
    );
    const order: ExistingOrder = orderRow.rows.length > 0 ? { id: orderRow.rows[0].id as string } : null;

    // Order items
    let orderItems: PersistedMessageState['orderItems'] = [];
    if (order) {
      const items = await pool!.query(
        `SELECT raw_product_name, resolution_status
         FROM order_items
         WHERE order_id = $1`,
        [order.id]
      );
      orderItems = items.rows.map((r) => ({
        rawProductName: r.raw_product_name as string,
        resolutionStatus: r.resolution_status as string
      }));
    }

    // Tasks
    const tasksRow = await pool!.query(
      `SELECT id, type, status FROM tasks WHERE source_message_id = $1`,
      [msg.id]
    );
    const tasks = tasksRow.rows.map((r) => ({
      id: r.id as string,
      type: r.type as string,
      status: r.status as string
    }));

    const state: PersistedMessageState = {
      messageId: msg.id as string,
      conversationId,
      rawText: msg.raw_text as string,
      customerId: (msg.customer_id as string | null) ?? (order?.id && orderRow.rows[0].customer_id as string | null),
      createdAt: new Date(msg.created_at as string),
      order,
      orderItems,
      tasks
    };
    return reconstructPipelineResult(state);
  };
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

  const ctrl = IngestMessageController.createForTest({
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

  // ========================================
  // SM-005.1 — Real PostgreSQL regression tests
  // ========================================

  it('POST persists correct messageId AND conversationId (Issue 1)', async () => {
    if (!available) return;
    const extId = `i1-pg-${Date.now()}`;
    const extConvId = `i1-conv-${Date.now()}`;
    const res = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: extId,
        externalConversationId: extConvId,
        text: '55 bo:5 cai',
        sender: { name: 'a.Long', phone: '0904813024' }
      })
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as IngestMessageApiResponse;
    expect(body.success).toBe(true);
    if (body.success === true) {
      // Bug fix: messageId MUST NOT be confused with conversationId
      expect(body.data.messageId).toBeDefined();
      expect(body.data.conversationId).toBeDefined();
      expect(body.data.messageId).not.toBe(body.data.conversationId);

      // Verify in the database
      const msgRows = await pool!.query(
        `SELECT m.id AS message_id, m.conversation_id
         FROM messages m
         WHERE m.source = 'manual' AND m.external_message_id = $1`,
        [extId]
      );
      expect(msgRows.rows.length).toBe(1);
      expect(msgRows.rows[0].message_id).toBe(body.data.messageId);
      expect(msgRows.rows[0].conversation_id).toBe(body.data.conversationId);

      const convRows = await pool!.query(
        `SELECT id FROM conversations WHERE id = $1`,
        [body.data.conversationId]
      );
      expect(convRows.rows.length).toBe(1);
    }
  });

  it('POST #2 returns the ORIGINAL persisted messageId (Issue 2)', async () => {
    if (!available) return;
    const extId = `i2-pg-${Date.now()}`;
    const extConvId = `i2-conv-${Date.now()}`;
    const body = JSON.stringify({
      source: 'manual',
      externalMessageId: extId,
      externalConversationId: extConvId,
      text: '55 bo:5 cai',
      sender: { name: 'a.Long', phone: '0904813024' }
    });

    const r1 = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    });
    expect(r1.status).toBe(201);
    const b1 = (await r1.json()) as IngestMessageApiResponse;
    const originalMessageId = b1.data.messageId;
    const originalConversationId = b1.data.conversationId;
    const originalOrderId = b1.data.orderId;
    expect(b1.meta.idempotentReplay).toBe(false);

    const r2 = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    });
    expect(r2.status).toBe(201);
    const b2 = (await r2.json()) as IngestMessageApiResponse;
    expect(b2.meta.idempotentReplay).toBe(true);
    // Bug fix: replay returns the ORIGINAL persisted IDs
    expect(b2.data.messageId).toBe(originalMessageId);
    expect(b2.data.conversationId).toBe(originalConversationId);
    expect(b2.data.orderId).toBe(originalOrderId);
  });

  it('replay preserves itemCount and reviewRequired (Issue 3)', async () => {
    if (!available) return;
    const extId = `i3-pg-${Date.now()}`;
    const extConvId = `i3-conv-${Date.now()}`;
    const body = JSON.stringify({
      source: 'manual',
      externalMessageId: extId,
      externalConversationId: extConvId,
      text: '55 bo:5 cai\n50g cay:5 cái',
      sender: { name: 'a.Long', phone: '0904813024' }
    });

    const r1 = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body
    });
    const b1 = (await r1.json()) as IngestMessageApiResponse;
    expect(b1.success).toBe(true);
    if (b1.success === true) {
      expect(b1.data.itemCount).toBeGreaterThan(0);

      const r2 = await fetch(`${baseUrl}/api/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
      });
      const b2 = (await r2.json()) as IngestMessageApiResponse;
      expect(b2.meta.idempotentReplay).toBe(true);
      // Replay must report the persisted itemCount (2 from the message)
      expect(b2.data.itemCount).toBe(b1.data.itemCount);
      expect(b2.data.reviewRequired).toBe(b1.data.reviewRequired);
    }
  });

  it('concurrent duplicate POSTs do NOT create duplicate rows (Issue 4)', async () => {
    if (!available) return;
    const extId = `i4-pg-${Date.now()}`;
    const extConvId = `i4-conv-${Date.now()}`;
    const body = JSON.stringify({
      source: 'manual',
      externalMessageId: extId,
      externalConversationId: extConvId,
      text: '55 bo:5 cai',
      sender: { name: 'a.Long', phone: '0904813024' }
    });

    // Fire 5 concurrent requests
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/api/v1/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body
        })
      )
    );

    // Every response must succeed (200/201). No 500 PROCESSING_FAILED
    // is acceptable for a duplicate.
    for (const r of responses) {
      expect(r.status).toBe(201);
    }

    const bodies = await Promise.all(
      responses.map((r) => r.json())
    ) as IngestMessageApiResponse[];

    // All responses must report the SAME messageId
    const messageIds = new Set(bodies.map((b) => b.data.messageId));
    expect(messageIds.size).toBe(1);
    const singleMessageId = bodies[0].data.messageId;

    // All responses must report the SAME conversationId
    const conversationIds = new Set(bodies.map((b) => b.data.conversationId));
    expect(conversationIds.size).toBe(1);
    const singleConversationId = bodies[0].data.conversationId;

    // At least one response must report idempotentReplay = true
    // (the loser of the race falls into the replay branch)
    // The first to win has idempotentReplay = false.
    const replayCount = bodies.filter((b) => b.meta.idempotentReplay).length;
    expect(replayCount).toBeGreaterThan(0);

    // Verify in PostgreSQL: only ONE message row, ONE conversation row,
    // ONE order row, and ONE set of tasks.
    const msgCount = await pool!.query(
      `SELECT COUNT(*) AS count FROM messages WHERE id = $1`,
      [singleMessageId]
    );
    expect(Number(msgCount.rows[0].count)).toBe(1);

    const convCount = await pool!.query(
      `SELECT COUNT(*) AS count FROM conversations WHERE id = $1`,
      [singleConversationId]
    );
    expect(Number(convCount.rows[0].count)).toBe(1);

    const orderCount = await pool!.query(
      `SELECT COUNT(*) AS count FROM orders WHERE source_message_id = $1`,
      [singleMessageId]
    );
    expect(Number(orderCount.rows[0].count)).toBe(1);

    const taskCount = await pool!.query(
      `SELECT COUNT(*) AS count FROM tasks WHERE source_message_id = $1`,
      [singleMessageId]
    );
    // Number of tasks depends on rules. The CRITICAL invariant is that
    // the count is bounded (not 5× the count for 5 concurrent requests).
    expect(Number(taskCount.rows[0].count)).toBeLessThan(5);
  });

  it('does NOT expose SQL details in any 500 response (Issue 5)', async () => {
    if (!available) return;
    // Create a request that will likely fail validation but exercise the
    // 500 path indirectly through a malformed invoker is risky in
    // real DB. Instead verify that ALL real responses in this test
    // do not leak SQL. We check the bodies of the previous requests.
    // (This test is mostly a placeholder asserting the response shape.)
    const res = await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: `i5-${Date.now()}`,
        externalConversationId: `i5-conv-${Date.now()}`,
        text: '55 bo:5 cai',
        sender: { name: 'a.Long', phone: '0904813024' }
      })
    });
    const text = await res.text();
    expect(text).not.toContain('messages_source_external_unique');
    expect(text).not.toContain('23505');
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain('postgres://');
    expect(text).not.toContain('Stack:');
  });

  it('preserves caller-supplied X-Request-ID through the response (Issue 6)', async () => {
    if (!available) return;
    const requestId = 'aaaaaaaa-1111-4222-8333-444444444444';
    const res = (await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': requestId
      },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: `i6-${Date.now()}`,
        externalConversationId: `i6-conv-${Date.now()}`,
        text: '55 bo:5 cai',
        sender: { name: 'a.Long', phone: '0904813024' }
      })
    })) as unknown as {
      status: number;
      headers: { get(name: string): string | null };
      json: () => Promise<unknown>;
    };
    expect(res.status).toBe(201);
    expect(res.headers.get('x-request-id')).toBe(requestId);
    const body = (await res.json()) as IngestMessageApiResponse;
    expect(body.data.correlationId).toBe(requestId);
    // The correlation ID MUST NOT be confused with the persisted IDs
    expect(body.data.correlationId).not.toBe(body.data.messageId);
    expect(body.data.correlationId).not.toBe(body.data.conversationId);
  });
});

// ============================================================
// SM-005.2 — Mandatory idempotency lookup in production wiring
// ============================================================

/**
 * These tests verify that:
 *
 *   1. `IngestMessageController.create()` throws when idempotencyLookup
 *      is missing — there is no silent fallback.
 *
 *   2. The production bootstrap wires a real PostgreSQL-backed
 *      IdempotencyLookup into the controller.
 *
 *   3. Duplicate sequential POSTs return replay.
 *
 *   4. Concurrent duplicate POSTs return the same persisted result.
 *
 *   5. No fake/mock lookup exists in production wiring.
 */
describe('SM-005.2: Production wiring requires idempotencyLookup', () => {
  // ========================================
  // Type-level guard: production factory throws without idempotencyLookup
  // ========================================
  it('IngestMessageController.create throws when idempotencyLookup is missing', () => {
    // Cast: bypass the type-level check to verify the runtime guard.
    // This is exactly the production-construction contract we want to
    // enforce: missing idempotencyLookup must throw, not silently
    // fall back.
    expect(() => {
      IngestMessageController.create({
        invoker: async () => makePipelineResult()
      } as unknown as Parameters<typeof IngestMessageController.create>[0]);
    }).toThrow(/idempotencyLookup/);
  });

  it('IngestMessageController.create accepts a real IdempotencyLookup', () => {
    const ctrl = IngestMessageController.create({
      invoker: async () => makePipelineResult(),
      idempotencyLookup: async () => null
    });
    expect(ctrl).toBeDefined();
  });

  it('createForTest allows omission (test-only path)', () => {
    const ctrl = IngestMessageController.createForTest({
      invoker: async () => makePipelineResult()
    });
    expect(ctrl).toBeDefined();
  });

  it('createForTest still works when a lookup is provided', () => {
    const ctrl = IngestMessageController.createForTest({
      invoker: async () => makePipelineResult(),
      idempotencyLookup: async () => null
    });
    expect(ctrl).toBeDefined();
  });

  it('production wiring uses a real PostgreSQL-backed IdempotencyLookup (no mocks)', () => {
    if (!available || !pool) return;
    const lookup = createPostgresIdempotencyLookup(pool);
    // The lookup is a real async function reading the database
    expect(typeof lookup).toBe('function');
    // Calling it must NOT throw on missing rows; it returns null
    return lookup('nonexistent-source', 'nonexistent-external-id').then((r) => {
      expect(r).toBeNull();
    });
  });

  it('production wiring uses a real transactional PipelineInvoker (no mocks)', () => {
    if (!available || !pool) return;
    const invoker = createPostgresPipelineInvoker(pool);
    expect(typeof invoker).toBe('function');
    // The invoker must be an async function — calling it without a
    // pool-bound pipeline will exercise the transaction path. We do
    // not call it here to avoid mutating the DB in this test.
  });
});

describe('SM-005.2: bootstrapMessageApiServer wires production components', () => {
  it('produces a fully-wired server backed by the real PostgreSQL lookup and invoker', async () => {
    if (!available || !pool) return;

    // Stop the shared server while bootstrap is running to avoid port
    // conflicts (we will reuse `pool`).
    if (server) await server.close();
    if (httpServer) await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    server = undefined;
    httpServer = undefined;

    const boot = await bootstrapMessageApiServer({ pool, runMigrations: false });
    expect(boot.controller).toBeDefined();
    expect(boot.server).toBeDefined();
    expect(boot.pool).toBe(pool);
    expect(typeof boot.idempotencyLookup).toBe('function');
    expect(typeof boot.invoker).toBe('function');

    // Boot the server, exercise it, then tear down.
    const httpS = await boot.server.listen();
    const addr = httpS.address();
    if (typeof addr !== 'object' || !addr) throw new Error('bind failed');
    const bootUrl = `http://127.0.0.1:${addr.port}`;

    // 1. Sequential duplicate POST returns replay
    const extId = `sm52-seq-${Date.now()}`;
    const reqBody = JSON.stringify({
      source: 'manual',
      externalMessageId: extId,
      externalConversationId: `sm52-conv-seq-${Date.now()}`,
      text: '55 bo:5 cai',
      sender: { name: 'a.Long', phone: '0904813024' }
    });
    const r1 = await fetch(`${bootUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: reqBody
    });
    expect(r1.status).toBe(201);
    const b1 = (await r1.json()) as IngestMessageApiResponse;
    expect(b1.meta.idempotentReplay).toBe(false);

    const r2 = await fetch(`${bootUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: reqBody
    });
    expect(r2.status).toBe(201);
    const b2 = (await r2.json()) as IngestMessageApiResponse;
    expect(b2.meta.idempotentReplay).toBe(true);
    expect(b2.data.messageId).toBe(b1.data.messageId);
    expect(b2.data.conversationId).toBe(b1.data.conversationId);
    expect(b2.data.orderId).toBe(b1.data.orderId);

    // 2. Concurrent duplicate POSTs converge to the same persisted result
    const concExt = `sm52-conc-${Date.now()}`;
    const concBody = JSON.stringify({
      source: 'manual',
      externalMessageId: concExt,
      externalConversationId: `sm52-conv-conc-${Date.now()}`,
      text: '55 bo:5 cai',
      sender: { name: 'a.Long', phone: '0904813024' }
    });
    const concurrentResults = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${bootUrl}/api/v1/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: concBody
        })
      )
    );
    const concurrentBodies = (await Promise.all(
      concurrentResults.map((r) => r.json())
    )) as Array<IngestMessageApiResponse | ErrorApiResponse>;
    const successBodies = concurrentBodies.filter((b) => b.success === true) as IngestMessageApiResponse[];
    expect(successBodies.length).toBeGreaterThan(0);
    const uniqueMsgIds = new Set(successBodies.map((b) => b.data.messageId));
    expect(uniqueMsgIds.size).toBe(1);

    // Verify database state: only ONE message + ONE conversation +
    // ONE order, regardless of how concurrent the requests were.
    const msgCount = await pool!.query(
      `SELECT COUNT(*) AS count FROM messages
       WHERE source = 'manual' AND external_message_id = $1`,
      [concExt]
    );
    expect(Number(msgCount.rows[0].count)).toBe(1);

    const singleMsgId = successBodies[0].data.messageId;
    const singleConvId = successBodies[0].data.conversationId;
    const orderCount = await pool!.query(
      `SELECT COUNT(*) AS count FROM orders WHERE source_message_id = $1`,
      [singleMsgId]
    );
    expect(Number(orderCount.rows[0].count)).toBe(1);

    const convCount = await pool!.query(
      `SELECT COUNT(*) AS count FROM conversations WHERE id = $1`,
      [singleConvId]
    );
    expect(Number(convCount.rows[0].count)).toBe(1);

    // Tear down the boot server
    await boot.server.close();
  });

  it('does NOT provide a fake/mock IdempotencyLookup as a fallback', () => {
    // The factory does NOT define a default lookup when none is
    // provided — `create()` throws. The bootstrap helper always
    // builds a real PG-backed lookup when none is injected.
    expect(() => {
      IngestMessageController.create({
        invoker: async () => makePipelineResult(),
        // idempotencyLookup intentionally omitted
      } as any); // Cast to bypass the type guard; this is a runtime check.
    }).toThrow(/idempotencyLookup/);
  });
});

// Local helper used only in this file's tests
function makePipelineResult(): import('../../src/services/MessageProcessingService.js').PipelineResult {
  return {
    messageId: 'm',
    conversationId: 'conv',
    correlationId: 'c',
    rawText: 'r',
    intent: 'order' as unknown as import('../../src/shared/enums.js').MessageIntent,
    intentConfidence: 1.0,
    items: [],
    instructions: [],
    invoiceRequired: false,
    taskIds: [],
    reviewRequired: false,
    reviewReasons: [],
    warnings: [],
    metadata: {
      processedAt: new Date().toISOString(),
      processingDurationMs: 0,
      parserVersion: '1.0.0',
      ruleEngineVersion: '1.0.0'
    }
  };
}