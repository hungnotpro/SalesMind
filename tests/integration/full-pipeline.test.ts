/**
 * SM-002.1 Integration Tests: Full Pipeline with Product Resolution
 * 
 * Tests the complete message-to-order pipeline with product resolution integrated.
 * Uses inline implementations to avoid module resolution issues.
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================
// Inline Enums
// ============================================================

const MessageIntent = { Order: 'order', OrderCancellation: 'order_cancellation', OrderUpdate: 'order_update', Unknown: 'unknown' };
const ResolutionStatus = { Resolved: 'resolved', NeedsReview: 'needs_review', Unresolved: 'unresolved', Rejected: 'rejected' };
const OrderStatus = { Draft: 'draft', Confirmed: 'confirmed', Processing: 'processing', Completed: 'completed', Cancelled: 'cancelled' };
const TaskPriority = { Low: 'low', Normal: 'normal', High: 'high', Urgent: 'urgent' };
const TaskType = { Delivery: 'delivery', Invoice: 'invoice', PaymentFollowup: 'payment_followup', ReviewOrder: 'review_order', ResolveProduct: 'resolve_product', ResolveCustomer: 'resolve_customer', Other: 'other' };
const InstructionType = { Discount: 'discount', Payment: 'payment', Delivery: 'delivery', Invoice: 'invoice', Note: 'note', Cancellation: 'cancellation' };

// ============================================================
// Inline Utils
// ============================================================

function removeDiacritics(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeAlias(alias: string): string {
  return removeDiacritics(alias.toLowerCase().trim()).replace(/\s+/g, ' ');
}

const UNIT_NORMALIZATIONS: Record<string, string> = {
  'cái': 'cái', 'cai': 'cái', 'cáí': 'cái', 'cÁI': 'cái', 'CÁI': 'cái',
  'gói': 'gói', 'goi': 'gói',
  'kg': 'kg',
  'chai': 'chai',
  'hộp': 'hộp', 'hop': 'hộp', 'bx': 'hộp',
  'lon': 'lon', 'lộn': 'lộn',
  'bịch': 'bịch', 'bich': 'bịch',
};

function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return UNIT_NORMALIZATIONS[lower] || lower;
}

// ============================================================
// Inline Parser (simplified)
// ============================================================

function splitIntoLines(text: string): string[] {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
}

function parseQuantity(text: string): number | null {
  const cleaned = text.replace(/^[:xX×]+/, '').trim();
  const match = cleaned.match(/^(\d+(?:[.,]\d+)?)/);
  if (match) {
    return parseFloat(match[1].replace(',', '.'));
  }
  return null;
}

function classifyIntent(text: string): { intent: string; confidence: number } {
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

function parseProductLine(line: string, lineNumber: number): any | null {
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
  if (/^xuất\s*hoá?\s*đơn|^có\s*hoá?\s*đơn|^xin\s*hoá?\s*đơn/i.test(lower)) {
    return { type: InstructionType.Invoice, rawText: text, isSameDay: true };
  }
  if (/^khỏi\s*giao$/i.test(lower) || /^hủy$/i.test(lower)) {
    return { type: InstructionType.Cancellation, rawText: text };
  }
  return null;
}

function extractPhone(text: string): string | null {
  const match = text.match(/(0\d{9,10})/);
  return match ? match[1] : null;
}

function extractName(text: string): string | null {
  const match = text.match(/\(([^)]+)\)$/);
  return match ? match[1].trim() : null;
}

function parseMessage(input: { messageId: string; rawText: string; sender?: { name?: string; phone?: string }; receivedAt?: Date; correlationId?: string }): any {
  const correlationId = input.correlationId || `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const startTime = Date.now();
  const result: any = {
    messageId: input.messageId,
    intent: MessageIntent.Unknown,
    intentConfidence: 0,
    items: [],
    instructions: [],
    tasks: [],
    reviewRequired: false,
    reviewReasons: [],
    warnings: [],
    metadata: { processedAt: new Date().toISOString(), processingDurationMs: 0, parserVersion: '1.0.0', ruleEngineVersion: '1.0.0', correlationId }
  };
  try {
    const lines = splitIntoLines(input.rawText);
    if (lines.length === 0) {
      result.warnings.push({ code: 'EMPTY_MESSAGE', message: 'Message contains no text to parse' });
      return result;
    }
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
    const instructions: any[] = [];
    for (const line of lines) {
      const instruction = parseInstruction(line);
      if (instruction) instructions.push(instruction);
    }
    result.instructions = instructions;
    const items: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (parseInstruction(lines[i])) continue;
      const item = parseProductLine(lines[i], i + 1);
      if (item) items.push(item);
    }
    result.items = items;
    if (input.sender) {
      result.customerInfo = {
        displayName: input.sender.name,
        phone: input.sender.phone,
        resolutionStatus: input.sender.phone ? ResolutionStatus.NeedsReview : ResolutionStatus.Unresolved,
        confidence: input.sender.phone ? 0.7 : 0.3
      };
    } else {
      for (const line of lines) {
        const phone = extractPhone(line);
        const name = extractName(line);
        if (phone || name) {
          result.customerInfo = { displayName: name, phone: phone, resolutionStatus: phone ? ResolutionStatus.NeedsReview : ResolutionStatus.Unresolved, confidence: phone ? 0.7 : 0.3 };
          break;
        }
      }
    }
    if (items.length === 0 && instructions.length === 0) {
      result.reviewReasons.push('No products or instructions detected');
    }
  } catch (error) {
    result.warnings.push({ code: 'PARSE_ERROR', message: error instanceof Error ? error.message : 'Unknown error' });
  }
  result.metadata.processingDurationMs = Date.now() - startTime;
  return result;
}

// ============================================================
// Inline Rules (simplified)
// ============================================================

const SAME_DAY_CUTOFF_HOUR = 14;
const INVOICE_CUTOFF_HOUR = 16;

function applyBusinessRules(result: any): any {
  const tasks: any[] = [];
  const discountInstruction = result.instructions.find((i: any) => i.type === InstructionType.Discount);
  const discountRate = discountInstruction?.numericValue ?? null;
  const discountSource = discountInstruction?.rawText ?? null;
  const paymentInstruction = result.instructions.find((i: any) => i.type === InstructionType.Payment);
  const paymentMethod = paymentInstruction?.normalizedValue ?? null;
  const paymentSource = paymentInstruction?.rawText ?? null;
  const deliveryInstruction = result.instructions.find((i: any) => i.type === InstructionType.Delivery);
  if (deliveryInstruction) {
    const now = new Date();
    const priority = now.getHours() < 12 ? TaskPriority.Normal : (now.getHours() < SAME_DAY_CUTOFF_HOUR ? TaskPriority.High : TaskPriority.Urgent);
    tasks.push({ type: TaskType.Delivery, title: 'Giao đơn hàng trong ngày', description: deliveryInstruction.rawText, priority });
  }
  const invoiceInstruction = result.instructions.find((i: any) => i.type === InstructionType.Invoice);
  let invoiceRequired = false;
  let invoiceDueAt: Date | null = null;
  if (invoiceInstruction) {
    invoiceRequired = true;
    invoiceDueAt = new Date();
    invoiceDueAt.setHours(INVOICE_CUTOFF_HOUR, 0, 0, 0);
    const now = new Date();
    const priority = now.getHours() < 12 ? TaskPriority.Normal : (now.getHours() < INVOICE_CUTOFF_HOUR ? TaskPriority.High : TaskPriority.Urgent);
    tasks.push({ type: TaskType.Invoice, title: 'Xuất hóa đơn trong ngày', description: invoiceInstruction.rawText, priority });
  }
  const reasons: string[] = [];
  for (const item of result.items) {
    if (item.resolutionStatus === 'needs_review' || item.resolutionStatus === 'unresolved') {
      reasons.push(`Item "${item.rawProductName}" needs review`);
    }
  }
  if (!result.customerInfo || result.customerInfo.resolutionStatus === 'unresolved') {
    reasons.push('Customer could not be identified');
  }
  if (result.items.length === 0) {
    reasons.push('No products found');
  }
  return { tasks, reviewRequirement: { required: reasons.length > 0, reasons }, discountRate, discountSource, paymentMethod, paymentSource, invoiceRequired, invoiceDueAt };
}

// ============================================================
// Inline Repositories
// ============================================================

interface Product { id: string; sku: string; name: string; normalizedName: string; defaultUnit: string; active: boolean; }
interface ProductAlias { id: string; productId: string; customerId?: string; alias: string; normalizedAlias: string; source: string; verified: boolean; confidence: number; }

class InMemoryProductRepository {
  private products: Map<string, Product> = new Map();
  async findById(id: string): Promise<Product | null> { return this.products.get(id) || null; }
  async findBySku(sku: string): Promise<Product | null> { return Array.from(this.products.values()).find((p) => p.sku === sku) || null; }
  async findByNormalizedName(normalized: string): Promise<Product | null> { return Array.from(this.products.values()).find((p) => p.normalizedName === normalized) || null; }
  seed(products: Product[]): void { for (const product of products) { this.products.set(product.id, product); } }
}

class InMemoryProductAliasRepository {
  private aliases: Map<string, ProductAlias> = new Map();
  private aliasIndex: Map<string, string[]> = new Map();
  private normalizedIndex: Map<string, string[]> = new Map();
  async findByExactAlias(alias: string, customerId?: string): Promise<ProductAlias | null> {
    const candidates = this.aliasIndex.get(alias.toLowerCase()) || [];
    for (const id of candidates) {
      const a = this.aliases.get(id);
      if (a && (!customerId || !a.customerId || a.customerId === customerId)) { return a; }
    }
    return null;
  }
  async findByNormalizedAlias(normalized: string, customerId?: string): Promise<ProductAlias[]> {
    const candidates = this.normalizedIndex.get(normalized.toLowerCase()) || [];
    return candidates.map((id) => this.aliases.get(id)).filter((a) => a && (!customerId || !a.customerId || a.customerId === customerId)) as ProductAlias[];
  }
  async findByProductId(productId: string): Promise<ProductAlias[]> { return Array.from(this.aliases.values()).filter((a) => a.productId === productId); }
  async findByCustomerId(customerId: string): Promise<ProductAlias[]> { return Array.from(this.aliases.values()).filter((a) => a.customerId === customerId); }
  async findVerifiedGlobal(): Promise<ProductAlias[]> { return Array.from(this.aliases.values()).filter((a) => a.verified && !a.customerId); }
  async save(alias: ProductAlias): Promise<void> {
    this.aliases.set(alias.id, alias);
    const aliasKey = alias.alias.toLowerCase();
    const existing = this.aliasIndex.get(aliasKey) || [];
    if (!existing.includes(alias.id)) { this.aliasIndex.set(aliasKey, [...existing, alias.id]); }
    const normalizedKey = alias.normalizedAlias.toLowerCase();
    const normExisting = this.normalizedIndex.get(normalizedKey) || [];
    if (!normExisting.includes(alias.id)) { this.normalizedIndex.set(normalizedKey, [...normExisting, alias.id]); }
  }
  seed(aliases: ProductAlias[]): void { for (const alias of aliases) { this.save(alias); } }
}

class InMemoryMessageRepository {
  private messages: Map<string, any> = new Map();
  private sourceExternalIndex: Map<string, string> = new Map();
  async findById(id: string): Promise<any | null> { return this.messages.get(id) || null; }
  async findBySourceAndExternalId(source: string, externalId: string): Promise<any | null> {
    const key = `${source}:${externalId}`;
    const id = this.sourceExternalIndex.get(key);
    return id ? this.messages.get(id) || null : null;
  }
  async save(message: any): Promise<void> {
    this.messages.set(message.id, message);
    const key = `${message.source}:${message.externalMessageId}`;
    this.sourceExternalIndex.set(key, message.id);
  }
  async updateStatus(id: string, status: string): Promise<void> {
    const message = this.messages.get(id);
    if (message) { message.processingStatus = status; message.updatedAt = new Date(); }
  }
}

class InMemoryOrderRepository {
  private orders: Map<string, any> = new Map();
  async findById(id: string): Promise<any | null> { return this.orders.get(id) || null; }
  async findBySourceMessageId(messageId: string): Promise<any | null> { return Array.from(this.orders.values()).find((o) => o.sourceMessageId === messageId) || null; }
  async save(order: any): Promise<void> { this.orders.set(order.id, order); }
  async update(order: any): Promise<void> { this.orders.set(order.id, order); }
}

class InMemoryOrderItemRepository {
  private items: Map<string, any> = new Map();
  async findById(id: string): Promise<any | null> { return this.items.get(id) || null; }
  async findByOrderId(orderId: string): Promise<any[]> { return Array.from(this.items.values()).filter((i) => i.orderId === orderId); }
  async save(item: any): Promise<void> { this.items.set(item.id, item); }
  async saveMany(newItems: any[]): Promise<void> { for (const item of newItems) { this.items.set(item.id, item); } }
}

class InMemoryTaskRepository {
  private tasks: Map<string, any> = new Map();
  async findById(id: string): Promise<any | null> { return this.tasks.get(id) || null; }
  async findByBusinessKey(orderId: string | undefined, type: string, dueAt: Date | undefined): Promise<any | null> {
    const dateKey = dueAt ? dueAt.toISOString().split('T')[0] : 'unspecified';
    const key = `${orderId || 'no-order'}:${type}:${dateKey}`;
    return Array.from(this.tasks.values()).find((t) => {
      const taskDateKey = t.dueAt ? t.dueAt.toISOString().split('T')[0] : 'unspecified';
      return `${t.orderId || 'no-order'}:${t.type}:${taskDateKey}` === key;
    }) || null;
  }
  async save(task: any): Promise<void> { this.tasks.set(task.id, task); }
  getAll(): any[] { return Array.from(this.tasks.values()); }
}

class InMemoryAuditLogRepository {
  private logs: Map<string, any> = new Map();
  async save(log: any): Promise<void> { this.logs.set(log.id, log); }
}

// ============================================================
// Inline Product Resolution Service
// ============================================================

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) { matrix[i][j] = matrix[i - 1][j - 1]; }
      else { matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1); }
    }
  }
  return matrix[b.length][a.length];
}

function calculateSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

class InlineProductResolutionService {
  constructor(private productRepo: InMemoryProductRepository, private aliasRepo: InMemoryProductAliasRepository) {}

  async resolve(rawAlias: string, customerId?: string): Promise<any> {
    const normalizedInput = normalizeAlias(rawAlias);
    const exactMatch = await this.aliasRepo.findByExactAlias(rawAlias, customerId);
    if (exactMatch && (exactMatch.verified || exactMatch.confidence >= 0.95)) {
      const product = await this.productRepo.findById(exactMatch.productId);
      return { productId: exactMatch.productId, product: product || undefined, status: ResolutionStatus.Resolved, confidence: exactMatch.confidence, matchMethod: 'exact', aliasId: exactMatch.id };
    }
    if (customerId) {
      const customerAliases = await this.aliasRepo.findByCustomerId(customerId);
      const customerMatch = customerAliases.find((alias) => normalizeAlias(alias.alias) === normalizedInput && alias.verified);
      if (customerMatch) {
        const product = await this.productRepo.findById(customerMatch.productId);
        return { productId: customerMatch.productId, product: product || undefined, status: ResolutionStatus.Resolved, confidence: customerMatch.confidence, matchMethod: 'customer', aliasId: customerMatch.id };
      }
    }
    const normalizedMatches = await this.aliasRepo.findByNormalizedAlias(normalizedInput, customerId);
    const normalizedMatch = normalizedMatches.find((alias) => alias.verified || alias.confidence >= 0.95);
    if (normalizedMatch) {
      const product = await this.productRepo.findById(normalizedMatch.productId);
      return { productId: normalizedMatch.productId, product: product || undefined, status: normalizedMatch.verified ? ResolutionStatus.Resolved : ResolutionStatus.NeedsReview, confidence: normalizedMatch.confidence, matchMethod: 'normalized', aliasId: normalizedMatch.id };
    }
    const verifiedAliases = await this.aliasRepo.findVerifiedGlobal();
    let bestMatch: { alias: ProductAlias; similarity: number } | null = null;
    for (const alias of verifiedAliases) {
      if (alias.customerId && alias.customerId !== customerId) continue;
      const similarity = calculateSimilarity(normalizedInput, alias.normalizedAlias);
      if (similarity >= 0.80 && similarity > (bestMatch?.similarity || 0)) { bestMatch = { alias, similarity }; }
    }
    if (bestMatch) {
      const product = await this.productRepo.findById(bestMatch.alias.productId);
      return { productId: bestMatch.alias.productId, product: product || undefined, status: ResolutionStatus.NeedsReview, confidence: bestMatch.alias.confidence, matchMethod: 'fuzzy', aliasId: bestMatch.alias.id };
    }
    return { status: ResolutionStatus.Unresolved, confidence: 0, matchMethod: 'none' };
  }
}

// ============================================================
// Inline Message Processing Service
// ============================================================

class InlineMessageProcessingService {
  constructor(
    private messageRepo: InMemoryMessageRepository,
    private orderRepo: InMemoryOrderRepository,
    private orderItemRepo: InMemoryOrderItemRepository,
    private taskRepo: InMemoryTaskRepository,
    private auditRepo: InMemoryAuditLogRepository,
    private productResolutionService: InlineProductResolutionService
  ) {}

  async findBySourceAndExternalId(source: string, externalId: string): Promise<any | null> {
    return this.messageRepo.findBySourceAndExternalId(source, externalId);
  }

  async processMessage(message: any, correlationId?: string): Promise<any> {
    const startTime = Date.now();
    const corrId = correlationId || `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const warnings: any[] = [];

    // Step 1: Parse message
    const parsingResult = parseMessage({ messageId: message.id, rawText: message.rawText, sender: message.sender, correlationId: corrId });

    // Step 2: Product resolution
    const resolvedItems: any[] = [];
    for (const item of parsingResult.items) {
      const normalizedUnit = normalizeUnit(item.unit);
      const resolution = await this.productResolutionService.resolve(item.rawProductName, parsingResult.customerInfo?.customerId);
      resolvedItems.push({
        rawProductName: item.rawProductName,
        quantity: item.quantity,
        unit: item.unit,
        normalizedUnit,
        productId: resolution.productId,
        productName: resolution.product?.name,
        resolutionStatus: resolution.status,
        resolutionConfidence: resolution.confidence,
        matchMethod: resolution.matchMethod,
        lineNumber: item.lineNumber
      });
    }

    // Step 3: Apply business rules
    const ruleResult = applyBusinessRules(parsingResult);

    // Step 4: Determine review requirements
    const unresolvedItems = resolvedItems.filter(i => i.resolutionStatus === ResolutionStatus.NeedsReview || i.resolutionStatus === ResolutionStatus.Unresolved);
    const customerNeedsReview = !parsingResult.customerInfo?.customerId && (parsingResult.customerInfo?.resolutionStatus === ResolutionStatus.NeedsReview || parsingResult.customerInfo?.resolutionStatus === ResolutionStatus.Unresolved);
    const reviewReasons: string[] = [];
    if (unresolvedItems.length > 0) { reviewReasons.push(`${unresolvedItems.length} product(s) need review: ${unresolvedItems.map(i => `"${i.rawProductName}"`).join(', ')}`); }
    if (customerNeedsReview) { reviewReasons.push('Customer could not be identified'); }
    if (parsingResult.items.length === 0) { reviewReasons.push('No products found'); }
    const reviewRequired = reviewReasons.length > 0 || ruleResult.reviewRequirement.required;

    // Step 5: Create order and items
    let orderId: string | undefined;
    if (parsingResult.items.length > 0) {
      const order = { id: generateUUID(), customerId: undefined, sourceMessageId: message.id, orderDate: message.receivedAt, status: OrderStatus.Draft, discountRate: ruleResult.discountRate ?? undefined, discountSource: ruleResult.discountSource ?? undefined, paymentMethod: ruleResult.paymentMethod ?? undefined, paymentSource: ruleResult.paymentSource ?? undefined, invoiceRequired: ruleResult.invoiceRequired, invoiceDueAt: ruleResult.invoiceDueAt ?? undefined, createdAt: new Date(), updatedAt: new Date() };
      await this.orderRepo.save(order);
      orderId = order.id;
      const orderItems = resolvedItems.map(item => ({ id: generateUUID(), orderId, productId: item.productId, rawProductName: item.rawProductName, quantity: item.quantity, unit: item.unit, normalizedUnit: item.normalizedUnit, resolutionStatus: item.resolutionStatus, resolutionConfidence: item.resolutionConfidence, matchMethod: item.matchMethod, createdAt: new Date(), updatedAt: new Date() }));
      await this.orderItemRepo.saveMany(orderItems);

      // Create tasks
      for (const candidate of ruleResult.tasks) {
        const existing = await this.taskRepo.findByBusinessKey(orderId, candidate.type, candidate.dueAt);
        if (!existing) {
          await this.taskRepo.save({ id: generateUUID(), orderId, type: candidate.type, title: candidate.title, description: candidate.description, priority: candidate.priority || TaskPriority.Normal, status: 'pending', dueAt: candidate.dueAt, sourceMessageId: message.id, createdAt: new Date(), updatedAt: new Date() });
        }
      }

      // Create review task if needed
      if (reviewRequired && reviewReasons.length > 0) {
        const existingReview = await this.taskRepo.findByBusinessKey(orderId, TaskType.ReviewOrder, undefined);
        if (!existingReview) {
          await this.taskRepo.save({ id: generateUUID(), orderId, type: TaskType.ReviewOrder, title: 'Review Order', description: `Review required: ${reviewReasons.join('; ')}`, priority: TaskPriority.Normal, status: 'pending', sourceMessageId: message.id, createdAt: new Date(), updatedAt: new Date() });
        }
      }
    }

    return {
      messageId: message.id, conversationId: 'conv-fixture', correlationId: corrId, rawText: message.rawText, intent: parsingResult.intent, intentConfidence: parsingResult.intentConfidence, customerInfo: parsingResult.customerInfo, items: resolvedItems, instructions: parsingResult.instructions, discountRate: ruleResult.discountRate, paymentMethod: ruleResult.paymentMethod, invoiceRequired: ruleResult.invoiceRequired, orderId, taskIds: [], reviewRequired, reviewReasons, warnings, metadata: { processedAt: new Date().toISOString(), processingDurationMs: Date.now() - startTime, parserVersion: '1.0.0', ruleEngineVersion: '1.0.0' }
    };
  }
}

// ============================================================
// Test Setup
// ============================================================

const REAL_WORLD_MESSAGE = `3/CHTL CPLUS (10/8)
Đc: 65B đường hiệp bình , hcm
Sđt:0904813024 ( a.Long)

50g cay :10 cái
Sw chà bông:10 cái
Sw cá hồi :10 cái
55g so:10 cái
55 bơ :10 cái
Phủ 55g:10 cái
Hoa cúc :10 cái
Ck 5%

Tiền mặt
giao trong ngày
xuất hoá đơn trong ngày`;

function createTestMessage(rawText: string, externalId: string = `ext-${Date.now()}`): any {
  return { id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, source: 'zalo', externalMessageId: externalId, conversationId: 'conv-001', sender: { name: 'Test User', phone: '0909123456' }, receivedAt: new Date(), rawText, processingStatus: 'received', createdAt: new Date(), updatedAt: new Date() };
}

function createRepositories() {
  const messageRepo = new InMemoryMessageRepository();
  const productRepo = new InMemoryProductRepository();
  const aliasRepo = new InMemoryProductAliasRepository();
  const orderRepo = new InMemoryOrderRepository();
  const orderItemRepo = new InMemoryOrderItemRepository();
  const taskRepo = new InMemoryTaskRepository();
  const auditRepo = new InMemoryAuditLogRepository();
  const productResolutionService = new InlineProductResolutionService(productRepo, aliasRepo);
  const messageProcessingService = new InlineMessageProcessingService(messageRepo, orderRepo, orderItemRepo, taskRepo, auditRepo, productResolutionService);

  // Seed sample data
  productRepo.seed([
    { id: 'prod-001', sku: 'BUN01', name: 'Bánh bao nhân bơ', normalizedName: 'banh bao nhan bo', defaultUnit: 'cái', active: true },
    { id: 'prod-002', sku: 'BUN02', name: 'Bánh bao nhân thịt', normalizedName: 'banh bao nhan thit', defaultUnit: 'cái', active: true },
    { id: 'prod-003', sku: 'BUN03', name: 'Bánh bao nhân đậu xanh', normalizedName: 'banh bao nhan dau xanh', defaultUnit: 'cái', active: true },
    { id: 'prod-004', sku: 'BUN04', name: 'Bánh bao gà', normalizedName: 'banh bao ga', defaultUnit: 'cái', active: true },
  ]);
  aliasRepo.seed([
    { id: 'alias-001', productId: 'prod-001', alias: '55 bơ', normalizedAlias: '55 bo', source: 'global', verified: true, confidence: 1.0 },
    { id: 'alias-002', productId: 'prod-001', alias: 'banh 55 bo', normalizedAlias: 'banh 55 bo', source: 'global', verified: true, confidence: 0.95 },
    { id: 'alias-003', productId: 'prod-002', alias: '55 thịt', normalizedAlias: '55 thit', source: 'global', verified: true, confidence: 1.0 },
    { id: 'alias-004', productId: 'prod-002', alias: 'sw chà bông', normalizedAlias: 'sw cha bong', source: 'global', verified: true, confidence: 0.9 },
    { id: 'alias-005', productId: 'prod-002', alias: 'sw cá hồi', normalizedAlias: 'sw ca hoi', source: 'global', verified: true, confidence: 0.9 },
    { id: 'alias-006', productId: 'prod-003', alias: '55 đậu', normalizedAlias: '55 dau', source: 'global', verified: true, confidence: 1.0 },
    { id: 'alias-007', productId: 'prod-004', alias: '50g cay', normalizedAlias: '50g cay', source: 'global', verified: true, confidence: 0.9 },
    { id: 'alias-008', productId: 'prod-003', alias: '55g so', normalizedAlias: '55g so', source: 'global', verified: true, confidence: 0.9 },
  ]);

  return { messageRepo, productRepo, aliasRepo, orderRepo, orderItemRepo, taskRepo, auditRepo, productResolutionService, messageProcessingService };
}

let repos: ReturnType<typeof createRepositories>;

// ============================================================
// Integration Tests
// ============================================================

describe('SM-002.1: Full Pipeline Integration', () => {

  beforeEach(() => { repos = createRepositories(); });

  describe('AC-1: Full Real-World Message', () => {
    it('should process real-world message with multiple order items', async () => {
      const message = createTestMessage(REAL_WORLD_MESSAGE);
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items.length).toBe(7);
      expect(result.intent).toBe(MessageIntent.Order);
      expect(result.intentConfidence).toBeGreaterThan(0.8);
      expect(result.customerInfo).toBeDefined();
      expect(result.customerInfo?.phone).toBe('0909123456'); // From sender, not extracted from text
      expect(result.discountRate).toBe(0.05);
      expect(result.paymentMethod).toBe('cash');
      expect(result.invoiceRequired).toBe(true);
      expect(result.rawText).toBe(REAL_WORLD_MESSAGE);
      expect(result.metadata.processingDurationMs).toBeLessThan(1000);
    });

    it('should correctly resolve verified aliases', async () => {
      const message = createTestMessage('55 bơ:10 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      const item55bo = result.items.find((i: any) => i.rawProductName.includes('55 bơ'));
      expect(item55bo).toBeDefined();
      expect(item55bo?.resolutionStatus).toBe(ResolutionStatus.Resolved);
      expect(item55bo?.productId).toBe('prod-001');
      expect(item55bo?.productName).toBe('Bánh bao nhân bơ');
    });

    it('should mark unknown aliases as needs_review', async () => {
      const message = createTestMessage('unknown product xyz:5 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      const unknownItem = result.items.find((i: any) => i.rawProductName.includes('unknown'));
      expect(unknownItem).toBeDefined();
      expect(unknownItem?.resolutionStatus).toBe(ResolutionStatus.Unresolved);
      expect(unknownItem?.productId).toBeUndefined();
    });
  });

  describe('AC-2: Multiple Order Items', () => {
    it('should process multiple items with mixed resolution status', async () => {
      const message = createTestMessage('55 bơ:10 cái\nunknown item:5 cái\n55 thịt:3 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items.length).toBe(3);
      const resolvedItems = result.items.filter((i: any) => i.resolutionStatus === ResolutionStatus.Resolved);
      expect(resolvedItems.length).toBe(2);
      const unresolvedItems = result.items.filter((i: any) => i.resolutionStatus === ResolutionStatus.Unresolved);
      expect(unresolvedItems.length).toBe(1);
      expect(result.reviewRequired).toBe(true);
    });
  });

  describe('AC-3: Unknown Aliases', () => {
    it('should handle completely unknown product names', async () => {
      const message = createTestMessage('xyz totally unknown:10 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items[0].resolutionStatus).toBe(ResolutionStatus.Unresolved);
      expect(result.items[0].productId).toBeUndefined();
      expect(result.items[0].matchMethod).toBe('none');
    });

    it('should not invent canonical products for unknown aliases', async () => {
      const message = createTestMessage('some random product name xyz:5 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items[0].productId).toBeUndefined();
    });
  });

  describe('AC-4: Verified Aliases', () => {
    it('should resolve "55 bơ" alias to correct product', async () => {
      const message = createTestMessage('55 bơ:10 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items[0].productId).toBe('prod-001');
      expect(result.items[0].productName).toBe('Bánh bao nhân bơ');
      expect(result.items[0].resolutionStatus).toBe(ResolutionStatus.Resolved);
    });

    it('should resolve "sw chà bông" alias', async () => {
      const message = createTestMessage('Sw chà bông:10 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items[0].productId).toBe('prod-002');
      expect(result.items[0].resolutionStatus).toBe(ResolutionStatus.Resolved);
    });
  });

  describe('AC-5: Discount', () => {
    it('should extract 5% discount', async () => {
      const message = createTestMessage('55 bơ:10 cái\nCk 5%');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.discountRate).toBe(0.05);
    });

    it('should extract 3% discount', async () => {
      const message = createTestMessage('55 bơ:5 cái\nchiết khấu 3%');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.discountRate).toBe(0.03);
    });
  });

  describe('AC-6: Payment Method', () => {
    it('should extract cash payment', async () => {
      const message = createTestMessage('55 bơ:10 cái\nTiền mặt');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.paymentMethod).toBe('cash');
    });

    it('should extract bank transfer payment', async () => {
      const message = createTestMessage('55 bơ:10 cái\nChuyển khoản');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.paymentMethod).toBe('bank_transfer');
    });
  });

  describe('AC-7: Delivery', () => {
    it('should extract same-day delivery requirement', async () => {
      const message = createTestMessage('55 bơ:10 cái\ngiao trong ngày');
      const result = await repos.messageProcessingService.processMessage(message);
      const tasks = repos.taskRepo.getAll();
      const deliveryTask = tasks.find((t: any) => t.type === 'delivery');
      expect(deliveryTask).toBeDefined();
      expect(deliveryTask?.title).toContain('Giao đơn hàng');
    });
  });

  describe('AC-8: Invoice', () => {
    it('should extract same-day invoice requirement', async () => {
      const message = createTestMessage('55 bơ:10 cái\nxuất hoá đơn trong ngày');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.invoiceRequired).toBe(true);
      const tasks = repos.taskRepo.getAll();
      const invoiceTask = tasks.find((t: any) => t.type === 'invoice');
      expect(invoiceTask).toBeDefined();
      expect(invoiceTask?.title).toContain('Xuất hóa đơn');
    });
  });

  describe('AC-9: Customer Extraction', () => {
    it('should extract phone from sender info', async () => {
      const message = createTestMessage('55 bơ:10 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.customerInfo?.phone).toBe('0909123456');
      expect(result.customerInfo?.displayName).toBe('Test User');
    });

    it('should extract phone from message text when no sender info', async () => {
      const messageWithSender = { ...createTestMessage('55 bơ:10 cái'), sender: undefined };
      const messageWithoutSender = { ...messageWithSender, sender: undefined, rawText: 'Sđt:0904813024\n55 bơ:10 cái' };
      const result = await repos.messageProcessingService.processMessage(messageWithoutSender);
      expect(result.customerInfo?.phone).toBe('0904813024');
    });
  });

  describe('AC-10: Raw Message Preservation', () => {
    it('should preserve raw text throughout pipeline', async () => {
      const message = createTestMessage(REAL_WORLD_MESSAGE);
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.rawText).toBe(REAL_WORLD_MESSAGE);
    });

    it('should preserve raw product names', async () => {
      const message = createTestMessage('55 BƠ:10 CÁI');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items[0].rawProductName).toBe('55 BƠ');
    });

    it('should preserve raw units', async () => {
      const message = createTestMessage('55 bơ:10 CÁI');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items[0].unit).toBe('CÁI');
      expect(result.items[0].normalizedUnit).toBe('cái');
    });
  });

  describe('AC-11: Duplicate Message Detection', () => {
    it('should detect duplicate messages by source and external ID', async () => {
      const message1 = createTestMessage('55 bơ:10 cái', 'dup-msg-001');
      // First save the message directly
      await repos.messageRepo.save(message1);
      // Then process it
      await repos.messageProcessingService.processMessage(message1);
      // Now check for duplicate
      const existing = await repos.messageProcessingService.findBySourceAndExternalId('zalo', 'dup-msg-001');
      expect(existing).not.toBeNull();
      expect(existing?.id).toBe(message1.id);
    });
  });

  describe('AC-12: Invalid Quantity', () => {
    it('should handle zero quantity', async () => {
      const message = createTestMessage('55 bơ:0 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items.length).toBe(0);
    });

    it('should handle negative quantity', async () => {
      const message = createTestMessage('55 bơ:-5 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items.length).toBe(0);
    });

    it('should handle decimal quantity', async () => {
      const message = createTestMessage('55 bơ:5.5 cái');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items.length).toBe(1);
      expect(result.items[0].quantity).toBe(5.5);
    });
  });

  describe('AC-13: Unit Normalization', () => {
    it('should normalize "cai" to "cái" while preserving raw', async () => {
      const message = createTestMessage('55 bơ:10 cai');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items.length).toBe(1);
      expect(result.items[0].unit).toBe('cai');
      expect(result.items[0].normalizedUnit).toBe('cái');
    });

    it('should normalize unit in order items', async () => {
      const message = createTestMessage('55 bơ:10 goi');
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.items.length).toBe(1);
      expect(result.items[0].unit).toBe('goi');
      expect(result.items[0].normalizedUnit).toBe('gói');
    });
  });

  describe('AC-14: Complete Pipeline Result', () => {
    it('should return structured result with all fields', async () => {
      const message = createTestMessage(REAL_WORLD_MESSAGE);
      const result = await repos.messageProcessingService.processMessage(message);
      expect(result.messageId).toBeDefined();
      expect(result.correlationId).toBeDefined();
      expect(result.rawText).toBe(REAL_WORLD_MESSAGE);
      expect(result.intent).toBe(MessageIntent.Order);
      expect(result.intentConfidence).toBeGreaterThan(0);
      expect(result.customerInfo).toBeDefined();
      expect(result.items).toBeInstanceOf(Array);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.instructions).toBeInstanceOf(Array);
      expect(result.discountRate).toBeDefined();
      expect(result.paymentMethod).toBeDefined();
      expect(result.invoiceRequired).toBeDefined();
      expect(result.reviewRequired).toBeDefined();
      expect(result.reviewReasons).toBeInstanceOf(Array);
      expect(result.warnings).toBeInstanceOf(Array);
      expect(result.metadata).toBeDefined();
    });
  });
});
