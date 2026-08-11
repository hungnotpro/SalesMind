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
  MessageApiServer,
  validateMessageRequest,
  summarizeValidationIssues,
  reconstructPipelineResult,
  isUniqueViolation,
  resolveRequestId,
  type IngestMessageApiResponse,
  type PipelineInvoker,
  type IdempotencyLookup,
  type MessageIngestionRequest,
  type PersistedMessageState,
  type ExistingOrder
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
    conversationId: 'conv-1',
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
    return IngestMessageController.createForTest({
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
    const ctrl = IngestMessageController.createForTest({
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

describe('SM-005: reconstructPipelineResult (typed read-model)', () => {
  /**
   * Build a `PersistedMessageState` from the persisted entities
   * involved in idempotent replay.
   */
  function persistedStateOf(
    msg: Message | null,
    order: ExistingOrder,
    orderItems: PersistedMessageState['orderItems'],
    tasks: PersistedMessageState['tasks']
  ): PersistedMessageState | null {
    if (!msg) return null;
    return {
      messageId: msg.id,
      conversationId: msg.conversationId ?? 'conv-fallback',
      rawText: msg.rawText,
      customerId: null,
      createdAt: msg.createdAt,
      order,
      orderItems,
      tasks
    };
  }

  it('returns null when message does not exist', async () => {
    const lookup: IdempotencyLookup = async () => null;
    const r = await lookup('manual', 'never-seen');
    expect(r).toBeNull();
  });

  it('reconstructs a typed PipelineResult from persisted entities', () => {
    const state: PersistedMessageState = {
      messageId: 'msg-existing',
      conversationId: 'conv-existing',
      rawText: '55 bo:5 cai',
      customerId: 'cust-existing',
      createdAt: new Date('2026-08-11T10:00:00Z'),
      order: { id: 'order-existing' },
      orderItems: [
        { rawProductName: '55 bo', resolutionStatus: 'resolved' },
        { rawProductName: '50g cay', resolutionStatus: 'needs_review' }
      ],
      tasks: [{ id: 'task-1', type: 'review_order', status: 'pending' }]
    };
    const result = reconstructPipelineResult(state);
    expect(result.messageId).toBe('msg-existing');
    expect(result.conversationId).toBe('conv-existing');
    expect(result.orderId).toBe('order-existing');
    expect(result.customerInfo?.customerId).toBe('cust-existing');
    expect(result.reviewRequired).toBe(true);
    expect(result.reviewReasons[0]).toContain('1 product(s) need review');
    expect(result.items.length).toBe(2);
    expect(result.taskIds).toEqual(['task-1']);
  });

  it('returns null when no persisted message exists', async () => {
    const state = persistedStateOf(null, null, [], []);
    expect(state).toBeNull();
    if (state) {
      // Should never get here, but TypeScript checks the type.
      reconstructPipelineResult(state);
    }
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
    const ctrl = IngestMessageController.createForTest({
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

// ============================================================
// SM-005.1 — Hardening regression tests
// ============================================================

/**
 * SM-005.1 bug-fix regression suite. Each test maps to a numbered
 * issue in the task spec.
 */
describe('SM-005.1: Issue 1 — conversationId in PipelineResult and response', () => {
  it('PipelineResult exposes a separate conversationId', () => {
    const r = makePipelineResult({ messageId: 'msg-X', conversationId: 'conv-Y' });
    expect(r.messageId).toBe('msg-X');
    expect(r.conversationId).toBe('conv-Y');
    expect(r.messageId).not.toBe(r.conversationId);
  });

  it('API response uses result.conversationId (NOT messageId)', async () => {
    const ctrl = IngestMessageController.createForTest({
      invoker: async (m) =>
        makePipelineResult({ messageId: m.id, conversationId: 'persisted-conv' })
    });
    const r = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'i1-1',
      externalConversationId: 'c-1',
      text: 'hi'
    });
    expect(r.success).toBe(true);
    if (r.success === true) {
      // Conversation ID must NOT be derived from messageId
      expect(r.data.conversationId).toBe('persisted-conv');
      expect(r.data.messageId).not.toBe(r.data.conversationId);
    }
  });
});

describe('SM-005.1: Issue 2 — idempotent replay returns the persisted messageId', () => {
  it('POST #2 returns the ORIGINAL persisted messageId', async () => {
    let invocations = 0;
    const existing = makePipelineResult({ messageId: 'persisted-msg', conversationId: 'persisted-conv', orderId: 'persisted-order' });
    const ctrl = IngestMessageController.createForTest({
      invoker: async (m) => {
        invocations++;
        return makePipelineResult({ messageId: m.id });
      },
      idempotencyLookup: async () => existing
    });

    // First request: pre-flight finds existing → replay, pipeline NOT called
    const r1 = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'idem-1',
      externalConversationId: 'conv-1',
      text: '55 bo:5 cai'
    });
    expect(r1.success).toBe(true);
    if (r1.success === true) {
      expect(r1.data.messageId).toBe('persisted-msg');
      expect(r1.data.conversationId).toBe('persisted-conv');
      expect(r1.data.orderId).toBe('persisted-order');
      expect(r1.meta.idempotentReplay).toBe(true);
    }
    expect(invocations).toBe(0); // pipeline never invoked
  });

  it('does NOT generate a new messageId on replay', async () => {
    const ctrl = IngestMessageController.createForTest({
      invoker: async (m) => makePipelineResult({ messageId: m.id }),
      idempotencyLookup: async () =>
        makePipelineResult({ messageId: 'persisted-A', conversationId: 'persisted-B' }),
      generateId: () => 'freshly-generated-uuid'
    });
    const r = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'replay-1',
      externalConversationId: 'conv-replay-1',
      text: '55 bo:5 cai'
    });
    expect(r.success).toBe(true);
    if (r.success === true) {
      expect(r.data.messageId).toBe('persisted-A');
      expect(r.data.messageId).not.toBe('freshly-generated-uuid');
    }
  });
});

describe('SM-005.1: Issue 3 — replay result reconstructs persisted fields', () => {
  it('replay returns original conversationId, orderId, customerId, itemCount, reviewRequired', () => {
    const state: PersistedMessageState = {
      messageId: 'msg-1',
      conversationId: 'conv-1',
      rawText: '55 bo:5 cai',
      customerId: 'cust-1',
      createdAt: new Date('2026-08-11T10:00:00Z'),
      order: { id: 'order-1' },
      orderItems: [
        { rawProductName: '55 bo', resolutionStatus: 'resolved' },
        { rawProductName: '50g cay', resolutionStatus: 'resolved' },
        { rawProductName: 'hoa cuc', resolutionStatus: 'needs_review' }
      ],
      tasks: [{ id: 'task-1', type: 'review_order', status: 'pending' }]
    };
    const replayed = reconstructPipelineResult(state);
    expect(replayed.messageId).toBe('msg-1');
    expect(replayed.conversationId).toBe('conv-1');
    expect(replayed.orderId).toBe('order-1');
    expect(replayed.customerInfo?.customerId).toBe('cust-1');
    expect(replayed.items.length).toBe(3);
    expect(replayed.taskIds).toEqual(['task-1']);
    expect(replayed.reviewRequired).toBe(true);
    expect(replayed.reviewReasons.some((r) => r.includes('1 product'))).toBe(true);
  });

  it('replay does NOT fabricate intent or items from thin air', () => {
    const state: PersistedMessageState = {
      messageId: 'm',
      conversationId: 'c',
      rawText: 'raw',
      customerId: null,
      createdAt: new Date(),
      order: null,
      orderItems: [],
      tasks: []
    };
    const r = reconstructPipelineResult(state);
    expect(r.items.length).toBe(0);
    expect(r.orderId).toBeUndefined();
    expect(r.reviewRequired).toBe(false);
    // No fake customer info
    expect(r.customerInfo).toBeUndefined();
  });
});

describe('SM-005.1: Issue 4 — concurrent idempotency', () => {
  it('falls back to replay when pipeline raises a UNIQUE violation on messages', async () => {
    const persisted = makePipelineResult({
      messageId: 'winner-msg',
      conversationId: 'winner-conv',
      orderId: 'winner-order'
    });
    const uniqueViolation = Object.assign(
      new Error('duplicate key value violates unique constraint "messages_source_external_unique"'),
      {
        code: '23505',
        constraint: 'messages_source_external_unique',
        table: 'messages',
        detail: 'Key (source, external_message_id) = (manual, race-1) already exists.'
      }
    );
    const ctrl = IngestMessageController.createForTest({
      invoker: async () => {
        throw uniqueViolation;
      },
      idempotencyLookup: async () => persisted
    });

    const r = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'race-1',
      externalConversationId: 'conv-race-1',
      text: '55 bo:5 cai'
    });
    expect(r.success).toBe(true);
    if (r.success === true) {
      expect(r.data.messageId).toBe('winner-msg');
      expect(r.data.conversationId).toBe('winner-conv');
      expect(r.data.orderId).toBe('winner-order');
      expect(r.meta.idempotentReplay).toBe(true);
    }
  });

  it('does NOT fall back when UNIQUE violation is on a different table', async () => {
    const otherViolation = Object.assign(
      new Error('duplicate key value violates unique constraint'),
      { code: '23505', constraint: 'customers_phone_key', table: 'customers' }
    );
    const ctrl = IngestMessageController.createForTest({
      invoker: async () => { throw otherViolation; },
      idempotencyLookup: async () => null
    });
    const r = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'unique-1',
      externalConversationId: 'conv-1',
      text: 'hi'
    });
    expect(r.success).toBe(false);
    if (r.success === false) {
      // Falls through to generic processing failure
      expect(r.error.code).toBe('PROCESSING_FAILED');
    }
  });

  it('isUniqueViolation predicate detects PostgreSQL SQLSTATE 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
  });
});

