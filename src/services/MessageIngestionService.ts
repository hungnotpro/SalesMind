/**
 * Message ingestion service - handles incoming message processing.
 * 
 * This is the main entry point for the message-to-order pipeline.
 */

import { generateUUID, getCurrentTimestamp } from '@salesmind/shared';
import { 
  IncomingMessage, 
  Message, 
  createMessage, 
  MessageProcessingStatus,
  validateIncomingMessage,
  ProcessingResult,
  OrderItemCandidate,
  TaskCandidate,
  createEmptyProcessingResult,
  requiresReview,
  hasValidOrder
} from '@salesmind/domain';
import { parseMessage, ParseInput } from '@salesmind/parser';
import { applyBusinessRules, RuleEngineConfig, DEFAULT_RULE_ENGINE_CONFIG } from '@salesmind/rules';
import { MessageProcessingService } from './MessageProcessingService.js';
import { DuplicateResourceError, ValidationError } from '@salesmind/shared';

export interface IngestMessageInput {
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

export interface IngestMessageResult {
  messageId: string;
  processingStatus: MessageProcessingStatus;
  orderId?: string;
  taskIds: string[];
  reviewRequired: boolean;
  correlationId: string;
}

export class MessageIngestionService {
  constructor(
    private processingService: MessageProcessingService,
    private ruleEngineConfig: RuleEngineConfig = DEFAULT_RULE_ENGINE_CONFIG
  ) {}

  /**
   * Ingest a new message and process it through the pipeline.
   * 
   * AC-001: Original message is persisted unchanged.
   * AC-002: Same input processed twice does not create duplicates.
   */
  async ingest(input: IngestMessageInput): Promise<IngestMessageResult> {
    const messageId = generateUUID();
    const correlationId = `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    // Validate input
    const validated = validateIncomingMessage(input);

    // Check for duplicate (AC-002)
    const existing = await this.processingService.findBySourceAndExternalId(
      validated.source,
      validated.externalMessageId
    );

    if (existing) {
      // Return existing result (idempotent)
      return {
        messageId: existing.id,
        processingStatus: existing.processingStatus,
        correlationId
      };
    }

    // Create and persist message (AC-001)
    const message = createMessage(validated, messageId);
    await this.processingService.saveMessage(message);

    try {
      // Process the message through the pipeline
      const result = await this.processingService.processMessage(message, correlationId, this.ruleEngineConfig);

      // Determine final status
      const processingStatus = result.reviewRequired
        ? MessageProcessingStatus.Completed  // Still completed, but marked for review
        : MessageProcessingStatus.Completed;

      // Update message status
      await this.processingService.updateMessageStatus(messageId, processingStatus);

      return {
        messageId,
        processingStatus,
        orderId: result.orderId,
        taskIds: result.taskIds,
        reviewRequired: result.reviewRequired,
        correlationId
      };

    } catch (error) {
      // Mark message as failed
      await this.processingService.updateMessageStatus(messageId, MessageProcessingStatus.Failed);
      throw error;
    }
  }

  /**
   * Get processing result for a message.
   */
  async getProcessingResult(messageId: string): Promise<ProcessingResult | null> {
    return this.processingService.getProcessingResult(messageId);
  }
}
