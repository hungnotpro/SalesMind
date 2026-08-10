/**
 * AuditLog entity.
 */

import { AuditAction, AuditActorType } from '../shared/enums.js';

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorType: AuditActorType;
  actorId?: string;
  beforeData?: string;
  afterData?: string;
  sourceMessageId?: string;
  metadata?: string;
  createdAt: Date;
}

export function createAuditLog(input: any, id: string): AuditLog {
  const now = new Date();
  return { id, entityType: input.entityType, entityId: input.entityId, action: input.action, actorType: input.actorType, actorId: input.actorId, beforeData: input.beforeData ? JSON.stringify(input.beforeData) : undefined, afterData: input.afterData ? JSON.stringify(input.afterData) : undefined, sourceMessageId: input.sourceMessageId, createdAt: now };
}
