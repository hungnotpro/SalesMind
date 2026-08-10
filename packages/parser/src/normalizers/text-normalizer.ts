/**
 * Normalizers - clean and prepare text for extraction.
 */

import { removeDiacritics } from '../../../shared/src/utils.js';

export function normalizeForExtraction(text: string) {
  const trimmed = text.trim();
  
  return {
    normalized: trimmed,
    comparisonText: normalizeForComparison(trimmed)
  };
}

export function normalizeForComparison(text: string): string {
  return removeDiacritics(text.toLowerCase().trim()).replace(/\s+/g, ' ');
}

export function splitIntoLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function cleanPhrase(phrase: string): string {
  return phrase.trim().replace(/\s+/g, ' ');
}

export function extractNumericValue(text: string): number | null {
  const cleaned = text.replace(/^[:xX×]+/, '').trim();
  const match = cleaned.match(/^(\d+(?:[.,]\d+)?)/);
  if (match) {
    const numStr = match[1].replace(',', '.');
    const num = parseFloat(numStr);
    return isNaN(num) ? null : num;
  }
  return null;
}
