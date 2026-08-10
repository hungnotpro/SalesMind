/**
 * Customer entity - buyer/contact.
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