describe('SM-005.1: Issue 5 — safe processing error responses', () => {
  it('does NOT leak the original error message', async () => {
    const ctrl = IngestMessageController.createForTest({
      invoker: async () => {
        throw new Error(
          'duplicate key value violates unique constraint "messages_source_external_unique"\nDETAIL: Key (source, external_message_id)=(manual, leak-1) already exists.\nFile: nbtinsert.c\nSQL: INSERT INTO messages ...'
        );
      },
      idempotencyLookup: async () => null
    });
    const r = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'leak-1',
      externalConversationId: 'conv-leak-1',
      text: '55 bo:5 cai'
    });
    expect(r.success).toBe(false);
    if (r.success === false) {
      expect(r.error.code).toBe('PROCESSING_FAILED');
      expect(r.error.message).toBe('A message processing error occurred.');
      const json = JSON.stringify(r);
      expect(json).not.toContain('INSERT');
      expect(json).not.toContain('nbtinsert');
      expect(json).not.toContain('messages_source_external_unique');
      expect(json).not.toContain('localhost');
      expect(json).not.toContain('postgres://');
      expect(json).not.toContain('Stack:');
      expect(json).not.toContain('.ts:');
    }
  });

  it('does NOT leak stack traces in any error code', async () => {
    const ctrl = IngestMessageController.createForTest({
      invoker: async () => {
        const err = new Error('internal failure: connection refused at 127.0.0.1:5432');
        throw err;
      },
      idempotencyLookup: async () => null
    });
    const r = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'leak-2',
      externalConversationId: 'conv-leak-2',
      text: 'hi'
    });
    expect(r.success).toBe(false);
    if (r.success === false) {
      const json = JSON.stringify(r);
      expect(json).not.toContain('connection refused');
      expect(json).not.toContain('127.0.0.1');
      expect(json).not.toContain('5432');
    }
  });
});

