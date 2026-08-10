/**
 * Utility functions and helpers.
 */

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizeVietnamese(text: string): string {
  return removeDiacritics(text.toLowerCase().trim());
}

export function removeDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function generateIdempotencyKey(source: string, externalId: string): string {
  return `${source}:${externalId}`;
}

export function parseQuantity(input: unknown): number | null {
  if (input === null || input === undefined) {
    return null;
  }
  const str = String(input).trim();
  const fractionMatch = str.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const numerator = parseFloat(fractionMatch[1]);
    const denominator = parseFloat(fractionMatch[2]);
    if (denominator !== 0) {
      return numerator / denominator;
    }
    return null;
  }
  const normalizedStr = str.startsWith(',') ? `0${str}` : str;
  const parsed = parseFloat(normalizedStr);
  return isNaN(parsed) ? null : parsed;
}

export function isValidQuantity(quantity: unknown): boolean {
  const q = parseQuantity(quantity);
  return q !== null && q > 0 && Number.isFinite(q);
}

export function parsePercentage(input: string): number | null {
  const str = input.trim().replace(/%$/, '');
  const parsed = parseFloat(str);
  return isNaN(parsed) || parsed < 0 || parsed > 100 ? null : parsed / 100;
}

export function formatISODate(date: Date): string {
  return date.toISOString();
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

export function safeClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function isEmptyString(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh';
