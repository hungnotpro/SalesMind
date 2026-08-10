/**
 * Parser - Message parsing and entity extraction for SalesMind OS.
 */

import { MessageIntent, ResolutionStatus } from '../../shared/enums.js';
import { removeDiacritics } from '../../shared/utils.js';

export function normalizeText(text: string): string {
  return removeDiacritics(text.toLowerCase().trim()).replace(/\s+/g, ' ');
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
}

export function parseQuantity(text: string): number | null {
  const cleaned = text.replace(/^[:xX×]+/, '').trim();
  const match = cleaned.match(/^(\d+(?:[.,]\d+)?)/);
  return match ? parseFloat(match[1].replace(',', '.')) : null;
}

export enum InstructionType {
  Discount = 'discount',
  Payment = 'payment',
  Delivery = 'delivery',
  Invoice = 'invoice',
  Cancellation = 'cancellation'
}

export interface OrderItemCandidate {
  rawProductName: string;
  quantity: number;
  unit: string;
  resolutionStatus: string;
  lineNumber?: number;
}

export interface ProcessingResult {
  messageId: string;
  intent: string;
  intentConfidence: number;
  items: OrderItemCandidate[];
  instructions: any[];
  customerInfo?: any;
  reviewRequired: boolean;
  reviewReasons: string[];
  warnings: any[];
  metadata: any;
}

export function parseMessage(input: { messageId: string; rawText: string; sender?: any }): ProcessingResult {
  const correlationId = `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const startTime = Date.now();
  
  const result: ProcessingResult = {
    messageId: input.messageId,
    intent: MessageIntent.Unknown,
    intentConfidence: 0,
    items: [],
    instructions: [],
    reviewRequired: false,
    reviewReasons: [],
    warnings: [],
    metadata: { processedAt: new Date().toISOString(), parserVersion: '1.0.0', correlationId }
  };
  
  try {
    const lines = splitLines(input.rawText);
    
    if (lines.length === 0) {
      result.warnings.push({ code: 'EMPTY_MESSAGE', message: 'Message contains no text' });
      return result;
    }
    
    // Parse instructions
    for (const line of lines) {
      const lower = line.toLowerCase().trim();
      
      // Discount
      if (/^(?:ck|chiết\s*khấu)\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/i.test(line)) {
        const match = line.match(/(\d+(?:[.,]\d+)?)/);
        result.instructions.push({ type: InstructionType.Discount, rawText: line, numericValue: match ? parseFloat(match[1].replace(',', '.')) / 100 : null });
      }
      // Payment
      else if (/^tiền\s*mặt$|^cash$|^tm$/i.test(lower)) {
        result.instructions.push({ type: InstructionType.Payment, rawText: line, normalizedValue: 'cash' });
      }
      // Delivery
      else if (/^giao\s+(?:trong\s+)?ngày$|^giao\s+hôm\s+nay$/i.test(lower)) {
        result.instructions.push({ type: InstructionType.Delivery, rawText: line, isSameDay: true });
      }
      // Invoice
      else if (/^(?:xuất|xin)\s*(?:hóa\s*)?đơn/i.test(lower) || /^có\s*(?:hóa\s*)?đơn$/i.test(lower)) {
        result.instructions.push({ type: InstructionType.Invoice, rawText: line, isSameDay: true });
      }
      // Cancellation
      else if (/^khỏi\s*giao$|^hủy$/i.test(lower)) {
        result.instructions.push({ type: InstructionType.Cancellation, rawText: line });
      }
      // Product line
      else {
        const productPatterns = [
          /^(.+?)\s*[:xX×]\s*(\d+(?:[.,]\d+)?)\s*(cái|cai|gói|goi|kg|chai|hộp|bx)?\s*$/i,
          /^(\d+(?:[.,]\d+)?)\s+(cái|cai|gói|goi|kg|chai|hộp|bx)\s+(.+?)\s*$/i
        ];
        
        for (const pattern of productPatterns) {
          const match = line.match(pattern);
          if (match) {
            const isReverse = productPatterns.indexOf(pattern) === 1;
            const rawProductName = isReverse ? match[3].trim() : match[1].trim();
            const quantity = parseQuantity(isReverse ? match[1] : match[2]);
            const unit = isReverse ? (match[2]?.trim() || 'cái') : (match[3]?.trim() || 'cái');
            
            if (quantity && quantity > 0 && rawProductName.length >= 2) {
              result.items.push({ rawProductName, quantity, unit, resolutionStatus: ResolutionStatus.NeedsReview });
              break;
            }
          }
        }
      }
    }
    
    // Determine intent
    if (result.instructions.some((i: any) => i.type === InstructionType.Cancellation)) {
      result.intent = MessageIntent.OrderCancellation;
      result.intentConfidence = 0.90;
    } else if (result.items.length > 0) {
      result.intent = MessageIntent.Order;
      result.intentConfidence = 0.90;
    }
    
    // Extract customer info
    if (input.sender?.name || input.sender?.phone) {
      result.customerInfo = {
        displayName: input.sender.name,
        phone: input.sender.phone,
        resolutionStatus: input.sender.phone ? ResolutionStatus.NeedsReview : ResolutionStatus.Unresolved
      };
    }
    
    // Check review requirements
    if (result.items.length === 0 && result.instructions.length === 0) {
      result.reviewReasons.push('No products or instructions detected');
      result.reviewRequired = true;
    }
    
  } catch (error) {
    result.warnings.push({ code: 'PARSE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' });
  }
  
  result.metadata.processingDurationMs = Date.now() - startTime;
  return result;
}

export { MessageIntent, ResolutionStatus, InstructionType };