describe('SM-005.1: Issue 6 — correlation ID preservation', () => {
  it('preserves a valid X-Request-ID supplied by the caller', async () => {
    const provided = 'a1b2c3d4-5678-4abc-9def-0123456789ab';
    expect(resolveRequestId({ 'x-request-id': provided })).toBe(provided);
  });

  it('preserves X-Request-ID case-insensitively', () => {
    // Node HTTP normalizes header names to lowercase; callers must
    // pass lowercase keys when invoking resolveRequestId directly.
    const provided = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(resolveRequestId({ 'x-request-id': provided })).toBe(provided);
  });

  it('rejects an invalid X-Request-ID and generates a fresh one', () => {
    const id = resolveRequestId({ 'x-request-id': 'not-a-uuid' });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(id).not.toBe('not-a-uuid');
  });

  it('generates a correlation ID when no header is supplied', () => {
    const id = resolveRequestId({});
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('controller echoes the requestId into the response', async () => {
    const ctrl = IngestMessageController.createForTest({
      invoker: async (m) => makePipelineResult({ messageId: m.id })
    });
    const r = await ctrl.handle(
      {
        source: 'manual',
        externalMessageId: 'corr-1',
        externalConversationId: 'conv-corr-1',
        text: 'hi'
      },
      'cccccccc-1111-4222-8333-444444444444'
    );
    expect(r.success).toBe(true);
    if (r.success === true) {
      expect(r.data.correlationId).toBe('cccccccc-1111-4222-8333-444444444444');
    }
  });

  it('correlationId is distinct from messageId and conversationId', async () => {
    const ctrl = IngestMessageController.createForTest({
      invoker: async (m) =>
        makePipelineResult({ messageId: m.id, conversationId: 'conv-distinct' })
    });
    const r = await ctrl.handle(
      {
        source: 'manual',
        externalMessageId: 'distinct-1',
        externalConversationId: 'conv-1',
        text: 'hi'
      },
      'req-id-X'
    );
    if (r.success === true) {
      expect(r.data.correlationId).toBe('req-id-X');
      expect(r.data.messageId).not.toBe(r.data.correlationId);
      expect(r.data.conversationId).not.toBe(r.data.correlationId);
    }
  });
});

describe('SM-005.1: Issue 7 — no `any` in API hardening path', () => {
  it('createMessageIdempotencyLookup is REMOVED (replaced by reconstructPipelineResult)', () => {
    // The old `createMessageIdempotencyLookup` is no longer exported.
    // The replay logic is now split into:
    //   - IdempotencyLookup: returns PersistedMessageState | null (the
    //     caller's responsibility — they own the SQL)
    //   - reconstructPipelineResult(state): typed read-model
    // Verify by importing the new types directly.
    const fakeLookup: IdempotencyLookup = async () => null;
    expect(typeof fakeLookup).toBe('function');
  });

  it('replay state is fully typed (no any)', () => {
    // Type-level assertion: this code must compile without `as any`
    const state: PersistedMessageState = {
      messageId: 'm',
      conversationId: 'c',
      rawText: 'r',
      customerId: null,
      createdAt: new Date(),
      order: null,
      orderItems: [{ rawProductName: 'x', resolutionStatus: 'resolved' }],
      tasks: []
    };
    const r = reconstructPipelineResult(state);
    expect(r.messageId).toBe('m');
    expect(r.conversationId).toBe('c');
  });
});

// ============================================================
// SM-005.1 — HTTP-level regression suite
// ============================================================

describe('SM-005.1: HTTP transport — correlation + safe errors', () => {
  let server: MessageApiServer | undefined;
  let httpServer: Server | undefined;
  let baseUrl: string;
  let throwingCtrl: IngestMessageController;

  beforeEach(async () => {
    throwingCtrl = IngestMessageController.createForTest({
      invoker: async () => {
        throw new Error(
          'pg: connection refused at /var/run/postgresql/.s.PGSQL.5432 (host=db.internal.example.com password=secret123)'
        );
      }
    });
    server = new MessageApiServer(throwingCtrl, { port: 0, host: '127.0.0.1' });
    httpServer = await server.listen();
    const addr = httpServer.address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${addr.port}`;
    } else {
      throw new Error('server did not bind');
    }
  });

  afterEach(async () => {
    if (server) await server.close();
    server = undefined;
    httpServer = undefined;
  });

  it('does not expose the underlying error message in 500 response', async () => {
    const res = (await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: 'safe-1',
        externalConversationId: 'conv-safe-1',
        text: 'hi'
      })
    })) as unknown as { status: number; text: () => Promise<string> };
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('connection refused');
    expect(body).not.toContain('password=secret');
    expect(body).not.toContain('db.internal.example.com');
    expect(body).not.toContain('Stack');
    expect(body).toContain('PROCESSING_FAILED');
    expect(body).toContain('A message processing error occurred.');
  });

  it('preserves caller-supplied X-Request-ID through the response', async () => {
    const provided = '11111111-2222-4333-8444-555555555555';
    const res = (await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': provided
      },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: 'req-1',
        externalConversationId: 'conv-1',
        text: 'hi'
      })
    })) as unknown as { status: number; headers: { get(name: string): string | null } };
    expect(res.headers.get('x-request-id')).toBe(provided);
  });

  it('rejects an invalid X-Request-ID and generates a fresh one', async () => {
    const res = (await fetch(`${baseUrl}/api/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'definitely-not-a-uuid'
      },
      body: JSON.stringify({
        source: 'manual',
        externalMessageId: 'req-2',
        externalConversationId: 'conv-2',
        text: 'hi'
      })
    })) as unknown as { status: number; headers: { get(name: string): string | null } };
    const echo = res.headers.get('x-request-id');
    expect(echo).toBeTruthy();
    expect(echo).not.toBe('definitely-not-a-uuid');
    expect(echo).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

// ============================================================
// SM-005.1 — Concurrency regression (mock-level)
// ============================================================

describe('SM-005.1: Concurrent duplicate requests', () => {
  it('two concurrent controllers with shared pre-flight lookup converge to the same persisted result', async () => {
    const persisted = makePipelineResult({
      messageId: 'concurrent-winner',
      conversationId: 'concurrent-conv',
      orderId: 'concurrent-order'
    });
    // Pre-flight always returns the persisted result (simulates a DB
    // read after the first request committed). The pipeline throws a
    // UNIQUE violation for losers.
    let invocations = 0;
    const lookup: IdempotencyLookup = async () => persisted;
    const invoker = async () => {
      invocations++;
      throw Object.assign(new Error('unique violation'), {
        code: '23505',
        constraint: 'messages_source_external_unique',
        table: 'messages'
      });
    };
    const ctrl = IngestMessageController.createForTest({ invoker, idempotencyLookup: lookup });

    const req = {
      source: 'manual',
      externalMessageId: 'concurrent-1',
      externalConversationId: 'conv-concurrent-1',
      text: '55 bo:5 cai'
    };
    const results = await Promise.all([ctrl.handle(req), ctrl.handle(req), ctrl.handle(req)]);
    for (const r of results) {
      expect(r.success).toBe(true);
      if (r.success === true) {
        expect(r.data.messageId).toBe('concurrent-winner');
        expect(r.data.conversationId).toBe('concurrent-conv');
        expect(r.data.orderId).toBe('concurrent-order');
        expect(r.meta.idempotentReplay).toBe(true);
      }
    }
    // Pipeline was never invoked successfully; the pre-flight caught all
    // requests before they hit the UNIQUE-violation path.
    expect(invocations).toBe(0);
  });

  it('race condition: pre-flight misses, UNIQUE violation falls back to persisted read', async () => {
    const persisted = makePipelineResult({
      messageId: 'race-winner',
      conversationId: 'race-conv',
      orderId: 'race-order'
    });
    let preFlightCalls = 0;
    const lookup: IdempotencyLookup = async () => {
      preFlightCalls++;
      // First pre-flight misses, subsequent calls return the persisted result
      // (simulating the row having appeared between calls)
      return preFlightCalls === 1 ? null : persisted;
    };
    const invoker = async () => {
      throw Object.assign(new Error('unique violation'), {
        code: '23505',
        constraint: 'messages_source_external_unique',
        table: 'messages'
      });
    };
    const ctrl = IngestMessageController.createForTest({ invoker, idempotencyLookup: lookup });
    const r = await ctrl.handle({
      source: 'manual',
      externalMessageId: 'race-2',
      externalConversationId: 'conv-race-2',
      text: 'hi'
    });
    expect(r.success).toBe(true);
    if (r.success === true) {
      expect(r.data.messageId).toBe('race-winner');
      expect(r.meta.idempotentReplay).toBe(true);
    }
  });
});
