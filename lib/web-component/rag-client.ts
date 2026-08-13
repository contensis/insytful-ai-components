import { readSSEFrames } from '../shared/sse';
import { ctasFromFrameData } from '../shared/cta/validation';
// Types-only import — adds zero runtime weight to the IIFE bundle.
import type { Cta } from '../api/rag.types';

const SESSION_KEY = 'rag-session-id';

/**
 * One event from a streamed `ask()` response.
 *
 * Named `kind` (not `type`) deliberately: this is an envelope whose `ctas`
 * payload holds objects with their own `type` field — reusing the name would
 * be a readability trap.
 */
export type RAGStreamEvent =
  /** One streamed answer token. */
  | { kind: 'token'; content: string }
  /** The sanitized CTAs for this answer (yielded only when non-empty). */
  | { kind: 'ctas'; ctas: Cta[] };

export interface RAGClientConfig {
  baseUrl: string;
  projectId: string;
  sections?: string;
  /** Optional custom fetch function (e.g. mock for dev-mode). Defaults to window.fetch. */
  fetchFn?: typeof fetch;
}

export class RAGClient {
  private baseUrl: string;
  private projectId: string;
  private sections?: string;
  private fetchFn: typeof fetch;

  constructor(config: RAGClientConfig) {
    this.baseUrl = config.baseUrl;
    this.projectId = config.projectId;
    this.sections = config.sections;
    this.fetchFn = config.fetchFn ?? window.fetch.bind(window);
  }

  /**
   * Send a question to the RAG API and yield {@link RAGStreamEvent} objects
   * as Server-Sent Events arrive.
   *
   * BREAKING CHANGE (v3.0.0): `ask()` previously yielded plain content
   * strings. It now yields discriminated events so CTA frames can be
   * surfaced alongside answer tokens:
   *
   * - `{ kind: "token", content: string }` — one streamed answer chunk
   * - `{ kind: "ctas", ctas: Cta[] }` — sanitized CTAs (only when non-empty)
   *
   * Migration for existing `ragClient` consumers:
   * ```ts
   * let answer = "";
   * for await (const ev of client.ask(question)) {
   *   if (ev.kind === "token") answer += ev.content;
   * }
   * ```
   *
   * Malformed `cta` frame JSON logs a `[Insytful]` warn and is skipped —
   * streaming continues (never fail an answer over a decoration).
   */
  async *ask(
    question: string,
    signal?: AbortSignal,
  ): AsyncGenerator<RAGStreamEvent, void, void> {
    // POST body — the API moved off query-string params, so there is no
    // URL length ceiling on `question` and no encoding to get wrong.
    const body: Record<string, unknown> = {
      question,
      config: this.projectId,
      history: true,
      stream: true,
    };

    if (this.sections) {
      body.sections = this.sections;
    }

    const headers = new Headers({
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    });

    const sid = localStorage.getItem(SESSION_KEY);
    if (sid) {
      headers.append('X-Session-Id', sid);
    }

    const response = await this.fetchFn(
      `${this.baseUrl}/query-collection`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      }
    );

    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const json = await response.json();
        message = json?.message ?? message;
      } catch {
        try {
          const text = await response.text();
          if (text) message = text;
        } catch {
          // body already consumed or unreadable — use default message
        }
      }
      throw new Error(message);
    }

    // Persist session ID from response headers
    const newSid = response.headers.get('X-Session-Id');
    if (newSid) {
      localStorage.setItem(SESSION_KEY, newSid);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    // readSSEFrames owns decoding, abort checks, and reader cleanup
    // (mirrors the useRAGConversation / useRAGResponse stream loops).
    for await (const frame of readSSEFrames(response.body, signal)) {
      switch (frame.event) {
        case 'done': {
          return;
        }
        case 'cta': {
          // ctasFromFrameData owns the wire shape ({"ctas":[...]}) and
          // malformed-JSON handling — shared with useRAGConversation.
          const ctas = ctasFromFrameData(frame.data);
          if (ctas.length > 0) {
            yield { kind: 'ctas', ctas };
          }
          break;
        }
        case 'message': {
          try {
            const json = JSON.parse(frame.data);
            if (json?.content) {
              yield { kind: 'token', content: json.content };
            }
          } catch {
            // Malformed JSON frame — skip
          }
          break;
        }
      }
    }
  }

  /** Remove the stored session ID from localStorage. */
  static clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
  }
}
