/**
 * Value objects for the domain.
 */

import { ResolutionStatus } from '../../shared/src/enums.js';

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

export function createOrderItemCandidate(data: {
  rawProductName: string;
  quantity: number;
  unit: string;
  productId?: string;
  productName?: string;
  resolutionStatus: ResolutionStatus;
  resolutionConfidence?: number;
  lineNumber?: number;
}): OrderItemCandidate {
  if (!data.rawProductName.trim()) {
    throw new Error('Raw product name is required');
  }
  if (data.quantity <= 0 || !Number.isFinite(data.quantity)) {
    throw new Error('Quantity must be a positive number');
  }
  if (!data.unit.trim()) {
    throw new Error('Unit is required');
  }

  return {
    rawProductName: data.rawProductName.trim(),
    quantity: data.quantity,
    unit: data.unit.trim(),
    productId: data.productId,
    productName: data.productName,
    resolutionStatus: data.resolutionStatus,
    resolutionConfidence: data.resolutionConfidence,
    lineNumber: data.lineNumber
  };
}

export function hasUnresolvedItems(candidates: OrderItemCandidate[]): boolean {
  return candidates.some(
    (c) =>
      c.resolutionStatus === ResolutionStatus.NeedsReview ||
      c.resolutionStatus === ResolutionStatus.Unresolved
  );
}
