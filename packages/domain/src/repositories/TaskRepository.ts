import { Task, TaskType } from '../entities/Task.js';

export interface ITaskRepository {
  findById(id: string): Promise<Task | null>;
  findByBusinessKey(orderId: string | undefined, type: TaskType, dueAt: Date | undefined): Promise<Task | null>;
  findByOrderId(orderId: string): Promise<Task[]>;
  save(task: Task): Promise<void>;
  update(task: Task): Promise<void>;
  listByStatus(status: string, limit?: number): Promise<Task[]>;
  listByType(type: TaskType, limit?: number): Promise<Task[]>;
  listDueToday(): Promise<Task[]>;
  listPending(limit?: number): Promise<Task[]>;
}
