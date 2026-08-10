/**
 * Parser package - text parsing and entity extraction.
 */

import { MessageIntent, ResolutionStatus } from '../shared/enums.js';
import { createEmptyProcessingResult, InstructionType, OrderItemCandidate } from '../domain/value-objects/index.js';
import { removeDiacritics } from '../shared/utils.js';

/**
 * Normalize text for comparison.
 */
function normalizeForComparison(text: string): string {
  return removeDiacritics(text.toLowerCase().trim()).replace(/\s+/g, ' ');
}

/**
 * Split message into lines.
 */
function splitIntoLines(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
}

/**
 * Parse quantity from text.
 */
function parseQuantity(text: string): number | null {
  const cleaned = text.replace(/^[:xX×]+/, '').trim();
  const match = cleaned.match(/^(\d+(?:[.,]\d+)?)/);
  if (match) {
    return parseFloat(match[1].replace(',', '.'));
  }
  return null;
}

/**
 * Classify intent of text.
 */
function classifyIntent(text: string): { intent: MessageIntent; confidence: number } {
  const lower = text.toLowerCase();
  
  if (/^kh(?:ỏ|o)\s*gia/i.test(lower) || /^hủy/i.test(lower)) {
    return { intent: MessageIntent.OrderCancellation, confidence: 0.95 };
  }
  
  if (/\d+\s*[:xX×]\s*\d+/.test(text)) {
    return { intent: MessageIntent.Order, confidence: 0.90 };
  }
  
  if (/ck\s*\d+%/i.test(text) || /tiền\s*mặt/i.test(text) || /giao\s+(trong\s+)?ngày/i.test(text)) {
    return { intent: MessageIntent.Order, confidence: 0.75 };
  }
  
  return { intent: MessageIntent.Unknown, confidence: 0.5 };
}

/**
 * Parse product line like "55 bơ:10 cái".
 */
function parseProductLine(line: string, lineNumber: number): OrderItemCandidate | null {
  const patterns = [
    /^(.+?)\s*[:xX×]\s*(\d+(?:[.,]\d+)?)\s*(cái|cai|gói|goi|kg|chai|lộn|lon|bịch|hộp|bx)?\s*$/i,
    /^(\d+(?:[.,]\d+)?)\s+(cái|cai|gói|goi|kg|chai|lộn|lon|bịch|hộp|bx)\s+(.+?)\s*$/i
  ];
  
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const rawProductName = patterns.indexOf(pattern) === 0 ? match[1].trim() : match[3].trim();
      const quantity = patterns.indexOf(pattern) === 0 ? parseQuantity(match[2]) : parseQuantity(match[1]);
      const unit = patterns.indexOf(pattern) === 0 ? (match[3]?.trim() || 'cái') : (match[2]?.trim() || 'cái');
      
      if (quantity !== null && quantity > 0 && rawProductName.length >= 2) {
        return { rawProductName, quantity, unit, resolutionStatus: ResolutionStatus.NeedsReview, lineNumber };
      }
    }
  }
  return null;
}

/**
 * Parse instruction.
 */
function parseInstruction(text: string): any | null {
  const lower = text.toLowerCase().trim();
  
  if (/^(?:ck|chiết\s*khấu)\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/i.test(text)) {
    const match = text.match(/(\d+(?:[.,]\d+)?)/);
    return { type: InstructionType.Discount, rawText: text, numericValue: match ? parseFloat(match[1].replace(',', '.')) / 100 : null };
  }
  
  if (/^tiền\s*mặt$/i.test(lower) || /^cash$/i.test(lower) || /^tm$/i.test(lower)) {
    return { type: InstructionType.Payment, rawText: text, normalizedValue: 'cash', method: 'cash' };
  }
  
  if (/^chuyển\s*khoản$/i.test(lower) || /^ck$/i.test(lower)) {
    return { type: InstructionType.Payment, rawText: text, normalizedValue: 'bank_transfer', method: 'bank_transfer' };
  }
  
  if (/^giao\s+(?:trong\s+)?ngày$/i.test(lower) || /^giao\s+hôm\s+nay$/i.test(lower)) {
    return { type: InstructionType.Delivery, rawText: text, isSameDay: true };
  }
  
  if (/^(?:xuất|xin)\s*(?:hóa\s*)?đơn/i.test(lower) || /^có\s*(?:hóa\s*)?đơn$/i.test(lower)) {
    return { type: InstructionType.Invoice, rawText: text, isSameDay: true };
  }
  
  if (/^khỏi\s*giao$/i.test(lower) || /^hủy$/i.test(lower)) {
    return { type: InstructionType.Cancellation, rawText: text };
  }
  
  return null;
}

/**
 * Extract phone from text.
 */
