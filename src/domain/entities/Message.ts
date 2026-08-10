/**
 * Message entity - immutable source communication.
 */

import { MessageIntent } from '../shared/enums.js';

export interface MessageSender {
  name?: string;
  phone?: string;
}

export interface Message {
  id: string;
  source: string;
  externalMessageId: string;
  conversationId?: string;
  sender: MessageSender;
  receivedAt: Date;
  rawText: string;
  metadataJson?: string;
  processingStatus: MessageProcessingStatus;
  createdAt: Date;
  updatedAt: Date;
}

export enum MessageProcessingStatus {
  Received = 'received',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Duplicate = 'duplicate'
}

export interface IncomingMessage {
  source: string;
  externalMessageId: string;
  conversationId?: string;
  sender: MessageSender;
  receivedAt: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export function validateIncomingMessage(msg: unknown): IncomingMessage {
  if (!msg || typeof msg !== 'object') throw new Error('Message must be an object');
  const m = msg as Record<string, unknown>;
  if (typeof m.source !== 'string' || !m.source.trim()) throw new Error('source is required');
  if (typeof m.externalMessageId !== 'string' || !m.externalMessageId.trim()) throw new Error('externalMessageId is required');
  if (typeof m.text !== 'string') throw new Error('text is required');
  return {
    source: (m.source as string).trim(),
    externalMessageId: (m.externalMessageId as string).trim(),
    conversationId: m.conversationId?.toString().trim(),
    sender: { name: (m.sender as Record<string, string>)?.name?.trim(), phone: (m.sender as Record<string, string>)?.phone?.trim() },
    receivedAt: m.receivedAt?.toString() || new Date().toISOString(),
    text: m.text as string,
    metadata: m.metadata as Record<string, unknown>
  };
}

export function createMessage(incoming: IncomingMessage, id: string): Message {
  const now = new Date();
  return { id, source: incoming.source, externalMessageId: incoming.externalMessageId, conversationId: incoming.conversationId, sender: incoming.sender, receivedAt: new Date(incoming.receivedAt), rawText: incoming.text, metadataJson: incoming.metadata ? JSON.stringify(incoming.metadata) : undefined, processingStatus: MessageProcessingStatus.Received, createdAt: now, updatedAt: now };
}
