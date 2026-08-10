/**
 * Tests for the shared package - Utilities.
 */

import { describe, it, expect } from 'vitest';
import { 
  normalizeWhitespace, 
  normalizeVietnamese,
  removeDiacritics,
  generateIdempotencyKey,
  parseQuantity,
  isValidQuantity,
  parsePercentage,
  generateUUID,
  getCurrentTimestamp,
  safeClone,
  isEmptyString,
  capitalize
} from '../src/utils.js';

describe('Shared Utils', () => {
  describe('normalizeWhitespace', () => {
    it('should collapse multiple spaces', () => {
      expect(normalizeWhitespace('hello    world')).toBe('hello world');
    });

    it('should trim leading/trailing whitespace', () => {
      expect(normalizeWhitespace('  hello  ')).toBe('hello');
    });

    it('should handle tabs and newlines', () => {
      expect(normalizeWhitespace('hello\t\nworld')).toBe('hello world');
    });
  });

  describe('normalizeVietnamese', () => {
    it('should lowercase and remove accents', () => {
      expect(normalizeVietnamese('BÁNH BƠ')).toBe('banh bo');
    });

    it('should handle mixed case', () => {
      expect(normalizeVietnamese('Bánh Bơ')).toBe('banh bo');
    });
  });

  describe('removeDiacritics', () => {
    it('should remove Vietnamese diacritics', () => {
      expect(removeDiacritics('ăâđêôơư')).toBe('aadoou');
    });

    it('should preserve non-Vietnamese characters', () => {
      expect(removeDiacritics('hello world')).toBe('hello world');
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should create composite key', () => {
      expect(generateIdempotencyKey('zalo', 'msg-123')).toBe('zalo:msg-123');
    });
  });

  describe('parseQuantity', () => {
    it('should parse integer quantities', () => {
      expect(parseQuantity(10)).toBe(10);
      expect(parseQuantity('10')).toBe(10);
    });

    it('should parse decimal quantities', () => {
      expect(parseQuantity(5.5)).toBe(5.5);
      expect(parseQuantity('5.5')).toBe(5.5);
      expect(parseQuantity('5,5')).toBe(5.5);
    });

    it('should handle fraction format', () => {
      expect(parseQuantity('1/2')).toBe(0.5);
      expect(parseQuantity('3/4')).toBe(0.75);
    });

    it('should handle leading comma decimal', () => {
      expect(parseQuantity(',5')).toBe(0.5);
    });

    it('should return null for invalid input', () => {
      expect(parseQuantity('abc')).toBeNull();
      expect(parseQuantity(null)).toBeNull();
      expect(parseQuantity(undefined)).toBeNull();
    });
  });

  describe('isValidQuantity', () => {
    it('should accept positive numbers', () => {
      expect(isValidQuantity(10)).toBe(true);
      expect(isValidQuantity(0.5)).toBe(true);
    });

    it('should reject zero and negative', () => {
      expect(isValidQuantity(0)).toBe(false);
      expect(isValidQuantity(-1)).toBe(false);
    });

    it('should reject invalid input', () => {
      expect(isValidQuantity('abc')).toBe(false);
      expect(isValidQuantity(null)).toBe(false);
    });
  });

  describe('parsePercentage', () => {
    it('should parse percentages', () => {
      expect(parsePercentage('5%')).toBe(0.05);
      expect(parsePercentage('10')).toBe(0.1);
      expect(parsePercentage('50%')).toBe(0.5);
    });

    it('should reject invalid percentages', () => {
      expect(parsePercentage('abc')).toBeNull();
      expect(parsePercentage('-5%')).toBeNull();
      expect(parsePercentage('150%')).toBeNull();
    });
  });

  describe('generateUUID', () => {
    it('should generate valid UUID format', () => {
      const uuid = generateUUID();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should generate unique values', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('getCurrentTimestamp', () => {
    it('should return ISO format string', () => {
      const timestamp = getCurrentTimestamp();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });

  describe('safeClone', () => {
    it('should create deep copy', () => {
      const original = { a: 1, b: { c: 2 } };
      const clone = safeClone(original);
      clone.b.c = 3;
      expect(original.b.c).toBe(2);
    });
  });

  describe('isEmptyString', () => {
    it('should detect empty strings', () => {
      expect(isEmptyString('')).toBe(true);
      expect(isEmptyString('   ')).toBe(true);
    });

    it('should accept non-empty strings', () => {
      expect(isEmptyString('hello')).toBe(false);
    });

    it('should reject non-strings', () => {
      expect(isEmptyString(123)).toBe(true);
      expect(isEmptyString(null)).toBe(true);
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('should handle empty string', () => {
      expect(capitalize('')).toBe('');
    });
  });
});
