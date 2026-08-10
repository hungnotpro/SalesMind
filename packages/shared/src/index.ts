/**
 * Shared - Common types and utilities for SalesMind OS.
 */

export enum ResolutionStatus {
  Resolved = 'resolved',
  NeedsReview = 'needs_review',
  Unresolved = 'unresolved',
  Rejected = 'rejected'
}

export enum TaskPriority {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
  Urgent = 'urgent'
}

export enum TaskType {
  Delivery = 'delivery',
  Invoice = 'invoice',
  PaymentFollowup = 'payment_followup',
  ReviewOrder = 'review_order',
  Other = 'other'
}

export enum MessageIntent {
  Order = 'order',
  Task = 'task',
  OrderUpdate = 'order_update',
  OrderCancellation = 'order_cancellation',
  Information = 'information',
  Unknown = 'unknown'
}

export enum OrderStatus {
  Draft = 'draft',
  Confirmed = 'confirmed',
  Processing = 'processing',
  Completed = 'completed',
  Cancelled = 'cancelled'
}

export enum PaymentMethod {
  Cash = 'cash',
  BankTransfer = 'bank_transfer',
  Credit = 'credit',
  Other = 'other'
}

export function removeDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function parseQuantity(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const str = String(input).trim();
  const fractionMatch = str.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const num = parseFloat(fractionMatch[1]) / parseFloat(fractionMatch[2]);
    return isNaN(num) ? null : num;
  }
  const normalized = str.startsWith(',') ? `0${str}` : str;
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? null : parsed;
}

export function isValidQuantity(quantity: unknown): boolean {
  const q = parseQuantity(quantity);
  return q !== null && q > 0 && Number.isFinite(q);
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
