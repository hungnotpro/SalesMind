/**
 * Rules - Deterministic business rules for SalesMind OS.
 */

import { TaskPriority, TaskType } from '../../../shared/enums.js';

const SAME_DAY_CUTOFF_HOUR = 14;
const INVOICE_CUTOFF_HOUR = 16;

export interface RuleEngineResult {
  tasks: any[];
  reviewRequired: boolean;
  reviewReasons: string[];
  discountRate: number | null;
  paymentMethod: string | null;
  invoiceRequired: boolean;
}

export function applyBusinessRules(result: any): RuleEngineResult {
  const tasks: any[] = [];
  const reasons: string[] = [];
  
  // Extract discount
  const discountInstruction = result.instructions.find((i: any) => i.type === 'discount');
  const discountRate = discountInstruction?.numericValue ?? null;
  
  // Extract payment
  const paymentInstruction = result.instructions.find((i: any) => i.type === 'payment');
  const paymentMethod = paymentInstruction?.normalizedValue ?? null;
  
  // Delivery task
  const deliveryInstruction = result.instructions.find((i: any) => i.type === 'delivery');
  if (deliveryInstruction) {
    const now = new Date();
    const priority = now.getHours() < 12 ? TaskPriority.Normal : (now.getHours() < SAME_DAY_CUTOFF_HOUR ? TaskPriority.High : TaskPriority.Urgent);
    tasks.push({ type: TaskType.Delivery, title: 'Giao đơn hàng trong ngày', priority });
  }
  
  // Invoice task
  const invoiceInstruction = result.instructions.find((i: any) => i.type === 'invoice');
  let invoiceRequired = false;
  if (invoiceInstruction) {
    invoiceRequired = true;
    const now = new Date();
    const priority = now.getHours() < 12 ? TaskPriority.Normal : (now.getHours() < INVOICE_CUTOFF_HOUR ? TaskPriority.High : TaskPriority.Urgent);
    tasks.push({ type: TaskType.Invoice, title: 'Xuất hóa đơn trong ngày', priority });
  }
  
  // Check review requirements
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
    reviewRequired: reasons.length > 0,
    reviewReasons: reasons,
    discountRate,
    paymentMethod,
    invoiceRequired
  };
}

export { TaskPriority, TaskType };
