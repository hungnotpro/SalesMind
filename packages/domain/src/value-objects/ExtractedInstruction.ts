/**
 * ExtractedInstruction value object.
 */

import { PaymentMethod } from '../../shared/src/enums.js';

export enum InstructionType {
  Discount = 'discount',
  Payment = 'payment',
  Delivery = 'delivery',
  Invoice = 'invoice',
  Note = 'note',
  Cancellation = 'cancellation'
}

export interface ExtractedInstruction {
  type: InstructionType;
  rawText: string;
  normalizedValue?: string;
  numericValue?: number;
  isSameDay?: boolean;
  targetDate?: Date;
  method?: PaymentMethod;
}

export function isCommercialInstruction(instruction: ExtractedInstruction): boolean {
  return [
    InstructionType.Discount,
    InstructionType.Payment,
    InstructionType.Delivery,
    InstructionType.Invoice,
    InstructionType.Note,
    InstructionType.Cancellation
  ].includes(instruction.type);
}
