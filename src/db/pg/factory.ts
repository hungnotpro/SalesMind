/**
 * PostgreSQL repository factory.
 *
 * Wires together a `pg.Pool` with all PostgreSQL repository implementations.
 * The application/domain layer receives these repositories through the
 * existing interfaces — it does not import `pg` or know about the database.
 *
 * Two modes:
 *   - createRepositories(pool)  → pool-scoped (each statement may use a different conn)
 *   - createTransactionalRepositories(client) → client-scoped (single transaction)
 *
 * For message processing, use createTransactionalRepositories inside a
 * `withTransaction` block to ensure all persistence happens atomically.
 */

import type { PgPool, PgClient } from './pool.js';
import {
  PgCustomerRepository,
  PgConversationRepository,
  PgMessageRepository,
  PgProductRepository,
  PgProductAliasRepository,
  PgOrderRepository,
  PgOrderItemRepository,
  PgTaskRepository,
  PgAuditLogRepository
} from './repositories.js';

export interface PostgresRepositories {
  customerRepository: PgCustomerRepository;
  conversationRepository: PgConversationRepository;
  messageRepository: PgMessageRepository;
  productRepository: PgProductRepository;
  productAliasRepository: PgProductAliasRepository;
  orderRepository: PgOrderRepository;
  orderItemRepository: PgOrderItemRepository;
  taskRepository: PgTaskRepository;
  auditLogRepository: PgAuditLogRepository;
}

export function createRepositories(pool: PgPool): PostgresRepositories {
  const exec = pool;
  return {
    customerRepository: new PgCustomerRepository(exec),
    conversationRepository: new PgConversationRepository(exec),
    messageRepository: new PgMessageRepository(exec),
    productRepository: new PgProductRepository(exec),
    productAliasRepository: new PgProductAliasRepository(exec),
    orderRepository: new PgOrderRepository(exec),
    orderItemRepository: new PgOrderItemRepository(exec),
    taskRepository: new PgTaskRepository(exec),
    auditLogRepository: new PgAuditLogRepository(exec)
  };
}

export function createTransactionalRepositories(client: PgClient): PostgresRepositories {
  return {
    customerRepository: new PgCustomerRepository(client),
    conversationRepository: new PgConversationRepository(client),
    messageRepository: new PgMessageRepository(client),
    productRepository: new PgProductRepository(client),
    productAliasRepository: new PgProductAliasRepository(client),
    orderRepository: new PgOrderRepository(client),
    orderItemRepository: new PgOrderItemRepository(client),
    taskRepository: new PgTaskRepository(client),
    auditLogRepository: new PgAuditLogRepository(client)
  };
}
