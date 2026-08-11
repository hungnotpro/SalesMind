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
 * Transaction boundary:
 *
 *   The controller does NOT start its own transaction. The pipeline already
 *   runs inside `withTransaction(pool, ...)` when invoked with a pool
 *   (see `src/db/pg/pool.ts`). The controller receives a pool and hands it
 *   to the pipeline via a thin wrapper that opens the transaction.
 *
 * Idempotency:
 *
 *   The pipeline is idempotent at the database level:
 *     - messages UNIQUE(source, external_message_id)
 *     - conversations UNIQUE(source, external_conversation_id)
 *     - tasks UNIQUE(business_key)
 *
 *   The controller checks for a previously-processed message by
 *   (source, externalMessageId) BEFORE invoking the pipeline and returns
 *   the existing result when present. This avoids redundant work and keeps
 *   the API contract "idempotent" without relying solely on DB constraints.
 */

import { generateUUID } from '../shared/utils.js';
import {
  MessageProcessingService,
  type Message,
  type PipelineResult
} from '../services/MessageProcessingService.js';
import {
  validateMessageRequest,
  summarizeValidationIssues,
  type MessageIngestionRequest
} from './validation/messageRequest.js';
import { ValidationError } from '../shared/errors.js';

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
 * Stable shape — do not expose internal database implementation details.
 * The correlationId allows callers to debug server-side issues without
 * needing to inspect the database.
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
 * Optional pre-flight idempotency check.
 *
 * Returns the existing pipeline result (if any) for a previously-processed
 * message. The HTTP layer injects this so the controller does not import
 * the database directly.
 */
export type IdempotencyLookup = (
  source: string,
  externalMessageId: string
) => Promise<PipelineResult | null>;

/**
 * Options for the controller.
 */
export interface IngestMessageControllerOptions {
  invoker: PipelineInvoker;
  idempotencyLookup?: IdempotencyLookup;
  /** Optional ID generator (for deterministic tests). */
  generateId?: () => string;
}

export class IngestMessageController {
  constructor(private readonly options: IngestMessageControllerOptions) {}

  /**
   * Handle a POST /api/v1/messages request.
   *
   * Returns either an IngestMessageApiResponse or an ErrorApiResponse.
   * The caller (HTTP transport) is responsible for serializing these
   * into JSON and selecting the HTTP status code.
   */
  async handle(request: unknown): Promise<IngestMessageApiResponse | ErrorApiResponse> {
    const requestId = generateUUID();

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

    // 2. Build the canonical Message entity (id generated here, so the
    //    pipeline can use it consistently for both pipeline + idempotency)
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

    // 3. Idempotency pre-check: if this message was processed before,
    //    return the existing result without re-running the pipeline.
    let idempotentReplay = false;
    if (this.options.idempotencyLookup) {
      const existing = await this.options.idempotencyLookup(req.source, req.externalMessageId);
      if (existing) {
        return this.toApiResponse(existing, messageId, /* idempotent */ true);
      }
    }

    // 4. Run the pipeline
    let result: PipelineResult;
    try {
      result = await this.options.invoker(message);
    } catch (err) {
      // Surface processing failures with a stable code per ERROR_CODES.md
      const message = err instanceof Error ? err.message : 'Unknown processing error';
      return {
        success: false,
        error: {
          code: 'PROCESSING_FAILED',
          message,
          requestId
        }
      };
    }

    return this.toApiResponse(result, messageId, idempotentReplay);
  }

  private toApiResponse(
    result: PipelineResult,
    messageId: string,
    idempotentReplay: boolean
  ): IngestMessageApiResponse {
    return {
      success: true,
      data: {
        messageId,
        correlationId: result.correlationId,
        conversationId: result.messageId,
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
 * Build a default idempotency lookup that checks the message repository.
 *
 * The lookup is best-effort: a DB miss simply means "not seen before",
 * and the pipeline will create it. The DB UNIQUE constraint is the
 * authoritative idempotency mechanism.
 */
export function createMessageIdempotencyLookup(
  messageRepository: { findBySourceAndExternalId(source: string, externalId: string): Promise<Message | null> },
  orderRepository: { findBySourceMessageId(messageId: string): Promise<unknown | null> }
): IdempotencyLookup {
  return async (source: string, externalMessageId: string): Promise<PipelineResult | null> => {
    const existingMessage = await messageRepository.findBySourceAndExternalId(source, externalMessageId);
    if (!existingMessage) return null;
    // We have a prior message; look for an order derived from it
    const existingOrder = await orderRepository.findBySourceMessageId(existingMessage.id);
    return {
      messageId: existingMessage.id,
      correlationId: existingMessage.id,
      rawText: existingMessage.rawText,
      intent: 'order' as any,
      intentConfidence: 1.0,
      customerInfo: undefined,
      items: [],
      instructions: [],
      invoiceRequired: false,
      orderId: (existingOrder as { id?: string } | null)?.id,
      taskIds: [],
      reviewRequired: false,
      reviewReasons: [],
      warnings: [],
      metadata: {
        processedAt: existingMessage.createdAt.toISOString(),
        processingDurationMs: 0,
        parserVersion: '1.0.0',
        ruleEngineVersion: '1.0.0'
      }
    };
  };
}

// Re-export ValidationError so consumers do not need to import from
// `shared/errors.ts` directly.
export { ValidationError };