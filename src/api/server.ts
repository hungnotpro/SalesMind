/**
 * HTTP transport for POST /api/v1/messages.
 *
 * Uses Node's built-in `http` module — no third-party HTTP framework.
 * The transport only handles:
 *   - JSON body parsing
 *   - Routing
 *   - Status code selection
 *   - Error envelope serialization
 *
 * All business logic lives in the controller (IngestMessageController).
 * All persistence lives in the application pipeline.
 *
 * Design notes:
 *
 *   - Body size is capped at 256 KiB to prevent DoS via large payloads.
 *   - JSON parse errors return 400 with VALIDATION_ERROR.
 *   - Only POST /api/v1/messages is wired. Other paths return 404.
 *   - The transport does NOT implement authentication or Zalo webhooks.
 *     Those are out of scope for SM-005 and are layered concerns that
 *     sit in front of this controller.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { IngestMessageController, type IngestMessageApiResponse } from './messages.js';
import { generateUUID } from '../shared/utils.js';

const MAX_BODY_BYTES = 256 * 1024; // 256 KiB

export interface ServerOptions {
  /** Optional port for `server.listen(port)`; if absent, call `listen()` manually. */
  port?: number;
  /** Optional host binding (default '127.0.0.1'). */
  host?: string;
}

export class MessageApiServer {
  private server?: Server;
  constructor(private readonly controller: IngestMessageController, private readonly opts: ServerOptions = {}) {}

  /**
   * Start listening. Returns the underlying `http.Server` for tests.
   */
  listen(): Promise<Server> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        this.handle(req, res).catch((err) => {
          // Last-resort safety net
          this.sendJson(res, 500, {
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: err instanceof Error ? err.message : 'Internal error',
              requestId: this.requestId()
            }
          });
        });
      });
      server.on('error', reject);
      server.on('listening', () => resolve(server));
      const host = this.opts.host ?? '127.0.0.1';
      const port = this.opts.port ?? 0; // 0 = pick a free port
      server.listen(port, host);
      this.server = server;
    });
  }

  /**
   * Stop the underlying HTTP server.
   */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  /**
   * Handle a single request. Exposed for testing.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = this.requestId();

    // CORS preflight: not implemented (no browser clients in scope)
    if (req.method === 'OPTIONS') {
      this.sendJson(res, 204, {}, requestId);
      return;
    }

    // Route: POST /api/v1/messages
    if (req.method === 'POST' && req.url === '/api/v1/messages') {
      await this.handleIngest(req, res, requestId);
      return;
    }

    // Health check: GET /healthz
    if (req.method === 'GET' && req.url === '/healthz') {
      this.sendJson(res, 200, { status: 'ok' }, requestId);
      return;
    }

    this.sendJson(res, 404, {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `No route for ${req.method} ${req.url}`,
        requestId
      }
    }, requestId);
  }

  private async handleIngest(req: IncomingMessage, res: ServerResponse, requestId: string): Promise<void> {
    // Content-Type must be application/json (or JSON-ish)
    const contentType = (req.headers['content-type'] ?? '').toLowerCase();
    if (!contentType.includes('application/json')) {
      this.sendJson(res, 415, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Content-Type must be application/json',
          requestId
        }
      }, requestId);
      return;
    }

    // Read body (with size limit)
    let raw: string;
    try {
      raw = await readBody(req, MAX_BODY_BYTES);
    } catch (err) {
      const message = (err as Error).message;
      this.sendJson(res, 400, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Failed to read body: ${message}`,
          requestId
        }
      }, requestId);
      return;
    }

    // Parse JSON
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      this.sendJson(res, 400, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body is not valid JSON',
          requestId
        }
      }, requestId);
      return;
    }

    // Delegate to the controller
    const result = await this.controller.handle(body);

    if (result.success === true) {
      // Successful ingestion: 201 Created (per API_SPEC.md convention)
      this.sendJson(res, 201, result, requestId);
    } else if (result.error.code === 'VALIDATION_ERROR') {
      this.sendJson(res, 400, result, requestId);
    } else if (result.error.code === 'PROCESSING_FAILED') {
      this.sendJson(res, 500, result, requestId);
    } else {
      // Catch-all for future error codes (NOT_FOUND, CONFLICT, etc.)
      this.sendJson(res, 500, result, requestId);
    }
  }

  private sendJson(res: ServerResponse, status: number, body: unknown, requestId?: string): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(payload),
      ...(requestId ? { 'x-request-id': requestId } : {})
    });
    res.end(payload);
  }

  private requestId(): string {
    return generateUUID();
  }
}

/**
 * Read the request body as a string, capped at `maxBytes`.
 * Rejects with an Error if the body exceeds the limit.
 */
function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error(`Request body exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', (err) => reject(err));
  });
}

// Re-export the response type for callers
export type { IngestMessageApiResponse };