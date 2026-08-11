/**
 * SalesMind OS — public API surface.
 *
 * Exposes the controllers, validation, HTTP transport, read-model
 * helpers, and production bootstrap for callers.
 *
 * Architecture:
 *
 *   Production bootstrap (bootstrap.ts)
 *        ↓
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
  type IngestMessageControllerTestOptions,
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

export {
  bootstrapMessageApiServer,
  createPostgresIdempotencyLookup,
  createPostgresPipelineInvoker,
  type BootstrapDependencies,
  type BootstrapResult
} from './bootstrap.js';

export {
  type PgPoolLike,
  isPgPoolLike,
  asPgPoolLike
} from './pg-connection.js';