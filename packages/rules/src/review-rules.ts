/**
 * Review rules - determine when human review is required.
 */

import { ResolutionStatus } from '../../../shared/src/enums.js';
import { OrderItemCandidate } from '../../../domain/src/value-objects/OrderItemCandidate.js';
import { ProcessingResult } from '../../../domain/src/value-objects/ProcessingResult.js';

export interface ReviewRequirement {
  required: boolean;
  reasons: string[];
  itemCount: number;
  customerUnresolved: boolean;
}

export const RESOLUTION_THRESHOLDS = {
  AUTO_RESOLVE: 0.95,
  REVIEW_REQUIRED: 0.80,
  UNRESOLVED: 0.5
};

export function checkItemReviewRequirements(items: OrderItemCandidate[]) {
  const reasons: string[] = [];

  for (const item of items) {
    switch (item.resolutionStatus) {
      case ResolutionStatus.NeedsReview:
        reasons.push(`Item "${item.rawProductName}" needs review`);
        break;
      case ResolutionStatus.Unresolved:
        reasons.push(`Item "${item.rawProductName}" could not be resolved`);
        break;
      case ResolutionStatus.Rejected:
        reasons.push(`Item "${item.rawProductName}" was rejected`);
        break;
      case ResolutionStatus.Resolved:
        if (item.resolutionConfidence !== undefined && item.resolutionConfidence < RESOLUTION_THRESHOLDS.REVIEW_REQUIRED) {
          reasons.push(`Item "${item.rawProductName}" has low confidence (${item.resolutionConfidence.toFixed(2)})`);
        }
        break;
    }
  }

  return { needsReview: reasons.length > 0, reasons };
}

export function checkCustomerReviewRequirements(customerInfo: any) {
  if (!customerInfo) {
    return { needsReview: true, reason: 'No customer information available' };
  }

  if (customerInfo.resolutionStatus === ResolutionStatus.Unresolved) {
    return { needsReview: true, reason: 'Customer could not be identified' };
  }

  if (customerInfo.resolutionStatus === ResolutionStatus.NeedsReview) {
    return { needsReview: true, reason: 'Customer identification needs confirmation' };
  }

  return { needsReview: false };
}

export function checkDuplicateItems(items: OrderItemCandidate[]) {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  for (const item of items) {
    const key = `${item.rawProductName.toLowerCase()}|${item.unit.toLowerCase()}`;
    const existing = seen.get(key);
    
    if (existing !== undefined) {
      duplicates.push(`${item.rawProductName} (appears ${existing + 2} times)`);
    } else {
      seen.set(key, 0);
    }
  }

  return { hasDuplicates: duplicates.length > 0, duplicates };
}

export function determineReviewRequirements(result: ProcessingResult): ReviewRequirement {
  const reasons: string[] = [];

  if (result.reviewReasons.length > 0) {
    reasons.push(...result.reviewReasons);
  }

  const itemCheck = checkItemReviewRequirements(result.items);
  reasons.push(...itemCheck.reasons);

  const customerCheck = checkCustomerReviewRequirements(result.customerInfo);
  if (customerCheck.needsReview && customerCheck.reason) {
    reasons.push(customerCheck.reason);
  }

  const duplicateCheck = checkDuplicateItems(result.items);
  if (duplicateCheck.hasDuplicates) {
    reasons.push(...duplicateCheck.duplicates.map((d) => `Duplicate item: ${d}`));
  }

  return {
    required: reasons.length > 0,
    reasons,
    itemCount: result.items.length,
    customerUnresolved: customerCheck.needsReview
  };
}
