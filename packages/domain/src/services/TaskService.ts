/**
 * TaskService - domain service for task management.
 */

import { Task, TaskType, CreateTaskInput, validateCreateTask, generateTaskBusinessKey } from '../entities/Task.js';
import { TaskPriority, TaskStatus } from '@salesmind/shared';
import { ITaskRepository } from '../repositories/TaskRepository.js';
import { IAuditLogRepository } from '../repositories/AuditLogRepository.js';
import { createAuditLog, AuditAction, AuditActorType } from '../entities/AuditLog.js';
import { generateUUID } from '@salesmind/shared';
import { TaskCandidate } from '../value-objects/ProcessingResult.js';

export interface CreateTaskFromProcessingInput {
  orderId?: string;
  candidates: TaskCandidate[];
  sourceMessageId?: string;
}

export class TaskService {
  constructor(
    private taskRepository: ITaskRepository,
    private auditLogRepository: IAuditLogRepository
  ) {}

  /**
   * Create tasks from processing result, handling idempotency.
   */
  async createFromProcessing(input: CreateTaskFromProcessingInput): Promise<Task[]> {
    const createdTasks: Task[] = [];

    for (const candidate of input.candidates) {
      const taskType = candidate.type as TaskType;
      const dueAt = candidate.dueAt;

      // Check for existing task with same business key
      const existingTask = await this.taskRepository.findByBusinessKey(
        input.orderId,
        taskType,
        dueAt ?? undefined
      );

      if (existingTask) {
        // Update existing task instead of creating duplicate
        if (existingTask.status === TaskStatus.Completed || existingTask.status === TaskStatus.Cancelled) {
          // Don't reactivate completed or cancelled tasks
          continue;
        }

        // Update due date if new one is provided and different
        if (dueAt && (!existingTask.dueAt || existingTask.dueAt.getTime() !== dueAt.getTime())) {
          existingTask.dueAt = dueAt;
          existingTask.updatedAt = new Date();
          await this.taskRepository.update(existingTask);

          await this.auditLogRepository.save(
            createAuditLog(
              {
                entityType: 'Task',
                entityId: existingTask.id,
                action: AuditAction.Update,
                actorType: AuditActorType.System,
                beforeData: { dueAt: existingTask.dueAt },
                afterData: { dueAt: dueAt }
              },
              generateUUID()
            )
          );
        }

        createdTasks.push(existingTask);
      } else {
        // Create new task
        const taskId = generateUUID();
        const now = new Date();

        const taskInput: CreateTaskInput = {
          orderId: input.orderId,
          type: taskType,
          title: candidate.title,
          description: candidate.description,
          priority: (candidate.priority as TaskPriority) || TaskPriority.Normal,
          dueAt,
          sourceMessageId: input.sourceMessageId
        };

        validateCreateTask(taskInput);

        const task: Task = {
          id: taskId,
          orderId: taskInput.orderId,
          type: taskInput.type,
          title: taskInput.title,
          description: taskInput.description,
          priority: taskInput.priority!,
          status: TaskStatus.Pending,
          dueAt: taskInput.dueAt,
          sourceMessageId: taskInput.sourceMessageId,
          createdAt: now,
          updatedAt: now
        };

        await this.taskRepository.save(task);

        await this.auditLogRepository.save(
          createAuditLog(
            {
              entityType: 'Task',
              entityId: taskId,
              action: AuditAction.Create,
              actorType: AuditActorType.System,
              sourceMessageId: input.sourceMessageId,
              afterData: { type: taskType, title: task.title }
            },
            generateUUID()
          )
        );

        createdTasks.push(task);
      }
    }

    return createdTasks;
  }

  /**
   * Update task status.
   */
  async updateStatus(taskId: string, newStatus: TaskStatus): Promise<Task> {
    const task = await this.taskRepository.findById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const oldStatus = task.status;
    task.status = newStatus;
    task.updatedAt = new Date();

    await this.taskRepository.update(task);

    await this.auditLogRepository.save(
      createAuditLog(
        {
          entityType: 'Task',
          entityId: taskId,
          action: AuditAction.Update,
          actorType: AuditActorType.System,
          beforeData: { status: oldStatus },
          afterData: { status: newStatus }
        },
        generateUUID()
      )
    );

    return task;
  }

  /**
   * Get pending tasks.
   */
  async getPendingTasks(limit?: number): Promise<Task[]> {
    return this.taskRepository.listPending(limit);
  }

  /**
   * Get tasks for an order.
   */
  async getTasksForOrder(orderId: string): Promise<Task[]> {
    return this.taskRepository.findByOrderId(orderId);
  }
}
