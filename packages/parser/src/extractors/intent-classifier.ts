import { MessageIntent } from '../../../shared/src/enums.js';

export interface IntentClassification {
  intent: MessageIntent;
  confidence: number;
  reasoning?: string;
}

interface IntentPattern {
  intent: MessageIntent;
  patterns: RegExp[];
  keywords: string[];
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: MessageIntent.OrderCancellation,
    patterns: [/^kh(o|ô)i\s+giao/i, /^h(u|ủ)y(\s|$)/i, /^kh(o|ô)ng\s+l(ấ|ea)\y+n(ữa)?$/i, /^b(ỏ|h)|，取消/i, /^cancel/i],
    keywords: ['khỏi giao', 'hủy', 'không lấy nữa', 'bỏ', '取消', 'cancel']
  },
  {
    intent: MessageIntent.Order,
    patterns: [/^\d+\s*[xg:×:]\s*\d+/, /^\d+\s+\w+\s*:\s*\d+/, /^[0-9,.]+\s*(cái|caisse|cai|gói|goi|kg|chai|lộn|lon|bịch|hộp|bx)$/i],
    keywords: ['đặt', 'mua', 'order', 'lấy', 'cho']
  },
  {
    intent: MessageIntent.Task,
    patterns: [/^giao\s+/i, /^nhận\s+/i, /^làm\s+/i, /^xong\s+/i],
    keywords: ['giao', 'nhận', 'làm', 'xong', 'trả']
  }
];

function containsCommercialInstruction(text: string): boolean {
  const instructionPatterns = [
    /ck\s*\d+%/i, /chi(ế|t){1}\s*kh(ấ|u){1}\s*\d+%/i, /tiền\s*mặt/i, /chuyển\s*khoản/i,
    /giao\s+(trong\s+)?ngày/i, /giao\s+hôm\s+nay/i, /hóa\s*đơn/i, /xuất\s+(hóa\s+)?đơn/i
  ];
  return instructionPatterns.some((pattern) => pattern.test(text));
}

export function classifyIntent(text: string): IntentClassification {
  const trimmed = text.trim();
  const lowerText = trimmed.toLowerCase();

  const cancellationPattern = INTENT_PATTERNS.find(p => p.intent === MessageIntent.OrderCancellation);
  if (cancellationPattern) {
    for (const pattern of cancellationPattern.patterns) {
      if (pattern.test(trimmed)) {
        return { intent: MessageIntent.OrderCancellation, confidence: 0.95, reasoning: 'Explicit cancellation pattern matched' };
      }
    }
  }

  const orderPattern = INTENT_PATTERNS.find(p => p.intent === MessageIntent.Order);
  if (orderPattern) {
    for (const pattern of orderPattern.patterns) {
      if (pattern.test(trimmed)) {
        return { intent: MessageIntent.Order, confidence: 0.90, reasoning: 'Order item pattern detected' };
      }
    }
  }

  for (const keyword of orderPattern?.keywords || []) {
    if (lowerText.includes(keyword)) {
      return { intent: MessageIntent.Order, confidence: 0.85, reasoning: `Order keyword detected: ${keyword}` };
    }
  }

  const taskPattern = INTENT_PATTERNS.find(p => p.intent === MessageIntent.Task);
  for (const keyword of taskPattern?.keywords || []) {
    if (lowerText.includes(keyword)) {
      return { intent: MessageIntent.Task, confidence: 0.80, reasoning: `Task keyword detected: ${keyword}` };
    }
  }

  if (containsCommercialInstruction(trimmed)) {
    return { intent: MessageIntent.Order, confidence: 0.75, reasoning: 'Commercial instructions present' };
  }

  return { intent: MessageIntent.Unknown, confidence: 0.5, reasoning: 'No specific pattern matched' };
}

export function classifyMessageIntent(lines: string[]): IntentClassification {
  if (lines.length === 0) {
    return { intent: MessageIntent.Unknown, confidence: 0 };
  }

  const intentCounts = new Map<MessageIntent, number>();
  
  for (const line of lines) {
    const classification = classifyIntent(line);
    const current = intentCounts.get(classification.intent) || 0;
    intentCounts.set(classification.intent, current + 1);
  }

  let maxCount = 0;
  let dominantIntent = MessageIntent.Unknown;

  for (const [intent, count] of intentCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantIntent = intent;
    }
  }

  const hasOrderItems = intentCounts.get(MessageIntent.Order)! > 0;
  const hasCancellation = intentCounts.get(MessageIntent.OrderCancellation)! > 0;

  if (hasCancellation) {
    return { intent: MessageIntent.OrderCancellation, confidence: 0.90, reasoning: 'Cancellation detected in message' };
  }

  if (hasOrderItems) {
    return { intent: MessageIntent.Order, confidence: 0.90, reasoning: 'Order items detected in message' };
  }

  if (maxCount > 0) {
    const confidence = Math.min(0.7, (maxCount / lines.length) * 0.9);
    return { intent: dominantIntent, confidence, reasoning: `Most common intent: ${dominantIntent}` };
  }

  return { intent: MessageIntent.Unknown, confidence: 0.3, reasoning: 'No clear intent pattern' };
}
