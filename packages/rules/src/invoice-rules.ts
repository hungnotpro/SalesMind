/**
 * Invoice rules - handle invoice requirement detection and task creation.
 */

import { InstructionType } from '../../../domain/src/value-objects/ExtractedInstruction.js';
import { TaskPriority, TaskType } from '../../../shared/src/enums.js';

export interface InvoiceRequirement {
  required: boolean;
  sameDay: boolean;
  targetDate?: Date;
  priority: TaskPriority;
}

export const INVOICE_SAME_DAY_CUTOFF_HOUR = 16;

export function extractInvoiceRequirement(instructions: any[], messageReceivedAt: Date) {
  const invoiceInstruction = instructions.find((i: any) => i.type === InstructionType.Invoice);

  if (!invoiceInstruction) {
    return null;
  }

  const sameDay = invoiceInstruction.isSameDay === true;
  const priority = sameDay ? determineInvoicePriority(messageReceivedAt) : TaskPriority.Normal;

  return {
    required: true,
    sameDay,
    targetDate: sameDay ? calculateSameDayDeadline(messageReceivedAt) : undefined,
    priority
  };
}

export function calculateSameDayDeadline(receivedAt: Date): Date {
  const deadline = new Date(receivedAt);
  deadline.setHours(INVOICE_SAME_DAY_CUTOFF_HOUR, 0, 0, 0);
  return deadline;
}

export function determineInvoicePriority(receivedAt: Date): TaskPriority {
  const hour = receivedAt.getHours();

  if (hour < 12) {
    return TaskPriority.Normal;
  }

  if (hour < INVOICE_SAME_DAY_CUTOFF_HOUR) {
    return TaskPriority.High;
  }

  return TaskPriority.Urgent;
}

export function createInvoiceTaskCandidate(requirement: InvoiceRequirement, sourceInstruction?: string) {
  const title = requirement.sameDay
    ? 'Xuất hóa đơn trong ngày'
    : 'Xuất hóa đơn';

  const description = requirement.sameDay
    ? 'Yêu cầu xuất hóa đơn trong ngày'
    : 'Yêu cầu xuất hóa đơn';

  return {
    type: TaskType.Invoice,
    title,
    description,
    priority: requirement.priority,
    dueAt: requirement.targetDate,
    sourceInstruction
  };
}

export function canFulfillSameDayInvoice(receivedAt: Date): boolean {
  const now = new Date();
  return now.getHours() < INVOICE_SAME_DAY_CUTOFF_HOUR;
}
