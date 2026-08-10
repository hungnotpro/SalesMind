/**
 * Customer Resolution Service
 * 
 * Resolution pipeline using evidence hierarchy:
 * 1. exact verified phone number
 * 2. conversation/customer mapping
 * 3. exact verified customer identifier
 * 4. verified customer name
 * 5. fuzzy name candidate
 * 6. unresolved
 * 
 * Conflict detection:
 * - If phone → Customer A but name → Customer B, return conflict
 */

import { ResolutionStatus } from '../../shared/enums.js';
import { removeDiacritics } from '../../shared/utils.js';

// ============================================================
// Types
// ============================================================

export interface Customer {
  id: string;
  displayName: string;
  normalizedName: string;
  phone?: string;
  normalizedPhone?: string;
  addresses?: CustomerAddress[];
  status: string;
  verified: boolean;
  confidence: number;
}

export interface CustomerAddress {
  rawAddress: string;
  normalizedAddress?: string;
  isVerified: boolean;
}

export interface CustomerCandidate {
  rawName?: string;
  normalizedName?: string;
  rawPhone?: string;
  normalizedPhone?: string;
  rawAddress?: string;
  normalizedAddress?: string;
  confidence: number;
  resolutionStatus: ResolutionStatus;
  matchMethod?: 'exact_phone' | 'exact_name' | 'fuzzy_name' | 'conversation' | 'none';
  conflict?: ConflictInfo;
}

export interface ConflictInfo {
  phoneCustomerId?: string;
  phoneCustomerName?: string;
  nameCustomerId?: string;
  nameCustomerName?: string;
  reason: string;
}

// ============================================================
// Repository Interface
// ============================================================

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByPhone(normalizedPhone: string): Promise<Customer | null>;
  findByNormalizedName(normalizedName: string): Promise<Customer[]>;
  findByConversationId(conversationId: string): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
  update(customer: Customer): Promise<void>;
}

// ============================================================
// Phone Normalization
// ============================================================

export function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Handle Vietnamese phone numbers
  // 0-prefixed numbers (10-11 digits)
  // +84-prefixed numbers
  
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

// ============================================================
// Name Normalization
// ============================================================

export function normalizeCustomerName(name: string): string {
  // Remove dots and other punctuation for comparison
  const withoutPunctuation = name.replace(/[._-]/g, ' ');
  const trimmed = withoutPunctuation.trim().replace(/\s+/g, ' ');
  return removeDiacritics(trimmed).toLowerCase();
}

// ============================================================
// Fuzzy Name Matching
// ============================================================

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function calculateNameSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ============================================================
// Resolution Configuration
// ============================================================

export interface CustomerResolutionConfig {
  fuzzyNameThreshold: number;
  confidenceThreshold: number;
}

export const DEFAULT_CUSTOMER_RESOLUTION_CONFIG: CustomerResolutionConfig = {
  fuzzyNameThreshold: 0.75,
  confidenceThreshold: 0.80
};

// ============================================================
// Customer Resolution Service
// ============================================================

export class CustomerResolutionService {
  constructor(
    private customerRepo: ICustomerRepository,
    private config: CustomerResolutionConfig = DEFAULT_CUSTOMER_RESOLUTION_CONFIG
  ) {}

