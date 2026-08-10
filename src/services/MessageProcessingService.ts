/**
 * Message Processing Service - Full Pipeline Integration
 * 
 * Pipeline:
 * 1. Parse message (intent, products, instructions)
 * 2. Customer Resolution (resolve customer candidate)
 * 3. Product Resolution (resolve aliases to canonical products)
 * 4. Apply business rules
 * 5. Validate
 * 6. Create order and items
 * 7. Create tasks
 * 8. Determine review requirements
 */

import { generateUUID } from '../shared/utils.js';
import { MessageIntent, OrderStatus, PaymentMethod, TaskPriority, TaskType, ResolutionStatus } from '../shared/enums.js';
import { OrderItemCandidate, ProcessingResult, createEmptyProcessingResult, requiresReview, TaskCandidate, CustomerInfo, ExtractedInstruction } from '../domain/value-objects/index.js';
import { parseMessage } from '../parser/index.js';
import { applyBusinessRules, DEFAULT_RULE_ENGINE_CONFIG, RuleEngineConfig } from '../rules/index.js';
import { ProductResolutionService, normalizeUnit, IProductRepository, IProductAliasRepository, Product, ProductAlias } from '../product-resolution/ProductResolutionService.js';
import { CustomerResolutionService, ICustomerRepository, Customer, CustomerCandidate, normalizePhone, normalizeCustomerName, CustomerResolutionResult } from '../customer-resolution/CustomerResolutionService.js';

// Re-export types for external use
export { ProductResolutionService, normalizeUnit };
export type { IProductRepository, IProductAliasRepository, Product, ProductAlias };
export type { ResolutionConfig, ResolutionResult } from '../product-resolution/ProductResolutionService.js';
export { CustomerResolutionService, normalizePhone, normalizeCustomerName };
export type { ICustomerRepository, Customer, CustomerCandidate, CustomerResolutionResult };

// ============================================================
// Repository Interfaces
// ============================================================

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findBySourceAndExternalId(source: string, externalId: string): Promise<Message | null>;
  save(message: Message): Promise<void>;
  updateStatus(id: string, status: string): Promise<void>;
}

export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  findBySourceMessageId(messageId: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  update(order: Order): Promise<void>;
}

export interface IOrderItemRepository {
  findById(id: string): Promise<OrderItem | null>;
  findByOrderId(orderId: string): Promise<OrderItem[]>;
  save(item: OrderItem): Promise<void>;
  saveMany(items: OrderItem[]): Promise<void>;
}

export interface ITaskRepository {
  findById(id: string): Promise<Task | null>;
  findByBusinessKey(orderId: string | undefined, type: string, dueAt: Date | undefined): Promise<Task | null>;
  save(task: Task): Promise<void>;
}

export interface IAuditLogRepository {
  save(log: AuditLog): Promise<void>;
}

// ============================================================
// Entity Types
// ============================================================

export interface Message {
  id: string;
  source: string;
  externalMessageId: string;
  conversationId?: string;
  senderName?: string;
  senderPhone?: string;
  sender?: { name?: string; phone?: string };
  receivedAt: Date;
  rawText: string;
  metadataJson?: string;
  processingStatus: string;
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
  normalizedUnit?: string;
  resolutionStatus: string;
  resolutionConfidence?: number;
  matchMethod?: string;
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
  metadata?: string;
  createdAt: Date;
}

// ============================================================
// Processing Result Types
// ============================================================

export interface ProcessedOrderItem extends OrderItemCandidate {
  normalizedUnit?: string;
  matchMethod?: 'exact' | 'normalized' | 'fuzzy' | 'customer' | 'none';
}

export interface ProcessedCustomerInfo extends CustomerInfo {
  customerId?: string;
  rawName?: string;
  normalizedName?: string;
  rawPhone?: string;
  normalizedPhone?: string;
  rawAddress?: string;
  normalizedAddress?: string;
  resolutionStatus: ResolutionStatus;
  resolutionConfidence?: number;
  matchMethod?: string;
  conflict?: {
    phoneCustomerId?: string;
    phoneCustomerName?: string;
    nameCustomerId?: string;
    nameCustomerName?: string;
    reason: string;
  };
}

