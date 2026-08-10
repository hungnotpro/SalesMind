/**
 * Delivery rules - handle delivery requirement detection and task creation.
 */

import { InstructionType } from '../../../domain/src/value-objects/ExtractedInstruction.js';
import { TaskPriority, TaskType } from '../../../shared/src/enums.js';

export interface DeliveryRequirement {
  sameDay: boolean;
  targetDate?: Date;
  priority: TaskPriority;
}

export const BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const SAME_DAY_CUTOFF_HOUR = 14;

export function extractDeliveryRequirement(instructions: any[], messageReceivedAt: Date) {
  const deliveryInstruction = instructions.find((i: any) => i.type === InstructionType.Delivery);

  if (!deliveryInstruction) {
    return null;
  }

  if (deliveryInstruction.isSameDay) {
    const targetDate = calculateSameDayDeadline(messageReceivedAt);
    const priority = determineDeliveryPriority(messageReceivedAt);

    return { sameDay: true, targetDate, priority };
  }

  return {
    sameDay: false,
    targetDate: deliveryInstruction.targetDate,
    priority: TaskPriority.Normal
  };
}

export function calculateSameDayDeadline(receivedAt: Date): Date {
  const deadline = new Date(receivedAt);
  deadline.setHours(SAME_DAY_CUTOFF_HOUR, 0, 0, 0);
  return deadline;
}

export function determineDeliveryPriority(receivedAt: Date): TaskPriority {
  const hour = receivedAt.getHours();
  
  if (hour < 12) {
    return TaskPriority.Normal;
  }
  
  if (hour < SAME_DAY_CUTOFF_HOUR) {
    return TaskPriority.High;
  }
  
  return TaskPriority.Urgent;
}

export function createDeliveryTaskCandidate(requirement: DeliveryRequirement, sourceInstruction?: string) {
  const title = requirement.sameDay
    ? 'Giao đơn hàng trong ngày'
    : 'Giao đơn hàng';

  const description = requirement.sameDay
    ? 'Yêu cầu giao hàng trong ngày'
    : 'Yêu cầu giao hàng';

  return {
    type: TaskType.Delivery,
    title,
    description,
    priority: requirement.priority,
    dueAt: requirement.targetDate,
    sourceInstruction
  };
}

export function canFulfillSameDay(receivedAt: Date): boolean {
  const now = new Date();
  return now.getHours() < SAME_DAY_CUTOFF_HOUR;
}
