import { vi } from "vitest";
import type { Cta } from "../rag.types";

/** Type-safe factory for a mocked `executeRecaptcha` function, avoiding `as any` at call sites. */
export function mockExecuteRecaptcha() {
  return vi.fn<(action?: string) => Promise<string>>();
}

/** A minimal ReadableStream-like body that yields the given raw SSE text chunks, then ends. */
export function mockSSEBody(chunks: string[]) {
  let i = 0;
  const encoder = new TextEncoder();
  return {
    getReader() {
      return {
        read: async () => {
          if (i < chunks.length) {
            const value = encoder.encode(chunks[i]);
            i += 1;
            return { value, done: false };
          }
          return { value: undefined, done: true };
        },
        releaseLock: () => {},
        cancel: async () => {},
      };
    },
  };
}

/** Builds a single SSE "data:" frame (as sent by the RAG API), including the trailing blank line. */
export function sseDataFrame(content: string): string {
  return `data: ${JSON.stringify({ content })}\n\n`;
}

/** Builds a single SSE "cta" frame (as sent by the RAG API), including the trailing blank line. */
export function sseCtaFrame(ctas: Cta[]): string {
  return `event: cta\ndata: ${JSON.stringify({ ctas })}\n\n`;
}

export const sseDoneFrame = "event: done\n\n";

type MockResponseOptions = {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  chunks?: string[];
  body?: unknown;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

export function mockFetchResponse({
  ok = true,
  status = 200,
  headers = {},
  chunks = [],
  body,
  json,
  text,
}: MockResponseOptions = {}) {
  return {
    ok,
    status,
    headers: new Headers(headers),
    body: body !== undefined ? body : mockSSEBody(chunks),
    json: json ?? (async () => ({})),
    text: text ?? (async () => ""),
  };
}

export function stubFetch(impl: (...args: Parameters<typeof fetch>) => Promise<unknown>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

/** Parses the JSON request body the hook POSTed on the given fetch call. */
export function requestBody(
  fetchMock: ReturnType<typeof stubFetch>,
  callIndex = 0,
): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[callIndex][1]!.body as string);
}
