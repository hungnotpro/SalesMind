/**
 * Product Alias Resolution Service
 * 
 * Resolution pipeline:
 * 1. exact alias
 * 2. normalized alias
 * 3. customer-specific alias
 * 4. verified fuzzy candidate
 * 5. unresolved
 */

import { ResolutionStatus, AliasSource } from '../../shared/enums.js';
import { removeDiacritics } from '../../shared/utils.js';

// ============================================================
// Types
// ============================================================

export interface Product {
  id: string;
  sku: string;
  name: string;
  normalizedName: string;
  category?: string;
  defaultUnit: string;
  active: boolean;
}

export interface ProductAlias {
  id: string;
  productId: string;
  customerId?: string;
  alias: string;
  normalizedAlias: string;
  source: string;
  verified: boolean;
  confidence: number;
}

export interface ResolutionResult {
  productId?: string;
  product?: Product;
  status: ResolutionStatus;
  confidence: number;
  matchMethod: 'exact' | 'normalized' | 'fuzzy' | 'customer' | 'none';
  aliasId?: string;
}

// ============================================================
// Repository Interfaces (for dependency injection)
// ============================================================

export interface IProductRepository {
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  findByNormalizedName(normalized: string): Promise<Product | null>;
}

export interface IProductAliasRepository {
  findByExactAlias(alias: string, customerId?: string): Promise<ProductAlias | null>;
  findByNormalizedAlias(normalized: string, customerId?: string): Promise<ProductAlias[]>;
  findByProductId(productId: string): Promise<ProductAlias[]>;
  findByCustomerId(customerId: string): Promise<ProductAlias[]>;
  findVerifiedGlobal(): Promise<ProductAlias[]>;
}

// ============================================================
// Unit Normalization
// ============================================================

const UNIT_NORMALIZATIONS: Record<string, string> = {
  'cái': 'cái', 'cai': 'cái', 'cÁI': 'cái', 'CÁI': 'cái', 'CÁI': 'cái',
  'gói': 'gói', 'goi': 'gói',
  'kg': 'kg',
  'chai': 'chai',
  'hộp': 'hộp', 'hop': 'hộp', 'bx': 'hộp',
  'lon': 'lon', 'lộn': 'lộn',
  'bịch': 'bịch', 'bich': 'bịch',
};

export function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return UNIT_NORMALIZATIONS[lower] || lower;
}

// ============================================================
// Alias Normalization
// ============================================================

export function normalizeAlias(alias: string): string {
  return removeDiacritics(alias.toLowerCase().trim()).replace(/\s+/g, ' ');
}

// ============================================================
// Fuzzy Matching (simple Levenshtein-based)
// ============================================================

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
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

function calculateSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// ============================================================
// Resolution Configuration
// ============================================================

export interface ResolutionConfig {
  autoResolveThreshold: number;    // e.g., 0.95 - auto-resolve above this
  fuzzyMatchEnabled: boolean;
  fuzzyThreshold: number;           // e.g., 0.80 - minimum similarity for fuzzy match
}

export const DEFAULT_RESOLUTION_CONFIG: ResolutionConfig = {
  autoResolveThreshold: 0.95,
  fuzzyMatchEnabled: true,
  fuzzyThreshold: 0.80
};

// ============================================================
// Product Alias Resolution Service
// ============================================================

export class ProductResolutionService {
  constructor(
    private productRepo: IProductRepository,
    private aliasRepo: IProductAliasRepository,
    private config: ResolutionConfig = DEFAULT_RESOLUTION_CONFIG
  ) {}

  /**
   * Resolve a raw product alias to a canonical product.
   * 
   * Resolution pipeline:
   * 1. Exact match (case-insensitive)
   * 2. Customer-specific alias match
   * 3. Normalized alias match
   * 4. Fuzzy match (if enabled)
   * 5. Return unresolved
   */
  async resolve(
    rawAlias: string,
    customerId?: string,
    config?: Partial<ResolutionConfig>
  ): Promise<ResolutionResult> {
    const cfg = { ...this.config, ...config };
    const normalizedInput = normalizeAlias(rawAlias);
    const now = Date.now();

    // Step 1: Exact match
    const exactMatch = await this.aliasRepo.findByExactAlias(rawAlias, customerId);
    if (exactMatch && this.isValidMatch(exactMatch, customerId)) {
      return this.toResolutionResult(exactMatch, 'exact', cfg);
    }

    // Step 2: Customer-specific match
    if (customerId) {
      const customerAliases = await this.aliasRepo.findByCustomerId(customerId);
      const customerMatch = customerAliases.find(
        (alias) => normalizeAlias(alias.alias) === normalizedInput && alias.verified
      );
      if (customerMatch) {
        return this.toResolutionResult(customerMatch, 'customer', cfg);
      }
    }

    // Step 3: Normalized match
    const normalizedMatches = await this.aliasRepo.findByNormalizedAlias(normalizedInput, customerId);
    const normalizedMatch = normalizedMatches.find(
      (alias) => this.isValidMatch(alias, customerId)
    );
    if (normalizedMatch) {
      return this.toResolutionResult(normalizedMatch, 'normalized', cfg);
    }

    // Step 4: Fuzzy match (if enabled)
    if (cfg.fuzzyMatchEnabled) {
      const fuzzyResult = await this.fuzzyMatch(normalizedInput, customerId, cfg);
      if (fuzzyResult) {
        return fuzzyResult;
      }
    }

    // Step 5: Unresolved
    return {
      status: ResolutionStatus.Unresolved,
      confidence: 0,
      matchMethod: 'none'
    };
  }

