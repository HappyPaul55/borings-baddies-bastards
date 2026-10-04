/**
 * Client for our own `/api/words` endpoint.
 *
 * The browser never talks to an AI provider directly — it calls this
 * same-origin route, which holds the API key server-side. Errors are typed so
 * the UI can offer the right recovery: "try again" for a flaky network,
 * "choose a different category" when a topic returns nothing.
 */
import { clearTurnstileSession, turnstileHeaders } from "./turnstile-client";

export type WordApiErrorKind =
  | "network"
  | "server"
  | "format"
  | "empty"
  | "turnstile";

export class WordApiError extends Error {
  readonly kind: WordApiErrorKind;

  constructor(kind: WordApiErrorKind, message: string) {
    super(message);
    this.name = "WordApiError";
    this.kind = kind;
  }
}

export interface FetchWordsOptions {
  signal?: AbortSignal;
}

export async function fetchWords(
  category: string,
  { signal }: FetchWordsOptions = {},
): Promise<string[]> {
  const url = `/api/words?term=${encodeURIComponent(category)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...turnstileHeaders() },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new WordApiError(
      "network",
      "Could not reach the word service. Check your connection and try again.",
    );
  }

  if (response.status === 401) {
    clearTurnstileSession();
    throw new WordApiError(
      "turnstile",
      "Please complete the human check to keep playing.",
    );
  }

  if (!response.ok) {
    throw new WordApiError(
      "server",
      `The word service could not help with that. Please try again.`,
    );
  }

  const text = await response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WordApiError(
      "format",
      "The word service returned something we couldn't read. Please try again.",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new WordApiError(
      "format",
      "The word service returned an unexpected format. Please try again.",
    );
  }

  const words = parsed
    .filter((word): word is string => typeof word === "string")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    throw new WordApiError(
      "empty",
      "No words came back for that category. Try a broader or more common topic.",
    );
  }

  return words;
}
