/**
 * In-Memory Repositories for Development and Testing
 * 
 * These are simple implementations for testing the persistence layer
 * without requiring a real database.
 */

import { MessageProcessingStatus } from '../domain/entities/Message.js';
import { OrderStatus, PaymentMethod, ResolutionStatus } from '../shared/enums.js';
import { TaskStatus } from '../shared/enums.js';

// ============================================================
// Types
// ============================================================

export interface Message {
  id: string;
  source: string;
  externalMessageId: string;
  conversationId?: string;
  senderName?: string;
  senderPhone?: string;
  receivedAt: Date;
  rawText: string;
  metadataJson?: string;
  processingStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  normalizedName: string;
  category?: string;
  defaultUnit: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductAlias {
  id: string;
  productId: string;
  customerId?: string;
  alias: string;
  normalizedAlias: string;
  source: string;
  verified: boolean;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  displayName: string;
  normalizedName: string;
  phone?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  customerId?: string;
  sourceMessageId?: string;
  orderNumber?: string;
  orderDate: Date;
  status: string;
  discountRate?: number;
  discountSource?: string;
  paymentMethod?: string;
  paymentSource?: string;
  invoiceRequired: boolean;
  invoiceDueAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId?: string;
  rawProductName: string;
  quantity: number;
  unit: string;
  resolutionStatus: string;
  resolutionConfidence?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  orderId?: string;
  type: string;
  title: string;
  description?: string;
  ownerId?: string;
  priority: string;
  status: string;
  dueAt?: Date;
  sourceMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorType: string;
  actorId?: string;
  beforeData?: string;
  afterData?: string;
  sourceMessageId?: string;
  createdAt: Date;
}

// ============================================================
// UUID Generator
// ============================================================

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================
// Message Repository
// ============================================================

export class InMemoryMessageRepository {
  private messages: Map<string, Message> = new Map();
  private sourceExternalIndex: Map<string, string> = new Map();

  async findById(id: string): Promise<Message | null> {
    return this.messages.get(id) || null;
  }

  async findBySourceAndExternalId(source: string, externalId: string): Promise<Message | null> {
    const key = `${source}:${externalId}`;
    const id = this.sourceExternalIndex.get(key);
    return id ? this.messages.get(id) || null : null;
  }

  async save(message: Message): Promise<void> {
    this.messages.set(message.id, message);
    const key = `${message.source}:${message.externalMessageId}`;
    this.sourceExternalIndex.set(key, message.id);
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const message = this.messages.get(id);
    if (message) {
      message.processingStatus = status;
      message.updatedAt = new Date();
    }
  }

  async listByConversation(conversationId: string, limit?: number): Promise<Message[]> {
    const results = Array.from(this.messages.values())
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    return limit ? results.slice(0, limit) : results;
  }
}

// ============================================================
// Product Repository
// ============================================================

export class InMemoryProductRepository {
  private products: Map<string, Product> = new Map();

  async findById(id: string): Promise<Product | null> {
    return this.products.get(id) || null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    return Array.from(this.products.values()).find((p) => p.sku === sku) || null;
  }

  async findByNormalizedName(normalized: string): Promise<Product | null> {
    return Array.from(this.products.values()).find(
      (p) => p.normalizedName === normalized
    ) || null;
  }

  async save(product: Product): Promise<void> {
    this.products.set(product.id, product);
  }

  async update(product: Product): Promise<void> {
    this.products.set(product.id, product);
  }

  async listActive(): Promise<Product[]> {
    return Array.from(this.products.values()).filter((p) => p.active);
  }

  // Seed data
  seed(products: Product[]): void {
    for (const product of products) {
      this.products.set(product.id, product);
    }
  }
}

// ============================================================
// Product Alias Repository
// ============================================================

export class InMemoryProductAliasRepository {
  private aliases: Map<string, ProductAlias> = new Map();
  private aliasIndex: Map<string, string[]> = new Map();
  private normalizedIndex: Map<string, string[]> = new Map();

  async findById(id: string): Promise<ProductAlias | null> {
    return this.aliases.get(id) || null;
  }

  async findByExactAlias(alias: string, customerId?: string): Promise<ProductAlias | null> {
    const candidates = this.aliasIndex.get(alias.toLowerCase()) || [];
    for (const id of candidates) {
      const a = this.aliases.get(id)!;
      if (a && (!customerId || !a.customerId || a.customerId === customerId)) {
        return a;
      }
    }
    return null;
  }

  async findByNormalizedAlias(normalized: string, customerId?: string): Promise<ProductAlias[]> {
    const candidates = this.normalizedIndex.get(normalized.toLowerCase()) || [];
    return candidates
      .map((id) => this.aliases.get(id))
      .filter((a) => a && (!customerId || !a.customerId || a.customerId === customerId));
  }

