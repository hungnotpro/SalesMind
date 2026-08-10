/**
 * Order entity - commercial transaction.
 */

import { OrderStatus, PaymentMethod, ResolutionStatus } from '../../shared/src/enums.js';

export interface Order {
  id: string;
  customerId?: string;
  sourceMessageId: string;
  orderNumber?: string;
  orderDate: Date;
  requestedDeliveryAt?: Date;
  status: OrderStatus;
  discountRate?: number;
  discountSource?: string;
  paymentMethod?: PaymentMethod;
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
  resolutionStatus: ResolutionStatus;
  resolutionConfidence?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderInput {
  customerId?: string;
  sourceMessageId: string;
  orderDate?: Date;
  requestedDeliveryAt?: Date;
  discountRate?: number;
  discountSource?: string;
  paymentMethod?: PaymentMethod;
  paymentSource?: string;
  invoiceRequired?: boolean;
  invoiceDueAt?: Date;
  notes?: string;
  status?: OrderStatus;
}

export interface CreateOrderItemInput {
  orderId: string;
  productId?: string;
  rawProductName: string;
  quantity: number;
  unit: string;
  resolutionStatus: ResolutionStatus;
  resolutionConfidence?: number;
  notes?: string;
}

export function validateCreateOrder(input: unknown): CreateOrderInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Order input must be an object');
  }

  const i = input as Record<string, unknown>;

  if (typeof i.sourceMessageId !== 'string' || !i.sourceMessageId.trim()) {
    throw new Error('Source message ID is required');
  }

  const discountRate = i.discountRate as number | undefined;
  if (discountRate !== undefined && (discountRate < 0 || discountRate > 1)) {
    throw new Error('Discount rate must be between 0 and 1');
  }

  return {
    customerId: i.customerId?.toString().trim(),
    sourceMessageId: i.sourceMessageId.trim(),
    orderDate: i.orderDate as Date || new Date(),
    requestedDeliveryAt: i.requestedDeliveryAt as Date | undefined,
    discountRate,
    discountSource: i.discountSource?.toString().trim(),
    paymentMethod: i.paymentMethod as PaymentMethod | undefined,
    paymentSource: i.paymentSource?.toString().trim(),
    invoiceRequired: Boolean(i.invoiceRequired),
    invoiceDueAt: i.invoiceDueAt as Date | undefined,
    notes: i.notes?.toString().trim(),
    status: i.status as OrderStatus || OrderStatus.Draft
  };
}

export function validateCreateOrderItem(input: unknown): CreateOrderItemInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Order item input must be an object');
  }

  const i = input as Record<string, unknown>;

  if (typeof i.orderId !== 'string' || !i.orderId.trim()) {
    throw new Error('Order ID is required');
  }

  if (typeof i.rawProductName !== 'string' || !i.rawProductName.trim()) {
    throw new Error('Raw product name is required');
  }

  if (typeof i.quantity !== 'number' || i.quantity <= 0 || !Number.isFinite(i.quantity)) {
    throw new Error('Quantity must be a positive number');
  }

  if (typeof i.unit !== 'string' || !i.unit.trim()) {
    throw new Error('Unit is required');
  }

  return {
    orderId: i.orderId.trim(),
    productId: i.productId?.toString().trim(),
    rawProductName: i.rawProductName.trim(),
    quantity: i.quantity,
    unit: i.unit.trim(),
    resolutionStatus: (i.resolutionStatus as ResolutionStatus) || ResolutionStatus.NeedsReview,
    resolutionConfidence: i.resolutionConfidence as number | undefined,
    notes: i.notes?.toString().trim()
  };
}
