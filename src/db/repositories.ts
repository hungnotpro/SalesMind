/**
 * In-Memory Repositories for Development and Testing
 * 
 * Provides in-memory implementations of all repository interfaces
 * for testing the complete pipeline without a real database.
 */

import { MessageProcessingService, IMessageRepository, IOrderRepository, IOrderItemRepository, ITaskRepository, IAuditLogRepository, Message, Order, OrderItem, Task, AuditLog } from '../services/MessageProcessingService.js';
import { ProductResolutionService, IProductRepository, IProductAliasRepository, Product, ProductAlias } from '../product-resolution/ProductResolutionService.js';
import { CustomerResolutionService, ICustomerRepository, Customer, CustomerCandidate, normalizePhone, normalizeCustomerName } from '../customer-resolution/CustomerResolutionService.js';
import { ResolutionStatus, MessageIntent } from '../shared/enums.js';

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

export class InMemoryMessageRepository implements IMessageRepository {
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
}

// ============================================================
// Product Repository
// ============================================================

export class InMemoryProductRepository implements IProductRepository {
  private products: Map<string, Product> = new Map();

  async findById(id: string): Promise<Product | null> {
    return this.products.get(id) || null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    return Array.from(this.products.values()).find((p) => p.sku === sku) || null;
  }

  async findByNormalizedName(normalized: string): Promise<Product | null> {
    return Array.from(this.products.values()).find((p) => p.normalizedName === normalized) || null;
  }

  seed(products: Product[]): void {
    for (const product of products) {
      this.products.set(product.id, product);
    }
  }
}

// ============================================================
// Product Alias Repository
// ============================================================

export class InMemoryProductAliasRepository implements IProductAliasRepository {
  private aliases: Map<string, ProductAlias> = new Map();
  private aliasIndex: Map<string, string[]> = new Map();
  private normalizedIndex: Map<string, string[]> = new Map();
  private customerIndex: Map<string, string[]> = new Map();

  async findById(id: string): Promise<ProductAlias | null> {
    return this.aliases.get(id) || null;
  }

  async findByExactAlias(alias: string, customerId?: string): Promise<ProductAlias | null> {
    // First check customer-specific aliases
    if (customerId) {
      const customerAliases = this.customerIndex.get(customerId) || [];
      for (const id of customerAliases) {
        const a = this.aliases.get(id);
        if (a && a.alias.toLowerCase() === alias.toLowerCase()) {
          return a;
        }
      }
    }
    // Then check global aliases
    const candidates = this.aliasIndex.get(alias.toLowerCase()) || [];
    for (const id of candidates) {
      const a = this.aliases.get(id);
      if (a && !a.customerId) {
        return a;
      }
    }
    return null;
  }

  async findByNormalizedAlias(normalized: string, customerId?: string): Promise<ProductAlias[]> {
    const results: ProductAlias[] = [];
    // Check customer-specific aliases first
    if (customerId) {
      const customerAliases = this.customerIndex.get(customerId) || [];
      for (const id of customerAliases) {
        const a = this.aliases.get(id);
        if (a && a.normalizedAlias.toLowerCase() === normalized.toLowerCase()) {
          results.push(a);
        }
      }
    }
    // Then check global aliases
    const candidates = this.normalizedIndex.get(normalized.toLowerCase()) || [];
    for (const id of candidates) {
      const a = this.aliases.get(id);
      if (a && !a.customerId) {
        results.push(a);
      }
    }
    return results;
  }

  async findByProductId(productId: string): Promise<ProductAlias[]> {
    return Array.from(this.aliases.values()).filter((a) => a.productId === productId);
  }

  async findByCustomerId(customerId: string): Promise<ProductAlias[]> {
    const ids = this.customerIndex.get(customerId) || [];
    return ids.map(id => this.aliases.get(id)).filter(Boolean) as ProductAlias[];
  }

  async findVerifiedGlobal(): Promise<ProductAlias[]> {
    return Array.from(this.aliases.values()).filter((a) => a.verified && !a.customerId);
  }

  async save(alias: ProductAlias): Promise<void> {
    this.aliases.set(alias.id, alias);
    
    // Index by alias (case-insensitive)
    const aliasKey = alias.alias.toLowerCase();
    const existing = this.aliasIndex.get(aliasKey) || [];
    if (!existing.includes(alias.id)) {
      this.aliasIndex.set(aliasKey, [...existing, alias.id]);
    }
    
    // Index by normalized alias
    const normalizedKey = alias.normalizedAlias.toLowerCase();
    const normExisting = this.normalizedIndex.get(normalizedKey) || [];
    if (!normExisting.includes(alias.id)) {
      this.normalizedIndex.set(normalizedKey, [...normExisting, alias.id]);
    }
    
    // Index by customer
    if (alias.customerId) {
      const customerAliases = this.customerIndex.get(alias.customerId) || [];
      if (!customerAliases.includes(alias.id)) {
        this.customerIndex.set(alias.customerId, [...customerAliases, alias.id]);
      }
    }
  }

