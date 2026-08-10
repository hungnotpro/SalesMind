/**
 * Error codes and classification.
 */

export enum ErrorCode {
  ValidationError = 'VALIDATION_ERROR',
  InvalidQuantity = 'INVALID_QUANTITY',
  InvalidDate = 'INVALID_DATE',
  InvalidStateTransition = 'INVALID_STATE_TRANSITION',
  ProductUnresolved = 'PRODUCT_UNRESOLVED',
  ProductAmbiguous = 'PRODUCT_AMBIGUOUS',
  CustomerUnresolved = 'CUSTOMER_UNRESOLVED',
  CustomerAmbiguous = 'CUSTOMER_AMBIGUOUS',
  ProcessingFailed = 'PROCESSING_FAILED',
  AIProviderError = 'AI_PROVIDER_ERROR',
  AIOutputInvalid = 'AI_OUTPUT_INVALID',
  RuleEngineError = 'RULE_ENGINE_ERROR',
  NotFound = 'NOT_FOUND',
  DuplicateResource = 'DUPLICATE_RESOURCE',
  Conflict = 'CONFLICT',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  InternalError = 'INTERNAL_ERROR'
}

export enum ErrorClassification {
  Validation = 'validation',
  Integration = 'integration',
  AIProvider = 'ai_provider',
  BusinessRule = 'business_rule',
  Persistence = 'persistence',
  Unknown = 'unknown'
}

export function classifyError(errorCode: ErrorCode): ErrorClassification {
  switch (errorCode) {
    case ErrorCode.ValidationError:
    case ErrorCode.InvalidQuantity:
    case ErrorCode.InvalidDate:
    case ErrorCode.InvalidStateTransition:
      return ErrorClassification.Validation;
    case ErrorCode.AIProviderError:
    case ErrorCode.AIOutputInvalid:
      return ErrorClassification.AIProvider;
    case ErrorCode.ProductUnresolved:
    case ErrorCode.ProductAmbiguous:
    case ErrorCode.CustomerUnresolved:
    case ErrorCode.CustomerAmbiguous:
    case ErrorCode.RuleEngineError:
      return ErrorClassification.BusinessRule;
    case ErrorCode.ProcessingFailed:
      return ErrorClassification.Integration;
    case ErrorCode.NotFound:
    case ErrorCode.DuplicateResource:
    case ErrorCode.Conflict:
      return ErrorClassification.Persistence;
    default:
      return ErrorClassification.Unknown;
  }
}

export class SalesMindError extends Error {
  public readonly code: string;
  public readonly classification: string;
  public readonly requestId?: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, classification: string, requestId?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SalesMindError';
    this.code = code;
    this.classification = classification;
    this.requestId = requestId;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toResponse(): Record<string, unknown> {
    return { error: { code: this.code, message: this.message } };
  }
}

export class ValidationError extends SalesMindError {
  constructor(message: string, details?: Record<string, unknown>, requestId?: string) {
    super('VALIDATION_ERROR', message, 'validation', requestId, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends SalesMindError {
  constructor(entityType: string, entityId: string, requestId?: string) {
    super('NOT_FOUND', `${entityType} not found: ${entityId}`, 'persistence', requestId, { entityType, entityId });
    this.name = 'NotFoundError';
  }
}
