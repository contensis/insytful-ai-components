import { useCallback, useState } from "react";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { readSSEFrames } from "../shared/sse";
import { useElapsedTime } from "../utilities/use-elapsed-time";

const history = false;
const stream = true;

export const useRAGResponse = (
  config: string,
  baseUrl: string,
  recaptchaSiteKey?: string,
) => {
  const [response, setResponse] = useState<string>(""); // accumulated streamed text
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { executeRecaptcha } = useGoogleReCaptcha();

  const { elapsed, setElapsed } = useElapsedTime(loading);
  /**
   * Asks a question and returns a response.
   *
   * @param question - The user’s question.
   * @param sections - Optional list of section slugs to scope the question.
   * @returns A promise that resolves when the request completes.
   */
  const ask = useCallback(
    async (question: string, sections?: string[]) => {
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

      setLoading(true);
      setError(null);
      setElapsed(0);
      setResponse("");

      try {
        // POST body — the API moved off query-string params, so there is no
        // URL length ceiling on `question` and no encoding to get wrong.
        const body: Record<string, unknown> = {
          question,
          config,
          history,
          stream,
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

        const payload = await fetch(`${baseUrl}/query-collection`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!payload.ok) {
          let message = `Request failed (${payload.status})`;
          try {
            const json = await payload.json();
            message = json?.message ?? message;
          } catch {
            const text = await payload.text();
            if (text) message = text;
          }
          throw new Error(message);
        }

        if (payload.headers.has("X-Session-Id")) {
          localStorage.setItem(
            "rag-session-id",
            payload.headers.get("X-Session-Id")!,
          );
        }

        if (!payload.body) throw new Error("No payload body");

        for await (const frame of readSSEFrames(payload.body)) {
          switch (frame.event) {
            case "done": {
              setLoading(false);
              setElapsed(0);
              return;
            }
            case "cta": {
              // TODO(Phase 3): CTAs are ignored by the non-conversation hook in v1.
              // See docs/plans/2026-07-14-001-feat-cta-quick-actions-above-answers-plan.md
              break;
            }
            case "message": {
              try {
                const json = JSON.parse(frame.data);
                if (json?.content) setResponse((prev) => prev + json.content);
              } catch (parseErr) {
                console.error("Failed to parse SSE chunk", parseErr, frame.data);
              }
              break;
            }
          }
        }

        setLoading(false);
        setElapsed(0);
      } catch (err) {
        const errorMessage =
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong";
        console.error(err);
        setError(errorMessage);
        setElapsed(0);
        setLoading(false);
      }
    },
    [config, baseUrl, recaptchaSiteKey, executeRecaptcha, setElapsed],
  );

  return { response, loading, elapsed, error, ask };
};
