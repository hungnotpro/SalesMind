/**
 * Customer entity - buyer/contact.
 *
 * @deprecated This is a LEGACY contract. The active domain entity lives at
 * `src/domain/entities/Customer.ts`. New code MUST NOT import this file.
 * PostgreSQL implementation MUST use the canonical active contract.
 *
 * Migration plan:
 * - Use `Customer` from `src/domain/entities/Customer.ts` for all new code.
 * - Persisted Customer data must include `created_at` and `updated_at`
 *   timestamps as required by the canonical contract.
 * - The `notes` field here is not present in the canonical contract; do
 *   not introduce it in the persistence layer.
 * - The `verified` and `confidence` fields are absent here; the canonical
 *   contract requires them. Backfill during migration.
 *
 * This file is kept unchanged per the SM-003.4 directive
 * ("Do not delete packages/") and is annotated for awareness.
 */

import { CustomerStatus } from '../../shared/src/enums.js';

export interface Customer {
  id: string;
  displayName: string;
  normalizedName: string;
  phone?: string;
  addresses: CustomerAddress[];
  notes?: string;
  status: CustomerStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  label?: string;
  address: string;
  verified: boolean;
  createdAt: Date;
}

export interface CreateCustomerInput {
  displayName: string;
  phone?: string;
  addresses?: Omit<CustomerAddress, 'id' | 'customerId' | 'createdAt'>[];
}

export function normalizeCustomerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function validateCreateCustomer(input: unknown): CreateCustomerInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Customer input must be an object');
  }

  const i = input as Record<string, unknown>;

  if (typeof i.displayName !== 'string' || !i.displayName.trim()) {
    throw new Error('Display name is required');
  }

  return {
    displayName: i.displayName.trim(),
    phone: i.phone?.toString().trim(),
    addresses: (i.addresses as CreateCustomerInput['addresses']) || []
  };
}