  seed(aliases: ProductAlias[]): void {
    for (const alias of aliases) {
      this.save(alias);
    }
  }
}

// ============================================================
// Customer Repository
// ============================================================

export class InMemoryCustomerRepository implements ICustomerRepository {
  private customers: Map<string, Customer> = new Map();
  private phoneIndex: Map<string, string> = new Map();
  private nameIndex: Map<string, string[]> = new Map();
  private conversationIndex: Map<string, string> = new Map();

  async findById(id: string): Promise<Customer | null> {
    return this.customers.get(id) || null;
  }

  async findByPhone(normalizedPhone: string): Promise<Customer | null> {
    const id = this.phoneIndex.get(normalizedPhone);
    return id ? this.customers.get(id) || null : null;
  }

  async findByNormalizedName(normalizedName: string): Promise<Customer[]> {
    // Exact match
    const exactIds = this.nameIndex.get(normalizedName.toLowerCase()) || [];
    const exactMatches = exactIds.map(id => this.customers.get(id)).filter(Boolean) as Customer[];

    // Also find by prefix (for fuzzy search)
    const allMatches: Customer[] = [...exactMatches];
    const prefix = normalizedName.toLowerCase().slice(0, 3);

    for (const [name, ids] of this.nameIndex.entries()) {
      if (name.startsWith(prefix) && !exactMatches.some(m => m.id === this.nameIndex.get(name)?.[0])) {
        for (const id of ids) {
          const customer = this.customers.get(id);
          if (customer) {
            allMatches.push(customer);
          }
        }
      }
    }

    return allMatches;
  }

  async findByConversationId(conversationId: string): Promise<Customer | null> {
    const id = this.conversationIndex.get(conversationId);
    return id ? this.customers.get(id) || null : null;
  }

  async save(customer: Customer): Promise<void> {
    this.customers.set(customer.id, customer);

    // Index by phone
    if (customer.normalizedPhone) {
      this.phoneIndex.set(customer.normalizedPhone, customer.id);
    }

    // Index by name
    const nameKey = customer.normalizedName.toLowerCase();
    const existing = this.nameIndex.get(nameKey) || [];
    if (!existing.includes(customer.id)) {
      this.nameIndex.set(nameKey, [...existing, customer.id]);
    }

    // Index by conversation if available
    const conversations = (customer as any).conversations as string[] | undefined;
    if (conversations) {
      for (const convId of conversations) {
        if (!this.conversationIndex.has(convId)) {
          this.conversationIndex.set(convId, customer.id);
        }
      }
    }
  }

  async update(customer: Customer): Promise<void> {
    this.customers.set(customer.id, customer);
  }

  seed(customers: Customer[]): void {
    for (const customer of customers) {
      this.save(customer);
    }
  }
}

// ============================================================
// Order Repository
// ============================================================

export class InMemoryOrderRepository implements IOrderRepository {
  private orders: Map<string, Order> = new Map();

  async findById(id: string): Promise<Order | null> {
    return this.orders.get(id) || null;
  }

  async findBySourceMessageId(messageId: string): Promise<Order | null> {
    return Array.from(this.orders.values()).find((o) => o.sourceMessageId === messageId) || null;
  }

  async save(order: Order): Promise<void> {
    this.orders.set(order.id, order);
  }

  async update(order: Order): Promise<void> {
    this.orders.set(order.id, order);
  }
}

// ============================================================
// Order Item Repository
// ============================================================

export class InMemoryOrderItemRepository implements IOrderItemRepository {
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
}

// ============================================================
// Task Repository
// ============================================================

export class InMemoryTaskRepository implements ITaskRepository {
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

  async save(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }
}

// ============================================================
// Audit Log Repository
// ============================================================

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  private logs: Map<string, AuditLog> = new Map();

  async save(log: AuditLog): Promise<void> {
    this.logs.set(log.id, log);
  }

  async findByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    return Array.from(this.logs.values())
      .filter((l) => l.entityType === entityType && l.entityId === entityId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}

// ============================================================
// Factory Function
// ============================================================

export interface Repositories {
  messageRepository: InMemoryMessageRepository;
  productRepository: InMemoryProductRepository;
  aliasRepository: InMemoryProductAliasRepository;
  customerRepository: InMemoryCustomerRepository;
  orderRepository: InMemoryOrderRepository;
  orderItemRepository: InMemoryOrderItemRepository;
  taskRepository: InMemoryTaskRepository;
  auditLogRepository: InMemoryAuditLogRepository;
  productResolutionService: ProductResolutionService;
  customerResolutionService: CustomerResolutionService;
  messageProcessingService: MessageProcessingService;
}

