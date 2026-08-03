import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import type { RAGMessage } from "../../api/rag.types";
import { sanitizeCtas } from "../../shared/cta/validation";
import { SearchProvider, type SearchContextValue } from "../context";
import { SearchMessages } from "../search-messages";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function makeCtx(overrides: Partial<SearchContextValue> = {}): SearchContextValue {
  return {
    open: true,
    onOpenChange: () => {},
    titleId: "title-id",
    descriptionId: "description-id",
    options: { config: "my-config", baseUrl: "https://api.example.com" },
    messages: [],
    loading: false,
    elapsed: 0,
    error: null,
    onSend: async () => {},
    isDevMode: false,
    computedOffsetHeight: 0,
    ...overrides,
  };
}

function renderMessages(ctxOverrides: Partial<SearchContextValue>) {
  const view = render(
    <SearchProvider value={makeCtx(ctxOverrides)}>
      <SearchMessages />
    </SearchProvider>,
  );
  const rerenderMessages = (nextOverrides: Partial<SearchContextValue>) =>
    view.rerender(
      <SearchProvider value={makeCtx(nextOverrides)}>
        <SearchMessages />
      </SearchProvider>,
    );
  return { ...view, rerenderMessages };
}

const ctas = sanitizeCtas([
  { type: "event", label: "Start web chat", event: "openWebChat" },
  { type: "link", label: "Contact page", url: "https://example.com/contact" },
]);

describe("Search.Messages — CTA bar integration", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the CTA bar while the skeleton is still visible (cta frame before tokens)", () => {
    const messages: RAGMessage[] = [
      { role: "user", content: "How do I contact you?" },
      { role: "assistant", content: "", ctas },
    ];
    const { container } = renderMessages({ messages, loading: true });

    // Skeleton still throbbing (no content yet) …
    expect(container.querySelector(".insytful-search-skeleton-content")).not.toBeNull();
    // … and the CTA bar is already there, above it.
    expect(screen.getByRole("group", { name: "Quick actions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start web chat" })).toBeTruthy();
  });

  it("keeps focus on a CTA chip across a token update (stable message keys)", () => {
    const base: RAGMessage[] = [
      { role: "user", content: "How do I contact you?" },
      { role: "assistant", content: "You can reach us", ctas },
    ];
    const { rerenderMessages } = renderMessages({ messages: base, loading: true });

    const chip = screen.getByRole("button", { name: "Start web chat" });
    chip.focus();
    expect(document.activeElement).toBe(chip);

    // Simulated token frame: same message slot, longer content.
    rerenderMessages({
      messages: [
        base[0],
        { ...base[1], content: "You can reach us by phone or web chat." },
      ],
      loading: true,
    });

    // The SAME node still exists and still has focus — the <li> was not remounted.
    expect(screen.getByRole("button", { name: "Start web chat" })).toBe(chip);
    expect(document.activeElement).toBe(chip);
  });

  it("keeps the CTA bar visible when the stream errors", () => {
    const messages: RAGMessage[] = [
      { role: "user", content: "How do I contact you?" },
      { role: "assistant", content: "Partial answ", ctas },
    ];
    const { rerenderMessages, container } = renderMessages({
      messages,
      loading: true,
    });
    expect(screen.getByRole("group", { name: "Quick actions" })).toBeTruthy();

    rerenderMessages({ messages, loading: false, error: "Something went wrong" });

    expect(screen.getByRole("group", { name: "Quick actions" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact page" })).toBeTruthy();
    // Error state must not resurrect the skeleton over the bar.
    expect(container.querySelector(".insytful-search-skeleton-content")).toBeNull();
  });
});
