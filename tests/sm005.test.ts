/**
 * SM-005 Tests — Message Ingestion API.
 *
 * Covers:
 *   - validation (open/closed contract, type checks, ISO-8601)
 *   - controller happy path
 *   - controller idempotency replay
 *   - controller error envelopes
 *   - HTTP transport routing, status codes, JSON serialization
 *   - end-to-end POST /api/v1/messages via real HTTP server
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import {
  IngestMessageController,
  createMessageIdempotencyLookup,
  MessageApiServer,
  validateMessageRequest,
  summarizeValidationIssues,
  type IngestMessageApiResponse,
  type PipelineInvoker,
  type IdempotencyLookup,
  type MessageIngestionRequest
} from '../src/api/index.js';
import type { Message, PipelineResult } from '../src/services/MessageProcessingService.js';
import { ResolutionStatus } from '../src/shared/enums.js';

// ============================================================
// Validation tests
// ============================================================

describe('SM-005: validateMessageRequest', () => {
  it('accepts a complete valid request', () => {
    const req = {
      source: 'manual',
      externalMessageId: 'msg-1',
      externalConversationId: 'conv-1',
      text: '55 bo:10 cai',
      receivedAt: '2026-08-11T10:00:00+07:00',
      sender: { name: 'a.Long', phone: '0904813024' },
      metadata: { foo: 'bar' }
    };
    const r = validateMessageRequest(req);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.source).toBe('manual');
      expect(r.value.externalMessageId).toBe('msg-1');
      expect(r.value.externalConversationId).toBe('conv-1');
      expect(r.value.text).toBe('55 bo:10 cai');
      expect(r.value.receivedAt).toBe(new Date('2026-08-11T10:00:00+07:00').toISOString());
      expect(r.value.sender?.name).toBe('a.Long');
      expect(r.value.sender?.phone).toBe('0904813024');
      expect(r.value.metadata).toEqual({ foo: 'bar' });
    }
  });

  it('rejects missing source', () => {
    const r = validateMessageRequest({
      externalMessageId: 'x',
      externalConversationId: 'c',
      text: 'y'
    });
    expect(r.ok).toBe(false);
    if (r.ok !== true) {
      expect(r.issues.some((i) => i.field === 'source')).toBe(true);
    }
  });

  it('rejects empty source string', () => {
    const r = validateMessageRequest({
      source: '   ',
      externalMessageId: 'x',
      externalConversationId: 'c',
      text: 'y'
    });
    expect(r.ok).toBe(false);
    if (r.ok !== true) {
      expect(r.issues.some((i) => i.field === 'source' && i.code === 'required')).toBe(true);
    }
  });

  it('rejects missing externalMessageId', () => {
    const r = validateMessageRequest({
      source: 'zalo',
      externalConversationId: 'c',
      text: 'y'
    });
    expect(r.ok).toBe(false);
  });

  it('rejects missing externalConversationId (per spec: REQUIRED)', () => {
    const r = validateMessageRequest({
      source: 'zalo',
      externalMessageId: 'x',
      text: 'y'
    });
    expect(r.ok).toBe(false);
    if (r.ok !== true) {
      expect(r.issues.some((i) => i.field === 'externalConversationId' && i.code === 'required')).toBe(true);
    }
  });

  it('rejects empty text', () => {
    const r = validateMessageRequest({
      source: 'zalo',
      externalMessageId: 'x',
      externalConversationId: 'c',
      text: '   '
    });
    expect(r.ok).toBe(false);
    if (r.ok !== true) {
      expect(r.issues.some((i) => i.field === 'text' && i.code === 'empty')).toBe(true);
    }
  });

  it('rejects invalid receivedAt', () => {
    const r = validateMessageRequest({
      source: 'zalo',
      externalMessageId: 'x',
      externalConversationId: 'c',
      text: 'y',
      receivedAt: 'not-a-date'
    });
    expect(r.ok).toBe(false);
    if (r.ok !== true) {
      expect(r.issues.some((i) => i.field === 'receivedAt' && i.code === 'invalid_date')).toBe(true);
    }
  });

  it('rejects unknown top-level fields', () => {
    const r = validateMessageRequest({
      source: 'zalo',
      externalMessageId: 'x',
      externalConversationId: 'c',
      text: 'y',
      foo: 'bar'
    });
    expect(r.ok).toBe(false);
    if (r.ok !== true) {
      expect(r.issues.some((i) => i.field === 'foo' && i.code === 'unknown_field')).toBe(true);
    }
  });

  it('rejects sender as a non-object', () => {
    const r = validateMessageRequest({
      source: 'zalo',
      externalMessageId: 'x',
      externalConversationId: 'c',
      text: 'y',
      sender: 'not-an-object'
    });
    expect(r.ok).toBe(false);
    if (r.ok !== true) {
      expect(r.issues.some((i) => i.field === 'sender')).toBe(true);
    }
  });

  it('rejects unknown sender fields', () => {
    const r = validateMessageRequest({
      source: 'zalo',
      externalMessageId: 'x',
      externalConversationId: 'c',
      text: 'y',
      sender: { name: 'A', phone: '0904', email: 'a@b.com' }
    });
    expect(r.ok).toBe(false);
    if (r.ok !== true) {
      expect(r.issues.some((i) => i.field === 'sender.email')).toBe(true);
    }
  });

  it('rejects non-object body', () => {
    expect(validateMessageRequest(null).ok).toBe(false);
    expect(validateMessageRequest('string').ok).toBe(false);
    expect(validateMessageRequest(42).ok).toBe(false);
    expect(validateMessageRequest([]).ok).toBe(false);
  });

  it('accepts request without optional fields', () => {
    const r = validateMessageRequest({
      source: 'manual',
      externalMessageId: 'x',
      externalConversationId: 'c',
      text: '55 bo:5 cai'
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.receivedAt).toBeUndefined();
      expect(r.value.sender).toBeUndefined();
      expect(r.value.metadata).toBeUndefined();
    }
  });
});

// ============================================================
// Controller tests
// ============================================================

function makePipelineResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    messageId: 'msg-1',
    correlationId: 'corr-1',
    rawText: '55 bo:5 cai',
    intent: 'order' as any,
    intentConfidence: 0.95,
    customerInfo: {
      resolutionStatus: ResolutionStatus.Resolved,
      resolutionConfidence: 0.9,
      customerId: 'cust-1',
      displayName: 'A',
      phone: '0904',
      normalizedName: 'a',
      normalizedPhone: '84904'
    },
    items: [],
    instructions: [],
    invoiceRequired: false,
    orderId: 'order-1',
    taskIds: [],
    reviewRequired: false,
    reviewReasons: [],
    warnings: [],
    metadata: {
      processedAt: '2026-08-11T10:00:00.000Z',
      processingDurationMs: 12,
      parserVersion: '1.0.0',
      ruleEngineVersion: '1.0.0'
    },
    ...overrides
  };
}

describe('SM-005: IngestMessageController', () => {
  let invocations: Message[] = [];

  beforeEach(() => {
    invocations = [];
  });

  function buildController(opts: {
    result?: PipelineResult;
    throwError?: boolean;
    existing?: PipelineResult | null;
  }): IngestMessageController {
    const invoker: PipelineInvoker = async (message) => {
      invocations.push(message);
      if (opts.throwError) throw new Error('pipeline boom');
      return opts.result ?? makePipelineResult({ messageId: message.id });
    };
    const idempotencyLookup: IdempotencyLookup = opts.existing !== undefined
      ? async () => opts.existing
      : async () => null;
    return new IngestMessageController({
      invoker,
      idempotencyLookup,
      generateId: (() => { let n = 0; return () => `fixed-id-${++n}`; })()
    });
  }

  it('invokes the pipeline with a properly-shaped Message entity', async () => {
    const ctrl = buildController({});
    const result = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'msg-1',
      externalConversationId: 'conv-1',
      text: '55 bo:5 cai',
      receivedAt: '2026-08-11T10:00:00+07:00',
      sender: { name: 'a.Long', phone: '0904813024' }
    });
    expect(result.success).toBe(true);
    expect(invocations.length).toBe(1);
    const msg = invocations[0];
    expect(msg.source).toBe('manual');
    expect(msg.externalMessageId).toBe('msg-1');
    expect(msg.externalConversationId).toBe('conv-1');
    expect(msg.conversationId).toBeUndefined(); // not yet linked
    expect(msg.rawText).toBe('55 bo:5 cai');
    expect(msg.sender?.name).toBe('a.Long');
    expect(msg.sender?.phone).toBe('0904813024');
    expect(msg.receivedAt).toBeInstanceOf(Date);
    expect(msg.processingStatus).toBe('received');
  });

  it('returns an error envelope on validation failure', async () => {
    const ctrl = buildController({});
    const result = await ctrl.handle({
      source: '',
      externalMessageId: 'x',
      externalConversationId: 'c',
      text: 'y'
    });
    expect(result.success).toBe(false);
    if (result.success !== true) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toBeDefined();
    }
    expect(invocations.length).toBe(0); // pipeline NOT called on invalid request
  });

  it('returns an error envelope when the pipeline throws', async () => {
    const ctrl = buildController({ throwError: true });
    const result = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'msg-1',
      externalConversationId: 'conv-1',
      text: '55 bo:5 cai'
    });
    expect(result.success).toBe(false);
    if (result.success !== true) {
      expect(result.error.code).toBe('PROCESSING_FAILED');
    }
  });

  it('returns idempotent replay when prior message exists', async () => {
    const existing = makePipelineResult({ messageId: 'msg-1', orderId: 'order-existing' });
    const ctrl = buildController({ existing });
    const result = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'msg-1',
      externalConversationId: 'conv-1',
      text: '55 bo:5 cai'
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.meta.idempotentReplay).toBe(true);
      expect(result.data.orderId).toBe('order-existing');
    }
    expect(invocations.length).toBe(0); // pipeline NOT re-invoked
  });

  it('does not expose internal DB details in the response', async () => {
    const ctrl = buildController({});
    const result = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'msg-1',
      externalConversationId: 'conv-1',
      text: '55 bo:5 cai'
    });
    if (result.success) {
      const json = JSON.stringify(result);
      expect(json).not.toContain('postgres');
      expect(json).not.toContain('SELECT');
      expect(json).not.toContain('@salesmind');
    }
  });
});

// ============================================================
// HTTP transport tests
// ============================================================

describe('SM-005: MessageApiServer (HTTP)', () => {
  let server: MessageApiServer | undefined;
  let httpServer: Server | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    const ctrl = new IngestMessageController({
      invoker: async (message) => makePipelineResult({ messageId: message.id }),
      idempotencyLookup: async () => null
    });
    server = new MessageApiServer(ctrl, { port: 0, host: '127.0.0.1' });
    httpServer = await server.listen();
    const addr = httpServer.address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    } else {
      throw new Error('server did not bind to a port');
    }
  });

  afterEach(async () => {
    if (server) await server.close();
    server = undefined;
    httpServer = undefined;
  });

  it('responds 201 Created with success envelope on a valid POST', async () => {
    const res = (await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: 'msg-1',
        externalConversationId: 'conv-1',
        text: '55 bo:5 cai'
      })
    })) as unknown as { status: number; json: () => Promise<unknown> };
    expect(res.status).toBe(201);
    const body = (await res.json()) as IngestMessageApiResponse;
    expect(body.success).toBe(true);
    expect(body.data.messageId).toBeDefined();
    expect(body.data.correlationId).toBeDefined();
    expect(body.data.reviewRequired).toBe(false);
    expect(body.meta.idempotentReplay).toBe(false);
  });

  it('responds 400 Bad Request when source is missing', async () => {
    const res = (await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        externalMessageId: 'msg-1',
        externalConversationId: 'conv-1',
        text: '55 bo:5 cai'
      })
    })) as unknown as { status: number; json: () => Promise<unknown> };
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('responds 400 on invalid JSON', async () => {
    const res = (await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{this is not valid JSON'
    })) as unknown as { status: number };
    expect(res.status).toBe(400);
  });

  it('responds 415 on non-JSON content type', async () => {
    const res = (await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello'
    })) as unknown as { status: number };
    expect(res.status).toBe(415);
  });

  it('responds 404 for unknown routes', async () => {
    const res = (await fetch(`${baseUrl}/api/v1/does-not-exist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })) as unknown as { status: number };
    expect(res.status).toBe(404);
  });

  it('responds 200 on GET /healthz', async () => {
    const res = (await fetch(`${baseUrl}/healthz`)) as unknown as { status: number; json: () => Promise<unknown> };
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('sets x-request-id header', async () => {
    const res = (await fetch(`${baseUrl}/healthz`)) as unknown as { headers: { get(name: string): string | null } };
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('rejects bodies exceeding 256 KiB', async () => {
    const big = 'x'.repeat(257 * 1024);
    let status: number | null = null;
    let fetchError: unknown = null;
    try {
      const res = (await fetch(`${baseUrl}/api/v1/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'manual',
          externalMessageId: 'msg-1',
          externalConversationId: 'conv-1',
          text: big
        })
      })) as unknown as { status: number };
      status = res.status;
    } catch (err) {
      // The server destroys the socket mid-stream when the limit is hit;
      // node's undici fetch surfaces this as a SocketError. Either the
      // server returned a 400 OR the socket was destroyed before a
      // response was emitted. Both indicate rejection.
      fetchError = err;
    }
    expect(status === 400 || fetchError !== null).toBe(true);
  });
});

// ============================================================
// Idempotency helper tests
// ============================================================

describe('SM-005: createMessageIdempotencyLookup', () => {
  it('returns null when message does not exist', async () => {
    const lookup = createMessageIdempotencyLookup(
      { findBySourceAndExternalId: async () => null },
      { findBySourceMessageId: async () => null }
    );
    const r = await lookup('manual', 'never-seen');
    expect(r).toBeNull();
  });

  it('returns a synthetic PipelineResult when message exists', async () => {
    const lookup = createMessageIdempotencyLookup(
      {
        findBySourceAndExternalId: async () => ({
          id: 'msg-1',
          source: 'manual',
          externalMessageId: 'msg-1',
          receivedAt: new Date(),
          rawText: '55 bo:5 cai',
          processingStatus: 'completed',
          createdAt: new Date(),
          updatedAt: new Date()
        } as Message)
      },
      { findBySourceMessageId: async () => ({ id: 'order-1' }) }
    );
    const r = await lookup('manual', 'msg-1');
    expect(r).not.toBeNull();
    expect(r?.orderId).toBe('order-1');
  });
});

// ============================================================
// summarizeValidationIssues
// ============================================================

describe('SM-005: summarizeValidationIssues', () => {
  it('joins issue messages with semicolons', () => {
    const summary = summarizeValidationIssues([
      { field: 'source', code: 'required', message: 'is required' },
      { field: 'text', code: 'required', message: 'is required' }
    ]);
    expect(summary).toContain('source: is required');
    expect(summary).toContain('text: is required');
    expect(summary).toContain(';');
  });

  it('handles empty issue list', () => {
    expect(summarizeValidationIssues([])).toBe('');
  });
});

// ============================================================
// End-to-end pipeline integration via API
// ============================================================

describe('SM-005: End-to-end pipeline via API', () => {
  it('controller receives a message with the canonical pipeline', async () => {
    let receivedMessage: Message | null = null;
    const ctrl = new IngestMessageController({
      invoker: async (m) => {
        receivedMessage = m;
        return makePipelineResult({ messageId: m.id });
      }
    });
    const r = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'e2e-msg',
      externalConversationId: 'e2e-conv',
      text: '55 bo:5 cai',
      sender: { name: 'Long', phone: '0904' }
    });
    expect(r.success).toBe(true);
    expect(receivedMessage).not.toBeNull();
    expect((receivedMessage as unknown as Message).rawText).toBe('55 bo:5 cai');
    expect((receivedMessage as unknown as Message).externalConversationId).toBe('e2e-conv');
  });
});