function extractPhone(text: string): string | null {
  const match = text.match(/(0\d{9,10})/);
  return match ? match[1] : null;
}

/**
 * Extract name from text (in parentheses).
 */
function extractName(text: string): string | null {
  const match = text.match(/\(([^)]+)\)$/);
  return match ? match[1].trim() : null;
}

/**
 * Extract address from text.
 * Matches patterns like:
 * - Đc: <address>
 * - Địa chỉ: <address>
 * - Address: <address>
 */
function extractAddress(text: string): string | null {
  const lower = text.toLowerCase().trim();
  
  // Match "Đc:" or "Địa chỉ:" or similar patterns
  const match = text.match(/^(?:đc|địa\s*chỉ|address)[:\s]+(.+)$/i);
  if (match) {
    return match[1].trim();
  }
  
  // Check if line contains address keywords and is not an instruction
  if (/đường|phường|quận|hcm|hn|tp\.|tp\s/i.test(text) && 
      !/^\d+\s*(?:bơ|thịt|gà|cá|đậu)/i.test(text) &&
      !/:?\s*\d+\s*(?:cái|gói|kg)/i.test(text)) {
    return text.replace(/^(?:đc|địa\s*chỉ|address)\s*/i, '').trim();
  }
  
  return null;
}

/**
 * Parse a raw message and extract structured information.
 */
export function parseMessage(input: { messageId: string; rawText: string; sender?: { name?: string; phone?: string }; receivedAt?: Date; correlationId?: string }): any {
  const correlationId = input.correlationId || `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const startTime = Date.now();
  
  const result = createEmptyProcessingResult(input.messageId, correlationId);
  result.metadata.parserVersion = '1.0.0';
  result.metadata.ruleEngineVersion = '1.0.0';
  
  try {
    const lines = splitIntoLines(input.rawText);
    
    if (lines.length === 0) {
      result.warnings.push({ code: 'EMPTY_MESSAGE', message: 'Message contains no text to parse' });
      return result;
    }
    
    // Classify intent
    let orderCount = 0, cancelCount = 0;
    for (const line of lines) {
      const { intent, confidence } = classifyIntent(line);
      if (intent === MessageIntent.Order) orderCount++;
      if (intent === MessageIntent.OrderCancellation) cancelCount++;
    }
    
    if (cancelCount > 0) {
      result.intent = MessageIntent.OrderCancellation;
      result.intentConfidence = 0.90;
    } else if (orderCount > 0) {
      result.intent = MessageIntent.Order;
      result.intentConfidence = 0.90;
    }
    
    // Extract instructions
    const instructions: any[] = [];
    for (const line of lines) {
      const instruction = parseInstruction(line);
      if (instruction) instructions.push(instruction);
    }
    result.instructions = instructions;
    
    // Extract products
    const items: OrderItemCandidate[] = [];
    for (let i = 0; i < lines.length; i++) {
      // Skip instruction lines
      if (parseInstruction(lines[i])) continue;
      
      const item = parseProductLine(lines[i], i + 1);
      if (item) items.push(item);
    }
    result.items = items;
    
    // Extract customer info
    let rawAddress: string | undefined;
    
    if (input.sender) {
      result.customerInfo = {
        displayName: input.sender.name,
        phone: input.sender.phone,
        resolutionStatus: input.sender.phone ? ResolutionStatus.NeedsReview : ResolutionStatus.Unresolved,
        confidence: input.sender.phone ? 0.7 : 0.3
      };
    } else {
      // Try to extract from text
      for (const line of lines) {
        const phone = extractPhone(line);
        const name = extractName(line);
        const address = extractAddress(line);
        
        if (phone || name || address) {
          result.customerInfo = {
            displayName: name || undefined,
            phone: phone || undefined,
            resolutionStatus: phone ? ResolutionStatus.NeedsReview : ResolutionStatus.Unresolved,
            confidence: phone ? 0.7 : (name ? 0.4 : 0.2)
          };
          if (address) {
            rawAddress = address;
          }
          break;
        }
      }
    }
    
    // Also scan for address in all lines
    if (!rawAddress) {
      for (const line of lines) {
        const address = extractAddress(line);
        if (address) {
          rawAddress = address;
          break;
        }
      }
    }
    
    // Store raw address in metadata for customer resolution
    if (rawAddress) {
      (result as any)._rawAddress = rawAddress;
    }
    
    if (items.length === 0 && instructions.length === 0) {
      result.reviewReasons.push('No products or instructions detected');
    }
    
  } catch (error) {
    result.warnings.push({ code: 'PARSE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' });
  }
  
  result.metadata.processedAt = new Date().toISOString();
  result.metadata.processingDurationMs = Date.now() - startTime;
  
  return result;
}

export { MessageIntent, ResolutionStatus, InstructionType };
