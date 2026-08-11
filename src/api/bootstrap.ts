/**
 * Production bootstrap for the SalesMind Message Ingestion API.
 *
 * This module is the ONLY entry point for production HTTP wiring.
 * It composes:
 *
 *   1. A real PostgreSQL-backed `IdempotencyLookup`
 *      (reads messages → order → order_items → tasks from the database
 *       and reconstructs a typed PipelineResult).
 *
 *   2. A real `PipelineInvoker` that opens a database transaction
 *      via `withTransaction(pool, ...)` and runs the canonical
 *      MessageProcessingService.
 *
 *   3. The mandatory `IngestMessageController.create(...)` factory,
 *      which throws at construction time if `idempotencyLookup` is
 *      missing.
 *
 *   4. The `MessageApiServer` HTTP transport bound to the controller.
 *
 * No fake/default lookups. No mock data. Every component in the wiring
 * is backed by the real PostgreSQL database.
 *
 * Usage:
 *
 *   import { bootstrapMessageApiServer } from './api/bootstrap.js';
 *   const { server, pool } = await bootstrapMessageApiServer();
 *   await server.listen();
 *
 *   // On shutdown:
 *   await server.close();
 *   await pool.end();
 */

import {
  IngestMessageController,
  reconstructPipelineResult,
  type IdempotencyLookup,
  type PipelineInvoker,
  type ExistingOrder,
  type PersistedMessageState
} from './messages.js';
import { MessageApiServer } from './server.js';
import { connectFromEnv, type PgPool, type PgPoolLike } from './pg-connection.js';
import { withTransaction } from '../db/pg/pool.js';
import { createTransactionalRepositories } from '../db/pg/factory.js';
import { ProductResolutionService } from '../product-resolution/ProductResolutionService.js';
import { CustomerResolutionService } from '../customer-resolution/CustomerResolutionService.js';
import { MessageProcessingService } from '../services/MessageProcessingService.js';
import type { Message } from '../services/MessageProcessingService.js';
import { runMigrations } from '../db/migrations/runner.js';

/**
 * Dependencies that the bootstrap composes. Exposed primarily for
 * advanced wiring scenarios (custom pipeline stacks) and for tests
 * that need to substitute individual layers.
 */
export interface BootstrapDependencies {
  pool: PgPool;
  /** Optional override: custom IdempotencyLookup. */
  idempotencyLookup?: IdempotencyLookup;
  /** Optional override: custom PipelineInvoker. */
  invoker?: PipelineInvoker;
  /** Apply migrations before wiring. Default: true. */
  runMigrations?: boolean;
}

export interface BootstrapResult {
  server: MessageApiServer;
  controller: IngestMessageController;
  pool: PgPool;
  idempotencyLookup: IdempotencyLookup;
  invoker: PipelineInvoker;
}

/**
 * Build a real PostgreSQL-backed `IdempotencyLookup`.
 *
 * Reads the persisted `messages`, `orders`, `order_items`, and `tasks`
 * rows and reconstructs a typed `PipelineResult` via
 * `reconstructPipelineResult`. No fabrication.
 *
 * This is the production implementation that satisfies Issue 5
 * ("No fake fallback lookup exists") of SM-005.1.
 */
export function createPostgresIdempotencyLookup(pool: PgPoolLike): IdempotencyLookup {
  return async (source: string, externalMessageId: string) => {
    const msgResult = await pool.query<Record<string, unknown>>(
      `SELECT id, source, external_message_id, conversation_id, customer_id,
              raw_text, created_at
       FROM messages
       WHERE source = $1 AND external_message_id = $2
       LIMIT 1`,
      [source, externalMessageId]
    );
    if (msgResult.rows.length === 0) return null;
    const msg = msgResult.rows[0];

    const conversationId = (msg.conversation_id as string | null) ?? '';

    // Order linked to this message
    const orderResult = await pool.query<Record<string, unknown>>(
      `SELECT id, customer_id FROM orders WHERE source_message_id = $1 LIMIT 1`,
      [msg.id]
    );
    const order: ExistingOrder =
      orderResult.rows.length > 0 ? { id: orderResult.rows[0].id as string } : null;

    // Order items
    let orderItems: PersistedMessageState['orderItems'] = [];
    if (order) {
      const items = await pool.query<Record<string, unknown>>(
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
    const tasksResult = await pool.query<Record<string, unknown>>(
      `SELECT id, type, status FROM tasks WHERE source_message_id = $1`,
      [msg.id]
    );
    const tasks = tasksResult.rows.map((r) => ({
      id: r.id as string,
      type: r.type as string,
      status: r.status as string
    }));

    // Customer ID precedence: messages.customer_id (set during pipeline),
    // else orders.customer_id (the order may have its own).
    let customerId: string | null = (msg.customer_id as string | null) ?? null;
    if (!customerId && order) {
      customerId = (orderResult.rows[0].customer_id as string | null) ?? null;
    }

    const state: PersistedMessageState = {
      messageId: msg.id as string,
      conversationId,
      rawText: msg.raw_text as string,
      customerId,
      createdAt: new Date(msg.created_at as string),
      order,
      orderItems,
      tasks
    };
    return reconstructPipelineResult(state);
  };
}

/**
 * Build a real transactional `PipelineInvoker` backed by PostgreSQL.
 *
 * The callback opens a single transaction around the canonical
 * MessageProcessingService, ensuring Conversation + Message + Order +
 * Items + Tasks + AuditLog all commit atomically.
 */
export function createPostgresPipelineInvoker(pool: PgPoolLike): PipelineInvoker {
  return async (message: Message) => {
    // `withTransaction` requires the full `pg.Pool` type. In production
    // the value passed in IS a `pg.Pool` (from `connectFromEnv`); the
    // cast is safe because `PgPoolLike` is a structural subset.
    return withTransaction(pool as unknown as import('pg').Pool, async (client) => {
      const txRepos = createTransactionalRepositories(client);
      const txProduct = new ProductResolutionService(
        txRepos.productRepository,
        txRepos.productAliasRepository
      );
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
}

/**
 * Bootstrap the production Message Ingestion API.
 *
 * Reads the database connection from `process.env.DATABASE_URL`
 * (via `connectFromEnv`), runs migrations by default, wires the
 * controller with a REAL PostgreSQL-backed idempotency lookup and
 * a REAL transactional pipeline, and returns a ready-to-listen
 * `MessageApiServer`.
 *
 * This function is the **only** supported way to construct a
 * production HTTP server. It MUST be used at process startup.
 *
 * Production wiring contract:
 *   - idempotencyLookup is the PostgreSQL-backed read-model.
 *   - No mock/fallback lookup exists.
 *   - IngestMessageController.create() throws if idempotencyLookup
 *     is missing; this is enforced at construction time.
 */
export async function bootstrapMessageApiServer(
  deps: BootstrapDependencies = {} as BootstrapDependencies
): Promise<BootstrapResult> {
  const pool = deps.pool ?? connectFromEnv();
  const shouldRunMigrations = deps.runMigrations ?? true;

  if (shouldRunMigrations) {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await runMigrations(pool);
  }

  const idempotencyLookup = deps.idempotencyLookup ?? createPostgresIdempotencyLookup(pool);
  const invoker = deps.invoker ?? createPostgresPipelineInvoker(pool);

  // Mandatory at the type level. Will throw if `idempotencyLookup` is
  // somehow null/undefined.
  const controller = IngestMessageController.create({
    invoker,
    idempotencyLookup
  });

  const server = new MessageApiServer(controller);

  return {
    server,
    controller,
    pool,
    idempotencyLookup,
    invoker
  };
}