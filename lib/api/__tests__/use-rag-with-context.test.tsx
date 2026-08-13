import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { RAGProvider } from "../rag-context";
import { useRAGConversationContext, useRAGResponseContext } from "../use-rag-with-context";
import { mockFetchResponse, requestBody, sseDataFrame, stubFetch } from "./sse-test-helpers";

vi.mock("react-google-recaptcha-v3", () => ({
  useGoogleReCaptcha: vi.fn(() => ({ executeRecaptcha: undefined })),
  GoogleReCaptchaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function wrapperFor(config: string, baseUrl: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <RAGProvider config={config} baseUrl={baseUrl}>
      {children}
    </RAGProvider>
  );
}

describe("useRAGResponseContext / useRAGConversationContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("useRAGResponseContext sends requests using the RAGProvider's config and baseUrl", async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [sseDataFrame("answer")] }));

    const { result } = renderHook(() => useRAGResponseContext(), {
      wrapper: wrapperFor("ctx-config", "https://ctx.example.com"),
    });

    await act(async () => {
      await result.current.ask("question");
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://ctx.example.com/query-collection");
    expect(requestBody(fetchMock).config).toBe("ctx-config");
    expect(result.current.response).toBe("answer");
  });

  it("useRAGConversationContext sends requests using the RAGProvider's config and baseUrl", async () => {
    const fetchMock = stubFetch(async () => mockFetchResponse({ chunks: [sseDataFrame("answer")] }));

    const { result } = renderHook(() => useRAGConversationContext(), {
      wrapper: wrapperFor("ctx-config", "https://ctx.example.com"),
    });

    await act(async () => {
      await result.current.ask("question");
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://ctx.example.com/query-collection");
    expect(requestBody(fetchMock).config).toBe("ctx-config");
    expect(result.current.messages).toEqual([
      { role: "user", content: "question" },
      { role: "assistant", content: "answer" },
    ]);
  });

  it("throws when used outside of RAGProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useRAGResponseContext())).toThrow(
      "useRAGConfig must be used within RAGProvider"
    );
    consoleError.mockRestore();
  });
});