  /**
   * Resolve multiple aliases.
   */
  async resolveMany(
    aliases: string[],
    customerId?: string
  ): Promise<ResolutionResult[]> {
    return Promise.all(aliases.map((alias) => this.resolve(alias, customerId)));
  }

  /**
   * Check if an alias match is valid.
   */
  private isValidMatch(alias: ProductAlias, customerId?: string): boolean {
    if (alias.verified) return true;
    if (alias.customerId && alias.customerId !== customerId) return false;
    return alias.confidence >= this.config.autoResolveThreshold;
  }

  /**
   * Convert alias to resolution result.
   */
  private async toResolutionResult(
    alias: ProductAlias,
    matchMethod: ResolutionResult['matchMethod'],
    cfg: ResolutionConfig
  ): Promise<ResolutionResult> {
    const product = await this.productRepo.findById(alias.productId);

    // Determine resolution status
    let status: ResolutionStatus;
    if (alias.verified && alias.confidence >= cfg.autoResolveThreshold) {
      status = ResolutionStatus.Resolved;
    } else if (alias.verified || alias.confidence >= cfg.autoResolveThreshold) {
      status = ResolutionStatus.NeedsReview;
    } else {
      status = ResolutionStatus.NeedsReview;
    }

    return {
      productId: alias.productId,
      product: product || undefined,
      status,
      confidence: alias.confidence,
      matchMethod,
      aliasId: alias.id
    };
  }

  /**
   * Perform fuzzy matching against verified aliases.
   */
  private async fuzzyMatch(
    normalizedInput: string,
    customerId: string | undefined,
    cfg: ResolutionConfig
  ): Promise<ResolutionResult | null> {
    const verifiedAliases = await this.aliasRepo.findVerifiedGlobal();
    
    let bestMatch: { alias: ProductAlias; similarity: number } | null = null;

    for (const alias of verifiedAliases) {
      // Skip customer-specific aliases for global fuzzy search
      if (alias.customerId && alias.customerId !== customerId) continue;

      const similarity = calculateSimilarity(normalizedInput, alias.normalizedAlias);
      
      if (similarity >= cfg.fuzzyThreshold && similarity > (bestMatch?.similarity || 0)) {
        bestMatch = { alias, similarity };
      }
    }

    if (bestMatch) {
      return this.toResolutionResult(bestMatch.alias, 'fuzzy', cfg);
    }

    return null;
  }
}

// ============================================================
// Order Item Resolution
// ============================================================

export interface OrderItemInput {
  rawProductName: string;
  quantity: number;
  unit: string;
  originalUnit?: string;  // preserved raw unit
}

export interface ResolvedOrderItem extends OrderItemInput {
  productId?: string;
  productName?: string;
  resolutionStatus: ResolutionStatus;
  confidence: number;
  matchMethod: ResolutionResult['matchMethod'];
}

export class OrderItemResolutionService {
  constructor(
    private productResolutionService: ProductResolutionService,
    private unitNormalizationEnabled: boolean = true
  ) {}

  /**
   * Resolve order items, preserving raw values.
   */
  async resolveItems(
    items: OrderItemInput[],
    customerId?: string
  ): Promise<ResolvedOrderItem[]> {
    const results: ResolvedOrderItem[] = [];

    for (const item of items) {
      // Normalize unit if enabled
      let normalizedUnit = item.unit;
      if (this.unitNormalizationEnabled) {
        normalizedUnit = normalizeUnit(item.unit);
      }

      // Resolve product
      const resolution = await this.productResolutionService.resolve(
        item.rawProductName,
        customerId
      );

      results.push({
        rawProductName: item.rawProductName,
        quantity: item.quantity,
        unit: item.unit,  // Original unit preserved
        originalUnit: item.unit,  // Explicit backup
        productId: resolution.productId,
        productName: resolution.product?.name,
        resolutionStatus: resolution.status,
        confidence: resolution.confidence,
        matchMethod: resolution.matchMethod
      });
    }

    return results;
  }
}
