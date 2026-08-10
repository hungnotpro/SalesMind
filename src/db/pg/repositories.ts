/**
 * PostgreSQL repository implementations.
 *
 * Each repository implements the existing application-domain interface
 * (e.g. IMessageRepository, ICustomerRepository) and uses the `pg` driver
 * to execute real SQL queries against the database.
 *
 * The application/domain layer continues to depend only on the interfaces;
 * it does not import from this module.
 *
 * For transactional message processing, the orchestrator (pipeline) takes
 * a single `pg.PoolClient` (transaction-scoped) and passes it to each
 * repository. This is the `withClient` variant. There is also a `withPool`
 * variant for read-only / single-statement writes.
 */

import type {
  IMessageRepository,
  IOrderRepository,
  IOrderItemRepository,
  ITaskRepository,
  IAuditLogRepository,
  Message,
  Order,
  OrderItem,
  Task,
  AuditLog
} from '../../services/MessageProcessingService.js';
import type {
  IProductRepository,
  IProductAliasRepository,
  Product,
  ProductAlias
} from '../../product-resolution/ProductResolutionService.js';
import type {
  ICustomerRepository,
  Customer
} from '../../customer-resolution/CustomerResolutionService.js';
import type { Conversation } from '../../domain/entities/Conversation.js';
import type { PgPool, PgClient } from './pool.js';
import {
  customerFromRow,
  customerToRow,
  conversationFromRow,
  messageFromRow,
  productFromRow,
  productAliasFromRow,
  orderFromRow,
  orderItemFromRow,
  taskFromRow,
  auditLogFromRow
} from './mappers.js';

// ============================================================
// Customer Repository
// ============================================================

export class PgCustomerRepository implements ICustomerRepository {
  constructor(
    private readonly exec: PgPool | PgClient
  ) {}

