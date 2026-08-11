/**
 * SalesMind OS — public API surface.
 *
 * Exposes the controllers, validation, and HTTP transport for callers.
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
  createMessageIdempotencyLookup,
  type IngestMessageApiRequest,
  type IngestMessageApiResponse,
  type ErrorApiResponse,
  type IngestMessageControllerOptions,
  type PipelineInvoker,
  type IdempotencyLookup
} from './messages.js';

export {
  MessageApiServer,
  type ServerOptions
} from './server.js';

export {
  validateMessageRequest,
  summarizeValidationIssues,
  type MessageIngestionRequest,
  type ValidationIssue,
  type ValidationResult
} from './validation/messageRequest.js';