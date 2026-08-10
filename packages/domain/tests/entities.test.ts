/**
 * Tests for the domain entities.
 */

import { describe, it, expect } from 'vitest';
import { 
  validateIncomingMessage, 
  createMessage,
  MessageProcessingStatus 
} from '../entities/Message.js';
import { 
  validateCreateOrder, 
  validateCreateOrderItem 
} from '../entities/Order.js';
import { 
  validateCreateTask,
  generateTaskBusinessKey,
  TaskType 
} from '../entities/Task.js';
import { normalizeAlias, validateCreateAlias } from '../entities/ProductAlias.js';
import { generateUUID } from '@salesmind/shared';

describe('Message Entity', () => {
  describe('validateIncomingMessage', () => {
    it('should validate correct message', () => {
      const message = {
        source: 'manual',
        externalMessageId: 'msg-001',
        text: 'Hello world',
        receivedAt: '2026-08-10T09:00:00+07:00',
        sender: { name: 'Test User' }
      };

      const result = validateIncomingMessage(message);
      
      expect(result.source).toBe('manual');
      expect(result.externalMessageId).toBe('msg-001');
      expect(result.text).toBe('Hello world');
    });

    it('should reject missing source', () => {
      expect(() => 
        validateIncomingMessage({ externalMessageId: 'msg-001', text: 'test' })
      ).toThrow('source is required');
    });

    it('should reject missing text', () => {
      expect(() => 
        validateIncomingMessage({ source: 'manual', externalMessageId: 'msg-001' })
      ).toThrow('Message text is required');
    });

    it('should reject invalid date', () => {
      expect(() => 
        validateIncomingMessage({ 
          source: 'manual', 
          externalMessageId: 'msg-001',
          text: 'test',
          receivedAt: 'invalid-date'
        })
      ).toThrow('Invalid received_at date');
    });
  });

  describe('createMessage', () => {
    it('should create message with all fields', () => {
      const incoming = {
        source: 'manual',
        externalMessageId: 'msg-001',
        text: 'Test message',
        receivedAt: '2026-08-10T09:00:00+07:00',
        sender: { name: 'Test' }
      };

      const message = createMessage(incoming, 'generated-id');

      expect(message.id).toBe('generated-id');
      expect(message.source).toBe('manual');
      expect(message.rawText).toBe('Test message');
      expect(message.processingStatus).toBe(MessageProcessingStatus.Received);
    });
  });
});

describe('Order Entity', () => {
  describe('validateCreateOrder', () => {
    it('should validate correct order input', () => {
      const input = {
        sourceMessageId: 'msg-001'
      };

      const result = validateCreateOrder(input);
      expect(result.sourceMessageId).toBe('msg-001');
    });

    it('should reject missing source message ID', () => {
      expect(() => validateCreateOrder({})).toThrow('Source message ID is required');
    });

    it('should validate discount rate range', () => {
      expect(() => 
        validateCreateOrder({ sourceMessageId: 'msg-001', discountRate: 1.5 })
      ).toThrow('Discount rate must be between 0 and 1');
    });
  });

  describe('validateCreateOrderItem', () => {
    it('should validate correct order item', () => {
      const input = {
        orderId: 'order-001',
        rawProductName: '55 bơ',
        quantity: 10,
        unit: 'cái'
      };

      const result = validateCreateOrderItem(input);
      expect(result.rawProductName).toBe('55 bơ');
      expect(result.quantity).toBe(10);
    });

    it('should reject invalid quantity', () => {
      expect(() => 
        validateCreateOrderItem({ orderId: 'o1', rawProductName: 'test', quantity: 0, unit: 'cái' })
      ).toThrow('Quantity must be a positive number');

      expect(() => 
        validateCreateOrderItem({ orderId: 'o1', rawProductName: 'test', quantity: -5, unit: 'cái' })
      ).toThrow('Quantity must be a positive number');
    });

    it('should reject missing unit', () => {
      expect(() => 
        validateCreateOrderItem({ orderId: 'o1', rawProductName: 'test', quantity: 10, unit: '' })
      ).toThrow('Unit is required');
    });
  });
});

describe('Task Entity', () => {
  describe('validateCreateTask', () => {
    it('should validate correct task input', () => {
      const input = {
        type: TaskType.Delivery,
        title: 'Deliver order'
      };

      const result = validateCreateTask(input);
      expect(result.type).toBe(TaskType.Delivery);
      expect(result.title).toBe('Deliver order');
    });

    it('should reject invalid task type', () => {
      expect(() => 
        validateCreateTask({ type: 'invalid', title: 'Test' })
      ).toThrow('Invalid task type');
    });

    it('should reject missing title', () => {
      expect(() => 
        validateCreateTask({ type: TaskType.Delivery })
      ).toThrow('Task title is required');
    });
  });

  describe('generateTaskBusinessKey', () => {
    it('should generate key with all components', () => {
      const dueAt = new Date('2026-08-10');
      const key = generateTaskBusinessKey('order-001', TaskType.Delivery, dueAt);
      expect(key).toBe('order-001:delivery:2026-08-10');
    });

    it('should handle undefined order ID', () => {
      const key = generateTaskBusinessKey(undefined, TaskType.Invoice, undefined);
      expect(key).toBe('no-order:invoice:unspecified');
    });
  });
});

describe('ProductAlias Entity', () => {
  describe('normalizeAlias', () => {
    it('should normalize Vietnamese text', () => {
      expect(normalizeAlias('55 BƠ')).toBe('55 bo');
    });

    it('should collapse whitespace', () => {
      expect(normalizeAlias('55   bo')).toBe('55 bo');
    });
  });

  describe('validateCreateAlias', () => {
    it('should validate correct alias input', () => {
      const input = {
        productId: 'prod-001',
        alias: '55 bơ',
        source: 'global'
      };

      const result = validateCreateAlias(input);
      expect(result.productId).toBe('prod-001');
      expect(result.alias).toBe('55 bơ');
    });

    it('should reject invalid confidence', () => {
      expect(() => 
        validateCreateAlias({ productId: 'p1', alias: 'test', confidence: 1.5 })
      ).toThrow('Confidence must be between 0 and 1');
    });
  });
});
