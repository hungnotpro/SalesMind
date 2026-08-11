/**
 * SalesMind OS — public API surface.
 *
 * Exposes the controllers, validation, HTTP transport, and read-model
 * helpers for callers.
 *
 * Architecture:
 *
 *   HTTP Transport (server.ts)            <- HTTP / JSON
 *        ↓
 *   Controller (messages.ts)              <- request validation + response shaping
 *        ↓
 *   Application Service (MessageProcessingService)
 *        ↓
 *   Repository interfaces (existing)
 *        ↓
 *   PostgreSQL
 *
 * Business logic never lives in this module.
 */

export {
  IngestMessageController,
  reconstructPipelineResult,
  type IngestMessageApiRequest,
  type IngestMessageApiResponse,
  type ErrorApiResponse,
  type IngestMessageControllerOptions,
  type PipelineInvoker,
  type IdempotencyLookup,
  type ApiLogger,
  type PersistedMessageState,
  type PersistedOrderItemState,
  type PersistedTaskState,
  type ExistingOrder
} from './messages.js';

export {
  MessageApiServer,
  resolveRequestId,
  type ServerOptions
} from './server.js';

export {
  validateMessageRequest,
  summarizeValidationIssues,
  type MessageIngestionRequest,
  type ValidationIssue,
  type ValidationResult,
  type ValidationFailure,
  type ValidationSuccess
} from './validation/messageRequest.js';

export {
  isUniqueViolation,
  type UniqueConstraintError
} from './persistence-errors.js';