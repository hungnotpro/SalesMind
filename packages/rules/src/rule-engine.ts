/**
 * Rule engine - orchestrates business rules for order creation.
 */

import { TaskType } from '../../../shared/src/enums.js';
import { ProcessingResult } from '../../../domain/src/value-objects/ProcessingResult.js';
import { extractDiscount } from './discount-rules.js';
import { extractDeliveryRequirement, createDeliveryTaskCandidate } from './delivery-rules.js';
import { extractInvoiceRequirement, createInvoiceTaskCandidate } from './invoice-rules.js';
import { determineReviewRequirements } from './review-rules.js';

export interface RuleEngineResult {
  tasks: any[];
  reviewRequirement: any;
  discountRate: number | null;
  discountSource: string | null;
  paymentMethod: string | null;
  paymentSource: string | null;
  invoiceRequired: boolean;
  invoiceDueAt: Date | null;
}

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

export function applyBusinessRules(
  result: ProcessingResult,
  config: RuleEngineConfig = DEFAULT_RULE_ENGINE_CONFIG
): RuleEngineResult {
  const tasks: any[] = [];

  const discount = extractDiscount(result.instructions);

  const paymentInstruction = result.instructions.find((i: any) => i.type === 'payment');

  const deliveryRequirement = config.sameDayDeliveryEnabled
    ? extractDeliveryRequirement(result.instructions, new Date())
    : null;

  if (deliveryRequirement) {
    const deliveryTask = createDeliveryTaskCandidate(
      deliveryRequirement,
      result.instructions.find((i: any) => i.type === 'delivery')?.rawText
    );
    tasks.push(deliveryTask);
  }

  const invoiceRequirement = config.sameDayInvoiceEnabled
    ? extractInvoiceRequirement(result.instructions, new Date())
    : null;

  let invoiceRequired = false;
  let invoiceDueAt: Date | null = null;

  if (invoiceRequirement) {
    invoiceRequired = true;
    invoiceDueAt = invoiceRequirement.targetDate || null;

    const invoiceTask = createInvoiceTaskCandidate(
      invoiceRequirement,
      result.instructions.find((i: any) => i.type === 'invoice')?.rawText
    );
    tasks.push(invoiceTask);
  }

  const reviewRequirement = determineReviewRequirements(result);

  return {
    tasks,
    reviewRequirement,
    discountRate: discount.rate,
    discountSource: discount.source,
    paymentMethod: paymentInstruction?.normalizedValue || null,
    paymentSource: paymentInstruction?.rawText || null,
    invoiceRequired,
    invoiceDueAt
  };
}