  async findById(id: string): Promise<Customer | null> {
    const r = await this.exec.query(
      `SELECT id, display_name, normalized_name, phone, normalized_phone,
              status, verified, confidence, created_at, updated_at
       FROM customers WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return null;
    const customer = customerFromRow(r.rows[0]);
    // Populate conversationIds from the conversations table
    const conv = await this.exec.query(
      `SELECT id FROM conversations WHERE customer_id = $1`,
      [id]
    );
    return {
      ...customer,
      conversationIds: (conv.rows as Array<{ id: string }>).map((row) => row.id)
    };
  }

  async findByPhone(normalizedPhone: string): Promise<Customer | null> {
    const r = await this.exec.query(
      `SELECT id, display_name, normalized_name, phone, normalized_phone,
              status, verified, confidence, created_at, updated_at
       FROM customers WHERE normalized_phone = $1 LIMIT 1`,
      [normalizedPhone]
    );
    if (!r.rows[0]) return null;
    return customerFromRow(r.rows[0]);
  }

  async findByNormalizedName(normalizedName: string): Promise<Customer[]> {
    const r = await this.exec.query(
      `SELECT id, display_name, normalized_name, phone, normalized_phone,
              status, verified, confidence, created_at, updated_at
       FROM customers
       WHERE normalized_name = $1
          OR normalized_name LIKE $2 || '%'`,
      [normalizedName, normalizedName.slice(0, 3)]
    );
    return (r.rows as Array<Record<string, unknown>>).map((row) => customerFromRow(row));
  }

  async findByConversationId(conversationId: string): Promise<Customer | null> {
    const r = await this.exec.query(
      `SELECT c.id, c.display_name, c.normalized_name, c.phone, c.normalized_phone,
              c.status, c.verified, c.confidence, c.created_at, c.updated_at
       FROM conversations cv
       JOIN customers c ON c.id = cv.customer_id
       WHERE cv.id = $1`,
      [conversationId]
    );
    if (!r.rows[0]) return null;
    return customerFromRow(r.rows[0]);
  }

  async save(customer: Customer): Promise<void> {
    const row = customerToRow(customer);
    // Defensive runtime check (mirrors InMemoryCustomerRepository.save)
    if (!Array.isArray(customer.conversationIds)) {
      throw new Error('Customer.conversationIds must be a string[]');
    }
    await this.exec.query(
      `INSERT INTO customers (id, display_name, normalized_name, phone, normalized_phone,
                              status, verified, confidence, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             normalized_name = EXCLUDED.normalized_name,
             phone = EXCLUDED.phone,
             normalized_phone = EXCLUDED.normalized_phone,
             status = EXCLUDED.status,
             verified = EXCLUDED.verified,
             confidence = EXCLUDED.confidence,
             updated_at = NOW()`,
      [
        row.id, row.display_name, row.normalized_name, row.phone, row.normalized_phone,
        row.status, row.verified, row.confidence
      ]
    );
  }

  async update(customer: Customer): Promise<void> {
    await this.save(customer);
  }
}

// ============================================================
// Conversation Repository
// ============================================================

export class PgConversationRepository {
  constructor(private readonly exec: PgPool | PgClient) {}

  async findById(id: string): Promise<Conversation | null> {
    const r = await this.exec.query(
      `SELECT id, source, external_conversation_id, customer_id, title,
              metadata_json, created_at, updated_at
       FROM conversations WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return null;
    return conversationFromRow(r.rows[0]);
  }

  async findBySourceAndExternalId(source: string, externalId: string): Promise<Conversation | null> {
    const r = await this.exec.query(
      `SELECT id, source, external_conversation_id, customer_id, title,
              metadata_json, created_at, updated_at
       FROM conversations WHERE source = $1 AND external_conversation_id = $2`,
      [source, externalId]
    );
    if (!r.rows[0]) return null;
    return conversationFromRow(r.rows[0]);
  }

  async save(conv: Conversation): Promise<void> {
    await this.exec.query(
      `INSERT INTO conversations (id, source, external_conversation_id, customer_id,
                                 title, metadata_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET customer_id = EXCLUDED.customer_id,
             title = EXCLUDED.title,
             metadata_json = EXCLUDED.metadata_json,
             updated_at = NOW()
       WHERE conversations.source = EXCLUDED.source
         AND conversations.external_conversation_id = EXCLUDED.external_conversation_id`,
      [
        conv.id, conv.source, conv.externalConversationId,
        conv.customerId ?? null, conv.title ?? null,
        conv.metadataJson ?? null
      ]
    );
  }

  /**
   * Find-or-create pattern for a conversation. Returns the persisted entity.
   *
   * When the conversation is created, the customer link is set in the same
   * transaction if customerId is provided.
   */
  async findOrCreate(
    source: string,
    externalConversationId: string,
    customerId?: string,
    title?: string
  ): Promise<Conversation> {
    const existing = await this.findBySourceAndExternalId(source, externalConversationId);
    if (existing) return existing;

    const id = conv_id();
    await this.exec.query(
      `INSERT INTO conversations (id, source, external_conversation_id, customer_id, title)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, source, externalConversationId, customerId ?? null, title ?? null]
    );
    return {
      id,
      source,
      externalConversationId,
      customerId,
      title,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async setCustomerId(conversationId: string, customerId: string | undefined): Promise<void> {
    await this.exec.query(
      `UPDATE conversations SET customer_id = $1, updated_at = NOW() WHERE id = $2`,
      [customerId ?? null, conversationId]
    );
  }
}

function conv_id(): string {
  // Postgres uuid_generate_v4() is set as DEFAULT; we pass NULL and let PG generate.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================
// Message Repository
// ============================================================

export class PgMessageRepository implements IMessageRepository {
  constructor(private readonly exec: PgPool | PgClient) {}

  async findById(id: string): Promise<Message | null> {
    const r = await this.exec.query(
      `SELECT id, source, external_message_id, conversation_id, customer_id,
              sender_name, sender_phone, received_at, raw_text, metadata_json,
              processing_status, created_at, updated_at
       FROM messages WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return null;
    return messageFromRow(r.rows[0]);
  }

  async findBySourceAndExternalId(source: string, externalId: string): Promise<Message | null> {
    const r = await this.exec.query(
      `SELECT id, source, external_message_id, conversation_id, customer_id,
              sender_name, sender_phone, received_at, raw_text, metadata_json,
              processing_status, created_at, updated_at
       FROM messages WHERE source = $1 AND external_message_id = $2`,
      [source, externalId]
    );
    if (!r.rows[0]) return null;
    return messageFromRow(r.rows[0]);
  }

  async save(message: Message): Promise<void> {
    await this.exec.query(
      `INSERT INTO messages (id, source, external_message_id, conversation_id,
                              customer_id, sender_name, sender_phone, received_at,
                              raw_text, metadata_json, processing_status,
                              created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET conversation_id = EXCLUDED.conversation_id,
             customer_id = EXCLUDED.customer_id,
             processing_status = EXCLUDED.processing_status,
             updated_at = NOW()`,
      [
        message.id, message.source, message.externalMessageId,
        message.conversationId ?? null, null,
        message.senderName ?? null, message.senderPhone ?? null,
        message.receivedAt, message.rawText,
        message.metadataJson ?? null, message.processingStatus
      ]
    );
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.exec.query(
      `UPDATE messages SET processing_status = $1, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
  }
}

// ============================================================
// Product Repository
// ============================================================

export class PgProductRepository implements IProductRepository {
  constructor(private readonly exec: PgPool | PgClient) {}

  async findById(id: string): Promise<Product | null> {
    const r = await this.exec.query(
      `SELECT id, sku, name, normalized_name, category, default_unit, active
       FROM products WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return null;
    return productFromRow(r.rows[0]);
  }

  async findBySku(sku: string): Promise<Product | null> {
    const r = await this.exec.query(
      `SELECT id, sku, name, normalized_name, category, default_unit, active
       FROM products WHERE sku = $1`,
      [sku]
    );
    if (!r.rows[0]) return null;
    return productFromRow(r.rows[0]);
  }

  async findByNormalizedName(normalized: string): Promise<Product | null> {
    const r = await this.exec.query(
      `SELECT id, sku, name, normalized_name, category, default_unit, active
       FROM products WHERE normalized_name = $1 LIMIT 1`,
      [normalized]
    );
    if (!r.rows[0]) return null;
    return productFromRow(r.rows[0]);
  }

  async save(product: Product): Promise<void> {
    await this.exec.query(
      `INSERT INTO products (id, sku, name, normalized_name, category, default_unit, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
         SET sku = EXCLUDED.sku,
             name = EXCLUDED.name,
             normalized_name = EXCLUDED.normalized_name,
             category = EXCLUDED.category,
             default_unit = EXCLUDED.default_unit,
             active = EXCLUDED.active,
             updated_at = NOW()`,
      [
        product.id, product.sku, product.name, product.normalizedName,
        product.category ?? null, product.defaultUnit, product.active
      ]
    );
  }
}

// ============================================================
// ProductAlias Repository
// ============================================================

export class PgProductAliasRepository implements IProductAliasRepository {
  constructor(private readonly exec: PgPool | PgClient) {}

  async findById(id: string): Promise<ProductAlias | null> {
    const r = await this.exec.query(
      `SELECT id, product_id, customer_id, alias, normalized_alias, source, verified, confidence
       FROM product_aliases WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return null;
    return productAliasFromRow(r.rows[0]);
  }

  /**
   * Resolution order (per spec):
   *   1. customer-specific exact match
   *   2. global exact match
   *   3. returns null and the caller tries normalized/fuzzy
   */
  async findByExactAlias(alias: string, customerId?: string): Promise<ProductAlias | null> {
    if (customerId) {
      const r = await this.exec.query(
        `SELECT id, product_id, customer_id, alias, normalized_alias, source, verified, confidence
         FROM product_aliases
         WHERE alias = $1 AND customer_id = $2
         LIMIT 1`,
        [alias, customerId]
      );
      if (r.rows[0]) return productAliasFromRow(r.rows[0]);
    }
    const r = await this.exec.query(
      `SELECT id, product_id, customer_id, alias, normalized_alias, source, verified, confidence
       FROM product_aliases
       WHERE alias = $1 AND customer_id IS NULL
       AND verified = true
       LIMIT 1`,
      [alias]
    );
    if (!r.rows[0]) return null;
    return productAliasFromRow(r.rows[0]);
  }

  async findByNormalizedAlias(normalized: string, customerId?: string): Promise<ProductAlias[]> {
    const r = await this.exec.query(
      `SELECT id, product_id, customer_id, alias, normalized_alias, source, verified, confidence
       FROM product_aliases
       WHERE normalized_alias = $1
         AND (customer_id = $2 OR customer_id IS NULL)
       ORDER BY customer_id NULLS LAST`,
      [normalized, customerId ?? null]
    );
    return (r.rows as Array<Record<string, unknown>>).map((row) => productAliasFromRow(row));
  }

  async findByProductId(productId: string): Promise<ProductAlias[]> {
    const r = await this.exec.query(
      `SELECT id, product_id, customer_id, alias, normalized_alias, source, verified, confidence
       FROM product_aliases WHERE product_id = $1`,
      [productId]
    );
    return (r.rows as Array<Record<string, unknown>>).map((row) => productAliasFromRow(row));
  }

  async findByCustomerId(customerId: string): Promise<ProductAlias[]> {
    const r = await this.exec.query(
      `SELECT id, product_id, customer_id, alias, normalized_alias, source, verified, confidence
       FROM product_aliases WHERE customer_id = $1`,
      [customerId]
    );
    return (r.rows as Array<Record<string, unknown>>).map((row) => productAliasFromRow(row));
  }

  async findVerifiedGlobal(): Promise<ProductAlias[]> {
    const r = await this.exec.query(
      `SELECT id, product_id, customer_id, alias, normalized_alias, source, verified, confidence
       FROM product_aliases WHERE verified = true AND customer_id IS NULL`
    );
    return (r.rows as Array<Record<string, unknown>>).map((row) => productAliasFromRow(row));
  }

  async save(alias: ProductAlias): Promise<void> {
    await this.exec.query(
      `INSERT INTO product_aliases (id, product_id, customer_id, alias, normalized_alias,
                                    source, verified, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE
         SET alias = EXCLUDED.alias,
             normalized_alias = EXCLUDED.normalized_alias,
             source = EXCLUDED.source,
             verified = EXCLUDED.verified,
             confidence = EXCLUDED.confidence,
             updated_at = NOW()`,
      [
        alias.id, alias.productId, alias.customerId ?? null,
        alias.alias, alias.normalizedAlias, alias.source,
        alias.verified, alias.confidence
      ]
    );
  }
}

// ============================================================
// Order Repository
// ============================================================

export class PgOrderRepository implements IOrderRepository {
  constructor(private readonly exec: PgPool | PgClient) {}

  async findById(id: string): Promise<Order | null> {
    const r = await this.exec.query(
      `SELECT id, customer_id, source_message_id, order_number, order_date,
              requested_delivery_at, status, discount_rate, discount_source,
              payment_method, payment_source, invoice_required, invoice_due_at,
              notes, created_at, updated_at
       FROM orders WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return null;
    return orderFromRow(r.rows[0]);
  }

  async findBySourceMessageId(messageId: string): Promise<Order | null> {
    const r = await this.exec.query(
      `SELECT id, customer_id, source_message_id, order_number, order_date,
              requested_delivery_at, status, discount_rate, discount_source,
              payment_method, payment_source, invoice_required, invoice_due_at,
              notes, created_at, updated_at
       FROM orders WHERE source_message_id = $1`,
      [messageId]
    );
    if (!r.rows[0]) return null;
    return orderFromRow(r.rows[0]);
  }

  async save(order: Order): Promise<void> {
    await this.exec.query(
      `INSERT INTO orders (id, customer_id, source_message_id, order_number, order_date,
                           requested_delivery_at, status, discount_rate, discount_source,
                           payment_method, payment_source, invoice_required,
                           invoice_due_at, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET customer_id = EXCLUDED.customer_id,
             status = EXCLUDED.status,
             discount_rate = EXCLUDED.discount_rate,
             updated_at = NOW()`,
      [
        order.id, order.customerId ?? null, order.sourceMessageId ?? null,
        order.orderNumber ?? null, order.orderDate,
        order.requestedDeliveryAt ?? null, order.status,
        order.discountRate ?? null, order.discountSource ?? null,
        order.paymentMethod ?? null, order.paymentSource ?? null,
        order.invoiceRequired, order.invoiceDueAt ?? null, order.notes ?? null
      ]
    );
  }

  async update(order: Order): Promise<void> {
    await this.save(order);
  }
}

// ============================================================
// OrderItem Repository
// ============================================================

export class PgOrderItemRepository implements IOrderItemRepository {
  constructor(private readonly exec: PgPool | PgClient) {}

  async findById(id: string): Promise<OrderItem | null> {
    const r = await this.exec.query(
      `SELECT id, order_id, product_id, raw_product_name, quantity, unit,
              normalized_unit, resolution_status, resolution_confidence,
              match_method, notes, created_at, updated_at
       FROM order_items WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return null;
    return orderItemFromRow(r.rows[0]);
  }

  async findByOrderId(orderId: string): Promise<OrderItem[]> {
    const r = await this.exec.query(
      `SELECT id, order_id, product_id, raw_product_name, quantity, unit,
              normalized_unit, resolution_status, resolution_confidence,
              match_method, notes, created_at, updated_at
       FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    return (r.rows as Array<Record<string, unknown>>).map((row) => orderItemFromRow(row));
  }

  async save(item: OrderItem): Promise<void> {
    await this.exec.query(
      `INSERT INTO order_items (id, order_id, product_id, raw_product_name, quantity,
                                unit, normalized_unit, resolution_status,
                                resolution_confidence, match_method, notes,
                                created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET product_id = EXCLUDED.product_id,
             resolution_status = EXCLUDED.resolution_status,
             updated_at = NOW()`,
      [
        item.id, item.orderId, item.productId ?? null,
        item.rawProductName, item.quantity, item.unit,
        item.normalizedUnit ?? null, item.resolutionStatus,
        item.resolutionConfidence ?? null, item.matchMethod ?? null,
        item.notes ?? null
      ]
    );
  }

  async saveMany(items: OrderItem[]): Promise<void> {
    // Bulk insert in a single round-trip using unnest to avoid many INSERT statements
    if (items.length === 0) return;
    const params: unknown[] = [];
    const tuples: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const base = i * 9;
      tuples.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`);
      params.push(
        it.id, it.orderId, it.productId ?? null,
        it.rawProductName, it.quantity, it.unit,
        it.resolutionStatus, it.resolutionConfidence ?? null,
        it.matchMethod ?? null
      );
    }
    await this.exec.query(
      `INSERT INTO order_items (id, order_id, product_id, raw_product_name, quantity,
                                unit, resolution_status, resolution_confidence, match_method)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (id) DO NOTHING`,
      params
    );
  }
}

// ============================================================
// Task Repository (with business-key idempotency)
// ============================================================

export class PgTaskRepository implements ITaskRepository {
  constructor(private readonly exec: PgPool | PgClient) {}

  async findById(id: string): Promise<Task | null> {
    const r = await this.exec.query(
      `SELECT id, order_id, type, title, description, owner_id, priority,
              status, due_at, business_key, source_message_id, created_at, updated_at
       FROM tasks WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return null;
    return taskFromRow(r.rows[0]);
  }

  async findByBusinessKey(
    orderId: string | undefined,
    type: string,
    dueAt: Date | undefined
  ): Promise<Task | null> {
    const r = await this.exec.query(
      `SELECT id, order_id, type, title, description, owner_id, priority,
              status, due_at, business_key, source_message_id, created_at, updated_at
       FROM tasks
       WHERE order_id IS NOT DISTINCT FROM $1
         AND type = $2
         AND due_at IS NOT DISTINCT FROM $3`,
      [orderId ?? null, type, dueAt ?? null]
    );
    if (!r.rows[0]) return null;
    return taskFromRow(r.rows[0]);
  }

  async save(task: Task): Promise<void> {
    // business_key is required for idempotency. Caller must compute it.
    const businessKey = computeBusinessKey(task);
    await this.exec.query(
      `INSERT INTO tasks (id, order_id, type, title, description, owner_id, priority,
                          status, due_at, business_key, source_message_id,
                          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       ON CONFLICT (business_key) DO NOTHING`,
      [
        task.id, task.orderId ?? null, task.type, task.title,
        task.description ?? null, task.ownerId ?? null, task.priority,
        task.status, task.dueAt ?? null, businessKey,
        task.sourceMessageId ?? null
      ]
    );
  }
}

function computeBusinessKey(task: Task): string {
  const dateKey = task.dueAt ? task.dueAt.toISOString().split('T')[0] : 'unspecified';
  return `${task.orderId || 'no-order'}:${task.type}:${dateKey}`;
}

// ============================================================
// AuditLog Repository
// ============================================================

export class PgAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly exec: PgPool | PgClient) {}

  async save(log: AuditLog): Promise<void> {
    await this.exec.query(
      `INSERT INTO audit_logs (id, entity_type, entity_id, action, actor_type,
                               actor_id, before_data, after_data,
                               source_message_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb)`,
      [
        log.id, log.entityType, log.entityId, log.action,
        log.actorType, log.actorId ?? null,
        log.beforeData ?? null, log.afterData ?? null,
        log.sourceMessageId ?? null, log.metadata ?? null
      ]
    );
  }
}
