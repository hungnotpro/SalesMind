/**
 * Row → entity mappers for PostgreSQL repositories.
 *
 * PostgreSQL stores timestamps as TIMESTAMPTZ (ISO 8601 strings), floats as
 * DECIMAL (string), and JSONB as parsed JS objects. The application uses
 * `Date`, `number`, and structured objects. These helpers bridge the two.
 *
 * Each mapper is a pure function of a single row.
 */

import type {
  Message,
  Order,
  OrderItem,
  Task,
  AuditLog
} from '../../services/MessageProcessingService.js';
import type { Product, ProductAlias } from '../../product-resolution/ProductResolutionService.js';
import type { Customer } from '../../customer-resolution/CustomerResolutionService.js';
import type { Conversation } from '../../domain/entities/Conversation.js';

type Row = Record<string, unknown>;

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  if (typeof v === 'number') return new Date(v);
  return new Date();
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v);
  return undefined;
}

function toStringOrUndefined(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  return String(v);
}

function toJsonString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function toJsonParsed(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

// ============================================================
// Customer
// ============================================================

export function customerFromRow(row: Row): Customer {
  const conversationIds = Array.isArray(row.conversation_ids)
    ? (row.conversation_ids as string[])
    : [];
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    normalizedName: row.normalized_name as string,
    phone: toStringOrUndefined(row.phone),
    normalizedPhone: toStringOrUndefined(row.normalized_phone),
    conversationIds,
    status: (row.status as string) ?? 'active',
    verified: Boolean(row.verified),
    confidence: toNumberOrUndefined(row.confidence) ?? 1.0,
    // createdAt / updatedAt are persisted but the resolver's runtime shape
    // does not currently include them; these are kept for canonical use.
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at)
  } as Customer;
}

export function customerToRow(c: Customer): {
  id: string;
  display_name: string;
  normalized_name: string;
  phone: string | null;
  normalized_phone: string | null;
  status: string;
  verified: boolean;
  confidence: number;
} {
  return {
    id: c.id,
    display_name: c.displayName,
    normalized_name: c.normalizedName,
    phone: c.phone ?? null,
    normalized_phone: c.normalizedPhone ?? null,
    status: c.status,
    verified: c.verified,
    confidence: c.confidence
  };
}

// ============================================================
// Conversation
// ============================================================

export function conversationFromRow(row: Row): Conversation {
  return {
    id: row.id as string,
    source: row.source as string,
    externalConversationId: row.external_conversation_id as string,
    customerId: toStringOrUndefined(row.customer_id),
    title: toStringOrUndefined(row.title),
    metadataJson: toJsonString(row.metadata_json),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at)
  };
}

// ============================================================
// Message
// ============================================================

export function messageFromRow(row: Row): Message {
  return {
    id: row.id as string,
    source: row.source as string,
    externalMessageId: row.external_message_id as string,
    conversationId: toStringOrUndefined(row.conversation_id),
    senderName: toStringOrUndefined(row.sender_name),
    senderPhone: toStringOrUndefined(row.sender_phone),
    sender: {
      name: toStringOrUndefined(row.sender_name),
      phone: toStringOrUndefined(row.sender_phone)
    },
    receivedAt: toDate(row.received_at),
    rawText: row.raw_text as string,
    metadataJson: toJsonString(row.metadata_json),
    processingStatus: (row.processing_status as string) ?? 'received',
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at)
  };
}

// ============================================================
// Product
// ============================================================

export function productFromRow(row: Row): Product {
  return {
    id: row.id as string,
    sku: row.sku as string,
    name: row.name as string,
    normalizedName: row.normalized_name as string,
    category: toStringOrUndefined(row.category),
    defaultUnit: (row.default_unit as string) ?? 'cái',
    active: Boolean(row.active)
  };
}

// ============================================================
// ProductAlias
// ============================================================

export function productAliasFromRow(row: Row): ProductAlias {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    customerId: toStringOrUndefined(row.customer_id),
    alias: row.alias as string,
    normalizedAlias: row.normalized_alias as string,
    source: (row.source as string) ?? 'global',
    verified: Boolean(row.verified),
    confidence: toNumberOrUndefined(row.confidence) ?? 1.0
  };
}

// ============================================================
// Order
// ============================================================

export function orderFromRow(row: Row): Order {
  return {
    id: row.id as string,
    customerId: toStringOrUndefined(row.customer_id),
    sourceMessageId: toStringOrUndefined(row.source_message_id),
    orderNumber: toStringOrUndefined(row.order_number),
    orderDate: toDate(row.order_date),
    requestedDeliveryAt: row.requested_delivery_at ? toDate(row.requested_delivery_at) : undefined,
    status: (row.status as string) ?? 'draft',
    discountRate: toNumberOrUndefined(row.discount_rate),
    discountSource: toStringOrUndefined(row.discount_source),
    paymentMethod: toStringOrUndefined(row.payment_method),
    paymentSource: toStringOrUndefined(row.payment_source),
    invoiceRequired: Boolean(row.invoice_required),
    invoiceDueAt: row.invoice_due_at ? toDate(row.invoice_due_at) : undefined,
    notes: toStringOrUndefined(row.notes),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at)
  };
}

// ============================================================
// OrderItem
// ============================================================

export function orderItemFromRow(row: Row): OrderItem {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    productId: toStringOrUndefined(row.product_id),
    rawProductName: row.raw_product_name as string,
    quantity: toNumberOrUndefined(row.quantity) ?? 0,
    unit: row.unit as string,
    normalizedUnit: toStringOrUndefined(row.normalized_unit),
    resolutionStatus: (row.resolution_status as string) ?? 'needs_review',
    resolutionConfidence: toNumberOrUndefined(row.resolution_confidence),
    matchMethod: toStringOrUndefined(row.match_method),
    notes: toStringOrUndefined(row.notes),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at)
  };
}

// ============================================================
// Task
// ============================================================

export function taskFromRow(row: Row): Task {
  return {
    id: row.id as string,
    orderId: toStringOrUndefined(row.order_id),
    type: row.type as string,
    title: row.title as string,
    description: toStringOrUndefined(row.description),
    ownerId: toStringOrUndefined(row.owner_id),
    priority: (row.priority as string) ?? 'normal',
    status: (row.status as string) ?? 'pending',
    dueAt: row.due_at ? toDate(row.due_at) : undefined,
    sourceMessageId: toStringOrUndefined(row.source_message_id),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at)
  };
}

// ============================================================
// AuditLog
// ============================================================

export function auditLogFromRow(row: Row): AuditLog {
  return {
    id: row.id as string,
    entityType: row.entity_type as string,
    entityId: row.entity_id as string,
    action: row.action as string,
    actorType: (row.actor_type as string) ?? 'System',
    actorId: toStringOrUndefined(row.actor_id),
    beforeData: toJsonString(row.before_data),
    afterData: toJsonString(row.after_data),
    sourceMessageId: toStringOrUndefined(row.source_message_id),
    metadata: toJsonString(row.metadata),
    createdAt: toDate(row.created_at)
  };
}