  /**
   * Resolve a customer candidate using evidence hierarchy.
   * 
   * Steps:
   * 1. Extract and normalize phone/name from candidate
   * 2. Try exact phone match
   * 3. Try conversation mapping
   * 4. Try exact name match
   * 5. Try fuzzy name match
   * 6. Check for conflicts
   * 7. Return unresolved if no match
   */
  async resolve(
    candidate: CustomerCandidate,
    conversationId?: string
  ): Promise<CustomerResolutionResult> {
    const results: CustomerResolutionResult[] = [];
    let conflict: ConflictInfo | undefined;

    // Step 1: Exact phone match (highest priority)
    if (candidate.normalizedPhone) {
      const phoneMatch = await this.customerRepo.findByPhone(candidate.normalizedPhone);
      if (phoneMatch) {
        results.push({
          customerId: phoneMatch.id,
          customer: phoneMatch,
          resolutionStatus: ResolutionStatus.Resolved,
          confidence: 1.0,
          matchMethod: 'exact_phone'
        });
      }
    }

    // Step 2: Conversation mapping
    if (conversationId) {
      const conversationMatch = await this.customerRepo.findByConversationId(conversationId);
      if (conversationMatch) {
        results.push({
          customerId: conversationMatch.id,
          customer: conversationMatch,
          resolutionStatus: ResolutionStatus.Resolved,
          confidence: 0.95,
          matchMethod: 'conversation'
        });
      }
    }

    // Step 3: Exact name match
    if (candidate.normalizedName) {
      const nameMatches = await this.customerRepo.findByNormalizedName(candidate.normalizedName);
      for (const match of nameMatches) {
        results.push({
          customerId: match.id,
          customer: match,
          resolutionStatus: ResolutionStatus.Resolved,
          confidence: match.confidence,
          matchMethod: 'exact_name'
        });
      }
    }

    // Step 4: Fuzzy name match
    if (candidate.normalizedName && results.length === 0) {
      const fuzzyMatch = await this.fuzzyNameMatch(candidate.normalizedName);
      if (fuzzyMatch) {
        results.push(fuzzyMatch);
      }
    }

    // Step 5: Check for conflicts
    if (results.length > 1) {
      // Multiple different customers found - check for conflict
      const customerIds = new Set(results.map(r => r.customerId));
      if (customerIds.size > 1) {
        // Conflict detected
        const phoneResult = results.find(r => r.matchMethod === 'exact_phone');
        const nameResult = results.find(r => r.matchMethod === 'exact_name' || r.matchMethod === 'fuzzy_name');
        
        if (phoneResult && nameResult && phoneResult.customerId !== nameResult.customerId) {
          conflict = {
            phoneCustomerId: phoneResult.customerId,
            phoneCustomerName: phoneResult.customer?.displayName,
            nameCustomerId: nameResult.customerId,
            nameCustomerName: nameResult.customer?.displayName,
            reason: `Phone matches "${phoneResult.customer?.displayName}" but name matches "${nameResult.customer?.displayName}"`
          };
          
          // Return conflict result
          return {
            customerId: undefined,
            resolutionStatus: ResolutionStatus.NeedsReview,
            confidence: 0,
            matchMethod: 'conflict',
            conflict,
            requiresReview: true
          };
        }
      }
    }

    // Return best result
    if (results.length > 0) {
      // Sort by confidence and return best
      results.sort((a, b) => b.confidence - a.confidence);
      const best = results[0];
      return {
        customerId: best.customerId,
        customer: best.customer,
        resolutionStatus: best.resolutionStatus,
        confidence: best.confidence,
        matchMethod: best.matchMethod,
        requiresReview: best.confidence < this.config.confidenceThreshold
      };
    }

    // No match found
    return {
      customerId: undefined,
      resolutionStatus: ResolutionStatus.Unresolved,
      confidence: 0,
      matchMethod: 'none'
    };
  }

  /**
   * Fuzzy name matching against verified customers.
   */
  private async fuzzyNameMatch(normalizedName: string): Promise<CustomerResolutionResult | null> {
    // Get all customers with verified names
    // For now, we'll use findByNormalizedName with a prefix search
    // In production, would have a better search index
    
    const candidates = await this.customerRepo.findByNormalizedName(normalizedName.slice(0, 3));
    
    let bestMatch: { customer: Customer; similarity: number } | null = null;
    
    for (const customer of candidates) {
      const similarity = calculateNameSimilarity(normalizedName, customer.normalizedName);
      
      if (similarity >= this.config.fuzzyNameThreshold && 
          similarity > (bestMatch?.similarity || 0)) {
        bestMatch = { customer, similarity };
      }
    }
    
    if (bestMatch) {
      return {
        customerId: bestMatch.customer.id,
        customer: bestMatch.customer,
        resolutionStatus: ResolutionStatus.NeedsReview, // Fuzzy matches need review
        confidence: bestMatch.similarity,
        matchMethod: 'fuzzy_name',
        requiresReview: true
      };
    }
    
    return null;
  }

  /**
   * Create a customer candidate from raw input.
   */
  createCandidate(input: {
    rawName?: string;
    rawPhone?: string;
    rawAddress?: string;
  }): CustomerCandidate {
    const candidate: CustomerCandidate = {
      confidence: 0,
      resolutionStatus: ResolutionStatus.Unresolved
    };

    if (input.rawName) {
      candidate.rawName = input.rawName.trim();
      candidate.normalizedName = normalizeCustomerName(input.rawName);
    }

    if (input.rawPhone) {
      candidate.rawPhone = input.rawPhone.trim();
      candidate.normalizedPhone = normalizePhone(input.rawPhone);
    }

    if (input.rawAddress) {
      candidate.rawAddress = input.rawAddress.trim();
      // Address normalization would be more complex in production
      candidate.normalizedAddress = input.rawAddress.toLowerCase().trim();
    }

    // Calculate initial confidence based on what we have
    if (candidate.normalizedPhone) {
      candidate.confidence = 0.8;
      candidate.resolutionStatus = ResolutionStatus.NeedsReview;
    } else if (candidate.normalizedName) {
      candidate.confidence = 0.5;
      candidate.resolutionStatus = ResolutionStatus.NeedsReview;
    }

    return candidate;
  }
}

// ============================================================
// Resolution Result Type
// ============================================================

export interface CustomerResolutionResult {
  customerId?: string;
  customer?: Customer;
  resolutionStatus: ResolutionStatus;
  confidence: number;
  matchMethod: 'exact_phone' | 'exact_name' | 'fuzzy_name' | 'conversation' | 'conflict' | 'none';
  conflict?: ConflictInfo;
  requiresReview?: boolean;
}
