/**
 * Task API routes - GET /tasks, PATCH /tasks/:id.
 */

import { TaskService } from '@salesmind/domain';
import { Task, TaskStatus } from '@salesmind/domain';
import { NotFoundError, ValidationError } from '@salesmind/shared';

export interface TaskListItem {
  id: string;
  orderId?: string;
  type: string;
  title: string;
  status: string;
  priority: string;
  dueAt?: string;
  createdAt: string;
}

export interface TaskDetail {
  id: string;
  orderId?: string;
  type: string;
  title: string;
  description?: string;
  ownerId?: string;
  status: string;
  priority: string;
  dueAt?: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTaskRequest {
  status?: string;
  priority?: string;
  ownerId?: string;
  dueAt?: string;
}

/**
 * List tasks with optional filters.
 */
export async function listTasks(
  taskService: TaskService,
  filters?: {
    status?: string;
    type?: string;
    orderId?: string;
    limit?: number;
  }
): Promise<TaskListItem[]> {
  let tasks: Task[];

  if (filters?.orderId) {
    tasks = await taskService.getTasksForOrder(filters.orderId);
  } else if (filters?.status) {
    tasks = await taskService['taskRepository'].listByStatus(filters.status, filters.limit);
  } else {
    tasks = await taskService.getPendingTasks(filters?.limit);
  }

  return tasks.map((task) => ({
    id: task.id,
    orderId: task.orderId,
    type: task.type,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString(),
    createdAt: task.createdAt.toISOString()
  }));
}

/**
 * Get task detail by ID.
 */
export async function getTaskDetail(
  taskService: TaskService,
  taskId: string
): Promise<TaskDetail> {
  const task = await taskService['taskRepository'].findById(taskId);

  if (!task) {
    throw new NotFoundError('Task', taskId);
  }

  return {
    id: task.id,
    orderId: task.orderId,
    type: task.type,
    title: task.title,
    description: task.description,
    ownerId: task.ownerId,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt?.toISOString(),
    sourceMessageId: task.sourceMessageId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}

/**
 * Update task.
 */
export async function updateTask(
  taskService: TaskService,
  taskId: string,
  updates: UpdateTaskRequest
): Promise<TaskDetail> {
  // Validate status if provided
  if (updates.status && !Object.values(TaskStatus).includes(updates.status as TaskStatus)) {
    throw new ValidationError(`Invalid status: ${updates.status}`);
  }

  // Update status if provided
  if (updates.status) {
    await taskService.updateStatus(taskId, updates.status as TaskStatus);
  }

  // Get updated task
  return getTaskDetail(taskService, taskId);
}
