/**
 * Request validation for POST /api/v1/messages.
 *
 * Pure functions only — no HTTP framework, no I/O, no side effects.
 * Validates the inbound envelope and returns either:
 *   - a normalized `MessageIngestionRequest`, or
 *   - a `ValidationFailure` with a list of issues.
 *
 * Required fields:
 *   source
 *   externalMessageId
 *   externalConversationId
 *   text
 *
 * Optional fields:
 *   receivedAt (ISO-8601 string)
 *   sender.name, sender.phone
 *   metadata (object, treated as opaque)
 *
 * Unknown fields are NOT accepted. The request body is a closed
 * shape to keep the contract stable across source adapters.
 */

export interface MessageIngestionRequest {
  source: string;
  externalMessageId: string;
  externalConversationId: string;
  text: string;
  receivedAt?: string;
  sender?: {
    name?: string;
    phone?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface ValidationFailure {
  readonly ok: false;
  readonly issues: ValidationIssue[];
}
export interface ValidationSuccess {
  readonly ok: true;
  readonly value: MessageIngestionRequest;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const ALLOWED_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  'source',
  'externalMessageId',
  'externalConversationId',
  'text',
  'receivedAt',
  'sender',
  'metadata'
]);

const ALLOWED_SENDER_KEYS: ReadonlySet<string> = new Set(['name', 'phone']);

function issue(field: string, code: string, message: string): ValidationIssue {
  return { field, code, message };
}

/**
 * Validate the inbound POST /api/v1/messages body.
 *
 * Returns a discriminated union. The caller (the controller) is responsible
 * for translating `issues` into an HTTP 400 response with a stable error code.
 */
export function validateMessageRequest(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (input === null || input === undefined || typeof input !== 'object') {
    return {
      ok: false,
      issues: [issue('body', 'invalid_type', 'Request body must be a JSON object')]
    };
  }

  const r = input as Record<string, unknown>;

  // Reject unknown top-level fields (closed contract)
  for (const key of Object.keys(r)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      issues.push(issue(key, 'unknown_field', `Unknown field: ${key}`));
    }
  }

  // source: required string, non-empty
  if (typeof r.source !== 'string' || !r.source.trim()) {
    issues.push(issue('source', 'required', 'source is required and must be a non-empty string'));
  }

  // externalMessageId: required string, non-empty
  if (typeof r.externalMessageId !== 'string' || !r.externalMessageId.trim()) {
    issues.push(issue('externalMessageId', 'required', 'externalMessageId is required and must be a non-empty string'));
  }

  // externalConversationId: required string, non-empty (per spec, NOT optional)
  if (typeof r.externalConversationId !== 'string' || !r.externalConversationId.trim()) {
    issues.push(
      issue('externalConversationId', 'required', 'externalConversationId is required and must be a non-empty string')
    );
  }

  // text: required string, must not be empty after trim
  if (typeof r.text !== 'string') {
    issues.push(issue('text', 'required', 'text is required and must be a string'));
  } else if (r.text.trim().length === 0) {
    issues.push(issue('text', 'empty', 'text must not be empty'));
  }

  // receivedAt: optional, must be ISO-8601 string if present
  let normalizedReceivedAt: string | undefined;
  if (r.receivedAt !== undefined) {
    if (typeof r.receivedAt !== 'string') {
      issues.push(issue('receivedAt', 'invalid_type', 'receivedAt must be an ISO-8601 string'));
    } else {
      const d = new Date(r.receivedAt);
      if (Number.isNaN(d.getTime())) {
        issues.push(issue('receivedAt', 'invalid_date', 'receivedAt is not a valid ISO-8601 timestamp'));
      } else {
        normalizedReceivedAt = d.toISOString();
      }
    }
  }

  // sender: optional object with name/phone
  let normalizedSender: MessageIngestionRequest['sender'];
  if (r.sender !== undefined) {
    if (r.sender === null || typeof r.sender !== 'object' || Array.isArray(r.sender)) {
      issues.push(issue('sender', 'invalid_type', 'sender must be an object'));
    } else {
      const s = r.sender as Record<string, unknown>;
      for (const key of Object.keys(s)) {
        if (!ALLOWED_SENDER_KEYS.has(key)) {
          issues.push(issue(`sender.${key}`, 'unknown_field', `Unknown sender field: ${key}`));
        }
      }
      normalizedSender = {};
      if (s.name !== undefined) {
        if (typeof s.name !== 'string') {
          issues.push(issue('sender.name', 'invalid_type', 'sender.name must be a string'));
        } else {
          normalizedSender.name = s.name.trim();
        }
      }
      if (s.phone !== undefined) {
        if (typeof s.phone !== 'string') {
          issues.push(issue('sender.phone', 'invalid_type', 'sender.phone must be a string'));
        } else {
          normalizedSender.phone = s.phone.trim();
        }
      }
    }
  }

  // metadata: optional object, opaque
  let normalizedMetadata: Record<string, unknown> | undefined;
  if (r.metadata !== undefined) {
    if (r.metadata === null || typeof r.metadata !== 'object' || Array.isArray(r.metadata)) {
      issues.push(issue('metadata', 'invalid_type', 'metadata must be a JSON object'));
    } else {
      normalizedMetadata = r.metadata as Record<string, unknown>;
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      source: (r.source as string).trim(),
      externalMessageId: (r.externalMessageId as string).trim(),
      externalConversationId: (r.externalConversationId as string).trim(),
      text: r.text as string,
      receivedAt: normalizedReceivedAt,
      sender: normalizedSender,
      metadata: normalizedMetadata
    }
  };
}

/**
 * Build a 400-friendly error message from validation issues.
 */
export function summarizeValidationIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `${i.field}: ${i.message}`).join('; ');
}