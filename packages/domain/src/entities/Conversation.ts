/**
 * Conversation entity (LEGACY placeholder).
 *
 * @deprecated This is a LEGACY placeholder. The active domain entity lives at
 * `src/domain/entities/Conversation.ts`. New code MUST NOT import this file.
 * PostgreSQL implementation MUST use the canonical active contract.
 *
 * The active Conversation entity was introduced in SM-003.4 and lives under
 * `src/domain/entities/Conversation.ts`. This file exists only as a marker
 * so that any code referring to `packages/domain/src/entities/Conversation`
 * is explicitly flagged as legacy.
 *
 * Migration plan:
 * - Use `Conversation` from `src/domain/entities/Conversation.ts` for all new code.
 * - The persistence model is `conversations` table with FK to `customers(id)`
 *   and a UNIQUE(source, external_conversation_id) constraint.
 *
 * This file is kept (per "Do not delete packages/") and contains no business
 * logic. It is annotated for awareness.
 */

export interface Conversation {
  id: string;
  source: string;
  externalConversationId: string;
  customerId?: string;
  title?: string;
  metadataJson?: string;
  createdAt: Date;
  updatedAt: Date;
}