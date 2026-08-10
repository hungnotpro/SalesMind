/**
 * Tests for the parser package - Pipeline.
 */

import { describe, it, expect } from 'vitest';
import { 
  parseMessage, 
  containsOrderContent,
  DEFAULT_PARSER_CONFIG
} from '../src/pipeline.js';
import { MessageIntent, ResolutionStatus } from '@salesmind/shared';
import { InstructionType } from '@salesmind/domain';

describe('Parser Pipeline', () => {
  describe('parseMessage', () => {
    it('should parse the example message from SM-001 spec', () => {
      const input = {
        messageId: 'test-001',
        rawText: `55 bơ:10 cái
CK 5%
Tiền mặt
giao trong ngày
xuất hoá đơn trong ngày`,
        sender: { name: 'a.Long', phone: '0904813024' },
        receivedAt: new Date('2026-08-10T09:00:00+07:00')
      };

      const result = parseMessage(input, DEFAULT_PARSER_CONFIG);

      // Should identify order intent
      expect(result.intent).toBe(MessageIntent.Order);

      // Should extract one order item
      expect(result.items.length).toBe(1);
      expect(result.items[0].rawProductName).toBe('55 bơ');
      expect(result.items[0].quantity).toBe(10);
      expect(result.items[0].unit).toBe('cái');
      expect(result.items[0].resolutionStatus).toBe(ResolutionStatus.NeedsReview);

      // Should extract instructions
      const instructionTypes = result.instructions.map((i) => i.type);
      expect(instructionTypes).toContain(InstructionType.Discount);
      expect(instructionTypes).toContain(InstructionType.Payment);
      expect(instructionTypes).toContain(InstructionType.Delivery);
      expect(instructionTypes).toContain(InstructionType.Invoice);

      // Should have customer info
      expect(result.customerInfo?.displayName).toBe('a.Long');
      expect(result.customerInfo?.phone).toBe('0904813024');
    });

    it('should handle multiple product lines', () => {
      const input = {
        messageId: 'test-002',
        rawText: `50g cay :10 cái
sw chà bông:10 cái
sw cá hồi :10 cái
55g so:10 cái
55 bơ :10 cái
Phủ 55g:10 cái
Hoa cúc :10 cái`,
        receivedAt: new Date()
      };

      const result = parseMessage(input, DEFAULT_PARSER_CONFIG);

      expect(result.items.length).toBe(7);
      expect(result.items[0].rawProductName).toBe('50g cay');
      expect(result.items[6].rawProductName).toBe('Hoa cúc');
    });

    it('should preserve line numbers for items', () => {
      const input = {
        messageId: 'test-003',
        rawText: `first item: 10
second item: 5`,
        receivedAt: new Date()
      };

      const result = parseMessage(input, DEFAULT_PARSER_CONFIG);

      // Items should have line numbers
      if (result.items.length > 0) {
        expect(result.items[0].lineNumber).toBeDefined();
      }
    });

    it('should handle empty message', () => {
      const input = {
        messageId: 'test-004',
        rawText: '',
        receivedAt: new Date()
      };

      const result = parseMessage(input, DEFAULT_PARSER_CONFIG);

      expect(result.warnings.some((w) => w.code === 'EMPTY_MESSAGE')).toBe(true);
    });

    it('should include processing metadata', () => {
      const input = {
        messageId: 'test-005',
        rawText: '55 bơ:10 cái',
        receivedAt: new Date(),
        correlationId: 'test-correlation'
      };

      const result = parseMessage(input, DEFAULT_PARSER_CONFIG);

      expect(result.metadata.correlationId).toBe('test-correlation');
      expect(result.metadata.parserVersion).toBe('1.0.0');
      expect(result.metadata.processedAt).toBeDefined();
      expect(result.metadata.processingDurationMs).toBeDefined();
    });

    it('should handle line with just quantity and unit', () => {
      const input = {
        messageId: 'test-006',
        rawText: '55g so :10',
        receivedAt: new Date()
      };

      const result = parseMessage(input, DEFAULT_PARSER_CONFIG);

      expect(result.items.length).toBe(1);
      expect(result.items[0].quantity).toBe(10);
      expect(result.items[0].unit).toBe('cái'); // Default unit
    });
  });

  describe('containsOrderContent', () => {
    it('should return true for messages with products', () => {
      expect(containsOrderContent('55 bơ :10 cái')).toBe(true);
    });

    it('should return true for messages with instructions', () => {
      expect(containsOrderContent('CK 5%')).toBe(true);
      expect(containsOrderContent('Tiền mặt')).toBe(true);
    });

    it('should return false for random text', () => {
      expect(containsOrderContent('hello world')).toBe(false);
    });
  });
});
