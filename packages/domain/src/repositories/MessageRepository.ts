/**
 * Repository interfaces.
 */

import { Message, MessageProcessingStatus } from '../entities/Message.js';

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  findBySourceAndExternalId(source: string, externalId: string): Promise<Message | null>;
  save(message: Message): Promise<void>;
  updateStatus(id: string, status: MessageProcessingStatus): Promise<void>;
  listByConversation(conversationId: string, limit?: number): Promise<Message[]>;
}
