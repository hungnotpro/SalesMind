/**
 * Enums for SalesMind.
 */

export enum ResolutionStatus {
  Resolved = 'resolved',
  NeedsReview = 'needs_review',
  Unresolved = 'unresolved',
  Rejected = 'rejected'
}

export enum TaskPriority {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
  Urgent = 'urgent'
}

export enum TaskStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled'
}

export enum OrderStatus {
  Draft = 'draft',
  Confirmed = 'confirmed',
  Processing = 'processing',
  Completed = 'completed',
  Cancelled = 'cancelled'
}

export enum CustomerStatus {
  Active = 'active',
  Inactive = 'inactive',
  Blocked = 'blocked'
}

export enum MessageIntent {
  Order = 'order',
  Task = 'task',
  OrderUpdate = 'order_update',
  OrderCancellation = 'order_cancellation',
  Information = 'information',
  Unknown = 'unknown'
}

export enum PaymentMethod {
  Cash = 'cash',
  BankTransfer = 'bank_transfer',
  Credit = 'credit',
  Other = 'other'
}

export enum AliasSource {
  Global = 'global',
  Customer = 'customer',
  HumanCorrection = 'human_correction',
  Import = 'import',
  ModelSuggestion = 'model_suggestion'
}

export enum AuditActorType {
  System = 'system',
  User = 'user',
  AI = 'ai'
}

export enum AuditAction {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  Resolve = 'resolve',
  Reject = 'reject',
  Approve = 'approve'
}
