import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useRAGResponse } from "../use-rag-response";
import {
  mockExecuteRecaptcha,
  mockFetchResponse,
  requestBody,
  sseDataFrame,
  sseDoneFrame,
  stubFetch,
} from "./sse-test-helpers";

vi.mock("react-google-recaptcha-v3", () => ({
  useGoogleReCaptcha: vi.fn(() => ({ executeRecaptcha: undefined })),
}));

describe("useRAGResponse", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(useGoogleReCaptcha).mockReturnValue({ executeRecaptcha: undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("streams the accumulated response on the happy path", async () => {
    stubFetch(async () =>
      mockFetchResponse({ chunks: [sseDataFrame("Hello "), sseDataFrame("world")] })
    );

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("What is this?");
    });

    expect(result.current.response).toBe("Hello world");
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("stops accumulating once an event: done frame is received", async () => {
    stubFetch(async () =>
      mockFetchResponse({
        chunks: [sseDataFrame("partial"), sseDoneFrame, sseDataFrame("ignored")],
      })
    );

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(result.current.response).toBe("partial");
    expect(result.current.loading).toBe(false);
  });

  it("POSTs a JSON body to the bare query-collection endpoint", async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

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
      history: false,
      stream: true,
    });
  });

  it("serializes the sections param when provided", async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question", ["faq", "docs"]);
    });

    expect(requestBody(fetchMock).sections).toBe("faq,docs");
  });

  it("omits the sections param when none are provided", async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(requestBody(fetchMock)).not.toHaveProperty("sections");
  });

  it("round-trips the session id via localStorage and the X-Session-Id header", async () => {
    localStorage.setItem("rag-session-id", "existing-session");
    const fetchMock = stubFetch(async () =>
      mockFetchResponse({ headers: { "X-Session-Id": "new-session" }, chunks: [] })
    );

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

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

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(result.current.error).toBe("Boom");
    expect(result.current.loading).toBe(false);
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

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(result.current.error).toBe("plain text failure");
  });

  it("errors out when the response has no body", async () => {
    stubFetch(async () => mockFetchResponse({ body: null }));

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(result.current.error).toBe("No payload body");
  });

  it("does not call executeRecaptcha when no recaptchaSiteKey is configured", async () => {
    const executeRecaptcha = mockExecuteRecaptcha().mockResolvedValue("token");
    vi.mocked(useGoogleReCaptcha).mockReturnValue({ executeRecaptcha });
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));

    const { result } = renderHook(() => useRAGResponse("my-config", "https://api.example.com"));

    await act(async () => {
      await result.current.ask("question");
    });

    expect(executeRecaptcha).not.toHaveBeenCalled();
    const requestHeaders = fetchMock.mock.calls[0][1]!.headers as Headers;
    expect(requestHeaders.has("X-Recaptcha-Token")).toBe(false);
  });

  it("attaches the X-Recaptcha-Token header when a token is generated", async () => {
    const executeRecaptcha = mockExecuteRecaptcha().mockResolvedValue("captcha-token");
    vi.mocked(useGoogleReCaptcha).mockReturnValue({ executeRecaptcha });
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));

    const { result } = renderHook(() =>
      useRAGResponse("my-config", "https://api.example.com", "site-key")
    );

    await act(async () => {
      await result.current.ask("question");
    });

    expect(executeRecaptcha).toHaveBeenCalledWith("rag_search");
    const requestHeaders = fetchMock.mock.calls[0][1]!.headers as Headers;
    expect(requestHeaders.get("X-Recaptcha-Token")).toBe("captcha-token");
  });

  it("proceeds without a token when the recaptcha script failed to load/ready", async () => {
    const executeRecaptcha = mockExecuteRecaptcha().mockRejectedValue(new Error("script not ready"));
    vi.mocked(useGoogleReCaptcha).mockReturnValue({ executeRecaptcha });
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [] }));

    const { result } = renderHook(() =>
      useRAGResponse("my-config", "https://api.example.com", "site-key")
    );

    await act(async () => {
      await result.current.ask("question");
    });

    const requestHeaders = fetchMock.mock.calls[0][1]!.headers as Headers;
    expect(requestHeaders.has("X-Recaptcha-Token")).toBe(false);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
