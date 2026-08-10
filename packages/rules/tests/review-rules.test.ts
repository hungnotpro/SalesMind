/**
 * Tests for the rules package - Review Rules.
 */

import { describe, it, expect } from 'vitest';
import { 
  checkItemReviewRequirements,
  checkCustomerReviewRequirements,
  checkDuplicateItems,
  determineReviewRequirements
} from '../src/review-rules.js';
import { OrderItemCandidate } from '@salesmind/domain';
import { ResolutionStatus, MessageIntent } from '@salesmind/shared';
import { createEmptyProcessingResult } from '@salesmind/domain';

describe('ReviewRules', () => {
  describe('checkItemReviewRequirements', () => {
    it('should identify items needing review', () => {
      const items: OrderItemCandidate[] = [
        {
          rawProductName: '55 bơ',
          quantity: 10,
          unit: 'cái',
          resolutionStatus: ResolutionStatus.NeedsReview
        }
      ];

      const result = checkItemReviewRequirements(items);
      expect(result.needsReview).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should identify unresolved items', () => {
      const items: OrderItemCandidate[] = [
        {
          rawProductName: 'unknown product',
          quantity: 5,
          unit: 'cái',
          resolutionStatus: ResolutionStatus.Unresolved
        }
      ];

      const result = checkItemReviewRequirements(items);
      expect(result.needsReview).toBe(true);
    });

    it('should pass for resolved items with high confidence', () => {
      const items: OrderItemCandidate[] = [
        {
          rawProductName: '55 bơ',
          quantity: 10,
          unit: 'cái',
          resolutionStatus: ResolutionStatus.Resolved,
          resolutionConfidence: 0.95
        }
      ];

      const result = checkItemReviewRequirements(items);
      expect(result.needsReview).toBe(false);
    });
  });

  describe('checkCustomerReviewRequirements', () => {
    it('should require review when no customer info', () => {
      const result = checkCustomerReviewRequirements(undefined);
      expect(result.needsReview).toBe(true);
    });

    it('should require review for unresolved customer', () => {
      const result = checkCustomerReviewRequirements({
        resolutionStatus: ResolutionStatus.Unresolved,
        confidence: 0
      });
      expect(result.needsReview).toBe(true);
    });

    it('should pass for resolved customer', () => {
      const result = checkCustomerReviewRequirements({
        customerId: 'cust-123',
        displayName: 'a.Long',
        resolutionStatus: ResolutionStatus.Resolved,
        confidence: 1.0
      });
      expect(result.needsReview).toBe(false);
    });
  });

  describe('checkDuplicateItems', () => {
    it('should detect duplicate items', () => {
      const items: OrderItemCandidate[] = [
        { rawProductName: '55 bơ', quantity: 10, unit: 'cái', resolutionStatus: ResolutionStatus.Resolved },
        { rawProductName: 'bánh', quantity: 5, unit: 'cái', resolutionStatus: ResolutionStatus.Resolved },
        { rawProductName: '55 bơ', quantity: 3, unit: 'cái', resolutionStatus: ResolutionStatus.Resolved }
      ];

      const result = checkDuplicateItems(items);
      expect(result.hasDuplicates).toBe(true);
      expect(result.duplicates.length).toBeGreaterThan(0);
    });

    it('should pass for unique items', () => {
      const items: OrderItemCandidate[] = [
        { rawProductName: '55 bơ', quantity: 10, unit: 'cái', resolutionStatus: ResolutionStatus.Resolved },
        { rawProductName: 'bánh', quantity: 5, unit: 'cái', resolutionStatus: ResolutionStatus.Resolved }
      ];

      const result = checkDuplicateItems(items);
      expect(result.hasDuplicates).toBe(false);
    });
  });

  describe('determineReviewRequirements', () => {
    it('should determine review needed for mixed result', () => {
      const result = createEmptyProcessingResult('msg-001', 'corr-001');
      result.intent = MessageIntent.Order;
      result.items = [
        {
          rawProductName: '55 bơ',
          quantity: 10,
          unit: 'cái',
          resolutionStatus: ResolutionStatus.NeedsReview
        }
      ];
      result.customerInfo = {
        resolutionStatus: ResolutionStatus.Unresolved
      };

      const review = determineReviewRequirements(result);
      expect(review.required).toBe(true);
      expect(review.itemCount).toBe(1);
      expect(review.customerUnresolved).toBe(true);
    });
  });
});
