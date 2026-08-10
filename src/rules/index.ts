/**
 * Rules package - deterministic business rules.
 */

import { TaskPriority, TaskType } from '../shared/enums.js';
import { InstructionType, ProcessingResult } from '../domain/value-objects/index.js';

export const MAX_DISCOUNT_RATE = 0.5;

export interface RuleEngineConfig {
  businessTimezone: string;
  sameDayDeliveryEnabled: boolean;
  sameDayInvoiceEnabled: boolean;
}

export const DEFAULT_RULE_ENGINE_CONFIG: RuleEngineConfig = {
  businessTimezone: 'Asia/Ho_Chi_Minh',
  sameDayDeliveryEnabled: true,
  sameDayInvoiceEnabled: true
};

const SAME_DAY_CUTOFF_HOUR = 14;
const INVOICE_CUTOFF_HOUR = 16;

/**
 * Apply business rules to processing result.
 */
export function applyBusinessRules(result: ProcessingResult, config: RuleEngineConfig = DEFAULT_RULE_ENGINE_CONFIG): any {
  const tasks: any[] = [];
  
  // Extract discount
  const discountInstruction = result.instructions.find((i: any) => i.type === InstructionType.Discount);
  const discountRate = discountInstruction?.numericValue ?? null;
  const discountSource = discountInstruction?.rawText ?? null;
  
  // Extract payment
  const paymentInstruction = result.instructions.find((i: any) => i.type === InstructionType.Payment);
  const paymentMethod = paymentInstruction?.normalizedValue ?? null;
  const paymentSource = paymentInstruction?.rawText ?? null;
  
  // Extract delivery requirement
  const deliveryInstruction = result.instructions.find((i: any) => i.type === InstructionType.Delivery);
  if (deliveryInstruction && config.sameDayDeliveryEnabled) {
    const now = new Date();
    const priority = now.getHours() < 12 ? TaskPriority.Normal : (now.getHours() < SAME_DAY_CUTOFF_HOUR ? TaskPriority.High : TaskPriority.Urgent);
    tasks.push({
      type: TaskType.Delivery,
      title: 'Giao đơn hàng trong ngày',
      description: deliveryInstruction.rawText,
      priority
    });
  }
  
  // Extract invoice requirement
  const invoiceInstruction = result.instructions.find((i: any) => i.type === InstructionType.Invoice);
  let invoiceRequired = false;
  let invoiceDueAt: Date | null = null;
  
  if (invoiceInstruction && config.sameDayInvoiceEnabled) {
    invoiceRequired = true;
    invoiceDueAt = new Date();
    invoiceDueAt.setHours(INVOICE_CUTOFF_HOUR, 0, 0, 0);
    
    const now = new Date();
    const priority = now.getHours() < 12 ? TaskPriority.Normal : (now.getHours() < INVOICE_CUTOFF_HOUR ? TaskPriority.High : TaskPriority.Urgent);
    tasks.push({
      type: TaskType.Invoice,
      title: 'Xuất hóa đơn trong ngày',
      description: invoiceInstruction.rawText,
      priority
    });
  }
  
  // Check review requirements
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
  
  return {
    tasks,
    reviewRequirement: { required: reasons.length > 0, reasons, itemCount: result.items.length },
    discountRate,
    discountSource,
    paymentMethod,
    paymentSource,
    invoiceRequired,
    invoiceDueAt
  };
}

export { InstructionType, TaskType, TaskPriority };
