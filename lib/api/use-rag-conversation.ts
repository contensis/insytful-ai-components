import { useCallback, useEffect, useRef, useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import type { RAGMessage } from "./rag.types";
import { readSSEFrames } from "../shared/sse";
// Imported from the validation module directly (not the `shared/cta` barrel)
// so hook-only consumers tree-shake the handlers/bus modules out.
import { ctasFromFrameData } from "../shared/cta/validation";
import { useElapsedTime } from "../utilities/use-elapsed-time";

export const useRAGConversation = (
  config: string,
  baseUrl: string,
  recaptchaSiteKey?: string,
) => {
  const [messages, setMessages] = useState<RAGMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { executeRecaptcha } = useGoogleReCaptcha();

  const { elapsed, setElapsed } = useElapsedTime(loading);

  // One AbortController per ask(); a newer ask() (or unmount) aborts the
  // previous in-flight stream so its late frames can never touch state.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  /**
   * Asks a question and returns a response.
   *
   * @param question - The user’s question.
   * @param sections - Optional list of section slugs to scope the question.
   * @returns A promise that resolves when the request completes.
   */
  const ask = useCallback(
    async (question: string, sections?: string[]) => {
      // Supersede any in-flight request before doing anything else.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      let recaptchaToken: string | null = null;
      if (recaptchaSiteKey) {
        try {
          if (executeRecaptcha) {
            recaptchaToken = await executeRecaptcha("rag_search");
          }
        } catch {
          console.warn("reCAPTCHA skipped: no provider found");
        }
      }
      if (signal.aborted) return; // superseded while awaiting reCAPTCHA

      // add the user’s message immediately
      setMessages((prev) => [...prev, { role: "user", content: question }]);
      setLoading(true);
      setElapsed(0);
      setError(null);

      try {
        // POST body — the API moved off query-string params, so there is no
        // URL length ceiling on `question` and no encoding to get wrong.
        const body: Record<string, unknown> = {
          question,
          config,
          history: true,
          stream: true,
        };

        if (sections && sections?.length >= 1) {
          body.sections = sections.join(",");
        }

        const headers = new Headers({
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        });

        // only include token if we generated one
        if (recaptchaToken) headers.append("X-Recaptcha-Token", recaptchaToken);

        const sid = localStorage.getItem("rag-session-id");
        if (sid) headers.append("X-Session-Id", sid);

        const response = await fetch(`${baseUrl}/query-collection`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal,
        });

        if (!response.ok) {
          let message = `Request failed (${response.status})`;
          try {
            const json = await response.json();
            message = json?.message ?? message;
          } catch {
            // fallback if not JSON
            const text = await response.text();
            if (text) message = text;
          }
          throw new Error(message);
        }

        if (response.headers.has("X-Session-Id")) {
          localStorage.setItem(
            "rag-session-id",
            response.headers.get("X-Session-Id")!,
          );
        }

        if (!response.body) throw new Error("No response body");

        let assistantMsg = ""; // accumulate assistant’s message

        // Add a placeholder assistant message we’ll update while streaming.
        // Its INDEX is captured here in ask()'s closure — every write (tokens
        // and CTAs) goes through it, never `updated[updated.length - 1]`, so
        // a slow stream's late frames can never land on a follow-up's message.
        let assistantIndex = -1;
        setMessages((prev) => {
          assistantIndex = prev.length;
          return [...prev, { role: "assistant", content: "" }];
        });

        /** Patches THIS ask()'s assistant message by its captured index,
         *  spreading the previous value so `content` and `ctas` writes
         *  never clobber each other. */
        const patchAssistant = (patch: Partial<RAGMessage>) => {
          setMessages((prev) => {
            if (assistantIndex < 0 || assistantIndex >= prev.length) return prev;
            const updated = [...prev];
            updated[assistantIndex] = { ...updated[assistantIndex], ...patch };
            return updated;
          });
        };

        for await (const frame of readSSEFrames(response.body, signal)) {
          switch (frame.event) {
            case "done": {
              setLoading(false);
              setElapsed(0);
              return;
            }
            case "cta": {
              // ctasFromFrameData owns the wire shape ({"ctas":[...]}) and
              // malformed-JSON handling — shared with RAGClient.ask().
              const ctas = ctasFromFrameData(frame.data);
              if (ctas.length > 0) patchAssistant({ ctas });
              break;
            }
            case "message": {
              try {
                const json = JSON.parse(frame.data);
                if (json?.content) {
                  assistantMsg += json.content;
                  patchAssistant({ content: assistantMsg });
                }
              } catch (parseErr) {
                console.error("Failed to parse SSE chunk", parseErr, frame.data);
              }
              break;
            }
          }
        }

        if (signal.aborted) return; // superseded — the newer ask() owns state now
        setLoading(false);
        setElapsed(0);
      } catch (err) {
        // An abort is expected (a newer ask() superseded this one, or the
        // hook unmounted) — never surface it as an error state.
        if (signal.aborted) return;
        const errorMessage =
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong";
        console.error(err);
        setError(errorMessage);
        setLoading(false);
        setElapsed(0);
      }
    },
    [config, baseUrl, recaptchaSiteKey, executeRecaptcha, setElapsed],
  );

  return { messages, loading, error, elapsed, ask };
};