export interface PipelineResult {
  messageId: string;
  correlationId: string;
  rawText: string;
  intent: MessageIntent;
  intentConfidence: number;
  customerInfo?: ProcessedCustomerInfo;
  items: ProcessedOrderItem[];
  instructions: ExtractedInstruction[];
  discountRate?: number;
  paymentMethod?: string;
  invoiceRequired: boolean;
  orderId?: string;
  taskIds: string[];
  reviewRequired: boolean;
  reviewReasons: string[];
  warnings: { code: string; message: string }[];
  metadata: {
    processedAt: string;
    processingDurationMs: number;
    parserVersion: string;
    ruleEngineVersion: string;
  };
}

// ============================================================
// Message Processing Service
// ============================================================

export class MessageProcessingService {
  constructor(
    private messageRepository: IMessageRepository,
    private orderRepository: IOrderRepository,
    private orderItemRepository: IOrderItemRepository,
    private taskRepository: ITaskRepository,
    private auditLogRepository: IAuditLogRepository,
    private productResolutionService: ProductResolutionService,
    private customerResolutionService: CustomerResolutionService
  ) {}

  /**
   * Check for duplicate message by source and external ID.
   */
  async findBySourceAndExternalId(source: string, externalId: string): Promise<Message | null> {
    return this.messageRepository.findBySourceAndExternalId(source, externalId);
  }

  /**
   * Save a message.
   */
  async saveMessage(message: Message): Promise<void> {
    await this.messageRepository.save(message);
  }

  /**
   * Update message status.
   */
  async updateMessageStatus(messageId: string, status: string): Promise<void> {
    await this.messageRepository.updateStatus(messageId, status);
  }

