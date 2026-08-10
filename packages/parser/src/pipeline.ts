/**
 * Parser pipeline - orchestrates all parsing steps.
 */

import { MessageIntent, ResolutionStatus } from '../../../shared/src/enums.js';
import { 
  createEmptyProcessingResult,
  InstructionType
} from '../../../domain/src/value-objects/ProcessingResult.js';
import { normalizeForExtraction, splitIntoLines } from './normalizers/text-normalizer.js';
import { classifyMessageIntent } from './extractors/intent-classifier.js';
import { extractProductLines, toOrderItemCandidates, isProductLine, mightBeProductLine } from './extractors/order-item-extractor.js';
import { extractInstructions, isInstructionLine } from './extractors/instruction-extractor.js';
import { extractCustomerInfo } from './extractors/customer-extractor.js';

export interface ParserConfig {
  parserVersion: string;
  ruleEngineVersion: string;
}

export const DEFAULT_PARSER_CONFIG: ParserConfig = {
  parserVersion: '1.0.0',
  ruleEngineVersion: '1.0.0'
};

export interface ParseInput {
  messageId: string;
  rawText: string;
  sender?: {
    name?: string;
    phone?: string;
  };
  receivedAt: Date;
  correlationId?: string;
}

export function parseMessage(input: ParseInput, config: ParserConfig = DEFAULT_PARSER_CONFIG) {
  const correlationId = input.correlationId || `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const startTime = Date.now();

  const result = createEmptyProcessingResult(input.messageId, correlationId);
  result.metadata.parserVersion = config.parserVersion;
  result.metadata.ruleEngineVersion = config.ruleEngineVersion;

  try {
    const normalized = normalizeForExtraction(input.rawText);
    const lines = splitIntoLines(normalized.normalized);

    if (lines.length === 0) {
      result.warnings.push({ code: 'EMPTY_MESSAGE', message: 'Message contains no text to parse' });
      return result;
    }

    const intentClassification = classifyMessageIntent(lines);
    result.intent = intentClassification.intent;
    result.intentConfidence = intentClassification.confidence;

    const { instructions } = extractInstructions(lines);
    result.instructions = instructions;

    const productLines = lines.filter(
      (line) => !isInstructionLine(line) && mightBeProductLine(line)
    );
    const extractedProducts = extractProductLines(productLines);
    const itemCandidates = toOrderItemCandidates(extractedProducts, ResolutionStatus.NeedsReview);
    result.items = itemCandidates;

    if (input.sender) {
      const customerInfo = {
        displayName: input.sender.name,
        phone: input.sender.phone,
        resolutionStatus: input.sender.phone ? ResolutionStatus.NeedsReview : ResolutionStatus.Unresolved,
        confidence: input.sender.phone ? 0.7 : 0.3
      };
      result.customerInfo = customerInfo;
    }

    if (itemCandidates.length === 0 && instructions.length === 0) {
      result.reviewReasons.push('No products or instructions detected');
    }

    const unparsedLines = lines.filter((line) => mightBeProductLine(line) && !isProductLine(line) && !isInstructionLine(line));
    if (unparsedLines.length > 0) {
      result.warnings.push({
        code: 'UNPARSED_LINES',
        message: `${unparsedLines.length} line(s) may contain products but were not parsed`,
        field: 'text'
      });
    }

  } catch (error) {
    result.warnings.push({
      code: 'PARSE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown parsing error',
      field: 'text'
    });
  }

  result.metadata.processedAt = new Date().toISOString();
  result.metadata.processingDurationMs = Date.now() - startTime;

  return result;
}

export function containsOrderContent(text: string): boolean {
  const lines = splitIntoLines(text);
  
  for (const line of lines) {
    if (mightBeProductLine(line) || isInstructionLine(line)) {
      return true;
    }
  }
  
  return false;
}
