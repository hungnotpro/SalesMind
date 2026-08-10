/**
 * Tests for the parser package - Instruction Extractor.
 */

import { describe, it, expect } from 'vitest';
import { 
  extractInstructions, 
  parseInstruction, 
  isInstructionLine,
  filterInstructionsFromProducts
} from '../src/extractors/instruction-extractor.js';
import { InstructionType } from '@salesmind/domain';

describe('InstructionExtractor', () => {
  describe('parseInstruction', () => {
    describe('Discount patterns', () => {
      it('should parse "CK 5%"', () => {
        const result = parseInstruction('CK 5%');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Discount);
        expect(result!.numericValue).toBe(0.05);
      });

      it('should parse "CK 10%" with space', () => {
        const result = parseInstruction('CK 10%');
        
        expect(result!.numericValue).toBe(0.1);
      });

      it('should parse "5%" alone', () => {
        const result = parseInstruction('5%');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Discount);
      });
    });

    describe('Payment patterns', () => {
      it('should parse "Tiền mặt"', () => {
        const result = parseInstruction('Tiền mặt');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Payment);
      });

      it('should parse "cash"', () => {
        const result = parseInstruction('cash');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Payment);
      });

      it('should parse "TM"', () => {
        const result = parseInstruction('TM');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Payment);
      });
    });

    describe('Delivery patterns', () => {
      it('should parse "giao trong ngày"', () => {
        const result = parseInstruction('giao trong ngày');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Delivery);
        expect(result!.isSameDay).toBe(true);
      });

      it('should parse "giao hôm nay"', () => {
        const result = parseInstruction('giao hôm nay');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Delivery);
        expect(result!.isSameDay).toBe(true);
      });
    });

    describe('Invoice patterns', () => {
      it('should parse "xuất hoá đơn trong ngày"', () => {
        const result = parseInstruction('xuất hoá đơn trong ngày');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Invoice);
        expect(result!.isSameDay).toBe(true);
      });

      it('should parse "có hóa đơn"', () => {
        const result = parseInstruction('có hóa đơn');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Invoice);
      });
    });

    describe('Cancellation patterns', () => {
      it('should parse "khỏi giao"', () => {
        const result = parseInstruction('khỏi giao');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Cancellation);
      });

      it('should parse "hủy"', () => {
        const result = parseInstruction('hủy');
        
        expect(result).not.toBeNull();
        expect(result!.type).toBe(InstructionType.Cancellation);
      });
    });

    it('should return null for non-instruction text', () => {
      expect(parseInstruction('55 bơ :10 cái')).toBeNull();
      expect(parseInstruction('some random text')).toBeNull();
    });
  });

  describe('extractInstructions', () => {
    it('should extract all instruction types from message', () => {
      const lines = [
        '55 bơ :10 cái',
        'CK 5%',
        'Tiền mặt',
        'giao trong ngày',
        'xuất hoá đơn trong ngày',
      ];

      const { instructions } = extractInstructions(lines);

      expect(instructions.length).toBe(4);
      
      const types = instructions.map((i) => i.type);
      expect(types).toContain(InstructionType.Discount);
      expect(types).toContain(InstructionType.Payment);
      expect(types).toContain(InstructionType.Delivery);
      expect(types).toContain(InstructionType.Invoice);
    });

    it('should track line numbers', () => {
      const lines = [
        'line 1',
        'CK 5%',
        'line 3',
      ];

      const { lineMap } = extractInstructions(lines);

      expect(lineMap.has(2)).toBe(true);
      expect(lineMap.get(2)?.type).toBe(InstructionType.Discount);
    });
  });

  describe('filterInstructionsFromProducts', () => {
    it('should separate instructions from products', () => {
      const lines = [
        '55 bơ :10 cái',
        'CK 5%',
        'sw chà bông :10 cái',
        'Tiền mặt',
      ];

      const { productLines, instructionLines } = filterInstructionsFromProducts(lines);

      expect(productLines).toEqual(['55 bơ :10 cái', 'sw chà bông :10 cái']);
      expect(instructionLines).toEqual(['CK 5%', 'Tiền mặt']);
    });
  });

  describe('isInstructionLine', () => {
    it('should identify instruction lines', () => {
      expect(isInstructionLine('CK 5%')).toBe(true);
      expect(isInstructionLine('Tiền mặt')).toBe(true);
      expect(isInstructionLine('giao trong ngày')).toBe(true);
      expect(isInstructionLine('xuất hoá đơn')).toBe(true);
    });

    it('should reject product lines', () => {
      expect(isInstructionLine('55 bơ :10 cái')).toBe(false);
    });
  });
});
