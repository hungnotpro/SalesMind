/**
 * Tests for the parser package - Customer Extractor.
 */

import { describe, it, expect } from 'vitest';
import { 
  extractPhone, 
  extractAddress, 
  extractName,
  extractCustomerInfo 
} from '../src/extractors/customer-extractor.js';

describe('CustomerExtractor', () => {
  describe('extractPhone', () => {
    it('should extract Vietnamese phone numbers', () => {
      expect(extractPhone('0904813024')).toBe('0904813024');
      expect(extractPhone('0904 813 024')).toBe('0904813024');
      expect(extractPhone('0912 345 678')).toBe('0912345678');
    });

    it('should handle phone with prefix', () => {
      expect(extractPhone('SĐT: 0904813024')).toBe('0904813024');
      expect(extractPhone('dt: 0904813024')).toBe('0904813024');
    });

    it('should handle international format', () => {
      expect(extractPhone('+84904813024')).toBe('0904813024');
    });

    it('should return null for invalid phones', () => {
      expect(extractPhone('123')).toBeNull();
      expect(extractPhone('hello')).toBeNull();
    });
  });

  describe('extractAddress', () => {
    it('should extract addresses with prefix', () => {
      expect(extractAddress('Đc: 65B đường Hiệp Bình, HCM')).toBe('65B đường Hiệp Bình, HCM');
      expect(extractAddress('địa chỉ: 123 Nguyễn Trãi')).toBe('123 Nguyễn Trãi');
    });
  });

  describe('extractName', () => {
    it('should extract name in parentheses', () => {
      expect(extractName('(a.Long)')).toBe('a.Long');
      expect(extractName('0904813024 (a.Long)')).toBe('a.Long');
    });
  });

  describe('extractCustomerInfo', () => {
    it('should extract customer info from full message', () => {
      const lines = [
        '55 bơ :10 cái',
        'Đc: 65B đường Hiệp Bình, HCM',
        'Sđt: 0904813024 (a.Long)',
      ];

      const result = extractCustomerInfo(lines);

      expect(result.phone).toBe('0904813024');
      expect(result.address).toBe('65B đường Hiệp Bình, HCM');
      expect(result.displayName).toBe('a.Long');
      expect(result.resolutionStatus).toBe('needs_review');
    });

    it('should handle minimal info', () => {
      const lines = ['55 bơ :10 cái'];

      const result = extractCustomerInfo(lines);

      expect(result.phone).toBeUndefined();
      expect(result.resolutionStatus).toBe('unresolved');
    });
  });
});
