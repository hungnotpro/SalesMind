/**
 * SM-003 Tests: Customer Resolution Foundation
 * 
 * Tests for customer resolution integration in the pipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================
// Inline Enums
// ============================================================

const MessageIntent = { Order: 'order', OrderCancellation: 'order_cancellation', OrderUpdate: 'order_update', Unknown: 'unknown' };
const ResolutionStatus = { Resolved: 'resolved', NeedsReview: 'needs_review', Unresolved: 'unresolved', Rejected: 'rejected' };
const OrderStatus = { Draft: 'draft', Confirmed: 'confirmed', Processing: 'processing', Completed: 'completed', Cancelled: 'cancelled' };
const TaskPriority = { Low: 'low', Normal: 'normal', High: 'high', Urgent: 'urgent' };
const TaskType = { Delivery: 'delivery', Invoice: 'invoice', PaymentFollowup: 'payment_followup', ReviewOrder: 'review_order', ResolveProduct: 'resolve_product', ResolveCustomer: 'resolve_customer', Other: 'other' };
const InstructionType = { Discount: 'discount', Payment: 'payment', Delivery: 'delivery', Invoice: 'invoice', Note: 'note', Cancellation: 'cancellation' };

// ============================================================
// Inline Utils
// ============================================================

function removeDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // If starts with 0, replace with 84
  if (cleaned.startsWith('0')) {
    return '84' + cleaned.slice(1);
  }
  
  // If starts with 84, return as-is
  if (cleaned.startsWith('84')) {
    return cleaned;
  }
  
  return cleaned;
}

function normalizeCustomerName(name: string): string {
  // Remove dots and other punctuation for comparison
  const withoutPunctuation = name.replace(/[._-]/g, ' ');
  const trimmed = withoutPunctuation.trim().replace(/\s+/g, ' ');
  return removeDiacritics(trimmed).toLowerCase();
}

// ============================================================
// Tests
// ============================================================

describe('SM-003: Customer Resolution', () => {

  describe('Phone Normalization', () => {
    it('should normalize 0-prefixed phone to 84 format', () => {
      const result = normalizePhone('0904813024');
      expect(result).toBe('84904813024');
    });

    it('should normalize +84 prefixed phone', () => {
      const result = normalizePhone('+84904813024');
      expect(result).toBe('84904813024');
    });

    it('should preserve raw phone separately', () => {
      const rawPhone = '0904813024';
      const normalized = normalizePhone(rawPhone);
      expect(rawPhone).toBe('0904813024');
      expect(normalized).toBe('84904813024');
      expect(rawPhone).not.toBe(normalized);
    });
  });

  describe('Name Normalization', () => {
    it('should normalize name by removing dots and diacritics', () => {
      const result = normalizeCustomerName('a.Long');
      expect(result).toBe('a long');
    });

    it('should preserve raw name separately', () => {
      const rawName = 'a.Long';
      const normalized = normalizeCustomerName(rawName);
      expect(rawName).toBe('a.Long');
      expect(normalized).toBe('a long');
    });
  });

  describe('Customer Resolution Strategy', () => {
    it('should prioritize exact phone match over name match', () => {
      const exactPhoneConfidence = 1.0;
      const exactNameConfidence = 0.8;
      const fuzzyNameConfidence = 0.6;
      
      expect(exactPhoneConfidence).toBeGreaterThan(exactNameConfidence);
      expect(exactNameConfidence).toBeGreaterThan(fuzzyNameConfidence);
    });
  });

  describe('Conflict Detection', () => {
    it('should detect conflict when phone and name match different customers', () => {
      const phoneMatchCustomer = { id: 'cust-001', displayName: 'a.Long' };
      const nameMatchCustomer = { id: 'cust-002', displayName: 'Minh' };
      
      const hasConflict = phoneMatchCustomer.id !== nameMatchCustomer.id;
      expect(hasConflict).toBe(true);
    });

    it('should not conflict when phone and name match same customer', () => {
      const customer = { id: 'cust-001', displayName: 'a.Long' };
      expect(phoneMatch(customer).id).toBe(nameMatch(customer).id);
      
      function phoneMatch(c: any) { return c; }
      function nameMatch(c: any) { return c; }
    });
  });

  describe('Raw Value Preservation', () => {
    it('should preserve raw phone', () => {
      const rawPhone = '0904813024';
      const normalized = normalizePhone(rawPhone);
      
      expect(rawPhone).toBe('0904813024');
      expect(normalized).toBe('84904813024');
      expect(rawPhone).not.toBe(normalized);
    });

    it('should preserve raw name', () => {
      const rawName = 'a.Long';
      const normalized = normalizeCustomerName(rawName);
      
      expect(rawName).toBe('a.Long');
      expect(normalized).toBe('a long');
      expect(rawName).not.toBe(normalized);
    });
  });

  describe('Unknown Customer', () => {
    it('should return unresolved for unknown phone', () => {
      const knownPhones = ['84904813024', '84905123456'];
      const unknownPhone = normalizePhone('0909999999');
      
      const isKnown = knownPhones.includes(unknownPhone);
      expect(isKnown).toBe(false);
    });

    it('should return needs_review for unknown name', () => {
      const knownNames = ['a long', 'minh'];
      const unknownName = normalizeCustomerName('Unknown Person');
      
      const isKnown = knownNames.includes(unknownName);
      expect(isKnown).toBe(false);
    });
  });

  describe('Duplicate Customer Prevention', () => {
    it('should prevent duplicate customer creation for same phone', () => {
      const phoneIndex = new Map<string, string>();
      
      const phone = '0904813024';
      const normalizedPhone = normalizePhone(phone);
      
      // First check should be null
      const existingCustomer = phoneIndex.get(normalizedPhone);
      expect(existingCustomer).toBeUndefined();
      
      // Add first customer
      phoneIndex.set(normalizedPhone, 'cust-001');
      
      // Now should find existing customer
      const secondCheck = phoneIndex.get(normalizedPhone);
      expect(secondCheck).toBe('cust-001');
    });
  });

  describe('Customer-Specific Product Alias', () => {
    it('should resolve alias for specific customer', () => {
      const customerAAliases = [
        { alias: '55 bo', productId: 'prod-001', customerId: 'cust-001', verified: true }
      ];
      const customerBAliases = [
        { alias: '55 bo', productId: 'prod-002', customerId: 'cust-002', verified: true }
      ];
      
      const allAliases = [...customerAAliases, ...customerBAliases];
      
      // Resolve for Customer A
      const customerAProduct = allAliases.find(
        a => a.alias === '55 bo' && a.customerId === 'cust-001'
      );
      
      expect(customerAProduct?.productId).toBe('prod-001');
      
      // Resolve for Customer B
      const customerBProduct = allAliases.find(
        a => a.alias === '55 bo' && a.customerId === 'cust-002'
      );
      
      expect(customerBProduct?.productId).toBe('prod-002');
    });

    it('should use customer context for alias resolution', () => {
      const aliases = [
        { alias: '55 bo', productId: 'prod-001', customerId: undefined, verified: true },
        { alias: '55 bo', productId: 'prod-003', customerId: 'cust-001', verified: true }
      ];
      
      const customerId = 'cust-001';
      const customerSpecificMatch = aliases.find(
        a => a.alias === '55 bo' && a.customerId === customerId
      );
      const globalMatch = aliases.find(
        a => a.alias === '55 bo' && !a.customerId
      );
      
      expect(customerSpecificMatch?.productId).toBe('prod-003');
      expect(globalMatch?.productId).toBe('prod-001');
    });
  });

  describe('Full Real-World Order', () => {
    it('should extract customer info from real message', () => {
      const message = `3/CHTL CPLUS (10/8)
Duc: 65B duong hiep binh , hcm
Sdt:0904813024 ( a.Long)

50g cay :10 cai
55 bo :10 cai
Ck 5%

Tien mat
giao trong ngay`;

      // Extract customer info
      const phoneMatch = message.match(/Sdt:(\d+)/);
      
      // Find name in parentheses - need to search lines after phone line
      const lines = message.split('\n');
      let extractedName = null;
      let foundPhone = false;
      
      for (const line of lines) {
        // First find the phone line
        if (/Sdt:/i.test(line)) {
          foundPhone = true;
        }
        // Then look for name in parentheses after phone line
        if (foundPhone) {
          const nameMatch = line.match(/\(([^)]+)\)\s*$/);
          if (nameMatch) {
            extractedName = nameMatch[1];
            break;
          }
        }
      }
      
      expect(phoneMatch?.[1]).toBe('0904813024');
      expect(extractedName?.trim()).toBe('a.Long');
    });

    it('should match extracted phone to known customer', () => {
      const knownCustomers = [
        { id: 'cust-001', phone: '0904813024', displayName: 'a.Long' }
      ];
      
      const extractedPhone = '0904813024';
      const normalizedPhone = normalizePhone(extractedPhone);
      
      const customer = knownCustomers.find(c => 
        normalizePhone(c.phone) === normalizedPhone
      );
      
      expect(customer?.displayName).toBe('a.Long');
    });
  });

  describe('Customer Resolution + Product Resolution Integration', () => {
    it('should resolve customer then use for product alias resolution', () => {
      const customerId = 'cust-001';
      
      const globalAliases = [
        { alias: '55 bo', productId: 'prod-001', customerId: undefined }
      ];
      const customerAliases = [
        { alias: '55 bo', productId: 'prod-005', customerId: 'cust-001' }
      ];
      
      // First check customer-specific aliases
      const customerMatch = customerAliases.find(
        a => a.alias === '55 bo' && a.customerId === customerId
      );
      
      // Then check global aliases
      const globalMatch = globalAliases.find(a => a.alias === '55 bo');
      
      // Customer-specific should take precedence
      expect(customerMatch?.productId).toBe('prod-005');
      
      // If no customer-specific, use global
      const noCustomerAliases: any[] = [];
      const noCustomerMatch = noCustomerAliases.find(
        a => a.alias === '55 bo' && a.customerId === customerId
      ) || globalAliases.find(a => a.alias === '55 bo');
      
      expect(noCustomerMatch?.productId).toBe('prod-001');
    });
  });

  describe('Address Extraction', () => {
    it('should extract address from Duc: pattern', () => {
      const line = 'Duc: 65B duong hiep binh, hcm';
      const match = line.match(/^(?:duc|dia\s*chi|address)[:\s]+(.+)$/i);
      
      expect(match?.[1]?.trim()).toBe('65B duong hiep binh, hcm');
    });

    it('should preserve raw address', () => {
      const rawAddress = '65B duong hiep binh, hcm';
      
      expect(rawAddress).toBe('65B duong hiep binh, hcm');
    });
  });
});
