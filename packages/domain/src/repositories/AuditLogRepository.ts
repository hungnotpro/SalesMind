import { AuditLog } from '../entities/AuditLog.js';

export interface IAuditLogRepository {
  findById(id: string): Promise<AuditLog | null>;
  findByEntity(entityType: string, entityId: string): Promise<AuditLog[]>;
  findBySourceMessage(messageId: string): Promise<AuditLog[]>;
  save(auditLog: AuditLog): Promise<void>;
  listRecent(limit?: number): Promise<AuditLog[]>;
}
