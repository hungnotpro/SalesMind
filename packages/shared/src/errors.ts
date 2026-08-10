/**
 * Common error classes for SalesMind.
 */
export class SalesMindError extends Error {
  public readonly code: string;
  public readonly classification: string;
  public readonly requestId?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    classification: string,
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SalesMindError';
    this.code = code;
    this.classification = classification;
    this.requestId = requestId;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toResponse(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message
      }
    };
  }
}

export class ValidationError extends SalesMindError {
  constructor(message: string, details?: Record<string, unknown>, requestId?: string) {
    super('VALIDATION_ERROR', message, 'validation', requestId, details);
    this.name = 'ValidationError';
  }
}

export class InvalidQuantityError extends SalesMindError {
  constructor(quantity: unknown, requestId?: string) {
    super('INVALID_QUANTITY', `Invalid quantity: ${quantity}`, 'validation', requestId, { quantity });
    this.name = 'InvalidQuantityError';
  }
}

export class InvalidDateError extends SalesMindError {
  constructor(dateValue: unknown, requestId?: string) {
    super('INVALID_DATE', `Invalid date: ${dateValue}`, 'validation', requestId, { dateValue });
    this.name = 'InvalidDateError';
  }
}

export class NotFoundError extends SalesMindError {
  constructor(entityType: string, entityId: string, requestId?: string) {
    super('NOT_FOUND', `${entityType} not found: ${entityId}`, 'persistence', requestId, { entityType, entityId });
    this.name = 'NotFoundError';
  }
}

export class DuplicateResourceError extends SalesMindError {
  constructor(resourceType: string, key: string, requestId?: string) {
    super('DUPLICATE_RESOURCE', `Duplicate ${resourceType}: ${key}`, 'persistence', requestId, { resourceType, key });
    this.name = 'DuplicateResourceError';
  }
}

export class ProductUnresolvedError extends SalesMindError {
  constructor(productAlias: string, requestId?: string) {
    super('PRODUCT_UNRESOLVED', `Product alias not resolved: ${productAlias}`, 'business_rule', requestId, { productAlias });
    this.name = 'ProductUnresolvedError';
  }
}

export class CustomerUnresolvedError extends SalesMindError {
  constructor(identifier: string, requestId?: string) {
    super('CUSTOMER_UNRESOLVED', `Customer not resolved: ${identifier}`, 'business_rule', requestId, { identifier });
    this.name = 'CustomerUnresolvedError';
  }
}

export class AIOutputInvalidError extends SalesMindError {
  constructor(details?: Record<string, unknown>, requestId?: string) {
    super('AI_OUTPUT_INVALID', 'AI output failed validation', 'ai_provider', requestId, details);
    this.name = 'AIOutputInvalidError';
  }
}

export class AIProviderError extends SalesMindError {
  constructor(provider: string, message: string, requestId?: string) {
    super('AI_PROVIDER_ERROR', `AI provider error (${provider}): ${message}`, 'ai_provider', requestId);
    this.name = 'AIProviderError';
  }
}

export class RuleEngineError extends SalesMindError {
  constructor(ruleName: string, message: string, requestId?: string) {
    super('RULE_ENGINE_ERROR', `Rule violation (${ruleName}): ${message}`, 'business_rule', requestId, { ruleName });
    this.name = 'RuleEngineError';
  }
}

export class InternalError extends SalesMindError {
  constructor(message: string, requestId?: string) {
    super('INTERNAL_ERROR', message, 'unknown', requestId);
    this.name = 'InternalError';
  }
}
