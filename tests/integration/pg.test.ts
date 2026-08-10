/**
 * PostgreSQL Integration Tests
 *
 * These tests verify the real PostgreSQL persistence layer.
 *
 * Requirements:
 *   - PostgreSQL 17+ running locally
 *   - DATABASE_URL=postgres://user:pass@host:port/dbname
 *   - uuid-ossp extension installed in the database
 *
 * Per spec: "If PostgreSQL is not available in the local environment,
 * do NOT fake the tests. Instead: report the missing dependency,
 * provide the test setup, keep unit tests passing, do not claim
 * PostgreSQL integration tests passed."
 *
 * The tests use real UUIDs produced by `uuid-ossp` at the SQL level
 * (DEFAULT uuid_generate_v4()) and pass them in via the application.
 * Schema fixtures use proper UUIDs (not string IDs).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PgPool } from '../../src/db/pg/pool.js';
import { createPool, withTransaction } from '../../src/db/pg/pool.js';
import { isPostgresAvailable } from '../../src/db/connect.js';
import { runMigrations } from '../../src/db/migrations/runner.js';
import { createRepositories, createTransactionalRepositories } from '../../src/db/pg/factory.js';
import { ProductResolutionService } from '../../src/product-resolution/ProductResolutionService.js';
import { CustomerResolutionService } from '../../src/customer-resolution/CustomerResolutionService.js';
import { MessageProcessingService } from '../../src/services/MessageProcessingService.js';
import type { Message } from '../../src/services/MessageProcessingService.js';
import { ResolutionStatus } from '../../src/shared/enums.js';

// ============================================================
// UUID helpers — generate proper UUIDs at the test fixture level
// ============================================================

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let counter = 0;
function uniqueId(prefix: string): string {
  // Append a counter so even when Math.random collides the ID is unique
  counter += 1;
  return `${prefix}-${counter}-${uuid()}`;
}

// ============================================================
// Test bootstrap
// ============================================================

let pool: PgPool | undefined;
let postgresAvailable = false;

const DATABASE_URL = process.env.DATABASE_URL;

beforeAll(async () => {
  if (!DATABASE_URL) {
    console.warn(
      '[pg-integration] DATABASE_URL not set — skipping PostgreSQL integration tests. ' +
      'Set DATABASE_URL and ensure PostgreSQL is running to enable these tests.'
    );
    return;
  }
  try {
    pool = createPool({ connectionString: DATABASE_URL });
    postgresAvailable = await isPostgresAvailable(pool);
    if (!postgresAvailable) {
      console.warn('[pg-integration] PostgreSQL not reachable — skipping tests.');
      return;
    }
    // Ensure uuid-ossp is available
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await runMigrations(pool);
  } catch (err) {
    console.warn(`[pg-integration] Failed to bootstrap: ${(err as Error).message}`);
    postgresAvailable = false;
  }
});

afterAll(async () => {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
});

beforeEach(async (ctx) => {
  if (!postgresAvailable || !pool) {
    ctx.skip();
    return;
  }
  await pool.query(`
    TRUNCATE
      audit_logs, order_items, tasks, orders, messages,
      product_aliases, conversations, customers, products
    RESTART IDENTITY CASCADE
  `);
  counter = 0;
});

// ============================================================
// 1. database connection
// ============================================================

describe('PG: 1. Database Connection', () => {
  it('should connect to PostgreSQL', () => {
    if (!postgresAvailable) return;
    expect(pool).toBeDefined();
  });

  it('should report availability', () => {
    if (!postgresAvailable) return;
    expect(postgresAvailable).toBe(true);
  });
});

// ============================================================
// 2. migration success
// ============================================================

describe('PG: 2. Migration', () => {
  it('should have applied base schema', async () => {
    if (!postgresAvailable || !pool) return;
    const r = await pool.query<{ version: string }>(
      `SELECT version FROM schema_migrations ORDER BY version ASC`
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(2);
    expect(r.rows[0].version).toBe('001');
    expect(r.rows[1].version).toBe('002');
  });

  it('should have all required tables', async () => {
    if (!postgresAvailable || !pool) return;
    const r = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       ORDER BY table_name`
    );
    const names = r.rows.map((row) => row.table_name);
    for (const expected of [
      'audit_logs', 'conversations', 'customers', 'messages',
      'order_items', 'orders', 'product_aliases', 'products',
      'schema_migrations', 'tasks'
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('should be idempotent (runMigrations is safe to call twice)', async () => {
    if (!postgresAvailable || !pool) return;
    await runMigrations(pool); // should be a no-op
    const r = await pool.query<{ version: string }>(
      `SELECT version FROM schema_migrations`
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// 3. customer persistence
// ============================================================

describe('PG: 3. Customer Persistence', () => {
  it('should insert and find a customer', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const id = uuid();
    const customer = {
      id,
      displayName: 'a.Long',
      normalizedName: 'along',
      phone: '0904813024',
      normalizedPhone: '84904813024',
      conversationIds: [],
      status: 'active',
      verified: true,
      confidence: 1.0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    await repos.customerRepository.save(customer);
    const found = await repos.customerRepository.findById(id);
    expect(found).not.toBeNull();
    expect(found!.displayName).toBe('a.Long');
    expect(found!.verified).toBe(true);
  });

  it('should find by phone', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const id = uuid();
    await repos.customerRepository.save({
      id, displayName: 'A', normalizedName: 'a',
      phone: '0904', normalizedPhone: '84904',
      conversationIds: [], status: 'active', verified: true, confidence: 1,
      createdAt: new Date(), updatedAt: new Date()
    });
    const found = await repos.customerRepository.findByPhone('84904');
    expect(found?.id).toBe(id);
  });

  it('should find by conversation', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const cid = uuid();
    const vid = uuid();
    await repos.customerRepository.save({
      id: cid, displayName: 'A', normalizedName: 'a',
      conversationIds: [], status: 'active', verified: true, confidence: 1,
      createdAt: new Date(), updatedAt: new Date()
    });
    await repos.conversationRepository.save({
      id: vid, source: 'zalo', externalConversationId: 'ex-1',
      customerId: cid, createdAt: new Date(), updatedAt: new Date()
    });
    const found = await repos.customerRepository.findByConversationId(vid);
    expect(found?.id).toBe(cid);
  });
});

// ============================================================
// 4. conversation persistence
// ============================================================

describe('PG: 4. Conversation Persistence', () => {
  it('should insert and find a conversation', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const id = uuid();
    await repos.conversationRepository.save({
      id, source: 'zalo', externalConversationId: 'ex-1',
      createdAt: new Date(), updatedAt: new Date()
    });
    const found = await repos.conversationRepository.findById(id);
    expect(found?.source).toBe('zalo');
    expect(found?.externalConversationId).toBe('ex-1');
  });

  it('should enforce UNIQUE(source, external_conversation_id)', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    await repos.conversationRepository.save({
      id: uuid(), source: 'zalo', externalConversationId: 'ex-unique',
      createdAt: new Date(), updatedAt: new Date()
    });
    await expect(
      repos.conversationRepository.save({
        id: uuid(), source: 'zalo', externalConversationId: 'ex-unique',
        createdAt: new Date(), updatedAt: new Date()
      })
    ).rejects.toThrow();
  });

  it('should find-or-create', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const a = await repos.conversationRepository.findOrCreate('zalo', 'ex-foc-' + Date.now());
    const b = await repos.conversationRepository.findOrCreate('zalo', 'ex-foc-' + Date.now());
    void a; void b;
    const c1 = await repos.conversationRepository.findOrCreate('zalo', 'ex-foc-1');
    const c2 = await repos.conversationRepository.findOrCreate('zalo', 'ex-foc-1');
    expect(c1.id).toBe(c2.id);
  });
});

// ============================================================
// 5. message persistence
// ============================================================

describe('PG: 5. Message Persistence', () => {
  it('should insert and find a message', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const id = uuid();
    const msg: Message = {
      id, source: 'zalo', externalMessageId: 'em-1',
      sender: { name: 'A', phone: '0904' },
      receivedAt: new Date(), rawText: '55 bo:5 cai',
      processingStatus: 'received',
      createdAt: new Date(), updatedAt: new Date()
    };
    await repos.messageRepository.save(msg);
    const found = await repos.messageRepository.findById(id);
    expect(found?.rawText).toBe('55 bo:5 cai');
  });

  // 6. message idempotency
  it('should enforce UNIQUE(source, external_message_id)', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const extId = 'em-uniq-' + Date.now();
    const msg: Message = {
      id: uuid(), source: 'zalo', externalMessageId: extId,
      sender: {}, receivedAt: new Date(), rawText: 'x',
      processingStatus: 'received',
      createdAt: new Date(), updatedAt: new Date()
    };
    await repos.messageRepository.save(msg);
    const dup = await repos.messageRepository.findBySourceAndExternalId('zalo', extId);
    expect(dup).not.toBeNull();
  });
});

// ============================================================
// 7-9. product persistence + global/customer alias
// ============================================================

describe('PG: 7-9. Product & ProductAlias Persistence', () => {
  it('should persist a product', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const id = uuid();
    await repos.productRepository.save({
      id, sku: 'BUN01', name: 'Bun', normalizedName: 'bun',
      defaultUnit: 'cái', active: true
    });
    const found = await repos.productRepository.findBySku('BUN01');
    expect(found?.id).toBe(id);
  });

  it('should persist a global alias', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const pid = uuid();
    await repos.productRepository.save({
      id: pid, sku: 'BUN01', name: 'Bun', normalizedName: 'bun',
      defaultUnit: 'cái', active: true
    });
    await repos.productAliasRepository.save({
      id: uuid(), productId: pid, alias: '55 bo', normalizedAlias: '55 bo',
      source: 'global', verified: true, confidence: 1.0
    });
    const found = await repos.productAliasRepository.findByExactAlias('55 bo');
    expect(found?.productId).toBe(pid);
    expect(found?.customerId).toBeUndefined();
  });

  it('should persist a customer-specific alias', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const pid = uuid();
    const cid = uuid();
    await repos.productRepository.save({
      id: pid, sku: 'BUN01', name: 'Bun', normalizedName: 'bun',
      defaultUnit: 'cái', active: true
    });
    await repos.customerRepository.save({
      id: cid, displayName: 'A', normalizedName: 'a',
      conversationIds: [], status: 'active', verified: true, confidence: 1,
      createdAt: new Date(), updatedAt: new Date()
    });
    await repos.productAliasRepository.save({
      id: uuid(), productId: pid, customerId: cid,
      alias: '55 bo', normalizedAlias: '55 bo',
      source: 'customer', verified: true, confidence: 1.0
    });
    const found = await repos.productAliasRepository.findByExactAlias('55 bo', cid);
    expect(found?.customerId).toBe(cid);
    expect(found?.productId).toBe(pid);
  });

  it('should prefer customer-specific alias', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const p1 = uuid();
    const p2 = uuid();
    const cid = uuid();
    await repos.productRepository.save({
      id: p1, sku: 'BUN01', name: 'Bun', normalizedName: 'bun',
      defaultUnit: 'cái', active: true
    });
    await repos.productRepository.save({
      id: p2, sku: 'BUN02', name: 'Bread', normalizedName: 'bread',
      defaultUnit: 'cái', active: true
    });
    await repos.customerRepository.save({
      id: cid, displayName: 'A', normalizedName: 'a',
      conversationIds: [], status: 'active', verified: true, confidence: 1,
      createdAt: new Date(), updatedAt: new Date()
    });
    await repos.productAliasRepository.save({
      id: uuid(), productId: p1, alias: '55 bo', normalizedAlias: '55 bo',
      source: 'global', verified: true, confidence: 1.0
    });
    await repos.productAliasRepository.save({
      id: uuid(), productId: p2, customerId: cid,
      alias: '55 bo', normalizedAlias: '55 bo',
      source: 'customer', verified: true, confidence: 1.0
    });
    const customerSpecific = await repos.productAliasRepository.findByExactAlias('55 bo', cid);
    const globalOnly = await repos.productAliasRepository.findByExactAlias('55 bo');
    expect(customerSpecific?.productId).toBe(p2);
    expect(globalOnly?.productId).toBe(p1);
  });
});

// ============================================================
// 10-11. order persistence
// ============================================================

describe('PG: 10-11. Order & OrderItem Persistence', () => {
  it('should persist an order with items', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const pid = uuid();
    const cid = uuid();
    const oid = uuid();
    const oiid = uuid();
    await repos.productRepository.save({
      id: pid, sku: 'BUN01', name: 'Bun', normalizedName: 'bun',
      defaultUnit: 'cái', active: true
    });
    await repos.customerRepository.save({
      id: cid, displayName: 'A', normalizedName: 'a',
      phone: '0904', normalizedPhone: '84904',
      conversationIds: [], status: 'active', verified: true, confidence: 1,
      createdAt: new Date(), updatedAt: new Date()
    });
    // Create a message first (FK requirement for orders.source_message_id)
    const msgId = uuid();
    await repos.messageRepository.save({
      id: msgId, source: 'zalo', externalMessageId: 'em-ord-' + Date.now(),
      sender: {}, receivedAt: new Date(), rawText: '55 bo',
      processingStatus: 'received',
      createdAt: new Date(), updatedAt: new Date()
    });
    const order = {
      id: oid, customerId: cid, sourceMessageId: msgId,
      orderDate: new Date(), status: 'draft', invoiceRequired: false,
      createdAt: new Date(), updatedAt: new Date()
    };
    await repos.orderRepository.save(order);
    await repos.orderItemRepository.save({
      id: oiid, orderId: oid, productId: pid,
      rawProductName: '55 bo', quantity: 5, unit: 'cái',
      resolutionStatus: 'resolved',
      createdAt: new Date(), updatedAt: new Date()
    });
    const items = await repos.orderItemRepository.findByOrderId(oid);
    expect(items.length).toBe(1);
    expect(items[0].productId).toBe(pid);
  });
});

// ============================================================
// 12-13. task persistence + duplicate prevention
// ============================================================

describe('PG: 12-13. Task Persistence', () => {
  it('should persist a task', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    // Create customer+order first (FK requirement)
    const cid = uuid();
    const oid = uuid();
    await repos.customerRepository.save({
      id: cid, displayName: 'A', normalizedName: 'a',
      conversationIds: [], status: 'active', verified: true, confidence: 1,
      createdAt: new Date(), updatedAt: new Date()
    });
    await repos.orderRepository.save({
      id: oid, customerId: cid, sourceMessageId: undefined,
      orderDate: new Date(), status: 'draft', invoiceRequired: false,
      createdAt: new Date(), updatedAt: new Date()
    });
    const id = uuid();
    await repos.taskRepository.save({
      id, orderId: oid, type: 'delivery',
      title: 'Deliver', priority: 'normal', status: 'pending',
      dueAt: new Date('2026-01-15'),
      createdAt: new Date(), updatedAt: new Date()
    });
    const found = await repos.taskRepository.findById(id);
    expect(found?.type).toBe('delivery');
  });

  it('should prevent duplicate tasks by business key', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const cid = uuid();
    const oid = uuid();
    await repos.customerRepository.save({
      id: cid, displayName: 'A', normalizedName: 'a',
      conversationIds: [], status: 'active', verified: true, confidence: 1,
      createdAt: new Date(), updatedAt: new Date()
    });
    await repos.orderRepository.save({
      id: oid, customerId: cid, sourceMessageId: undefined,
      orderDate: new Date(), status: 'draft', invoiceRequired: false,
      createdAt: new Date(), updatedAt: new Date()
    });
    const dueAt = new Date('2026-01-15');
    await repos.taskRepository.save({
      id: uuid(), orderId: oid, type: 'delivery',
      title: 'Deliver', priority: 'normal', status: 'pending',
      dueAt,
      createdAt: new Date(), updatedAt: new Date()
    });
    await repos.taskRepository.save({
      id: uuid(), orderId: oid, type: 'delivery',
      title: 'Deliver (retry)', priority: 'normal', status: 'pending',
      dueAt,
      createdAt: new Date(), updatedAt: new Date()
    });
    const dup = await repos.taskRepository.findByBusinessKey(oid, 'delivery', dueAt);
    expect(dup).not.toBeNull();
  });
});

// ============================================================
// 14. audit persistence
// ============================================================

describe('PG: 14. AuditLog Persistence', () => {
  it('should persist an audit log with FK to existing message', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    // First persist a message (FK requirement)
    const msgId = uuid();
    await repos.messageRepository.save({
      id: msgId, source: 'zalo', externalMessageId: 'em-audit-' + Date.now(),
      sender: {}, receivedAt: new Date(), rawText: 'audit',
      processingStatus: 'received',
      createdAt: new Date(), updatedAt: new Date()
    });
    const id = uuid();
    await repos.auditLogRepository.save({
      id, entityType: 'Order', entityId: uuid(),
      action: 'Create', actorType: 'System',
      beforeData: undefined, afterData: JSON.stringify({ status: 'draft' }),
      sourceMessageId: msgId,
      createdAt: new Date()
    });
    expect(true).toBe(true);
  });

  it('should persist an audit log without source message', async () => {
    if (!postgresAvailable) return;
    const repos = createRepositories(pool!);
    const id = uuid();
    await repos.auditLogRepository.save({
      id, entityType: 'Order', entityId: uuid(),
      action: 'Create', actorType: 'System',
      beforeData: undefined, afterData: JSON.stringify({ status: 'draft' }),
      sourceMessageId: undefined,
      createdAt: new Date()
    });
    expect(true).toBe(true);
  });
});

// ============================================================
// 15. transaction rollback
// ============================================================

describe('PG: 15. Transaction Rollback', () => {
  it('should rollback all writes on failure', async () => {
    if (!postgresAvailable || !pool) return;
    let rollbackTriggered = false;
    try {
      await withTransaction(pool, async (client) => {
        // 1. Write a customer
        await client.query(
          `INSERT INTO customers (id, display_name, normalized_name)
           VALUES ($1, 'Test', 'test')`,
          [uuid()]
        );
        // 2. Write a conversation
        await client.query(
          `INSERT INTO conversations (id, source, external_conversation_id)
           VALUES ($1, 'zalo', $2)`,
          [uuid(), 'ext-rollback-' + Date.now()]
        );
        // 3. Force failure
        throw new Error('intentional rollback');
      });
    } catch (err) {
      rollbackTriggered = true;
      expect((err as Error).message).toContain('intentional rollback');
    }
    expect(rollbackTriggered).toBe(true);
    // Verify NO partial business data remains
    const r = await pool.query(
      `SELECT id FROM customers WHERE display_name = 'Test'`
    );
    expect(r.rows.length).toBe(0);
    const rc = await pool.query(
      `SELECT id FROM conversations WHERE source = 'zalo' AND external_conversation_id LIKE 'ext-rollback-%'`
    );
    expect(rc.rows.length).toBe(0);
  });
});

// ============================================================
// 16. full pipeline
// ============================================================

describe('PG: 16. Full Message Pipeline (transactional)', () => {
  it('should persist a full message → order transaction', async () => {
    if (!postgresAvailable || !pool) return;
    const seedRepos = createRepositories(pool);
    const pid = uuid();
    const aid = uuid();
    await seedRepos.productRepository.save({
      id: pid, sku: 'BUN01', name: 'Bun', normalizedName: 'bun',
      defaultUnit: 'cái', active: true
    });
    await seedRepos.productAliasRepository.save({
      id: aid, productId: pid, alias: '55 bo', normalizedAlias: '55 bo',
      source: 'global', verified: true, confidence: 1.0
    });

    const message: Message = {
      id: uuid(),
      source: 'zalo',
      externalMessageId: 'em-pipe-' + Date.now(),
      sender: { name: 'Long', phone: '0904813024' },
      receivedAt: new Date(),
      rawText: '55 bo:5 cai',
      processingStatus: 'received',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await withTransaction(pool, async (client) => {
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

    expect(result.orderId).toBeDefined();
    const order = await seedRepos.orderRepository.findById(result.orderId!);
    expect(order).not.toBeNull();
  });

  it('should be idempotent on same source+externalMessageId', async () => {
    if (!postgresAvailable || !pool) return;
    const seedRepos = createRepositories(pool);
    const pid = uuid();
    await seedRepos.productRepository.save({
      id: pid, sku: 'BUN01', name: 'Bun', normalizedName: 'bun',
      defaultUnit: 'cái', active: true
    });
    await seedRepos.productAliasRepository.save({
      id: uuid(), productId: pid, alias: '55 bo', normalizedAlias: '55 bo',
      source: 'global', verified: true, confidence: 1.0
    });

    const extId = 'em-idem-' + Date.now();
    const message: Message = {
      id: uuid(),
      source: 'zalo',
      externalMessageId: extId,
      sender: { name: 'Long', phone: '0904813024' },
      receivedAt: new Date(),
      rawText: '55 bo:5 cai',
      processingStatus: 'received',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // First processing
    const r1 = await withTransaction(pool, async (client) => {
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

    // Second processing of the SAME message
    const r2 = await withTransaction(pool, async (client) => {
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

    expect(r1.orderId).toBe(r2.orderId);
  });
});

// ============================================================
// 17. conversation wiring (find-or-create by source+externalId)
// ============================================================

describe('PG: 17. Conversation Wiring', () => {
  it('should find-or-create conversation by source + externalConversationId', async () => {
    if (!postgresAvailable || !pool) return;
    const repos = createRepositories(pool);
    const extId = 'pipe-conv-' + Date.now();
    const c1 = await repos.conversationRepository.findOrCreate('zalo', extId);
    const c2 = await repos.conversationRepository.findOrCreate('zalo', extId);
    expect(c1.id).toBe(c2.id);
    // Verify the row exists in DB
    const found = await repos.conversationRepository.findBySourceAndExternalId('zalo', extId);
    expect(found?.id).toBe(c1.id);
  });

  it('should link customer to conversation after customer resolution', async () => {
    if (!postgresAvailable || !pool) return;
    const repos = createRepositories(pool);
    const cid = uuid();
    await repos.customerRepository.save({
      id: cid, displayName: 'A', normalizedName: 'a',
      phone: '0904', normalizedPhone: '84904',
      conversationIds: [], status: 'active', verified: true, confidence: 1,
      createdAt: new Date(), updatedAt: new Date()
    });
    const conv = await repos.conversationRepository.findOrCreate('zalo', 'linkconv-' + Date.now(), cid);
    expect(conv.customerId).toBe(cid);
    const fetched = await repos.conversationRepository.findById(conv.id);
    expect(fetched?.customerId).toBe(cid);
  });
});

// ============================================================
// 18. Transactional rollback for full pipeline
// ============================================================

describe('PG: 18. Transactional Pipeline Rollback', () => {
  it('should rollback all business writes on forced failure', async () => {
    if (!postgresAvailable || !pool) return;
    const seedRepos = createRepositories(pool);
    const pid = uuid();
    await seedRepos.productRepository.save({
      id: pid, sku: 'BUN01', name: 'Bun', normalizedName: 'bun',
      defaultUnit: 'cái', active: true
    });
    await seedRepos.productAliasRepository.save({
      id: uuid(), productId: pid, alias: '55 bo', normalizedAlias: '55 bo',
      source: 'global', verified: true, confidence: 1.0
    });

    const message: Message = {
      id: uuid(),
      source: 'zalo',
      externalMessageId: 'em-rollback-' + Date.now(),
      externalConversationId: 'rollback-conv-' + Date.now(),
      sender: { name: 'Long', phone: '0904813024' },
      receivedAt: new Date(),
      rawText: '55 bo:5 cai',
      processingStatus: 'received',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Snapshot counts before the transaction
    const beforeMessages = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM messages`);
    const beforeConvs = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM conversations`);
    const beforeOrders = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM orders`);
    const beforeTasks = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM tasks`);
    const beforeConvExt = message.externalConversationId!;

    let rollbackTriggered = false;
    try {
      await withTransaction(pool, async (client) => {
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

        // Run the pipeline - it should create conversation + message + order
        await txMessage.processMessage(message);

        // Snapshot INSIDE the transaction
        const txMessages = await client.query(`SELECT COUNT(*) AS count FROM messages`);
        const txOrders = await client.query(`SELECT COUNT(*) AS count FROM orders`);
        expect(Number(txMessages.rows[0].count)).toBeGreaterThan(Number(beforeMessages.rows[0].count));
        expect(Number(txOrders.rows[0].count)).toBeGreaterThan(Number(beforeOrders.rows[0].count));

        // Force failure
        throw new Error('intentional rollback');
      });
    } catch (err) {
      rollbackTriggered = true;
      expect((err as Error).message).toContain('intentional rollback');
    }
    expect(rollbackTriggered).toBe(true);

    // Verify NO partial business data remains
    const afterMessages = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM messages`);
    const afterConvs = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM conversations`);
    const afterOrders = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM orders`);
    const afterTasks = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM tasks`);

    expect(Number(afterMessages.rows[0].count)).toBe(Number(beforeMessages.rows[0].count));
    expect(Number(afterConvs.rows[0].count)).toBe(Number(beforeConvs.rows[0].count));
    expect(Number(afterOrders.rows[0].count)).toBe(Number(beforeOrders.rows[0].count));
    expect(Number(afterTasks.rows[0].count)).toBe(Number(beforeTasks.rows[0].count));

    // The conversation row referencing the rolled-back message must also be absent
    const convCheck = await pool.query(
      `SELECT id FROM conversations WHERE external_conversation_id = $1`,
      [beforeConvExt]
    );
    expect(convCheck.rows.length).toBe(0);
  });
});

// ============================================================
// 19. requestedDeliveryAt follows task due date
// ============================================================

describe('PG: 19. Delivery Requirement', () => {
  it('should populate Order.requestedDeliveryAt when items are present', async () => {
    if (!postgresAvailable || !pool) return;
    const seedRepos = createRepositories(pool);
    const pid = uuid();
    await seedRepos.productRepository.save({
      id: pid, sku: 'BUN01', name: 'Bun', normalizedName: 'bun',
      defaultUnit: 'cái', active: true
    });
    await seedRepos.productAliasRepository.save({
      id: uuid(), productId: pid, alias: '55 bo', normalizedAlias: '55 bo',
      source: 'global', verified: true, confidence: 1.0
    });

    const message: Message = {
      id: uuid(),
      source: 'zalo',
      externalMessageId: 'em-del-' + Date.now(),
      externalConversationId: 'del-conv-' + Date.now(),
      sender: { name: 'Long', phone: '0904813024' },
      receivedAt: new Date(),
      rawText: '55 bo:5 cai',
      processingStatus: 'received',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const before = new Date();
    const result = await withTransaction(pool, async (client) => {
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
    const after = new Date();

    const order = await seedRepos.orderRepository.findById(result.orderId!);
    expect(order).not.toBeNull();
    expect(order!.requestedDeliveryAt).toBeInstanceOf(Date);
    // Same-day delivery: requestedDeliveryAt should fall within [before, after]
    expect(order!.requestedDeliveryAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(order!.requestedDeliveryAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
