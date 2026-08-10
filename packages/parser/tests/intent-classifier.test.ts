/**
 * Tests for the parser package - Intent Classifier.
 */

import { describe, it, expect } from 'vitest';
import { 
  classifyIntent, 
  classifyMessageIntent 
} from '../src/extractors/intent-classifier.js';
import { MessageIntent } from '@salesmind/shared';

describe('IntentClassifier', () => {
  describe('classifyIntent (single line)', () => {
    it('should classify order item patterns as Order intent', () => {
      const result = classifyIntent('55 bơ :10 cái');
      
      expect(result.intent).toBe(MessageIntent.Order);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify pure discount as Order intent', () => {
      const result = classifyIntent('CK 5%');
      
      expect(result.intent).toBe(MessageIntent.Order);
    });

    it('should classify cancellation patterns', () => {
      const result = classifyIntent('khỏi giao');
      
      expect(result.intent).toBe(MessageIntent.OrderCancellation);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should classify delivery task', () => {
      const result = classifyIntent('giao trong ngày');
      
      expect(result.intent).toBe(MessageIntent.Task);
    });

    it('should return Unknown for random text', () => {
      const result = classifyIntent('hello world');
      
      expect(result.intent).toBe(MessageIntent.Unknown);
    });
  });

  describe('classifyMessageIntent (multiple lines)', () => {
    it('should identify Order intent from product lines', () => {
      const lines = [
        '55 bơ :10 cái',
        'sw chà bông :10 cái',
        'CK 5%',
      ];

      const result = classifyMessageIntent(lines);

      expect(result.intent).toBe(MessageIntent.Order);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should prioritize cancellation when present', () => {
      const lines = [
        '55 bơ :10 cái',
        'khỏi giao',
      ];

      const result = classifyMessageIntent(lines);

      expect(result.intent).toBe(MessageIntent.OrderCancellation);
    });

    it('should handle mixed content', () => {
      const lines = [
        '3/CHTL CPLUS (10/8)',
        'Đc: 65B đường Hiệp Bình, HCM',
        'Sđt: 0904813024 (a.Long)',
        '50g cay :10 cái',
        'CK 5%',
        'Tiền mặt',
        'giao trong ngày',
        'xuất hoá đơn trong ngày',
      ];

      const result = classifyMessageIntent(lines);

      expect(result.intent).toBe(MessageIntent.Order);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should return Unknown for empty lines', () => {
      const result = classifyMessageIntent([]);
      
      expect(result.intent).toBe(MessageIntent.Unknown);
      expect(result.confidence).toBe(0);
    });
  });
});
