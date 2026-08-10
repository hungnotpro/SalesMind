/**
 * Tests for the parser package - Order Item Extractor.
 */

import { describe, it, expect } from 'vitest';
import { 
  extractProductLines, 
  parseProductLine, 
  isProductLine,
  mightBeProductLine,
  normalizeUnit
} from '../src/extractors/order-item-extractor.js';
import { ResolutionStatus } from '@salesmind/shared';

describe('OrderItemExtractor', () => {
  describe('parseProductLine', () => {
    it('should parse "55 bơ :10 cái" format', () => {
      const result = parseProductLine('55 bơ :10 cái');
      
      expect(result).not.toBeNull();
      expect(result!.rawProductName).toBe('55 bơ');
      expect(result!.quantity).toBe(10);
      expect(result!.unit).toBe('cái');
    });

    it('should parse "55 bơ:10 cái" without space', () => {
      const result = parseProductLine('55 bơ:10 cái');
      
      expect(result).not.toBeNull();
      expect(result!.rawProductName).toBe('55 bơ');
      expect(result!.quantity).toBe(10);
      expect(result!.unit).toBe('cái');
    });

    it('should parse "55 bơ 10 cái" without colon', () => {
      const result = parseProductLine('55 bơ 10 cái');
      
      expect(result).not.toBeNull();
      expect(result!.rawProductName).toBe('55 bơ');
      expect(result!.quantity).toBe(10);
      expect(result!.unit).toBe('cái');
    });

    it('should parse quantity with comma decimal', () => {
      const result = parseProductLine('bánh :5,5 cái');
      
      expect(result).not.toBeNull();
      expect(result!.quantity).toBe(5.5);
    });

    it('should parse "x" separator', () => {
      const result = parseProductLine('bánh x10');
      
      expect(result).not.toBeNull();
      expect(result!.quantity).toBe(10);
      expect(result!.unit).toBe('cái');
    });

    it('should handle unit variations', () => {
      const testCases = [
        { input: 'bánh :10 cai', expected: 'cái' },
        { input: 'bánh :10 goi', expected: 'gói' },
        { input: 'bánh :10 kg', expected: 'kg' },
        { input: 'bánh :10 chai', expected: 'chai' },
      ];

      for (const testCase of testCases) {
        const result = parseProductLine(testCase.input);
        expect(result?.unit).toBe(testCase.expected);
      }
    });

    it('should return null for non-product lines', () => {
      expect(parseProductLine('CK 5%')).toBeNull();
      expect(parseProductLine('Tiền mặt')).toBeNull();
      expect(parseProductLine('giao trong ngày')).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(parseProductLine('')).toBeNull();
      expect(parseProductLine('   ')).toBeNull();
    });
  });

  describe('extractProductLines', () => {
    it('should extract multiple product lines', () => {
      const lines = [
        '55 bơ :10 cái',
        'CK 5%',
        '50g cay :10 cái',
        'Tiền mặt',
      ];

      const results = extractProductLines(lines);

      expect(results.length).toBe(2);
      expect(results[0].rawProductName).toBe('55 bơ');
      expect(results[1].rawProductName).toBe('50g cay');
    });

    it('should track line numbers', () => {
      const lines = [
        'line 1',
        '55 bơ :10 cái',
        'line 3',
      ];

      const results = extractProductLines(lines);

      expect(results.length).toBe(1);
      expect(results[0].lineNumber).toBe(2);
    });
  });

  describe('isProductLine', () => {
    it('should identify product lines', () => {
      expect(isProductLine('55 bơ :10 cái')).toBe(true);
      expect(isProductLine('bánh :5')).toBe(true);
    });

    it('should reject instruction lines', () => {
      expect(isProductLine('CK 5%')).toBe(false);
      expect(isProductLine('Tiền mặt')).toBe(false);
    });
  });

  describe('mightBeProductLine', () => {
    it('should return true for product-like lines', () => {
      expect(mightBeProductLine('55 bơ :10 cái')).toBe(true);
      expect(mightBeProductLine('bánh 5 cái')).toBe(true);
    });

    it('should return false for instructions', () => {
      expect(mightBeProductLine('CK 5%')).toBe(false);
      expect(mightBeProductLine('Tiền mặt')).toBe(false);
      expect(mightBeProductLine('giao trong ngày')).toBe(false);
    });

    it('should return false for long lines', () => {
      const longLine = 'a'.repeat(101);
      expect(mightBeProductLine(longLine)).toBe(false);
    });
  });

  describe('normalizeUnit', () => {
    it('should normalize common units', () => {
      expect(normalizeUnit('cai')).toBe('cái');
      expect(normalizeUnit('goi')).toBe('gói');
      expect(normalizeUnit('bx')).toBe('hộp');
    });
  });
});
