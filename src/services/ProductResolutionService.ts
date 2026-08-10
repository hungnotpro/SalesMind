/**
 * Product resolution service - resolve product aliases to canonical products.
 */

import { IProductRepository, IProductAliasRepository } from '@salesmind/domain';
import { ProductAlias, AliasResolutionResult } from '@salesmind/domain';
import { ResolutionStatus, AliasSource } from '@salesmind/shared';
import { normalizeAlias, createOrderItemCandidate, OrderItemCandidate } from '@salesmind/domain';

export interface ResolutionConfig {
  autoResolveThreshold: number;
  fuzzyMatchEnabled: boolean;
}

/**
 * Default resolution configuration.
 */
export const DEFAULT_RESOLUTION_CONFIG: ResolutionConfig = {
  autoResolveThreshold: 0.95,
  fuzzyMatchEnabled: true
};

/**
 * Resolution match methods.
 */
type MatchMethod = 'exact' | 'normalized' | 'fuzzy' | 'none';

export class ProductResolutionService {
  constructor(
    private productRepository: IProductRepository,
    private aliasRepository: IProductAliasRepository
  ) {}

  /**
   * Resolve a raw product alias to a canonical product.
   * 
   * Resolution pipeline:
   * 1. Exact match
   * 2. Normalized match
   * 3. Fuzzy match (if enabled)
   * 4. Return unresolved
   */
  async resolve(
    rawAlias: string,
    customerId?: string,
    config: ResolutionConfig = DEFAULT_RESOLUTION_CONFIG
  ): Promise<AliasResolutionResult> {
    const normalizedInput = normalizeAlias(rawAlias);

    // Step 1: Exact match
    const exactMatch = await this.aliasRepository.findByExactAlias(rawAlias);
    if (exactMatch && this.isValidMatch(exactMatch, customerId)) {
      return this.toResolutionResult(exactMatch, 'exact', config);
    }

    // Step 2: Normalized match
    const normalizedMatches = await this.aliasRepository.findByNormalizedAlias(normalizedInput);
    const normalizedMatch = normalizedMatches.find((alias) => 
      this.isValidMatch(alias, customerId)
    );
    if (normalizedMatch) {
      return this.toResolutionResult(normalizedMatch, 'normalized', config);
    }

    // Step 3: Customer-specific match
    if (customerId) {
      const customerAliases = await this.aliasRepository.findByCustomerId(customerId);
      const customerMatch = customerAliases.find((alias) => {
        const aliasNormalized = normalizeAlias(alias.alias);
        return aliasNormalized === normalizedInput && alias.verified;
      });
      if (customerMatch) {
        return this.toResolutionResult(customerMatch, 'exact', config);
      }
    }

    // Step 4: No match found
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
    customerId?: string,
    config: ResolutionConfig = DEFAULT_RESOLUTION_CONFIG
  ): Promise<AliasResolutionResult[]> {
    const results: AliasResolutionResult[] = [];

    for (const alias of aliases) {
      const result = await this.resolve(alias, customerId, config);
      results.push(result);
    }

    return results;
  }

  /**
   * Resolve order item candidates.
   */
  async resolveItems(
    items: OrderItemCandidate[],
    customerId?: string,
    config: ResolutionConfig = DEFAULT_RESOLUTION_CONFIG
  ): Promise<OrderItemCandidate[]> {
    const resolved: OrderItemCandidate[] = [];

    for (const item of items) {
      const result = await this.resolve(item.rawProductName, customerId, config);

      resolved.push({
        ...item,
        productId: result.productId,
        productName: result.productName,
        resolutionStatus: result.status,
        resolutionConfidence: result.confidence
      });
    }

    return resolved;
  }

  /**
   * Check if an alias match is valid for the given context.
   */
  private isValidMatch(alias: ProductAlias, customerId?: string): boolean {
    // Verified aliases are always valid
    if (alias.verified) {
      return true;
    }

    // Customer-specific aliases need to match customer
    if (alias.customerId) {
      return alias.customerId === customerId;
    }

    // Non-verified global aliases have lower confidence
    return alias.confidence >= 0.8;
  }

  /**
   * Convert alias to resolution result.
   */
  private async toResolutionResult(
    alias: ProductAlias,
    matchMethod: MatchMethod,
    config: ResolutionConfig
  ): Promise<AliasResolutionResult> {
    // Get the product for name
    const product = await this.productRepository.findById(alias.productId);
    const productName = product?.name;

    // Determine status based on confidence and verification
    let status: ResolutionStatus;
    if (alias.verified && alias.confidence >= config.autoResolveThreshold) {
      status = ResolutionStatus.Resolved;
    } else if (alias.verified || alias.confidence >= config.autoResolveThreshold) {
      status = ResolutionStatus.NeedsReview;
    } else {
      status = ResolutionStatus.NeedsReview;
    }

    return {
      productId: alias.productId,
      productName,
      status,
      confidence: alias.confidence,
      matchMethod,
      aliasId: alias.id
    };
  }
}
