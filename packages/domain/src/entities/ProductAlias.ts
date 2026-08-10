/**
 * ProductAlias entity - maps informal language to canonical Product.
 */

import { AliasSource, ResolutionStatus } from '../../shared/src/enums.js';

export interface ProductAlias {
  id: string;
  productId: string;
  customerId?: string;
  alias: string;
  normalizedAlias: string;
  source: AliasSource;
  verified: boolean;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductAliasInput {
  productId: string;
  customerId?: string;
  alias: string;
  source: AliasSource;
  verified?: boolean;
  confidence?: number;
}

export interface ProductAliasMatch {
  alias: ProductAlias;
  matchScore: number;
  matchMethod: 'exact' | 'normalized' | 'fuzzy';
}

export function normalizeAlias(alias: string): string {
  return alias.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function validateCreateAlias(input: unknown): CreateProductAliasInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Alias input must be an object');
  }

  const i = input as Record<string, unknown>;

  if (typeof i.productId !== 'string' || !i.productId.trim()) {
    throw new Error('Product ID is required');
  }

  if (typeof i.alias !== 'string' || !i.alias.trim()) {
    throw new Error('Alias text is required');
  }

  const confidence = i.confidence as number | undefined;
  if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
    throw new Error('Confidence must be between 0 and 1');
  }

  return {
    productId: i.productId.trim(),
    customerId: i.customerId?.toString().trim(),
    alias: i.alias.trim(),
    source: (i.source as AliasSource) || AliasSource.Global,
    verified: Boolean(i.verified),
    confidence: confidence ?? 1.0
  };
}

export interface AliasResolutionResult {
  productId?: string;
  productName?: string;
  status: ResolutionStatus;
  confidence: number;
  matchMethod: 'exact' | 'normalized' | 'fuzzy' | 'none';
  aliasId?: string;
}
