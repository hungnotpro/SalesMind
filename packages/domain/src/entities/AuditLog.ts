/**
 * AuditLog entity - trace of important system/AI transformations.
 */

import { AuditAction, AuditActorType } from '../../shared/src/enums.js';

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

export interface CreateAuditLogInput {
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorType: AuditActorType;
  actorId?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  sourceMessageId?: string;
  metadata?: Record<string, unknown>;
}

export function createAuditLog(input: CreateAuditLogInput, id: string): AuditLog {
  const now = new Date();

  return {
    id,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorType: input.actorType,
    actorId: input.actorId,
    beforeData: input.beforeData ? JSON.stringify(input.beforeData) : undefined,
    afterData: input.afterData ? JSON.stringify(input.afterData) : undefined,
    sourceMessageId: input.sourceMessageId,
    metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    createdAt: now
  };
}

export { AuditAction, AuditActorType };