export function createRepositories(): Repositories {
  // Create repositories
  const messageRepository = new InMemoryMessageRepository();
  const productRepository = new InMemoryProductRepository();
  const aliasRepository = new InMemoryProductAliasRepository();
  const customerRepository = new InMemoryCustomerRepository();
  const orderRepository = new InMemoryOrderRepository();
  const orderItemRepository = new InMemoryOrderItemRepository();
  const taskRepository = new InMemoryTaskRepository();
  const auditLogRepository = new InMemoryAuditLogRepository();

  // Create resolution services
  const productResolutionService = new ProductResolutionService(productRepository, aliasRepository);
  const customerResolutionService = new CustomerResolutionService(customerRepository);

  // Create MessageProcessingService with all dependencies
  const messageProcessingService = new MessageProcessingService(
    messageRepository,
    orderRepository,
    orderItemRepository,
    taskRepository,
    auditLogRepository,
    productResolutionService,
    customerResolutionService
  );

  // Seed sample data
  seedSampleData(productRepository, aliasRepository, customerRepository);

  return {
    messageRepository,
    productRepository,
    aliasRepository,
    customerRepository,
    orderRepository,
    orderItemRepository,
    taskRepository,
    auditLogRepository,
    productResolutionService,
    customerResolutionService,
    messageProcessingService
  };
}

function seedSampleData(
  productRepo: InMemoryProductRepository,
  aliasRepo: InMemoryProductAliasRepository,
  customerRepo: InMemoryCustomerRepository
): void {
  // Seed sample products
  productRepo.seed([
    { id: 'prod-001', sku: 'BUN01', name: 'Bánh bao nhân bơ', normalizedName: 'banh bao nhan bo', defaultUnit: 'cái', active: true },
    { id: 'prod-002', sku: 'BUN02', name: 'Bánh bao nhân thịt', normalizedName: 'banh bao nhan thit', defaultUnit: 'cái', active: true },
    { id: 'prod-003', sku: 'BUN03', name: 'Bánh bao nhân đậu xanh', normalizedName: 'banh bao nhan dau xanh', defaultUnit: 'cái', active: true },
    { id: 'prod-004', sku: 'BUN04', name: 'Bánh bao gà', normalizedName: 'banh bao ga', defaultUnit: 'cái', active: true },
  ]);

  // Seed sample product aliases
  aliasRepo.seed([
    { id: 'alias-001', productId: 'prod-001', alias: '55 bơ', normalizedAlias: '55 bo', source: 'global', verified: true, confidence: 1.0 },
    { id: 'alias-002', productId: 'prod-001', alias: 'banh 55 bo', normalizedAlias: 'banh 55 bo', source: 'global', verified: true, confidence: 0.95 },
    { id: 'alias-003', productId: 'prod-002', alias: '55 thịt', normalizedAlias: '55 thit', source: 'global', verified: true, confidence: 1.0 },
    { id: 'alias-004', productId: 'prod-002', alias: 'sw chà bông', normalizedAlias: 'sw cha bong', source: 'global', verified: true, confidence: 0.9 },
    { id: 'alias-005', productId: 'prod-002', alias: 'sw cá hồi', normalizedAlias: 'sw ca hoi', source: 'global', verified: true, confidence: 0.9 },
    { id: 'alias-006', productId: 'prod-003', alias: '55 đậu', normalizedAlias: '55 dau', source: 'global', verified: true, confidence: 1.0 },
    { id: 'alias-007', productId: 'prod-004', alias: '50g cay', normalizedAlias: '50g cay', source: 'global', verified: true, confidence: 0.9 },
    { id: 'alias-008', productId: 'prod-003', alias: '55g so', normalizedAlias: '55g so', source: 'global', verified: true, confidence: 0.9 },
  ]);

  // Seed sample customers
  customerRepo.seed([
    {
      id: 'cust-001',
      displayName: 'a.Long',
      normalizedName: 'along',
      phone: '0904813024',
      normalizedPhone: '84904813024',
      addresses: [
        { rawAddress: '65B đường hiệp bình, hcm', normalizedAddress: '65b duong hiep binh, hcm', isVerified: true }
      ],
      status: 'active',
      verified: true,
      confidence: 1.0,
      conversations: ['conv-001']
    },
    {
      id: 'cust-002',
      displayName: 'Minh',
      normalizedName: 'minh',
      phone: '0905123456',
      normalizedPhone: '84905123456',
      status: 'active',
      verified: true,
      confidence: 1.0
    },
    {
      // Unverified customer - name should NOT count as strong evidence
      id: 'cust-003',
      displayName: 'a.Long',
      normalizedName: 'along',
      phone: '0909988776',
      normalizedPhone: '84909988776',
      status: 'unverified',
      verified: false,
      confidence: 0.3
    }
  ] as any[]);
}
