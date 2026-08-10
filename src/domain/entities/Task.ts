/**
 * Task entity - operational action.
 */

import { TaskPriority, TaskStatus } from '../shared/enums.js';

export interface Task {
  id: string;
  orderId?: string;
  type: TaskType;
  title: string;
  description?: string;
  ownerId?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt?: Date;
  sourceMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum TaskType {
  Delivery = 'delivery',
  Invoice = 'invoice',
  PaymentFollowup = 'payment_followup',
  ReviewOrder = 'review_order',
  ResolveProduct = 'resolve_product',
  ResolveCustomer = 'resolve_customer',
  Other = 'other'
}

export function generateTaskBusinessKey(orderId: string | undefined, taskType: TaskType, dueAt: Date | undefined): string {
  const dateKey = dueAt ? dueAt.toISOString().split('T')[0] : 'unspecified';
  return `${orderId || 'no-order'}:${taskType}:${dateKey}`;
}

export function validateCreateTask(input: unknown): any {
  if (!input || typeof input !== 'object') throw new Error('Task input must be an object');
  const i = input as Record<string, unknown>;
  if (!Object.values(TaskType).includes(i.type as TaskType)) throw new Error(`Invalid task type: ${i.type}`);
  if (typeof i.title !== 'string' || !i.title.trim()) throw new Error('title is required');
  return { type: i.type as TaskType, title: i.title.trim(), description: i.description?.toString().trim(), priority: (i.priority as TaskPriority) || TaskPriority.Normal, dueAt: i.dueAt as Date | undefined, orderId: i.orderId?.toString().trim() };
}
