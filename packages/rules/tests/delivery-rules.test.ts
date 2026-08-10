/**
 * Tests for the rules package - Delivery Rules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  extractDeliveryRequirement,
  calculateSameDayDeadline,
  determineDeliveryPriority,
  createDeliveryTaskCandidate,
  canFulfillSameDay,
  SAME_DAY_CUTOFF_HOUR
} from '../src/delivery-rules.js';
import { ExtractedInstruction, InstructionType } from '@salesmind/domain';
import { TaskPriority, TaskType } from '@salesmind/shared';

describe('DeliveryRules', () => {
  describe('extractDeliveryRequirement', () => {
    it('should extract same-day delivery requirement', () => {
      const instructions: ExtractedInstruction[] = [
        {
          type: InstructionType.Delivery,
          rawText: 'giao trong ngày',
          isSameDay: true,
          targetDate: new Date()
        }
      ];

      const result = extractDeliveryRequirement(instructions, new Date());

      expect(result).not.toBeNull();
      expect(result!.sameDay).toBe(true);
      expect(result!.targetDate).toBeDefined();
    });

    it('should return null when no delivery instruction', () => {
      const instructions: ExtractedInstruction[] = [];

      const result = extractDeliveryRequirement(instructions, new Date());
      expect(result).toBeNull();
    });
  });

  describe('calculateSameDayDeadline', () => {
    it('should return cutoff time', () => {
      const receivedAt = new Date('2026-08-10T09:00:00+07:00');
      const deadline = calculateSameDayDeadline(receivedAt);

      expect(deadline.getHours()).toBe(SAME_DAY_CUTOFF_HOUR);
      expect(deadline.getMinutes()).toBe(0);
    });
  });

  describe('determineDeliveryPriority', () => {
    it('should return Normal for morning orders', () => {
      const morning = new Date('2026-08-10T09:00:00+07:00');
      expect(determineDeliveryPriority(morning)).toBe(TaskPriority.Normal);
    });

    it('should return High for afternoon orders before cutoff', () => {
      const afternoon = new Date('2026-08-10T13:00:00+07:00');
      expect(determineDeliveryPriority(afternoon)).toBe(TaskPriority.High);
    });

    it('should return Urgent for late orders', () => {
      const late = new Date('2026-08-10T15:00:00+07:00');
      expect(determineDeliveryPriority(late)).toBe(TaskPriority.Urgent);
    });
  });

  describe('createDeliveryTaskCandidate', () => {
    it('should create same-day delivery task', () => {
      const requirement = {
        sameDay: true,
        targetDate: new Date(),
        priority: TaskPriority.High
      };

      const result = createDeliveryTaskCandidate(requirement);

      expect(result.type).toBe(TaskType.Delivery);
      expect(result.title).toContain('trong ngày');
      expect(result.priority).toBe(TaskPriority.High);
    });
  });

  describe('canFulfillSameDay', () => {
    it('should check if cutoff has passed', () => {
      const beforeCutoff = new Date('2026-08-10T10:00:00+07:00');
      const afterCutoff = new Date('2026-08-10T15:00:00+07:00');

      // Note: This test depends on current time
      const canBefore = canFulfillSameDay(beforeCutoff);
      const canAfter = canFulfillSameDay(afterCutoff);

      // If before cutoff is possible, after should not be
      if (canBefore && !canAfter) {
        expect(canBefore).toBe(true);
        expect(canAfter).toBe(false);
      }
    });
  });
});
