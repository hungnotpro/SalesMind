/**
 * ProductAlias entity.
 */

import { AliasSource, ResolutionStatus } from '../shared/enums.js';

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

export function normalizeAlias(alias: string): string {
  return alias.toLowerCase().trim().replace(/\s+/g, ' ');
}

export interface AliasResolutionResult {
  productId?: string;
  productName?: string;
  status: ResolutionStatus;
  confidence: number;
  matchMethod: 'exact' | 'normalized' | 'fuzzy' | 'none';
  aliasId?: string;
}
