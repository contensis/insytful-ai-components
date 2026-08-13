import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RAGClient, type RAGStreamEvent } from "../rag-client";

/* ------------------------------------------------------------------ */
/* Local SSE frame helpers                                              */
/* lib/api/__tests__/sse-test-helpers.ts belongs to the React-side      */
/* workstream, so tiny local equivalents live here instead.             */
/* ------------------------------------------------------------------ */

const sseDataFrame = (content: string): string =>
  `data: ${JSON.stringify({ content })}\n\n`;

// Wire contract: the cta frame's data is `{"ctas":[...]}`, NOT a bare array —
// the original bare-array fixture masked a bug where the client passed the
// whole wrapper object to the sanitizer and dropped every CTA.
const sseCtaFrame = (ctas: unknown[]): string =>
  `event: cta\ndata: ${JSON.stringify({ ctas })}\n\n`;

const sseRawCtaFrame = (payloadJson: string): string =>
  `event: cta\ndata: ${payloadJson}\n\n`;

const sseDoneFrame = (): string => "event: done\ndata: {}\n\n";

/** Builds a Response whose body streams the given SSE frames, then closes. */
function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function clientFor(frames: string[]): RAGClient {
  return new RAGClient({
    baseUrl: "https://api.test",
    projectId: "proj",
    fetchFn: (async () => sseResponse(frames)) as typeof fetch,
  });
}

async function collect(client: RAGClient, question = "q"): Promise<RAGStreamEvent[]> {
  const events: RAGStreamEvent[] = [];
  for await (const ev of client.ask(question)) {
    events.push(ev);
  }
  return events;
}

/* ------------------------------------------------------------------ */

describe("RAGClient.ask", () => {
  let warnSpy: MockInstance;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    localStorage.clear();
  });

  it("POSTs a JSON body to the bare query-collection endpoint", async () => {
    const fetchFn = vi.fn(async () => sseResponse([sseDoneFrame()]));
    const client = new RAGClient({
      baseUrl: "https://api.test",
      projectId: "proj",
      sections: "faq,docs",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await collect(client, "what is this?");

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.test/query-collection");
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      question: "what is this?",
      config: "proj",
      history: true,
      stream: true,
      sections: "faq,docs",
    });
  });

  it("yields { kind: 'token' } events for data frames", async () => {
    const events = await collect(
      clientFor([sseDataFrame("Hello"), sseDataFrame(" world"), sseDoneFrame()]),
    );
    expect(events).toEqual([
      { kind: "token", content: "Hello" },
      { kind: "token", content: " world" },
    ]);
  });

  it("yields a { kind: 'ctas' } event with sanitized CTAs for a cta frame", async () => {
    const payload = [
      { type: "link", label: "Visit", url: "https://example.com/contact" },
      { type: "call", label: "Call us", phone: "+44 1234 567890", intent: "primary" },
    ];
    const events = await collect(
      clientFor([sseCtaFrame(payload), sseDataFrame("Hi"), sseDoneFrame()]),
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      kind: "ctas",
      ctas: [
        {
          type: "link",
          label: "Visit",
          url: "https://example.com/contact",
          newTab: false,
          intent: "secondary",
        },
        {
          type: "call",
          label: "Call us",
          phone: "+441234567890", // normalized by the sanitizer
          intent: "primary",
        },
      ],
    });
    expect(events[1]).toEqual({ kind: "token", content: "Hi" });
  });

  it("warns and skips a cta frame with malformed JSON; streaming continues", async () => {
    const events = await collect(
      clientFor([sseRawCtaFrame("{not json"), sseDataFrame("Still here"), sseDoneFrame()]),
    );
    expect(events).toEqual([{ kind: "token", content: "Still here" }]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Insytful]"),
    );
  });

  it("yields no ctas event when every CTA is dropped by the sanitizer", async () => {
    const payload = [{ type: "bogus", label: "Nope" }];
    const events = await collect(
      clientFor([sseCtaFrame(payload), sseDataFrame("Hi"), sseDoneFrame()]),
    );
    expect(events).toEqual([{ kind: "token", content: "Hi" }]);
  });

  it("stops iterating at the done frame", async () => {
    const events = await collect(
      clientFor([
        sseDataFrame("Before"),
        sseDoneFrame(),
        sseDataFrame("After"),
        sseCtaFrame([{ type: "event", label: "Chat", event: "open" }]),
      ]),
    );
    expect(events).toEqual([{ kind: "token", content: "Before" }]);
  });
});
