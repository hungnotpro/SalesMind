/**
 * Order entity - commercial transaction.
 */

import { OrderStatus, PaymentMethod, ResolutionStatus } from '../shared/enums.js';

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

export function validateCreateOrder(input: unknown): any {
  if (!input || typeof input !== 'object') throw new Error('Order input must be an object');
  const i = input as Record<string, unknown>;
  if (typeof i.sourceMessageId !== 'string' || !i.sourceMessageId.trim()) throw new Error('sourceMessageId is required');
  const discountRate = i.discountRate as number | undefined;
  if (discountRate !== undefined && (discountRate < 0 || discountRate > 1)) throw new Error('discount rate must be 0-1');
  return { sourceMessageId: (i.sourceMessageId as string).trim(), customerId: i.customerId?.toString().trim(), orderDate: i.orderDate as Date || new Date(), discountRate, paymentMethod: i.paymentMethod, invoiceRequired: Boolean(i.invoiceRequired), status: (i.status as OrderStatus) || OrderStatus.Draft };
}

export function validateCreateOrderItem(input: unknown): any {
  if (!input || typeof input !== 'object') throw new Error('Order item input must be an object');
  const i = input as Record<string, unknown>;
  if (typeof i.orderId !== 'string' || !i.orderId.trim()) throw new Error('orderId is required');
  if (typeof i.rawProductName !== 'string' || !i.rawProductName.trim()) throw new Error('rawProductName is required');
  if (typeof i.quantity !== 'number' || i.quantity <= 0 || !Number.isFinite(i.quantity)) throw new Error('quantity must be positive');
  if (typeof i.unit !== 'string' || !i.unit.trim()) throw new Error('unit is required');
  return { orderId: i.orderId.trim(), rawProductName: i.rawProductName.trim(), quantity: i.quantity, unit: i.unit.trim(), resolutionStatus: (i.resolutionStatus as ResolutionStatus) || ResolutionStatus.NeedsReview };
}
