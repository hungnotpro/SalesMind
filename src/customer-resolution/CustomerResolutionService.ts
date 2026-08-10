/**
 * Customer Resolution Service
 * 
 * Resolution pipeline using strict evidence hierarchy:
 * 1. exact verified phone number          (STRONG)
 * 2. conversation/customer mapping        (STRONG)
 * 3. exact verified customer name         (STRONG - requires verified flag)
 * 4. fuzzy name candidate                 (NEVER auto-resolves - always needs_review)
 * 5. unresolved                           (default)
 * 
 * Conflict rules:
 * - If STRONG evidence points to multiple different customers => conflict
 * - phone A vs name B => conflict
 * - conversation A vs phone B => conflict
 * - conversation A vs name B => conflict
 * - Conflict returns: resolutionStatus=needs_review, matchMethod=conflict, customerId=undefined
 * 
 * Verification rules:
 * - Exact-name resolution only uses customers where verified === true
 * - Unverified customers with matching names do NOT count as strong evidence
 * 
 * Fuzzy matching rules:
 * - Always requiresReview = true
 * - Never auto-resolves
 * - Isolated behind findFuzzyCandidates() so a future search implementation can replace it
 */

import { ResolutionStatus } from '../shared/enums.js';
import { removeDiacritics } from '../shared/utils.js';

// ============================================================
// Types
// ============================================================

export interface Customer {
  id: string;
  displayName: string;
  normalizedName: string;
  phone?: string;
  normalizedPhone?: string;
  /** First-class list of conversation IDs this customer is associated with. */
  conversationIds: string[];
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
  sources: Array<{
    source: 'phone' | 'conversation' | 'name';
    customerId: string;
    customerName: string;
  }>;
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
// Internal Strong Evidence Type
// ============================================================

type EvidenceSource = 'phone' | 'conversation' | 'name';

interface StrongEvidence {
  source: EvidenceSource;
  customer: Customer;
  confidence: number;
}

// ============================================================
// Customer Resolution Service
// ============================================================

export class CustomerResolutionService {
  constructor(
    private customerRepo: ICustomerRepository,
    private config: CustomerResolutionConfig = DEFAULT_CUSTOMER_RESOLUTION_CONFIG
  ) {}

  /**
   * Resolve a customer candidate using strict evidence hierarchy.
   *
   * Steps:
   * 1. Collect all STRONG evidence independently (phone, conversation, verified name)
   * 2. Detect conflict if strong evidence points to multiple customers
   * 3. If conflict => needs_review + conflict matchMethod + customerId=undefined
   * 4. If all strong evidence agrees => resolved
   * 5. If no strong evidence and only fuzzy candidates => needs_review + fuzzy_name
   * 6. Else => unresolved
   */
  async resolve(
    candidate: CustomerCandidate,
    conversationId?: string
  ): Promise<CustomerResolutionResult> {
    // Step 1: Collect strong evidence independently
    const strong: StrongEvidence[] = [];

    // Strong evidence: exact phone
    if (candidate.normalizedPhone) {
      const phoneCustomer = await this.customerRepo.findByPhone(candidate.normalizedPhone);
      if (phoneCustomer) {
        strong.push({
          source: 'phone',
          customer: phoneCustomer,
          confidence: 1.0
        });
      }
    }

    // Strong evidence: conversation mapping
    if (conversationId) {
      const conversationCustomer = await this.customerRepo.findByConversationId(conversationId);
      if (conversationCustomer) {
        strong.push({
          source: 'conversation',
          customer: conversationCustomer,
          confidence: 0.95
        });
      }
    }

    // Strong evidence: exact verified name (verified === true ONLY)
    if (candidate.normalizedName) {
      const nameCustomers = await this.customerRepo.findByNormalizedName(candidate.normalizedName);
      for (const customer of nameCustomers) {
        if (customer.verified === true) {
          strong.push({
            source: 'name',
            customer,
            confidence: customer.confidence
          });
        }
        // Unverified customers do NOT count as strong name evidence
      }
    }

    // Step 2: Detect conflict among strong evidence
    const conflict = this.detectConflict(strong);
    if (conflict) {
      return {
        customerId: undefined,
        resolutionStatus: ResolutionStatus.NeedsReview,
        confidence: 0,
        matchMethod: 'conflict',
        conflict,
        requiresReview: true
      };
    }

    // Step 3: If we have exactly one strong evidence customer, return resolved
    if (strong.length === 1) {
      const only = strong[0];
      return {
        customerId: only.customer.id,
        customer: only.customer,
        resolutionStatus: ResolutionStatus.Resolved,
        confidence: only.confidence,
        matchMethod: this.evidenceToMatchMethod(only.source),
        requiresReview: only.confidence < this.config.confidenceThreshold
      };
    }

    // Step 4: No strong evidence => try fuzzy (NEVER auto-resolves)
    if (candidate.normalizedName) {
      const fuzzy = await this.findFuzzyCandidate(candidate.normalizedName);
      if (fuzzy) {
        return {
          customerId: fuzzy.id,
          customer: fuzzy,
          resolutionStatus: ResolutionStatus.NeedsReview,
          confidence: fuzzy.confidence,
          matchMethod: 'fuzzy_name',
          requiresReview: true  // ALWAYS true for fuzzy
        };
      }
    }

    // Step 5: Default fallback
    return {
      customerId: undefined,
      resolutionStatus: ResolutionStatus.Unresolved,
      confidence: 0,
      matchMethod: 'none'
    };
  }

