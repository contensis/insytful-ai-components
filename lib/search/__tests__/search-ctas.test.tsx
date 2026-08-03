import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Cta } from "../../api/rag.types";
import { sanitizeCtas } from "../../shared/cta/validation";
import { registerCtaHandler } from "../../shared/cta/handlers";
import { getInsytfulAISearchEvents } from "../../shared/cta/bus";
import { SearchProvider, type SearchContextValue } from "../context";
import { SearchCtas, type SearchCtasProps } from "../search-ctas";

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

function renderCtas(
  props: SearchCtasProps,
  ctxOverrides: Partial<SearchContextValue> = {},
) {
  return render(
    <SearchProvider value={makeCtx(ctxOverrides)}>
      <SearchCtas {...props} />
    </SearchProvider>,
  );
}

/** Sanitized fixtures — SearchCtas contractually receives post-sanitizeCtas input. */
function makeCtas(): Cta[] {
  return sanitizeCtas([
    { type: "call", label: "Call us", phone: "+44 (0)1234 567890", intent: "primary" },
    { type: "email", label: "Email us", email: "help@example.com", subject: "Hi" },
    { type: "link", label: "Visit contact page", url: "https://example.com/contact", newTab: true },
    { type: "event", label: "Start web chat", event: "openWebChat", detail: { topic: "contact" } },
  ]);
}

describe("Search.Ctas", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders call/email/link as anchors with normalized hrefs and event as a button", () => {
    renderCtas({ ctas: makeCtas() });

    const call = screen.getByRole("link", { name: "Call us" });
    expect(call.getAttribute("href")).toBe("tel:+4401234567890");
    expect(call.hasAttribute("target")).toBe(false);

    const email = screen.getByRole("link", { name: "Email us" });
    expect(email.getAttribute("href")).toBe("mailto:help@example.com?subject=Hi");

    const link = screen.getByRole("link", { name: /visit contact page/i });
    expect(link.getAttribute("href")).toBe("https://example.com/contact");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");

    const button = screen.getByRole("button", { name: "Start web chat" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("renders nothing for empty or absent ctas", () => {
    const { unmount } = renderCtas({ ctas: [] });
    expect(screen.queryByRole("group")).toBeNull();
    unmount();

    renderCtas({});
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("never renders unknown CTA types (sanitizer drops them)", () => {
    const weird = sanitizeCtas([
      { type: "weird", label: "Do not render me" },
      { type: "__proto__", label: "Nope" },
    ]);
    renderCtas({ ctas: weird });
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByText("Do not render me")).toBeNull();
  });

  it("exposes group semantics labelled by the visible 'Quick actions' label", () => {
    renderCtas({ ctas: makeCtas() });

    const group = screen.getByRole("group", { name: "Quick actions" });
    const labelId = group.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const label = document.getElementById(labelId!);
    expect(label?.textContent).toBe("Quick actions");
    // The label is visible, not sr-only — aria-labelledby points at real text.
    expect(label?.classList.contains("insytful-sr-only")).toBe(false);
  });

  it("announces availability once via a visually-hidden role=status cue", () => {
    renderCtas({ ctas: makeCtas() });
    const status = screen.getByRole("status");
    expect(status.classList.contains("insytful-sr-only")).toBe(true);
    expect(status.textContent).toBe("4 quick actions available");
  });

  it("suffixes new-tab links with the sr-only '(opens in a new tab)' pattern", () => {
    renderCtas({ ctas: makeCtas() });
    const link = screen.getByRole("link", { name: /visit contact page/i });
    const srOnly = link.querySelector(".insytful-sr-only");
    expect(srOnly?.textContent).toBe(" (opens in a new tab)");
    // Same-tab anchors carry no suffix.
    const call = screen.getByRole("link", { name: "Call us" });
    expect(call.querySelector(".insytful-sr-only")).toBeNull();
  });

  it("fires onCtaClick with the full Cta and lets native navigation proceed on a default anchor click", () => {
    const ctas = makeCtas();
    const onCtaClick = vi.fn();
    const busEvents: unknown[] = [];
    const bus = getInsytfulAISearchEvents()!;
    const onBus = (e: Event) => busEvents.push((e as CustomEvent).detail);
    bus.addEventListener("insytful-cta", onBus);

    try {
      renderCtas({ ctas }, { onCtaClick });
      const call = screen.getByRole("link", { name: "Call us" });

      // fireEvent.click returns false when preventDefault was called —
      // `true` here asserts exactly one (native) navigation would occur.
      const nativeNavProceeds = fireEvent.click(call);

      expect(nativeNavProceeds).toBe(true);
      expect(onCtaClick).toHaveBeenCalledTimes(1);
      expect(onCtaClick).toHaveBeenCalledWith(ctas[0]);
      expect(busEvents).toEqual([{ name: "call", cta: ctas[0] }]);
    } finally {
      bus.removeEventListener("insytful-cta", onBus);
    }
  });

  it("intercepts unmodified left-clicks on anchors when an override is registered", () => {
    const ctas = makeCtas();
    const override = vi.fn();
    const unregister = registerCtaHandler("link", override);

    try {
      renderCtas({ ctas });
      const link = screen.getByRole("link", { name: /visit contact page/i });

      const nativeNavProceeds = fireEvent.click(link);

      expect(nativeNavProceeds).toBe(false); // preventDefault — no native nav
      expect(override).toHaveBeenCalledTimes(1);
      expect(override).toHaveBeenCalledWith(ctas[2]);

      // Modified clicks keep native behaviour and skip the override.
      const modifiedNavProceeds = fireEvent.click(link, { ctrlKey: true });
      expect(modifiedNavProceeds).toBe(true);
      expect(override).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it("dispatches the CMS-named bus event (and onCtaClick) for event-type button clicks", () => {
    const ctas = makeCtas();
    const onCtaClick = vi.fn();
    const received: unknown[] = [];
    const bus = getInsytfulAISearchEvents()!;
    const onNamed = (e: Event) => received.push((e as CustomEvent).detail);
    bus.addEventListener("openWebChat", onNamed);

    try {
      renderCtas({ ctas }, { onCtaClick });
      fireEvent.click(screen.getByRole("button", { name: "Start web chat" }));

      expect(received).toEqual([{ topic: "contact" }]);
      expect(onCtaClick).toHaveBeenCalledTimes(1);
      expect(onCtaClick).toHaveBeenCalledWith(ctas[3]);
    } finally {
      bus.removeEventListener("openWebChat", onNamed);
    }
  });
});
