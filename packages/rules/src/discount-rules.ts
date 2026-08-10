/**
 * Discount rules - handle discount parsing and validation.
 */

import { InstructionType } from '../../../domain/src/value-objects/ExtractedInstruction.js';

export const MAX_DISCOUNT_RATE = 0.5;
export const MIN_DISCOUNT_RATE = 0;

export function isValidDiscountRate(rate: number): boolean {
  return rate >= MIN_DISCOUNT_RATE && rate <= MAX_DISCOUNT_RATE;
}

export function parseDiscount(instruction: any): number | null {
  if (instruction.type !== InstructionType.Discount) {
    return null;
  }

  const rate = instruction.numericValue;
  if (rate === undefined || rate === null) {
    return null;
  }

  if (rate > 1) {
    return rate / 100;
  }

  return rate;
}

export function formatDiscountRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

export function extractDiscount(instructions: any[]) {
  const discountInstruction = instructions.find((i: any) => i.type === InstructionType.Discount);

  if (!discountInstruction) {
    return { rate: null, source: null };
  }

  const rate = parseDiscount(discountInstruction);
  
  if (rate !== null && !isValidDiscountRate(rate)) {
    return { rate: null, source: discountInstruction.rawText };
  }

  return {
    rate,
    source: discountInstruction.rawText
  };
}
