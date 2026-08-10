/**
 * OrderService - domain service for order management.
 */

import { Order, OrderItem, CreateOrderInput, CreateOrderItemInput, validateCreateOrder, validateCreateOrderItem } from '../entities/Order.js';
import { OrderStatus, PaymentMethod, ResolutionStatus } from '@salesmind/shared';
import { IOrderRepository, IOrderItemRepository } from '../repositories/OrderRepository.js';
import { IAuditLogRepository } from '../repositories/AuditLogRepository.js';
import { createAuditLog, AuditAction, AuditActorType } from '../entities/AuditLog.js';
import { generateUUID, getCurrentTimestamp } from '@salesmind/shared';
import { OrderItemCandidate } from '../value-objects/OrderItemCandidate.js';
import { ExtractedInstruction, InstructionType } from '../value-objects/ExtractedInstruction.js';

export interface CreateOrderFromProcessingInput {
  sourceMessageId: string;
  customerId?: string;
  items: OrderItemCandidate[];
  instructions: ExtractedInstruction[];
  orderDate?: Date;
}

export class OrderService {
  constructor(
    private orderRepository: IOrderRepository,
    private orderItemRepository: IOrderItemRepository,
    private auditLogRepository: IAuditLogRepository
  ) {}

  /**
   * Create an order from processing result.
   */
  async createFromProcessing(input: CreateOrderFromProcessingInput): Promise<Order> {
    const orderId = generateUUID();
    const now = new Date();

    // Extract discount from instructions
    const discountInstruction = input.instructions.find((i) => i.type === InstructionType.Discount);
    const discountRate = discountInstruction?.numericValue;

    // Extract payment method from instructions
    const paymentInstruction = input.instructions.find((i) => i.type === InstructionType.Payment);
    const paymentMethod = paymentInstruction
      ? (paymentInstruction as { method: PaymentMethod }).method
      : undefined;

    // Extract delivery requirement
    const deliveryInstruction = input.instructions.find((i) => i.type === InstructionType.Delivery);
    const requestedDeliveryAt = deliveryInstruction?.targetDate;

    // Extract invoice requirement
    const invoiceInstruction = input.instructions.find((i) => i.type === InstructionType.Invoice);
    const invoiceRequired = invoiceInstruction?.isSameDay ?? false;
    const invoiceDueAt = invoiceInstruction?.targetDate;

    // Validate order input
    const orderInput: CreateOrderInput = {
      sourceMessageId: input.sourceMessageId,
      customerId: input.customerId,
      orderDate: input.orderDate ?? now,
      requestedDeliveryAt,
      discountRate,
      discountSource: discountInstruction?.rawText,
      paymentMethod,
      paymentSource: paymentInstruction?.rawText,
      invoiceRequired,
      invoiceDueAt,
      status: OrderStatus.Draft
    };

    validateCreateOrder(orderInput);

    // Create order entity
    const order: Order = {
      id: orderId,
      customerId: orderInput.customerId,
      sourceMessageId: orderInput.sourceMessageId,
      orderDate: orderInput.orderDate!,
      requestedDeliveryAt,
      status: OrderStatus.Draft,
      discountRate,
      discountSource: orderInput.discountSource,
      paymentMethod,
      paymentSource: orderInput.paymentSource,
      invoiceRequired,
      invoiceDueAt,
      createdAt: now,
      updatedAt: now
    };

    // Save order
    await this.orderRepository.save(order);

    // Create audit log for order creation
    await this.auditLogRepository.save(
      createAuditLog(
        {
          entityType: 'Order',
          entityId: orderId,
          action: AuditAction.Create,
          actorType: AuditActorType.System,
          sourceMessageId: input.sourceMessageId,
          afterData: { status: OrderStatus.Draft, itemCount: input.items.length }
        },
        generateUUID()
      )
    );

    // Create order items
    const orderItems: OrderItem[] = [];
    for (let i = 0; i < input.items.length; i++) {
      const itemCandidate = input.items[i];
      const itemId = generateUUID();

      const item: OrderItem = {
        id: itemId,
        orderId: orderId,
        productId: itemCandidate.productId,
        rawProductName: itemCandidate.rawProductName,
        quantity: itemCandidate.quantity,
        unit: itemCandidate.unit,
        resolutionStatus: itemCandidate.resolutionStatus,
        resolutionConfidence: itemCandidate.resolutionConfidence,
        createdAt: now,
        updatedAt: now
      };

      orderItems.push(item);
    }

    if (orderItems.length > 0) {
      await this.orderItemRepository.saveMany(orderItems);
    }

    return order;
  }

  /**
   * Update order status.
   */
  async updateStatus(orderId: string, newStatus: OrderStatus): Promise<Order> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const oldStatus = order.status;
    order.status = newStatus;
    order.updatedAt = new Date();

    await this.orderRepository.update(order);

    await this.auditLogRepository.save(
      createAuditLog(
        {
          entityType: 'Order',
          entityId: orderId,
          action: AuditAction.Update,
          actorType: AuditActorType.System,
          beforeData: { status: oldStatus },
          afterData: { status: newStatus }
        },
        generateUUID()
      )
    );

    return order;
  }

  /**
   * Get order with items.
   */
  async getOrderWithItems(orderId: string): Promise<{ order: Order; items: OrderItem[] } | null> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      return null;
    }

    const items = await this.orderItemRepository.findByOrderId(orderId);
    return { order, items };
  }

  /**
   * Check if order exists for source message.
   */
  async existsForSourceMessage(sourceMessageId: string): Promise<boolean> {
    const existing = await this.orderRepository.findBySourceMessageId(sourceMessageId);
    return existing !== null;
  }
}