  async findByProductId(productId: string): Promise<ProductAlias[]> {
    return Array.from(this.aliases.values()).filter((a) => a.productId === productId);
  }

  async findByCustomerId(customerId: string): Promise<ProductAlias[]> {
    return Array.from(this.aliases.values()).filter((a) => a.customerId === customerId);
  }

  async findVerifiedGlobal(): Promise<ProductAlias[]> {
    return Array.from(this.aliases.values()).filter(
      (a) => a.verified && !a.customerId
    );
  }

  async save(alias: ProductAlias): Promise<void> {
    this.aliases.set(alias.id, alias);
    
    // Update indexes
    const aliasKey = alias.alias.toLowerCase();
    const existing = this.aliasIndex.get(aliasKey) || [];
    if (!existing.includes(alias.id)) {
      this.aliasIndex.set(aliasKey, [...existing, alias.id]);
    }
    
    const normalizedKey = alias.normalizedAlias.toLowerCase();
    const normExisting = this.normalizedIndex.get(normalizedKey) || [];
    if (!normExisting.includes(alias.id)) {
      this.normalizedIndex.set(normalizedKey, [...normExisting, alias.id]);
    }
  }

  async update(alias: ProductAlias): Promise<void> {
    this.aliases.set(alias.id, alias);
  }

  // Seed data
  seed(aliases: ProductAlias[]): void {
    for (const alias of aliases) {
      this.save(alias);
    }
  }
}

// ============================================================
// Customer Repository
// ============================================================

export class InMemoryCustomerRepository {
  private customers: Map<string, Customer> = new Map();

  async findById(id: string): Promise<Customer | null> {
    return this.customers.get(id) || null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    return Array.from(this.customers.values()).find((c) => c.phone === phone) || null;
  }

  async findByName(name: string): Promise<Customer[]> {
    const normalized = name.toLowerCase();
    return Array.from(this.customers.values()).filter(
      (c) => c.normalizedName.includes(normalized)
    );
  }

  async save(customer: Customer): Promise<void> {
    this.customers.set(customer.id, customer);
  }

  async update(customer: Customer): Promise<void> {
    this.customers.set(customer.id, customer);
  }
}

// ============================================================
// Order Repository
// ============================================================

export class InMemoryOrderRepository {
  private orders: Map<string, Order> = new Map();

  async findById(id: string): Promise<Order | null> {
    return this.orders.get(id) || null;
  }

  async findBySourceMessageId(messageId: string): Promise<Order | null> {
    return Array.from(this.orders.values()).find(
      (o) => o.sourceMessageId === messageId
    ) || null;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    return Array.from(this.orders.values()).find(
      (o) => o.orderNumber === orderNumber
    ) || null;
  }

  async save(order: Order): Promise<void> {
    this.orders.set(order.id, order);
  }

  async update(order: Order): Promise<void> {
    this.orders.set(order.id, order);
  }

