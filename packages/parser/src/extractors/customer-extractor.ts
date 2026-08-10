/**
 * Customer extractor - identify customer information from message text.
 */

import { ResolutionStatus } from '../../../shared/src/enums.js';

export function extractPhone(text: string): string | null {
  const phonePatterns = [/(0\d{9,10})/g, /\+84(\d{9,10})/g];
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      let phone = match[0];
      phone = phone.replace(/[^\d+]/g, '');
      if (phone.startsWith('+84')) {
        phone = '0' + phone.slice(3);
      }
      if (phone.length >= 9 && phone.length <= 11) {
        return phone;
      }
    }
  }
  
  return null;
}

export function extractAddress(text: string): string | null {
  const patterns = [/^(?:đc|địa\s*chỉ|addr|address)\s*[:\-]?\s*(.+)$/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

export function extractName(text: string): string | null {
  const patterns = [/\(([^)]+)\)$/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

export function extractCustomerInfo(lines: string[]) {
  let phone: string | undefined;
  let address: string | undefined;
  let displayName: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const extractedPhone = extractPhone(trimmed);
    if (extractedPhone) phone = extractedPhone;

    const extractedAddress = extractAddress(trimmed);
    if (extractedAddress) address = extractedAddress;

    const extractedName = extractName(trimmed);
    if (extractedName) displayName = extractedName;
  }

  let resolutionStatus = ResolutionStatus.Unresolved;
  let confidence = 0;

  if (phone) {
    resolutionStatus = ResolutionStatus.NeedsReview;
    confidence = 0.7;
  } else if (displayName) {
    resolutionStatus = ResolutionStatus.NeedsReview;
    confidence = 0.5;
  }

  return { phone, address, displayName, resolutionStatus, confidence };
}
