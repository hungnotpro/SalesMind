/**
 * ProcessingResult value object.
 */

import { MessageIntent, ResolutionStatus } from '../../shared/src/enums.js';
import { TaskType } from '../entities/Task.js';
import { OrderItemCandidate } from './OrderItemCandidate.js';
import { ExtractedInstruction } from './ExtractedInstruction.js';

export interface ProcessingMetadata {
  processedAt: string;
  processingDurationMs?: number;
  parserVersion: string;
  ruleEngineVersion: string;
  correlationId: string;
}

export interface ProcessingWarning {
  code: string;
  message: string;
  field?: string;
}

export interface ProcessingResult {
  messageId: string;
  intent: MessageIntent;
  intentConfidence: number;
  items: OrderItemCandidate[];
  instructions: ExtractedInstruction[];
  tasks: TaskCandidate[];
  customerInfo?: CustomerInfo;
  reviewRequired: boolean;
  reviewReasons: string[];
  warnings: ProcessingWarning[];
  metadata: ProcessingMetadata;
}

export interface TaskCandidate {
  type: TaskType;
  title: string;
  description?: string;
  priority?: string;
  dueAt?: Date;
  sourceInstruction?: string;
}

export interface CustomerInfo {
  customerId?: string;
  displayName?: string;
  phone?: string;
  address?: string;
  resolutionStatus: ResolutionStatus;
  confidence?: number;
}

export function createEmptyProcessingResult(messageId: string, correlationId: string): ProcessingResult {
  return {
    messageId,
    intent: MessageIntent.Unknown,
    intentConfidence: 0,
    items: [],
    instructions: [],
    tasks: [],
    reviewRequired: false,
    reviewReasons: [],
    warnings: [],
    metadata: {
      processedAt: new Date().toISOString(),
      parserVersion: '1.0.0',
      ruleEngineVersion: '1.0.0',
      correlationId
    }
  };
}

export function requiresReview(result: ProcessingResult): boolean {
  const hasUnresolvedItems = result.items.some(
    (item) =>
      item.resolutionStatus === ResolutionStatus.NeedsReview ||
      item.resolutionStatus === ResolutionStatus.Unresolved
  );

  const customerNeedsReview =
    result.customerInfo?.resolutionStatus === ResolutionStatus.NeedsReview ||
    result.customerInfo?.resolutionStatus === ResolutionStatus.Unresolved;

  return (
    hasUnresolvedItems ||
    customerNeedsReview ||
    result.reviewRequired ||
    result.reviewReasons.length > 0
  );
}

export function hasValidOrder(result: ProcessingResult): boolean {
  return (
    result.intent === MessageIntent.Order ||
    result.intent === MessageIntent.OrderUpdate
  ) && result.items.length > 0;
}
