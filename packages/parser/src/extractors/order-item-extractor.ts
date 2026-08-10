/**
 * Order item extractor - parse product lines from message text.
 */

import { ResolutionStatus } from '../../../shared/src/enums.js';
import { createOrderItemCandidate } from '../../../domain/src/value-objects/OrderItemCandidate.js';
import { cleanPhrase, extractNumericValue } from '../normalizers/text-normalizer.js';

export interface ExtractedProductLine {
  rawProductName: string;
  quantity: number;
  unit: string;
  quantityText: string;
  lineText: string;
  lineNumber: number;
}

interface ProductLinePattern {
  pattern: RegExp;
  extractProduct: (match: RegExpMatchArray) => string;
  extractQuantity: (match: RegExpMatchArray) => number | null;
  extractUnit: (match: RegExpMatchArray) => string;
}

const PRODUCT_LINE_PATTERNS: ProductLinePattern[] = [
  {
    pattern: /^(.+?)\s*[:xX×=]\s*(\d+(?:[.,]\d+)?)\s*(cái|cai|caisse|goi|gói|kg|chai|lộn|lon|bịch|hộp|bx|pack|lần)?\s*$/i,
    extractProduct: (m) => cleanPhrase(m[1]),
    extractQuantity: (m) => extractNumericValue(m[2]),
    extractUnit: (m) => cleanPhrase(m[3] || 'cái')
  },
  {
    pattern: /^(\d+(?:[.,]\d+)?)\s*(cái|cai|caisse|goi|gói|kg|chai|lộn|lon|bịch|hộp|bx|pack)?\s+(.+?)\s*$/i,
    extractProduct: (m) => cleanPhrase(m[3]),
    extractQuantity: (m) => extractNumericValue(m[1]),
    extractUnit: (m) => cleanPhrase(m[2] || 'cái')
  },
  {
    pattern: /^(.+?)\s*x\s*(\d+(?:[.,]\d+)?)\s*$/i,
    extractProduct: (m) => cleanPhrase(m[1]),
    extractQuantity: (m) => extractNumericValue(m[2]),
    extractUnit: () => 'cái'
  },
  {
    pattern: /^(.+?)\s*[:xX×]\s*(\d+(?:[.,]\d+)?)\s*$/i,
    extractProduct: (m) => cleanPhrase(m[1]),
    extractQuantity: (m) => extractNumericValue(m[2]),
    extractUnit: () => 'cái'
  }
];

const UNIT_VARIATIONS: Record<string, string> = {
  'cái': 'cái', 'cai': 'cái', 'caisse': 'caisse', 'goi': 'gói', 'gói': 'gói',
  'kg': 'kg', 'chai': 'chai', 'lộn': 'lộn', 'lon': 'lon', 'bịch': 'bịch',
  'hộp': 'hộp', 'bx': 'hộp', 'pack': 'pack'
};

export function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return UNIT_VARIATIONS[lower] || unit;
}

export function extractProductLines(lines: string[]): ExtractedProductLine[] {
  const products: ExtractedProductLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const result = parseProductLine(line, i + 1);
    if (result) {
      products.push(result);
    }
  }

  return products;
}

export function parseProductLine(line: string, lineNumber: number = 0): ExtractedProductLine | null {
  const trimmed = line.trim();
  
  if (!trimmed) {
    return null;
  }

  for (const patternDef of PRODUCT_LINE_PATTERNS) {
    const match = trimmed.match(patternDef.pattern);
    if (match) {
      const rawProductName = patternDef.extractProduct(match);
      const quantity = patternDef.extractQuantity(match);
      const unit = normalizeUnit(patternDef.extractUnit(match));

      if (quantity === null || quantity <= 0) {
        continue;
      }

      if (rawProductName.length < 2) {
        continue;
      }

      return {
        rawProductName,
        quantity,
        unit,
        quantityText: match[2] || String(quantity),
        lineText: trimmed,
        lineNumber
      };
    }
  }

  return null;
}

export function toOrderItemCandidates(
  productLines: ExtractedProductLine[],
  defaultResolutionStatus: ResolutionStatus = ResolutionStatus.NeedsReview
) {
  return productLines.map((line) =>
    createOrderItemCandidate({
      rawProductName: line.rawProductName,
      quantity: line.quantity,
      unit: line.unit,
      resolutionStatus: defaultResolutionStatus,
      lineNumber: line.lineNumber
    })
  );
}

export function isProductLine(line: string): boolean {
  return parseProductLine(line) !== null;
}

export function mightBeProductLine(line: string): boolean {
  const trimmed = line.trim();
  
  if (!trimmed) {
    return false;
  }

  if (trimmed.length > 100) {
    return false;
  }

  if (/[:xX×=]/.test(trimmed)) {
    return true;
  }

  if (/(?:cái|cai|caisse|goi|gói|kg|chai|lộn|lon|bịch|hộp|bx|pack)$/i.test(trimmed)) {
    return true;
  }

  return false;
}
