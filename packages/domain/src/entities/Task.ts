/**
 * Task entity - operational action.
 */

import { TaskPriority, TaskStatus } from '../../shared/src/enums.js';

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

export interface CreateTaskInput {
  orderId?: string;
  type: TaskType;
  title: string;
  description?: string;
  ownerId?: string;
  priority?: TaskPriority;
  dueAt?: Date;
  sourceMessageId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  ownerId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueAt?: Date;
}

export function generateTaskBusinessKey(
  orderId: string | undefined,
  taskType: TaskType,
  dueAt: Date | undefined
): string {
  const dateKey = dueAt ? dueAt.toISOString().split('T')[0] : 'unspecified';
  return `${orderId || 'no-order'}:${taskType}:${dateKey}`;
}

export function validateCreateTask(input: unknown): CreateTaskInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Task input must be an object');
  }

  const i = input as Record<string, unknown>;

  if (!Object.values(TaskType).includes(i.type as TaskType)) {
    throw new Error(`Invalid task type: ${i.type}`);
  }

  if (typeof i.title !== 'string' || !i.title.trim()) {
    throw new Error('Task title is required');
  }

  return {
    orderId: i.orderId?.toString().trim(),
    type: i.type as TaskType,
    title: i.title.trim(),
    description: i.description?.toString().trim(),
    ownerId: i.ownerId?.toString().trim(),
    priority: (i.priority as TaskPriority) || TaskPriority.Normal,
    dueAt: i.dueAt as Date | undefined,
    sourceMessageId: i.sourceMessageId?.toString().trim()
  };
}

export function validateUpdateTask(input: unknown): UpdateTaskInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Task update input must be an object');
  }

  const i = input as Record<string, unknown>;

  return {
    title: i.title?.toString().trim(),
    description: i.description?.toString().trim(),
    ownerId: i.ownerId?.toString().trim(),
    priority: i.priority as TaskPriority | undefined,
    status: i.status as TaskStatus | undefined,
    dueAt: i.dueAt as Date | undefined
  };
}