  /**
   * Process a message through the complete pipeline.
   * 
   * Pipeline:
   * 1. Parse message (intent, products, instructions, customer candidate)
   * 2. Customer Resolution (NEW - resolve customer candidate)
   * 3. Product Resolution (resolve aliases to canonical products)
   * 4. Apply business rules
   * 5. Validate
   * 6. Create order and items
   * 7. Create tasks
   * 8. Determine review requirements
   */
  async processMessage(
    message: Message,
    correlationId?: string,
    config: RuleEngineConfig = DEFAULT_RULE_ENGINE_CONFIG
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const corrId = correlationId || `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const warnings: { code: string; message: string }[] = [];

    // ========================================
    // Step 1: Parse Message
    // ========================================
    const parseInput = {
      messageId: message.id,
      rawText: message.rawText,
      sender: message.sender,
      receivedAt: message.receivedAt,
      correlationId: corrId
    };

    const parsingResult = parseMessage(parseInput);

    // ========================================
    // Step 2: Customer Resolution (NEW)
    // ========================================
    const customerInfo = await this.resolveCustomer(
      parsingResult.customerInfo,
      message.conversationId
    );

    // ========================================
    // Step 3: Product Resolution
    // ========================================
    const resolvedItems = await this.resolveProducts(
      parsingResult.items,
      customerInfo?.customerId
    );

    // ========================================
    // Step 4: Apply Business Rules
    // ========================================
    const ruleResult = applyBusinessRules(parsingResult, config);

    // Combine tasks from parsing and rules
    const allTasks: TaskCandidate[] = [
      ...parsingResult.tasks,
      ...ruleResult.tasks
    ];
    const uniqueTasks = this.deduplicateTasks(allTasks);

    // ========================================
    // Step 5: Determine Review Requirements
    // ========================================
    const unresolvedItems = resolvedItems.filter(
      i => i.resolutionStatus === ResolutionStatus.NeedsReview || i.resolutionStatus === ResolutionStatus.Unresolved
    );
    
    const customerNeedsReview = !customerInfo?.customerId &&
      (customerInfo?.resolutionStatus === ResolutionStatus.NeedsReview ||
       customerInfo?.resolutionStatus === ResolutionStatus.Unresolved);

    const hasConflict = !!customerInfo?.conflict;

    const reviewReasons: string[] = [];

    if (unresolvedItems.length > 0) {
      reviewReasons.push(`${unresolvedItems.length} product(s) need review: ${unresolvedItems.map(i => `"${i.rawProductName}"`).join(', ')}`);
    }

    if (customerNeedsReview) {
      reviewReasons.push('Customer could not be identified');
    }

    if (hasConflict) {
      reviewReasons.push(`Customer conflict: ${customerInfo?.conflict?.reason}`);
    }

    if (parsingResult.items.length === 0) {
      reviewReasons.push('No products found');
    }

    const reviewRequired = reviewReasons.length > 0 || ruleResult.reviewRequirement.required;

    // ========================================
    // Step 6: Create Order and Items
    // ========================================
    let orderId: string | undefined;

    if (parsingResult.items.length > 0) {
      const order = await this.createOrder(
        message,
        customerInfo,
        resolvedItems,
        ruleResult
      );
      orderId = order.id;

      // ========================================
      // Step 7: Create Tasks
      // ========================================
      if (uniqueTasks.length > 0) {
        const tasks = await this.createTasks(orderId, uniqueTasks, message.id);
        
        // ========================================
        // Step 8: Create Review Task if Needed
        // ========================================
        if (reviewRequired && reviewReasons.length > 0) {
          const reviewTask = await this.createReviewTask(orderId, reviewReasons, message.id);
          tasks.push(reviewTask);
        }

        // Save audit log
        await this.saveAuditLog('Task', tasks.map(t => t.id).join(','), 'Create', 'System', undefined, message.id);
      }
    }

    // ========================================
    // Return Pipeline Result
    // ========================================
    return {
      messageId: message.id,
      correlationId: corrId,
      rawText: message.rawText,
      intent: parsingResult.intent,
      intentConfidence: parsingResult.intentConfidence,
      customerInfo,
      items: resolvedItems,
      instructions: parsingResult.instructions,
      discountRate: ruleResult.discountRate,
      paymentMethod: ruleResult.paymentMethod,
      invoiceRequired: ruleResult.invoiceRequired,
      orderId,
      taskIds: [],
      reviewRequired,
      reviewReasons,
      warnings,
      metadata: {
        processedAt: new Date().toISOString(),
        processingDurationMs: Date.now() - startTime,
        parserVersion: '1.0.0',
        ruleEngineVersion: '1.0.0'
      }
    };
  }

  /**
   * Resolve customer using CustomerResolutionService.
   */
  private async resolveCustomer(
    candidateInfo: CustomerInfo | undefined,
    conversationId?: string
  ): Promise<ProcessedCustomerInfo | undefined> {
    // Get raw address from parsing result metadata if available
    const rawAddress = (candidateInfo as any)?._rawAddress;
    
    // Create customer candidate from parsing result
    const candidate = this.customerResolutionService.createCandidate({
      rawName: candidateInfo?.displayName,
      rawPhone: candidateInfo?.phone,
      rawAddress: rawAddress
    });

    // Resolve using evidence hierarchy
    const resolution = await this.customerResolutionService.resolve(candidate, conversationId);

    // Build ProcessedCustomerInfo
    const result: ProcessedCustomerInfo = {
      resolutionStatus: resolution.resolutionStatus,
      resolutionConfidence: resolution.confidence,
      matchMethod: resolution.matchMethod,
      conflict: resolution.conflict
    };

    if (resolution.customer) {
      result.customerId = resolution.customer.id;
      result.displayName = resolution.customer.displayName;
      result.phone = resolution.customer.phone;
      result.normalizedName = resolution.customer.normalizedName;
      result.normalizedPhone = resolution.customer.normalizedPhone;
      result.rawName = candidate.rawName;
      result.rawPhone = candidate.rawPhone;
      result.rawAddress = rawAddress || resolution.customer.addresses?.[0]?.rawAddress;
      result.normalizedAddress = resolution.customer.addresses?.[0]?.normalizedAddress;
    } else {
      // No match found, use candidate info
      result.displayName = candidate.rawName;
      result.phone = candidate.rawPhone;
      result.normalizedName = candidate.normalizedName;
      result.normalizedPhone = candidate.normalizedPhone;
      result.rawName = candidate.rawName;
      result.rawPhone = candidate.rawPhone;
      result.rawAddress = rawAddress;
    }

    return result;
  }

  /**
   * Resolve products using ProductResolutionService.
   * Preserves raw values and adds resolution info.
   */
  private async resolveProducts(
    items: OrderItemCandidate[],
    customerId?: string
  ): Promise<ProcessedOrderItem[]> {
    const resolved: ProcessedOrderItem[] = [];

    for (const item of items) {
      // Normalize unit while preserving raw unit
      const normalizedUnit = normalizeUnit(item.unit);

      // Resolve product alias to canonical product
      const resolution = await this.productResolutionService.resolve(
        item.rawProductName,
        customerId
      );

      resolved.push({
        rawProductName: item.rawProductName,
        quantity: item.quantity,
        unit: item.unit,  // Raw unit preserved
        normalizedUnit: normalizedUnit,
        productId: resolution.productId,
        productName: resolution.product?.name,
        resolutionStatus: resolution.status,
        resolutionConfidence: resolution.confidence,
        matchMethod: resolution.matchMethod,
        lineNumber: item.lineNumber
      });
    }

    return resolved;
  }

  /**
   * Create order with items.
   */
  private async createOrder(
    message: Message,
    customerInfo: ProcessedCustomerInfo | undefined,
    items: ProcessedOrderItem[],
    ruleResult: ReturnType<typeof applyBusinessRules>
  ): Promise<Order> {
    const orderId = generateUUID();
    const now = new Date();

    // Create order entity with customer ID
    const order: Order = {
      id: orderId,
      customerId: customerInfo?.customerId,
      sourceMessageId: message.id,
      orderDate: message.receivedAt,
      status: OrderStatus.Draft,
      discountRate: ruleResult.discountRate ?? undefined,
      discountSource: ruleResult.discountSource ?? undefined,
      paymentMethod: ruleResult.paymentMethod as PaymentMethod | undefined,
      paymentSource: ruleResult.paymentSource ?? undefined,
      invoiceRequired: ruleResult.invoiceRequired,
      invoiceDueAt: ruleResult.invoiceDueAt ?? undefined,
      notes: customerInfo?.rawAddress ? `Delivery: ${customerInfo.rawAddress}` : undefined,
      createdAt: now,
      updatedAt: now
    };

    await this.orderRepository.save(order);

    // Create order items
    const orderItems: OrderItem[] = items.map(item => ({
      id: generateUUID(),
      orderId,
      productId: item.productId,
      rawProductName: item.rawProductName,
      quantity: item.quantity,
      unit: item.unit,
      normalizedUnit: item.normalizedUnit,
      resolutionStatus: item.resolutionStatus,
      resolutionConfidence: item.resolutionConfidence,
      matchMethod: item.matchMethod,
      createdAt: now,
      updatedAt: now
    }));

    await this.orderItemRepository.saveMany(orderItems);

    // Save audit log
    await this.saveAuditLog('Order', orderId, 'Create', 'System', undefined, message.id);

    return order;
  }

  /**
   * Create tasks from task candidates.
   */
  private async createTasks(
    orderId: string,
    candidates: TaskCandidate[],
    sourceMessageId: string
  ): Promise<Task[]> {
    const createdTasks: Task[] = [];

    for (const candidate of candidates) {
      // Check for duplicate task by business key
      const existing = await this.taskRepository.findByBusinessKey(
        orderId,
        candidate.type,
        candidate.dueAt
      );

      if (existing) {
        // Task already exists, skip
        continue;
      }

      const task: Task = {
        id: generateUUID(),
        orderId,
        type: candidate.type as TaskType,
        title: candidate.title,
        description: candidate.description,
        priority: (candidate.priority as TaskPriority) || TaskPriority.Normal,
        status: 'pending',
        dueAt: candidate.dueAt,
        sourceMessageId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.taskRepository.save(task);
      createdTasks.push(task);
    }

    return createdTasks;
  }

  /**
   * Create a review task when human review is needed.
   */
  private async createReviewTask(
    orderId: string,
    reasons: string[],
    sourceMessageId: string
  ): Promise<Task> {
    // Check for existing review task
    const existing = await this.taskRepository.findByBusinessKey(
      orderId,
      TaskType.ReviewOrder,
      undefined
    );

    if (existing) {
      return existing;
    }

    const task: Task = {
      id: generateUUID(),
      orderId,
      type: TaskType.ReviewOrder,
      title: 'Review Order',
      description: `Review required: ${reasons.join('; ')}`,
      priority: TaskPriority.Normal,
      status: 'pending',
      sourceMessageId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.taskRepository.save(task);

    return task;
  }

  /**
   * Save audit log.
   */
  private async saveAuditLog(
    entityType: string,
    entityId: string,
    action: string,
    actorType: string,
    actorId?: string,
    sourceMessageId?: string
  ): Promise<void> {
    const log: AuditLog = {
      id: generateUUID(),
      entityType,
      entityId,
      action,
      actorType,
      actorId,
      sourceMessageId,
      createdAt: new Date()
    };

    await this.auditLogRepository.save(log);
  }

  /**
   * Deduplicate tasks by type.
   */
  private deduplicateTasks(tasks: TaskCandidate[]): TaskCandidate[] {
    const seen = new Set<TaskType>();
    const unique: TaskCandidate[] = [];

    for (const task of tasks) {
      if (!seen.has(task.type)) {
        seen.add(task.type);
        unique.push(task);
      }
    }

    return unique;
  }
}
