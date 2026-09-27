/**
 * Word generation.
 *
 * The prompt and the response parsing live here, free of any runtime, so the
 * Worker and the local dev server share exactly the same behaviour. The AI call
 * is server-side only: the API key must never reach the browser.
 */

import { CATEGORY_MAX_LENGTH } from "./limits";

export interface WordSourceEnv {
  /** Full URL of an OpenAI-compatible chat-completions endpoint. */
  endpoint: string;
  apiKey: string;
  /** Model id; defaults to a small, cheap model. */
  model?: string;
}

export class WordSourceError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "WordSourceError";
    this.status = status;
  }
}

/** How many words to ask the model for, and how many we pass on to the game. */
const REQUEST_MIN = 5;
const REQUEST_MAX = 15;
const RETURNED = 5;

/** Upper bound on the model's reply, in tokens. */
const MAX_RESPONSE_TOKENS = 500;

const DEFAULT_MODEL = "gpt-4o-mini";

export function buildPrompt(term: string): string {
  return [
    `List between ${REQUEST_MIN} and ${REQUEST_MAX} single words that fit the category "${term}".`,
    "Use common, concrete words that most people would recognise.",
    "Reply with the words only, separated by commas, in lower case, with no numbering and no explanation.",
  ].join(" ");
}

/**
 * Turn a model reply into the words the game will choose from.
 *
 * Splits on commas, semicolons and newlines, strips bullets/numbering and
 * quotes, lower-cases and de-duplicates, then **drops the first word** (models
 * tend to lead with the category itself) and returns at most {@link RETURNED}.
 */
export function parseWords(raw: string): string[] {
  const withoutFences = raw.replace(/```[a-z]*/gi, " ");
  const seen = new Set<string>();
  const words: string[] = [];

  for (const token of withoutFences.split(/[\n,;]+/)) {
    const word = token
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/["'“”‘’]/g, "")
      .trim()
      .toLowerCase();

    if (!word || word.length > 40 || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }

  return words.slice(1, RETURNED + 1);
}

export async function generateWords(
  term: string,
  env: WordSourceEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const category = term.trim();
  if (!category || category.length > CATEGORY_MAX_LENGTH) {
    throw new WordSourceError(
      `Category must be between 1 and ${CATEGORY_MAX_LENGTH} characters.`,
      400,
    );
  }
  if (!env.endpoint || !env.apiKey) {
    throw new WordSourceError("The word service is not configured.", 503);
  }

  let response: Response;
  try {
    response = await fetchImpl(env.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.apiKey}`,
      },
      body: JSON.stringify({
        model: env.model || DEFAULT_MODEL,
        temperature: 0.8,
        max_tokens: MAX_RESPONSE_TOKENS,
        messages: [
          {
            role: "system",
            content:
              "You generate short word lists for a social deduction party game.",
          },
          { role: "user", content: buildPrompt(category) },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new WordSourceError("Could not reach the word service.", 502);
  }

  if (!response.ok) {
    throw new WordSourceError(
      `The word service returned ${response.status}.`,
      502,
    );
  }

  let content = "";
  try {
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    content = data.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new WordSourceError(
      "The word service returned an unreadable response.",
      502,
    );
  }

  const words = parseWords(content);
  if (words.length === 0) {
    throw new WordSourceError("No words came back for that category.", 422);
  }
  return words;
}
