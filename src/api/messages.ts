/**
 * Message API routes — POST /api/v1/messages.
 *
 * This is a generic message ingestion boundary. It is NOT tied to any
 * specific source (e.g. Zalo, Facebook). The HTTP layer is a thin
 * validator + translator that:
 *
 *   1. Parses the request body (JSON)
 *   2. Validates against the closed MessageIngestionRequest contract
 *   3. Hands off to MessageProcessingService.processMessage (the existing
 *      application pipeline)
 *   4. Translates the PipelineResult into the API response envelope
 *
 * No business logic lives in this layer. No SQL. No parsing. No resolution.
 * The controller delegates to the existing transactional pipeline.
 *
 * Idempotency:
 *
 *   The pipeline is idempotent at the database level:
 *     - messages UNIQUE(source, external_message_id)
 *     - conversations UNIQUE(source, external_conversation_id)
 *     - tasks UNIQUE(business_key)
 *
 *   Idempotency has TWO layers:
 *
 *     1. Optimistic pre-flight: `IdempotencyLookup` returns a previously-
 *        persisted PipelineResult reconstructed from the database. This
 *        avoids re-running the pipeline when the same (source,
 *        externalMessageId) is seen again.
 *
 *     2. Authoritative: the pipeline's UNIQUE constraints catch concurrent
 *        duplicates. When a concurrent race occurs, the pipeline raises
 *        a UNIQUE violation. The controller catches that violation and
 *        falls back to reading the existing persisted result, then
 *        returns it as an idempotent replay.
 *
 *   In both cases the API response carries:
 *
 *     data.messageId        = the persisted message ID
 *     data.conversationId   = the persisted conversation ID
 *     meta.idempotentReplay = true
 *
 *   messageId is NEVER re-generated for an existing message. It is
 *   always the persisted ID.
 *
 * Error safety:
 *
 *   Processing exceptions are NEVER exposed to the API caller with their
 *   original message text. The controller logs the underlying error
 *   server-side and returns a generic "A message processing error
 *   occurred." envelope with code PROCESSING_FAILED.
 *
 * Correlation ID:
 *
 *   The HTTP transport passes the request ID (either from X-Request-ID
 *   or freshly generated) to the controller. The controller uses this
 *   ID for both logging and the response envelope. The correlation ID
 *   is distinct from messageId, conversationId, and externalMessageId.
 */

import { generateUUID } from '../shared/utils.js';
import {
  type Message,
  type PipelineResult
} from '../services/MessageProcessingService.js';
import {
  validateMessageRequest,
  summarizeValidationIssues,
  type MessageIngestionRequest
} from './validation/messageRequest.js';
import { isUniqueViolation, type UniqueConstraintError } from './persistence-errors.js';

/**
 * API request envelope (camelCase). Matches the validation contract.
 */
export interface IngestMessageApiRequest {
  source: string;
  externalMessageId: string;
  externalConversationId: string;
  text: string;
  receivedAt?: string;
  sender?: { name?: string; phone?: string };
  metadata?: Record<string, unknown>;
}

/**
 * API success response envelope.
 *
 * Stable shape — does not expose internal database implementation details.
 *
 *   - `data.messageId` is the PERSISTED message ID, never a freshly
 *     generated one. For replays, this equals the originally-persisted ID.
 *   - `data.conversationId` is the PERSISTED conversation ID. Distinct
 *     from `messageId`.
 *   - `data.correlationId` is the per-request correlation ID, distinct
 *     from both `messageId` and `conversationId`.
 *   - `meta.idempotentReplay` is true when the request resolved to an
 *     already-processed message.
 */
export interface IngestMessageApiResponse {
  success: true;
  data: {
    messageId: string;
    correlationId: string;
    conversationId: string;
    customerId?: string;
    orderId?: string;
    reviewRequired: boolean;
    reviewReasons: string[];
    intent: string;
    itemCount: number;
    createdAt: string;
  };
  meta: {
    idempotentReplay: boolean;
  };
}

/**
 * API error response envelope.
 */
export interface ErrorApiResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: { field: string; code: string; message: string }[];
  };
}

/**
 * Service-callback that owns the transactional pipeline invocation.
 *
 * The controller receives this from the HTTP layer; the callback wraps
 * the existing `MessageProcessingService.processMessage` in a transaction
 * using `withTransaction(pool, ...)`.
 *
 * For testing, this callback can be replaced with an in-memory variant.
 */
export type PipelineInvoker = (message: Message) => Promise<PipelineResult>;

/**
 * Reconstructs a PipelineResult from persisted state for an idempotent
 * replay. Returns `null` when no prior message exists.
 *
 * This MUST be the source of truth for replay responses: never invent
 * a fake result. Read it from the persisted tables.
 */
export type IdempotencyLookup = (
  source: string,
  externalMessageId: string
) => Promise<PipelineResult | null>;

/**
 * Server-side logger. Defaults to a no-op so the controller has no
 * hard dependency on a logging framework.
 */
