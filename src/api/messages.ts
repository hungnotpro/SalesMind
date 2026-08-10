/**
 * Message API routes - POST /messages for ingestion.
 */

import { MessageIngestionService, IngestMessageInput, IngestMessageResult } from '../services/MessageIngestionService.js';
import { validateIncomingMessage } from '@salesmind/domain';
import { ValidationError, ErrorCode } from '@salesmind/shared';

export interface MessageRequest {
  source: string;
  externalMessageId: string;
  conversationId?: string;
  sender: {
    name?: string;
    phone?: string;
  };
  receivedAt: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface MessageResponse {
  messageId: string;
  processingStatus: string;
  orderId?: string;
  reviewRequired: boolean;
  correlationId: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

/**
 * Handle POST /messages request.
 */
export async function handleIngestMessage(
  service: MessageIngestionService,
  request: unknown
): Promise<MessageResponse> {
  // Validate request
  let input: IngestMessageInput;
  try {
    input = validateMessageRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    throw new ValidationError(message, { request }, 'api');
  }

  // Process message
  const result = await service.ingest(input);

  return {
    messageId: result.messageId,
    processingStatus: result.processingStatus,
    orderId: result.orderId,
    reviewRequired: result.reviewRequired,
    correlationId: result.correlationId
  };
}

/**
 * Validate message request.
 */
function validateMessageRequest(request: unknown): IngestMessageInput {
  if (!request || typeof request !== 'object') {
    throw new Error('Request body must be an object');
  }

  const r = request as Record<string, unknown>;

  if (typeof r.source !== 'string' || !r.source.trim()) {
    throw new Error('source is required');
  }

  if (typeof r.externalMessageId !== 'string' || !r.externalMessageId.trim()) {
    throw new Error('externalMessageId is required');
  }

  if (typeof r.text !== 'string') {
    throw new Error('text is required');
  }

  if (r.receivedAt && typeof r.receivedAt !== 'string') {
    throw new Error('receivedAt must be an ISO string');
  }

  if (r.sender && typeof r.sender !== 'object') {
    throw new Error('sender must be an object');
  }

  return {
    source: r.source.trim(),
    externalMessageId: r.externalMessageId.trim(),
    conversationId: r.conversationId?.toString().trim(),
    sender: {
      name: (r.sender as Record<string, string>)?.name?.trim(),
      phone: (r.sender as Record<string, string>)?.phone?.trim()
    },
    receivedAt: r.receivedAt?.toString() || new Date().toISOString(),
    text: r.text,
    metadata: r.metadata as Record<string, unknown> | undefined
  };
}
