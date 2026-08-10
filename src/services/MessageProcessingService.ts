/**
 * Message processing service - orchestrates the message-to-order pipeline.
 * 
 * Pipeline:
 * 1. Parse message (intent, products, instructions)
 * 2. Apply business rules
 * 3. Create order
 * 4. Create tasks
 * 5. Determine review requirements
 */

import { 
  Message, 
  MessageProcessingStatus,
  ProcessingResult,
  createEmptyProcessingResult,
  requiresReview,
  OrderItemCandidate,
  TaskCandidate,
  OrderStatus,
  PaymentMethod,
  TaskPriority,
  TaskType
} from '@salesmind/domain';
import { parseMessage } from '@salesmind/parser';
import { applyBusinessRules, RuleEngineConfig, DEFAULT_RULE_ENGINE_CONFIG } from '@salesmind/rules';
import { OrderService } from '@salesmind/domain';
import { TaskService } from '@salesmind/domain';
import { IMessageRepository } from '@salesmind/domain';
import { IOrderRepository } from '@salesmind/domain';
import { IOrderItemRepository } from '@salesmind/domain';
import { ITaskRepository } from '@salesmind/domain';
import { IAuditLogRepository } from '@salesmind/domain';
import { generateUUID, ResolutionStatus, MessageIntent } from '@salesmind/shared';

export interface ProcessingServiceResult {
  orderId?: string;
  taskIds: string[];
  reviewRequired: boolean;
  processingResult: ProcessingResult;
}

export class MessageProcessingService {
  constructor(
    private messageRepository: IMessageRepository,
    private orderRepository: IOrderRepository,
    private orderItemRepository: IOrderItemRepository,
    private taskRepository: ITaskRepository,
    private auditLogRepository: IAuditLogRepository
  ) {}

  /**
   * Find message by source and external ID.
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
  async updateMessageStatus(messageId: string, status: MessageProcessingStatus): Promise<void> {
    await this.messageRepository.updateStatus(messageId, status);
  }

  /**
   * Process a message through the complete pipeline.
   */
  async processMessage(
    message: Message,
    correlationId: string,
    config: RuleEngineConfig = DEFAULT_RULE_ENGINE_CONFIG
  ): Promise<ProcessingServiceResult> {
    let orderId: string | undefined;
    const taskIds: string[] = [];

    // Step 1: Parse message
    const parseInput = {
      messageId: message.id,
      rawText: message.rawText,
      sender: message.sender,
      receivedAt: message.receivedAt,
      correlationId
    };

    const parsingResult = parseMessage(parseInput, {
      parserVersion: '1.0.0',
      ruleEngineVersion: '1.0.0'
    });

    // Step 2: Apply business rules
    const ruleResult = applyBusinessRules(parsingResult, config);

    // Combine tasks from parsing and rules
    const allTasks: TaskCandidate[] = [
      ...parsingResult.tasks,
      ...ruleResult.tasks
    ];

    // Deduplicate tasks by type
    const uniqueTasks = this.deduplicateTasks(allTasks);

    // Step 3: Determine review requirements
    const reviewRequired = 
      ruleResult.reviewRequirement.required ||
      requiresReview(parsingResult);

    // Step 4: Create order if valid order content exists
    if (parsingResult.items.length > 0) {
      const order = await this.createOrder(message, parsingResult, ruleResult);
      orderId = order.id;

      // Step 5: Create tasks
      if (uniqueTasks.length > 0) {
        const tasks = await this.createTasks(orderId, uniqueTasks, message.id);
        taskIds.push(...tasks.map((t) => t.id));
      }

      // Step 6: Create review task if needed
      if (reviewRequired) {
        const reviewTask = await this.createReviewTask(
          orderId,
          ruleResult.reviewRequirement.reasons,
          message.id
        );
        taskIds.push(reviewTask.id);
      }
    }

    return {
      orderId,
      taskIds,
      reviewRequired,
      processingResult: parsingResult
    };
  }

  /**
   * Get processing result for a message.
   */
  async getProcessingResult(messageId: string): Promise<ProcessingResult | null> {
    // For now, we return null as processing results aren't persisted separately
    // In production, this would query a processing_results table
    return null;
  }

  /**
   * Create order from processing result.
   */
  private async createOrder(
    message: Message,
    result: ProcessingResult,
    ruleResult: ReturnType<typeof applyBusinessRules>
  ) {
    const orderId = generateUUID();
    const now = new Date();

    // Resolve customer if available
    let customerId: string | undefined;
    if (result.customerInfo?.customerId) {
      customerId = result.customerInfo.customerId;
    }

    // Create order entity
    const order = {
      id: orderId,
      customerId,
      sourceMessageId: message.id,
      orderDate: message.receivedAt,
      status: OrderStatus.Draft,
      discountRate: ruleResult.discountRate ?? undefined,
      discountSource: ruleResult.discountSource ?? undefined,
      paymentMethod: ruleResult.paymentMethod as PaymentMethod | undefined,
      paymentSource: ruleResult.paymentSource ?? undefined,
      invoiceRequired: ruleResult.invoiceRequired,
      invoiceDueAt: ruleResult.invoiceDueAt ?? undefined,
      createdAt: now,
      updatedAt: now
    };

    await this.orderRepository.save(order);

    // Create order items
    for (const item of result.items) {
      const itemId = generateUUID();
      const orderItem = {
        id: itemId,
        orderId,
        productId: item.productId,
        rawProductName: item.rawProductName,
        quantity: item.quantity,
        unit: item.unit,
        resolutionStatus: item.resolutionStatus,
        resolutionConfidence: item.resolutionConfidence,
        createdAt: now,
        updatedAt: now
      };

      await this.orderItemRepository.save(orderItem);
    }

    return order;
  }

  /**
   * Create tasks from task candidates.
   */
  private async createTasks(
    orderId: string,
    candidates: TaskCandidate[],
    sourceMessageId: string
  ): Promise<{ id: string }[]> {
    const createdTasks: { id: string }[] = [];

    for (const candidate of candidates) {
      const taskId = generateUUID();
      const now = new Date();

      const task = {
        id: taskId,
        orderId,
        type: candidate.type as TaskType,
        title: candidate.title,
        description: candidate.description,
        priority: (candidate.priority as TaskPriority) || TaskPriority.Normal,
        status: 'pending' as const,
        dueAt: candidate.dueAt,
        sourceMessageId,
        createdAt: now,
        updatedAt: now
      };

      await this.taskRepository.save(task);
      createdTasks.push({ id: taskId });
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
  ): Promise<{ id: string }> {
    const taskId = generateUUID();
    const now = new Date();

    const task = {
      id: taskId,
      orderId,
      type: TaskType.ReviewOrder,
      title: 'Review Order',
      description: `Review required: ${reasons.join('; ')}`,
      priority: TaskPriority.Normal,
      status: 'pending' as const,
      sourceMessageId,
      createdAt: now,
      updatedAt: now
    };

    await this.taskRepository.save(task);
    return { id: taskId };
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
