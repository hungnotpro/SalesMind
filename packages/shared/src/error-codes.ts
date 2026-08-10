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
