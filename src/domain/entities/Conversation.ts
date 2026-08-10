/**
 * Conversation entity - canonical domain model.
 *
 * Represents a single conversation thread between a source (e.g. Zalo, Shopee,
 * Facebook) and the SalesMind system, optionally tied to a customer.
 *
 * This is a FIRST-CLASS domain entity. The canonical relationship is:
 *
 *   Customer
 *     |
 *     1
 *     |
 *     N
 *   Conversation
 *
 *   Conversation
 *     |
 *     1
 *     |
 *     N
 *   Message
 *
 * Persisted as its own table (`conversations`) with a foreign key to
 * `customers(id)` and a unique constraint on (source, external_conversation_id)
 * for idempotency. The Customer.conversationIds string[] on the application
 * side is a convenience projection - the persistence model uses a proper
 * foreign-key relationship.
 */

export interface Conversation {
  id: string;
  /** Source system: zalo, shopee, facebook, manual, etc. */
  source: string;
  /** External ID provided by the source system for idempotency. */
  externalConversationId: string;
  /**
   * Optional customer link. May be `undefined` until customer resolution
   * has been performed.
   */
  customerId?: string;
  /** Optional human-readable title or label. */
  title?: string;
  /** Optional JSON-serialized metadata blob for source-specific data. */
  metadataJson?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConversationInput {
  source: string;
  externalConversationId: string;
  customerId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export function validateCreateConversation(input: unknown): CreateConversationInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Conversation input must be an object');
  }
  const i = input as Record<string, unknown>;
  if (typeof i.source !== 'string' || !i.source.trim()) {
    throw new Error('source is required');
  }
  if (typeof i.externalConversationId !== 'string' || !i.externalConversationId.trim()) {
    throw new Error('externalConversationId is required');
  }
  return {
    source: i.source.trim(),
    externalConversationId: i.externalConversationId.trim(),
    customerId: i.customerId?.toString().trim(),
    title: i.title?.toString().trim(),
    metadata: i.metadata as Record<string, unknown> | undefined
  };
}

export function createConversation(input: CreateConversationInput, id: string): Conversation {
  const now = new Date();
  return {
    id,
    source: input.source,
    externalConversationId: input.externalConversationId,
    customerId: input.customerId,
    title: input.title,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
    createdAt: now,
    updatedAt: now
  };
}