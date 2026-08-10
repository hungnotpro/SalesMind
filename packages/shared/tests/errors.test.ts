/**
 * Tests for the shared package - Errors.
 */

import { describe, it, expect } from 'vitest';
import { 
  ErrorCode, 
  ErrorClassification, 
  classifyError 
} from '../src/errors.js';

describe('Error Codes', () => {
  describe('classifyError', () => {
    it('should classify validation errors', () => {
      expect(classifyError(ErrorCode.ValidationError)).toBe(ErrorClassification.Validation);
      expect(classifyError(ErrorCode.InvalidQuantity)).toBe(ErrorClassification.Validation);
      expect(classifyError(ErrorCode.InvalidDate)).toBe(ErrorClassification.Validation);
    });

    it('should classify AI provider errors', () => {
      expect(classifyError(ErrorCode.AIProviderError)).toBe(ErrorClassification.AIProvider);
      expect(classifyError(ErrorCode.AIOutputInvalid)).toBe(ErrorClassification.AIProvider);
    });

    it('should classify business rule errors', () => {
      expect(classifyError(ErrorCode.ProductUnresolved)).toBe(ErrorClassification.BusinessRule);
      expect(classifyError(ErrorCode.CustomerUnresolved)).toBe(ErrorClassification.BusinessRule);
      expect(classifyError(ErrorCode.RuleEngineError)).toBe(ErrorClassification.BusinessRule);
    });

    it('should classify persistence errors', () => {
      expect(classifyError(ErrorCode.NotFound)).toBe(ErrorClassification.Persistence);
      expect(classifyError(ErrorCode.DuplicateResource)).toBe(ErrorClassification.Persistence);
    });

    it('should classify unknown errors', () => {
      expect(classifyError(ErrorCode.InternalError)).toBe(ErrorClassification.Unknown);
    });
  });
});

describe('Domain Errors', () => {
  it('should create SalesMindError with proper properties', async () => {
    const { SalesMindError } = await import('../../src/errors.js');
    
    const error = new SalesMindError(
      'TEST_ERROR',
      'Test message',
      'test_classification',
      'req-123',
      { field: 'testField' }
    );

    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.classification).toBe('test_classification');
    expect(error.requestId).toBe('req-123');
    expect(error.details).toEqual({ field: 'testField' });
  });

  it('should convert to safe response', async () => {
    const { SalesMindError } = await import('../../src/errors.js');
    
    const error = new SalesMindError(
      'TEST_ERROR',
      'Test message',
      'test_classification'
    );

    const response = error.toResponse();
    expect(response).toEqual({
      error: {
        code: 'TEST_ERROR',
        message: 'Test message'
      }
    });
  });
});
