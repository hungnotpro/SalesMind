/**
 * Value objects for the domain.
 */

import { MessageIntent, ResolutionStatus, TaskType } from '../shared/enums.js';

export interface OrderItemCandidate {
  rawProductName: string;
  quantity: number;
  unit: string;
  productId?: string;
  productName?: string;
  resolutionStatus: ResolutionStatus;
  resolutionConfidence?: number;
  lineNumber?: number;
}

export function createOrderItemCandidate(data: OrderItemCandidate): OrderItemCandidate {
  if (!data.rawProductName.trim()) throw new Error('rawProductName is required');
  if (data.quantity <= 0 || !Number.isFinite(data.quantity)) throw new Error('quantity must be positive');
  if (!data.unit.trim()) throw new Error('unit is required');
  return { rawProductName: data.rawProductName.trim(), quantity: data.quantity, unit: data.unit.trim(), productId: data.productId, productName: data.productName, resolutionStatus: data.resolutionStatus, resolutionConfidence: data.resolutionConfidence, lineNumber: data.lineNumber };
}

export enum InstructionType {
  Discount = 'discount',
  Payment = 'payment',
  Delivery = 'delivery',
  Invoice = 'invoice',
  Note = 'note',
  Cancellation = 'cancellation'
}

export interface ExtractedInstruction {
  type: InstructionType;
  rawText: string;
  normalizedValue?: string;
  numericValue?: number;
  isSameDay?: boolean;
  targetDate?: Date;
  method?: string;
}

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
  /** Raw delivery address extracted from the message. Preserves the original value. */
  rawAddress?: string;
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
  return { messageId, intent: MessageIntent.Unknown, intentConfidence: 0, items: [], instructions: [], tasks: [], reviewRequired: false, reviewReasons: [], warnings: [], metadata: { processedAt: new Date().toISOString(), parserVersion: '1.0.0', ruleEngineVersion: '1.0.0', correlationId } };
}

export function requiresReview(result: ProcessingResult): boolean {
  const hasUnresolvedItems = result.items.some(i => i.resolutionStatus === ResolutionStatus.NeedsReview || i.resolutionStatus === ResolutionStatus.Unresolved);
  const customerNeedsReview = result.customerInfo?.resolutionStatus === ResolutionStatus.NeedsReview || result.customerInfo?.resolutionStatus === ResolutionStatus.Unresolved;
  return hasUnresolvedItems || customerNeedsReview || result.reviewRequired || result.reviewReasons.length > 0;
}

export function hasValidOrder(result: ProcessingResult): boolean {
  return (result.intent === MessageIntent.Order || result.intent === MessageIntent.OrderUpdate) && result.items.length > 0;
}
