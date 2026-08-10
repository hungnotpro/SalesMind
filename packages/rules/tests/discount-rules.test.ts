/**
 * Tests for the rules package - Discount Rules.
 */

import { describe, it, expect } from 'vitest';
import { 
  isValidDiscountRate, 
  parseDiscount, 
  formatDiscountRate,
  extractDiscount
} from '../src/discount-rules.js';
import { ExtractedInstruction, InstructionType } from '@salesmind/domain';

describe('DiscountRules', () => {
  describe('isValidDiscountRate', () => {
    it('should accept rates within valid range', () => {
      expect(isValidDiscountRate(0)).toBe(true);
      expect(isValidDiscountRate(0.05)).toBe(true);
      expect(isValidDiscountRate(0.5)).toBe(true);
    });

    it('should reject rates above maximum', () => {
      expect(isValidDiscountRate(0.51)).toBe(false);
      expect(isValidDiscountRate(1)).toBe(false);
    });

    it('should reject negative rates', () => {
      expect(isValidDiscountRate(-0.1)).toBe(false);
    });
  });

  describe('parseDiscount', () => {
    it('should parse discount instruction with numeric value', () => {
      const instruction: ExtractedInstruction = {
        type: InstructionType.Discount,
        rawText: 'CK 5%',
        numericValue: 0.05
      };

      const result = parseDiscount(instruction);
      expect(result).toBe(0.05);
    });

    it('should parse discount instruction with percentage over 1', () => {
      const instruction: ExtractedInstruction = {
        type: InstructionType.Discount,
        rawText: 'CK 5%',
        numericValue: 5 // 5 as percentage
      };

      const result = parseDiscount(instruction);
      expect(result).toBe(0.05);
    });

    it('should return null for non-discount instructions', () => {
      const instruction: ExtractedInstruction = {
        type: InstructionType.Payment,
        rawText: 'Tiền mặt'
      };

      expect(parseDiscount(instruction)).toBeNull();
    });

    it('should return null when numeric value is missing', () => {
      const instruction: ExtractedInstruction = {
        type: InstructionType.Discount,
        rawText: 'CK'
      };

      expect(parseDiscount(instruction)).toBeNull();
    });
  });

  describe('formatDiscountRate', () => {
    it('should format decimal rate as percentage', () => {
      expect(formatDiscountRate(0.05)).toBe('5%');
      expect(formatDiscountRate(0.1)).toBe('10%');
      expect(formatDiscountRate(0.5)).toBe('50%');
    });
  });

  describe('extractDiscount', () => {
    it('should extract discount from instructions', () => {
      const instructions: ExtractedInstruction[] = [
        {
          type: InstructionType.Discount,
          rawText: 'CK 5%',
          numericValue: 0.05
        }
      ];

      const result = extractDiscount(instructions);
      expect(result.rate).toBe(0.05);
      expect(result.source).toBe('CK 5%');
    });

    it('should return null when no discount instruction', () => {
      const instructions: ExtractedInstruction[] = [
        {
          type: InstructionType.Payment,
          rawText: 'Tiền mặt'
        }
      ];

      const result = extractDiscount(instructions);
      expect(result.rate).toBeNull();
      expect(result.source).toBeNull();
    });
  });
});
