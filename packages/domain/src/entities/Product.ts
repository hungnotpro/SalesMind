/**
 * Product entity - canonical catalog item.
 */

export interface Product {
  id: string;
  sku: string;
  name: string;
  normalizedName: string;
  category?: string;
  defaultUnit: string;
  packaging?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  category?: string;
  defaultUnit?: string;
  packaging?: string;
}

export function normalizeProductName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function validateCreateProduct(input: unknown): CreateProductInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Product input must be an object');
  }

  const i = input as Record<string, unknown>;

  if (typeof i.sku !== 'string' || !i.sku.trim()) {
    throw new Error('SKU is required');
  }

  if (typeof i.name !== 'string' || !i.name.trim()) {
    throw new Error('Product name is required');
  }

  return {
    sku: i.sku.trim(),
    name: i.name.trim(),
    category: i.category?.toString().trim(),
    defaultUnit: i.defaultUnit?.toString().trim() || 'cái',
    packaging: i.packaging?.toString().trim()
  };
}
