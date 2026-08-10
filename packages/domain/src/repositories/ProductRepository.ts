import { Product, ProductAlias } from '../entities/Product.js';

export interface IProductRepository {
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  listActive(): Promise<Product[]>;
  save(product: Product): Promise<void>;
  update(product: Product): Promise<void>;
}

export interface IProductAliasRepository {
  findByExactAlias(alias: string): Promise<ProductAlias | null>;
  findByNormalizedAlias(normalized: string): Promise<ProductAlias[]>;
  findByProductId(productId: string): Promise<ProductAlias[]>;
  findByCustomerId(customerId: string): Promise<ProductAlias[]>;
  save(alias: ProductAlias): Promise<void>;
  update(alias: ProductAlias): Promise<void>;
  listVerifiedGlobal(): Promise<ProductAlias[]>;
}
