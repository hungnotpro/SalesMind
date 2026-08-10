/**
 * Instruction extractor - parse commercial instructions from message text.
 */

import { PaymentMethod } from '../../../shared/src/enums.js';
import { InstructionType } from '../../../domain/src/value-objects/ExtractedInstruction.js';

export interface ExtractedInstructionResult {
  instructions: any[];
  lineMap: Map<number, any>;
}

const DISCOUNT_PATTERNS = [
  /^(?:ck|chi(?:ế|t){1}\s*kh(?:ấ|u){1})\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/i,
  /^(?:giảm|discount)\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/i
];

const PAYMENT_PATTERNS = [
  /^tiền\s*mặt\s*$/i, /^cash\s*$/i, /^tm\s*$/i,
  /^chuyển\s*khoản\s*$/i, /^ck\s*(?:nợ)?$/i, /^bank\s*transfer\s*$/i
];

const DELIVERY_PATTERNS = [
  /^giao\s+(?:trong\s+)?ngày\s*$/i, /^giao\s+hôm\s+nay\s*$/i,
  /^giao\s+hôm\s+này\s*$/i, /^giao\s+ngay\s*$/i, /^ship\s+same\s*day\s*$/i
];

const INVOICE_PATTERNS = [
  /^(?:xuất|xin)\s*(?:hóa\s*)?đơn\s+(?:trong\s+)?ngày\s*$/i,
  /^(?:hóa\s*)?đơn\s+(?:trong\s+)?ngày\s*$/i, /^invoice\s+(?:today|same\s*day)\s*$/i
];

const CANCELLATION_PATTERNS = [
  /^kh(?:ỏ|o)\s*gia[yo]\s*$/i, /^hủy\s*$/i, /^bỏ\s*$/i,
  /^không\s+lấy\s*(?:nữa)?\s*$/i, /^không\s*cần\s*(?:nữa)?\s*$/i
];

function parseDiscount(text: string, match: RegExpMatchArray) {
  const rateStr = match[1];
  const rate = parseFloat(rateStr.replace(',', '.')) / 100;
  
  return {
    type: InstructionType.Discount,
    rawText: text,
    normalizedValue: `CK ${rate * 100}%`,
    numericValue: isNaN(rate) ? undefined : rate,
    isSameDay: false
  };
}

function parsePayment(text: string) {
  const lower = text.toLowerCase().trim();
  let method = PaymentMethod.Other;
  let normalizedValue = text;

  if (/^tiền\s*mặt$/.test(lower) || /^cash$/.test(lower) || /^tm$/.test(lower)) {
    method = PaymentMethod.Cash;
    normalizedValue = 'cash';
  } else if (/^chuyển\s*khoản$/.test(lower) || /^ck$/.test(lower)) {
    method = PaymentMethod.BankTransfer;
    normalizedValue = 'bank_transfer';
  }

  return { type: InstructionType.Payment, rawText: text, normalizedValue, method, isSameDay: false };
}

function parseDelivery(text: string) {
  return {
    type: InstructionType.Delivery,
    rawText: text,
    normalizedValue: 'same_day',
    isSameDay: true,
    targetDate: new Date()
  };
}

function parseInvoice(text: string) {
  return {
    type: InstructionType.Invoice,
    rawText: text,
    normalizedValue: 'required_same_day',
    isSameDay: true,
    targetDate: new Date(),
    numericValue: 1
  };
}

function parseCancellation(text: string) {
  return { type: InstructionType.Cancellation, rawText: text, normalizedValue: 'cancel' };
}

export function parseInstruction(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const pattern of DISCOUNT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) return parseDiscount(trimmed, match);
  }

  for (const pattern of PAYMENT_PATTERNS) {
    if (pattern.test(trimmed)) return parsePayment(trimmed);
  }

  for (const pattern of DELIVERY_PATTERNS) {
    if (pattern.test(trimmed)) return parseDelivery(trimmed);
  }

  for (const pattern of INVOICE_PATTERNS) {
    if (pattern.test(trimmed)) return parseInvoice(trimmed);
  }

  for (const pattern of CANCELLATION_PATTERNS) {
    if (pattern.test(trimmed)) return parseCancellation(trimmed);
  }

  return null;
}

export function extractInstructions(lines: string[]) {
  const instructions: any[] = [];
  const lineMap = new Map<number, any>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const instruction = parseInstruction(line);
    if (instruction) {
      instructions.push(instruction);
      lineMap.set(i + 1, instruction);
    }
  }

  return { instructions, lineMap };
}

export function isInstructionLine(line: string): boolean {
  return parseInstruction(line) !== null;
}

export function filterInstructionsFromProducts(lines: string[]) {
  const productLines: string[] = [];
  const instructionLines: string[] = [];

  for (const line of lines) {
    if (isInstructionLine(line)) {
      instructionLines.push(line);
    } else {
      productLines.push(line);
    }
  }

  return { productLines, instructionLines };
}