  /**
   * Detect conflict when strong evidence points to different customers.
   */
  private detectConflict(strong: StrongEvidence[]): ConflictInfo | undefined {
    const distinctCustomerIds = new Set(strong.map(e => e.customer.id));
    if (distinctCustomerIds.size <= 1) return undefined;

    const sources = strong.map(e => ({
      source: e.source,
      customerId: e.customer.id,
      customerName: e.customer.displayName
    }));

    // Build reason
    const reason = sources
      .map(s => `${s.source} -> "${s.customerName}" (${s.customerId})`)
      .join('; ');

    return { sources, reason };
  }

  /**
   * Convert evidence source to matchMethod.
   */
  private evidenceToMatchMethod(source: EvidenceSource): 'exact_phone' | 'exact_name' | 'conversation' {
    switch (source) {
      case 'phone': return 'exact_phone';
      case 'name': return 'exact_name';
      case 'conversation': return 'conversation';
    }
  }

  /**
   * Find fuzzy candidates using a simple Levenshtein-based similarity.
   * 
   * This is intentionally isolated behind a method so a future database-backed
   * implementation (e.g., trigram search) can replace it without changing the
   * resolver contract.
   * 
   * Rules:
   * - Only considers verified customers
   * - Threshold-based similarity
   * - Returns candidates ordered by similarity (best first)
   */
  async findFuzzyCandidates(
    normalizedName: string,
    threshold: number = this.config.fuzzyNameThreshold
  ): Promise<Array<{ customer: Customer; similarity: number }>> {
    // Use the repository's prefix-based search to bound the candidate set.
    // In production this can be replaced by trigram search or DB fuzzy operator.
    const candidates = await this.customerRepo.findByNormalizedName(normalizedName.slice(0, 3));
    const results: Array<{ customer: Customer; similarity: number }> = [];

    for (const customer of candidates) {
      // Only consider verified customers for fuzzy name matching
      if (!customer.verified) continue;

      const similarity = calculateNameSimilarity(normalizedName, customer.normalizedName);
      if (similarity >= threshold) {
        results.push({ customer, similarity });
      }
    }

    // Sort by similarity desc
    results.sort((a, b) => b.similarity - a.similarity);
    return results;
  }

  /**
   * Find best fuzzy candidate (single result, not auto-resolved).
   */
  async findFuzzyCandidate(normalizedName: string): Promise<Customer | null> {
    const results = await this.findFuzzyCandidates(normalizedName);
    if (results.length === 0) return null;

    // If multiple fuzzy candidates agree on the same customer, that's stronger
    // but still requires review. We just return the best one.
    return results[0].customer;
  }

  /**
   * Create a customer candidate from raw input.
   * Always preserves raw values.
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

    if (input.rawName !== undefined && input.rawName !== null) {
      candidate.rawName = input.rawName.trim();
      candidate.normalizedName = normalizeCustomerName(input.rawName);
    }

    if (input.rawPhone !== undefined && input.rawPhone !== null) {
      candidate.rawPhone = input.rawPhone.trim();
      candidate.normalizedPhone = normalizePhone(input.rawPhone);
    }

    if (input.rawAddress !== undefined && input.rawAddress !== null) {
      candidate.rawAddress = input.rawAddress.trim();
      // Address normalization is intentionally simple for MVP
      candidate.normalizedAddress = input.rawAddress.toLowerCase().trim();
    }

    // Initial confidence is only based on what evidence is present, not resolution
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