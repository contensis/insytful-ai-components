import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useRAGConversation } from "../use-rag-conversation";
import {
  mockExecuteRecaptcha,
  mockFetchResponse,
  requestBody,
  sseDataFrame,
  stubFetch,
} from "./sse-test-helpers";

vi.mock("react-google-recaptcha-v3", () => ({
  useGoogleReCaptcha: vi.fn(() => ({ executeRecaptcha: undefined })),
}));

describe("useRAGConversation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useGoogleReCaptcha).mockReturnValue({ executeRecaptcha: undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("appends a user message immediately, then streams the assistant reply", async () => {
    stubFetch(async () =>
      mockFetchResponse({ chunks: [sseDataFrame("Hi "), sseDataFrame("there")] })
    );

    const { result } = renderHook(() => useRAGConversation("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("Hello?");
    });

    expect(result.current.messages).toEqual([
      { role: "user", content: "Hello?" },
      { role: "assistant", content: "Hi there" },
    ]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("accumulates multiple turns across successive ask() calls", async () => {
    stubFetch(async () => mockFetchResponse({ chunks: [sseDataFrame("First answer")] }));
    const { result } = renderHook(() => useRAGConversation("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("First question");
    });

    stubFetch(async () => mockFetchResponse({ chunks: [sseDataFrame("Second answer")] }));

    await act(async () => {
      await result.current.ask("Second question");
    });

    expect(result.current.messages).toEqual([
      { role: "user", content: "First question" },
      { role: "assistant", content: "First answer" },
      { role: "user", content: "Second question" },
      { role: "assistant", content: "Second answer" },
    ]);
  });

  it("POSTs a JSON body to the bare query-collection endpoint", async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));
    const { result } = renderHook(() => useRAGConversation("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/query-collection");
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    expect(requestBody(fetchMock)).toEqual({
      question: "question",
      config: "my-config",
      history: true,
      stream: true,
    });
  });

  it("serializes the sections param when provided", async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));
    const { result } = renderHook(() => useRAGConversation("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question", ["faq"]);
    });

    expect(requestBody(fetchMock).sections).toBe("faq");
  });

  it("round-trips the session id via localStorage and the X-Session-Id header", async () => {
    localStorage.setItem("rag-session-id", "existing-session");
    const fetchMock = stubFetch(async () =>
      mockFetchResponse({ headers: { "X-Session-Id": "new-session" }, chunks: [] })
    );

    const { result } = renderHook(() => useRAGConversation("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    const requestHeaders = fetchMock.mock.calls[0][1]!.headers as Headers;
    expect(requestHeaders.get("X-Session-Id")).toBe("existing-session");
    expect(localStorage.getItem("rag-session-id")).toBe("new-session");
  });

  it("surfaces the JSON error message when the request fails", async () => {
    stubFetch(async () =>
      mockFetchResponse({ ok: false, status: 500, json: async () => ({ message: "Boom" }) })
    );

    const { result } = renderHook(() => useRAGConversation("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(result.current.error).toBe("Boom");
    // the user's message stays in the transcript even though the assistant reply failed
    expect(result.current.messages).toEqual([{ role: "user", content: "question" }]);
  });

  it("falls back to the response text when the error body isn't JSON", async () => {
    stubFetch(async () =>
      mockFetchResponse({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
        text: async () => "plain text failure",
      })
    );

    const { result } = renderHook(() => useRAGConversation("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(result.current.error).toBe("plain text failure");
  });

  it("errors out when the response has no body", async () => {
    stubFetch(async () => mockFetchResponse({ body: null }));

    const { result } = renderHook(() => useRAGConversation("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(result.current.error).toBe("No response body");
  });

  it("attaches the X-Recaptcha-Token header when a token is generated", async () => {
    const executeRecaptcha = mockExecuteRecaptcha().mockResolvedValue("captcha-token");
    vi.mocked(useGoogleReCaptcha).mockReturnValue({ executeRecaptcha });
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));

    const { result } = renderHook(() =>
      useRAGConversation("my-config", "https://api.example.com", "site-key")
    );

    await act(async () => {
      await result.current.ask("question");
    });

    const requestHeaders = fetchMock.mock.calls[0][1]!.headers as Headers;
    expect(requestHeaders.get("X-Recaptcha-Token")).toBe("captcha-token");
  });

  it("proceeds without a token when the recaptcha script failed to load/ready", async () => {
    const executeRecaptcha = mockExecuteRecaptcha().mockRejectedValue(new Error("script not ready"));
    vi.mocked(useGoogleReCaptcha).mockReturnValue({ executeRecaptcha });
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));

    const { result } = renderHook(() =>
      useRAGConversation("my-config", "https://api.example.com", "site-key")
    );

    await act(async () => {
      await result.current.ask("question");
    });

    const requestHeaders = fetchMock.mock.calls[0][1]!.headers as Headers;
    expect(requestHeaders.has("X-Recaptcha-Token")).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
