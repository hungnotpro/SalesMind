/**
 * Customer entity - canonical domain model.
 *
 * This is the SINGLE SOURCE OF TRUTH for customer-related contracts
 * in the active SalesMind codebase under src/.
 *
 * Relationship graph (canonical):
 *
 *   Customer 1 ─── N Conversation
 *   Customer 1 ─── N Order
 *   Customer 1 ─── N ProductAlias  (customer-specific aliases)
 *
 * Field-by-field rationale:
 *
 *   id              - UUID primary key
 *   displayName     - raw human-entered name, preserved
 *   normalizedName  - canonical comparison form (lowercased, no diacritics)
 *   phone           - raw E.164/Vietnamese phone string, preserved
 *   normalizedPhone - canonical 84-prefixed form for lookups
 *   conversationIds - convenience projection of related conversation IDs;
 *                     persistence uses the conversations table with FK
 *   status          - free-form string ('active', 'unverified', etc.).
 *                     Kept as string - no TS/PG enum yet.
 *   verified        - gates strong-evidence name resolution in CustomerResolutionService
 *   confidence      - per-customer resolution confidence
 *   createdAt       - timestamp
 *   updatedAt       - timestamp
 *
 * Notes:
 *   - No `notes` field. The current application does not use it.
 *   - No speculation of fields.
 *   - Timestamps are required (added for PostgreSQL readiness).
 */

export interface Customer {
  id: string;
  displayName: string;
  normalizedName: string;
  phone?: string;
  normalizedPhone?: string;
  /**
   * Convenience list of conversation IDs associated with this customer.
   * In the persistence layer this is modeled via a foreign-key relationship
   * to the `conversations` table. The application-side array is for quick
   * in-memory access and repository indexing.
   */
  conversationIds: string[];
  /** Optional delivery addresses. Each address carries its own verification state. */
  addresses?: CustomerAddress[];
  status: string;
  verified: boolean;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerAddress {
  rawAddress: string;
  normalizedAddress?: string;
  isVerified: boolean;
}

export interface CreateCustomerInput {
  displayName: string;
  phone?: string;
  conversationIds?: string[];
}

export function validateCreateCustomer(input: unknown): CreateCustomerInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Customer input must be an object');
  }
  const i = input as Record<string, unknown>;
  if (typeof i.displayName !== 'string' || !i.displayName.trim()) {
    throw new Error('displayName is required');
  }
  return {
    displayName: i.displayName.trim(),
    phone: i.phone?.toString().trim(),
    conversationIds: Array.isArray(i.conversationIds) ? (i.conversationIds as unknown[]).map(String) : []
  };
}

export function createCustomer(input: CreateCustomerInput, id: string): Customer {
  const now = new Date();
  return {
    id,
    displayName: input.displayName,
    normalizedName: input.displayName.toLowerCase().trim().replace(/\s+/g, ' '),
    phone: input.phone,
    normalizedPhone: input.phone ? normalizePhone(input.phone) : undefined,
    conversationIds: input.conversationIds ?? [],
    addresses: [],
    status: 'active',
    verified: false,
    confidence: 1.0,
    createdAt: now,
    updatedAt: now
  };
}

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return '84' + cleaned.slice(1);
  if (cleaned.startsWith('84')) return cleaned;
  return cleaned;
}