export interface ApiLogger {
  error(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
}

const noopLogger: ApiLogger = {
  error: () => undefined,
  info: () => undefined
};

/**
 * Options for the controller.
 */
export interface IngestMessageControllerOptions {
  invoker: PipelineInvoker;
  idempotencyLookup?: IdempotencyLookup;
  /**
   * Optional ID generator (for deterministic tests). Default: UUID.
   * The ID is used ONLY for the correlation/request ID and ONLY for
   * the canonical Message ID of a NEW (never-seen-before) message.
   * For replay messages, the persisted ID is used instead.
   */
  generateId?: () => string;
  logger?: ApiLogger;
}

export class IngestMessageController {
  private readonly logger: ApiLogger;
  constructor(private readonly options: IngestMessageControllerOptions) {
    this.logger = options.logger ?? noopLogger;
  }

  /**
   * Handle a POST /api/v1/messages request.
   *
   * Returns either an IngestMessageApiResponse or an ErrorApiResponse.
   * The caller (HTTP transport) is responsible for serializing these
   * into JSON and selecting the HTTP status code.
   *
   * @param request    The inbound request body (untrusted JSON).
   * @param requestId  The correlation/request ID (from X-Request-ID or
   *                   freshly generated).
   */
  async handle(
    request: unknown,
    requestId: string = generateUUID()
  ): Promise<IngestMessageApiResponse | ErrorApiResponse> {
    // 1. Validate the inbound envelope
    const validation = validateMessageRequest(request);
    if (validation.ok !== true) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: summarizeValidationIssues(validation.issues),
          requestId,
          details: validation.issues
        }
      };
    }

    const req: MessageIngestionRequest = validation.value;

    // 2. Idempotency pre-flight: if this message was processed before,
    //    return the EXISTING persisted result (with the original
    //    messageId and conversationId).
    if (this.options.idempotencyLookup) {
      try {
        const existing = await this.options.idempotencyLookup(req.source, req.externalMessageId);
        if (existing) {
          this.logger.info('idempotent replay (pre-flight)', {
            requestId,
            source: req.source,
            externalMessageId: req.externalMessageId,
            messageId: existing.messageId,
            conversationId: existing.conversationId
          });
          return this.toApiResponse(existing, requestId, /* idempotent */ true);
        }
      } catch (err) {
        // A pre-flight failure is not fatal. The pipeline below will
        // still execute. Log and continue.
        this.logger.error('idempotency pre-flight failed', {
          requestId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // 3. Build the canonical Message entity. The ID is generated here
    //    so the pipeline + idempotency share the same identity.
    //    For a NEW message, this ID becomes the persisted ID.
    //    For a RACE-condition duplicate, the pipeline will throw a
    //    UNIQUE violation and we will re-read the persisted ID.
    const messageId = (this.options.generateId ?? generateUUID)();
    const message: Message = {
      id: messageId,
      source: req.source,
      externalMessageId: req.externalMessageId,
      externalConversationId: req.externalConversationId,
      receivedAt: req.receivedAt ? new Date(req.receivedAt) : new Date(),
      rawText: req.text,
      sender: {
        name: req.sender?.name,
        phone: req.sender?.phone
      },
      senderName: req.sender?.name,
      senderPhone: req.sender?.phone,
      processingStatus: 'received',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 4. Run the pipeline. On UNIQUE violation, fall back to a
    //    reconstructed idempotent replay (handles concurrent races).
    let result: PipelineResult;
    try {
      result = await this.options.invoker(message);
    } catch (err) {
      if (
        isUniqueViolation(err) &&
        isMessageIdUniqueViolation(err) &&
        this.options.idempotencyLookup
      ) {
        // A concurrent request created the message first. Re-read.
        try {
          const existing = await this.options.idempotencyLookup(req.source, req.externalMessageId);
          if (existing) {
            this.logger.info('idempotent replay (post-unique-violation)', {
              requestId,
              source: req.source,
              externalMessageId: req.externalMessageId,
              messageId: existing.messageId,
              conversationId: existing.conversationId
            });
            return this.toApiResponse(existing, requestId, /* idempotent */ true);
          }
        } catch (readErr) {
          this.logger.error('idempotency replay read failed after UNIQUE violation', {
            requestId,
            error: readErr instanceof Error ? readErr.message : String(readErr)
          });
        }
      }
      // Generic processing failure. Never leak the underlying error.
      this.logger.error('processing failed', {
        requestId,
        source: req.source,
        externalMessageId: req.externalMessageId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      return {
        success: false,
        error: {
          code: 'PROCESSING_FAILED',
          message: 'A message processing error occurred.',
          requestId
        }
      };
    }

    return this.toApiResponse(result, requestId, /* idempotent */ false);
  }

  private toApiResponse(
    result: PipelineResult,
    correlationId: string,
    idempotentReplay: boolean
  ): IngestMessageApiResponse {
    return {
      success: true,
      data: {
        messageId: result.messageId,
        correlationId,
        conversationId: result.conversationId,
        customerId: result.customerInfo?.customerId,
        orderId: result.orderId,
        reviewRequired: result.reviewRequired,
        reviewReasons: result.reviewReasons,
        intent: result.intent,
        itemCount: result.items.length,
        createdAt: result.metadata.processedAt
      },
      meta: {
        idempotentReplay
      }
    };
  }
}

/**
 * Predicate: does the UNIQUE violation correspond to the message
 * idempotency key? Used to distinguish message-idempotency races from
 * other UNIQUE conflicts (e.g. customer phone uniqueness).
 *
 * The check accepts either the canonical message constraint name
 * (`messages_source_external_unique`) or a generic `23505` whose error
 * mentions `messages` and `source` / `external_message_id`.
 */
function isMessageIdUniqueViolation(err: UniqueConstraintError): boolean {
  const constraint = (err.constraint ?? '').toLowerCase();
  if (constraint.includes('messages_source_external_unique')) return true;
  const table = (err.table ?? '').toLowerCase();
  const detail = (err.detail ?? '').toLowerCase();
  if (table === 'messages') return true;
  if (detail.includes('messages') && (detail.includes('source') || detail.includes('external_message_id'))) {
    return true;
  }
  return false;
}

// ============================================================
// Read-model helper (typed)
// ============================================================

/**
 * Typed Order lookup result. Replaces the previous `unknown | null`
 * shape that forced `as any` casts at the call site.
 */
export type ExistingOrder = {
  id: string;
} | null;

/**
 * Typed shape of the entities needed to reconstruct an idempotent
 * PipelineResult. All fields are derived from the database; none are
 * fabricated by the controller.
 */
export interface PersistedMessageState {
  messageId: string;
  conversationId: string;
  rawText: string;
  customerId: string | null;
  createdAt: Date;
  order: ExistingOrder;
  orderItems: PersistedOrderItemState[];
  tasks: PersistedTaskState[];
}

export interface PersistedOrderItemState {
  rawProductName: string;
  resolutionStatus: string;
}

export interface PersistedTaskState {
  id: string;
  type: string;
  status: string;
}

/**
 * Reconstruct a PipelineResult from the persisted message state.
 *
 * This is a read-model: every field comes from the database or is
 * deterministically derived. It does NOT re-run the parser, the
 * resolution services, or the rule engine. For idempotent replays,
 * the response carries:
 *
 *   - the persisted message ID (stable across requests)
 *   - the persisted conversation ID
 *   - the persisted customer ID (if known)
 *   - the persisted order ID (if any)
 *   - the persisted itemCount (count of order_items rows)
 *   - the persisted reviewRequired / reviewReasons
 *     (derived from order_items.resolution_status + customer state)
 *   - the persisted createdAt timestamp
 *
 * The `intent` is reconstructed from the order + items: a persisted
 * order implies an `order` intent; otherwise `unparseable` / `unknown`.
 */
export function reconstructPipelineResult(state: PersistedMessageState): PipelineResult {
  const itemCount = state.orderItems.length;
  const reviewReasons: string[] = [];
  const unresolvedCount = state.orderItems.filter(
    (i) => i.resolutionStatus === 'needs_review' || i.resolutionStatus === 'unresolved'
  ).length;
  if (unresolvedCount > 0) {
    reviewReasons.push(
      `${unresolvedCount} product(s) need review`
    );
  }
  if (!state.customerId && state.order) {
    reviewReasons.push('Customer could not be identified');
  }
  const reviewRequired = reviewReasons.length > 0;

  const intent = state.order ? 'order' : state.orderItems.length > 0 ? 'order' : 'unparseable';

  return {
    messageId: state.messageId,
    conversationId: state.conversationId,
    correlationId: state.messageId,
    rawText: state.rawText,
    intent: intent as PipelineResult['intent'],
    intentConfidence: 1.0,
    customerInfo: state.customerId
      ? {
          resolutionStatus: 'resolved' as any,
          resolutionConfidence: 1.0,
          customerId: state.customerId
        }
      : undefined,
    items: state.orderItems.map((i) => ({
      rawProductName: i.rawProductName,
      quantity: 0,
      unit: '',
      normalizedUnit: undefined,
      productId: undefined,
      productName: undefined,
      resolutionStatus: i.resolutionStatus as any,
      resolutionConfidence: undefined,
      matchMethod: undefined,
      lineNumber: undefined
    })),
    instructions: [],
    invoiceRequired: false,
    orderId: state.order?.id,
    taskIds: state.tasks.map((t) => t.id),
    reviewRequired,
    reviewReasons,
    warnings: [],
    metadata: {
      processedAt: state.createdAt.toISOString(),
      processingDurationMs: 0,
      parserVersion: '1.0.0',
      ruleEngineVersion: '1.0.0'
    }
  };
}

// Re-export the persistence-error types so consumers do not need
// to import from './persistence-errors.js' directly.
export type { UniqueConstraintError } from './persistence-errors.js';