  async listByCustomer(customerId: string, limit?: number): Promise<Order[]> {
    const results = Array.from(this.orders.values())
      .filter((o) => o.customerId === customerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return limit ? results.slice(0, limit) : results;
  }

  async listByStatus(status: string, limit?: number): Promise<Order[]> {
    const results = Array.from(this.orders.values())
      .filter((o) => o.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return limit ? results.slice(0, limit) : results;
  }

  async listRecent(limit?: number): Promise<Order[]> {
    const results = Array.from(this.orders.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return limit ? results.slice(0, limit) : results;
  }
}

// ============================================================
// Order Item Repository
// ============================================================

export class InMemoryOrderItemRepository {
  private items: Map<string, OrderItem> = new Map();

  async findById(id: string): Promise<OrderItem | null> {
    return this.items.get(id) || null;
  }

  async findByOrderId(orderId: string): Promise<OrderItem[]> {
    return Array.from(this.items.values()).filter((i) => i.orderId === orderId);
  }

  async save(item: OrderItem): Promise<void> {
    this.items.set(item.id, item);
  }

  async saveMany(newItems: OrderItem[]): Promise<void> {
    for (const item of newItems) {
      this.items.set(item.id, item);
    }
  }

  async update(item: OrderItem): Promise<void> {
    this.items.set(item.id, item);
  }
}

// ============================================================
// Task Repository
// ============================================================

export class InMemoryTaskRepository {
  private tasks: Map<string, Task> = new Map();

  async findById(id: string): Promise<Task | null> {
    return this.tasks.get(id) || null;
  }

  async findByBusinessKey(orderId: string | undefined, type: string, dueAt: Date | undefined): Promise<Task | null> {
    const dateKey = dueAt ? dueAt.toISOString().split('T')[0] : 'unspecified';
    const key = `${orderId || 'no-order'}:${type}:${dateKey}`;
    
    return Array.from(this.tasks.values()).find((t) => {
      const taskDateKey = t.dueAt ? t.dueAt.toISOString().split('T')[0] : 'unspecified';
      return `${t.orderId || 'no-order'}:${t.type}:${taskDateKey}` === key;
    }) || null;
  }

  async findByOrderId(orderId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter((t) => t.orderId === orderId);
  }

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async update(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async listByStatus(status: string, limit?: number): Promise<Task[]> {
    const results = Array.from(this.tasks.values())
      .filter((t) => t.status === status)
      .sort((a, b) => (a.dueAt?.getTime() || Infinity) - (b.dueAt?.getTime() || Infinity));
    return limit ? results.slice(0, limit) : results;
  }

  async listDueToday(): Promise<Task[]> {
    const today = new Date().toISOString().split('T')[0];
    return Array.from(this.tasks.values()).filter((t) => {
      const taskDate = t.dueAt?.toISOString().split('T')[0];
      return taskDate === today && t.status === 'pending';
    });
  }

  async listPending(limit?: number): Promise<Task[]> {
    const results = Array.from(this.tasks.values())
      .filter((t) => t.status === 'pending')
      .sort((a, b) => (a.dueAt?.getTime() || Infinity) - (b.dueAt?.getTime() || Infinity));
    return limit ? results.slice(0, limit) : results;
  }
}

// ============================================================
// Audit Log Repository
// ============================================================

export class InMemoryAuditLogRepository {
  private logs: Map<string, AuditLog> = new Map();

  async findById(id: string): Promise<AuditLog | null> {
    return this.logs.get(id) || null;
  }

  async findByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    return Array.from(this.logs.values())
      .filter((l) => l.entityType === entityType && l.entityId === entityId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findBySourceMessage(messageId: string): Promise<AuditLog[]> {
    return Array.from(this.logs.values())
      .filter((l) => l.sourceMessageId === messageId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async save(log: AuditLog): Promise<void> {
    this.logs.set(log.id, log);
  }

  async listRecent(limit?: number): Promise<AuditLog[]> {
    const results = Array.from(this.logs.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return limit ? results.slice(0, limit) : results;
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createInMemoryRepositories() {
  const messageRepo = new InMemoryMessageRepository();
  const productRepo = new InMemoryProductRepository();
  const aliasRepo = new InMemoryProductAliasRepository();
  const customerRepo = new InMemoryCustomerRepository();
  const orderRepo = new InMemoryOrderRepository();
  const orderItemRepo = new InMemoryOrderItemRepository();
  const taskRepo = new InMemoryTaskRepository();
  const auditLogRepo = new InMemoryAuditLogRepository();

  // Seed sample data
  const now = new Date();
  
  productRepo.seed([
    { id: 'prod-001', sku: 'BUN01', name: 'Bánh bao nhân bơ', normalizedName: 'banh bao nhan bo', defaultUnit: 'cái', active: true, createdAt: now, updatedAt: now },
    { id: 'prod-002', sku: 'BUN02', name: 'Bánh bao nhân thịt', normalizedName: 'banh bao nhan thit', defaultUnit: 'cái', active: true, createdAt: now, updatedAt: now },
    { id: 'prod-003', sku: 'BUN03', name: 'Bánh bao nhân đậu xanh', normalizedName: 'banh bao nhan dau xanh', defaultUnit: 'cái', active: true, createdAt: now, updatedAt: now },
  ]);

  aliasRepo.seed([
    { id: 'alias-001', productId: 'prod-001', alias: '55 bơ', normalizedAlias: '55 bo', source: 'global', verified: true, confidence: 1.0, createdAt: now, updatedAt: now },
    { id: 'alias-002', productId: 'prod-001', alias: 'banh 55 bo', normalizedAlias: 'banh 55 bo', source: 'global', verified: true, confidence: 0.95, createdAt: now, updatedAt: now },
    { id: 'alias-003', productId: 'prod-002', alias: '55 thịt', normalizedAlias: '55 thit', source: 'global', verified: true, confidence: 1.0, createdAt: now, updatedAt: now },
    { id: 'alias-004', productId: 'prod-003', alias: '55 đậu', normalizedAlias: '55 dau', source: 'global', verified: true, confidence: 1.0, createdAt: now, updatedAt: now },
  ]);

  return {
    messageRepository: messageRepo,
    productRepository: productRepo,
    productAliasRepository: aliasRepo,
    customerRepository: customerRepo,
    orderRepository: orderRepo,
    orderItemRepository: orderItemRepo,
    taskRepository: taskRepo,
    auditLogRepository: auditLogRepo
  };
}
