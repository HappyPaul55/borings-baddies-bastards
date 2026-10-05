/**
 * Word generation.
 *
 * The prompt and the response parsing live here, free of any runtime, so the
 * Worker and the local dev server share exactly the same behaviour. Every AI
 * call is server-side only: no key or binding ever reaches the browser.
 *
 * The preferred path is the **Cloudflare Workers AI binding** (`env.AI`), which
 * needs no configuration and works as soon as the Worker is deployed. When the
 * binding is unavailable — local dev has no such binding — an
 * OpenAI-compatible endpoint can be configured as a fallback. If both exist,
 * the binding is tried first and the endpoint is only used when it fails.
 */

import { CATEGORY_MAX_LENGTH } from "./limits";

/** Minimal shape of the Workers AI binding, available as `env.AI`. */
export interface AiBinding {
  run(model: string, inputs: unknown): Promise<unknown>;
}

export interface WordSourceEnv {
  /** Preferred: the Cloudflare Workers AI binding. */
  ai?: AiBinding;
  /** Workers AI model id; defaults to {@link DEFAULT_WORKERS_AI_MODEL}. */
  aiModel?: string;
  /** Fallback: full URL of an OpenAI-compatible chat-completions endpoint. */
  endpoint?: string;
  apiKey?: string;
  /** Fallback model id; defaults to a small, cheap model. */
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

/** Default OpenAI-compatible fallback model. */
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Last-resort Workers AI model, used only when `WORKERS_AI_MODEL` is not set.
 * Must be a plain instruct model that returns the answer in `content` — reasoning
 * models (for example `@cf/zai-org/glm-4.7-flash`) spend the token budget on a
 * hidden reasoning trace and return empty `content`, which yields no words.
 * Set `WORKERS_AI_MODEL` in wrangler.jsonc to use a different model.
 */
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const SYSTEM_PROMPT =
  "You generate short word lists for a social deduction party game.";

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

function textFromChoices(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  const first = value[0] as { message?: { content?: unknown } } | undefined;
  const content = first?.message?.content;
  return typeof content === "string" ? content : "";
}

/**
 * Pull the assistant text out of a model reply. Workers AI returns
 * `{ response }` for most models, `{ result: { response } }` from the raw REST
 * shape, and some newer models reply with the OpenAI-compatible `choices`
 * array — accept any of them.
 */
export function extractText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;

  if (typeof record.response === "string") return record.response;

  const nested = record.result;
  if (nested && typeof nested === "object") {
    const inner = nested as Record<string, unknown>;
    if (typeof inner.response === "string") return inner.response;
    const fromNestedChoices = textFromChoices(inner.choices);
    if (fromNestedChoices) return fromNestedChoices;
  }

  return textFromChoices(record.choices);
}

/** Generate words with the Cloudflare Workers AI binding. */
async function generateWithBinding(
  category: string,
  ai: AiBinding,
  model?: string,
): Promise<string[]> {
  let result: unknown;
  try {
    result = await ai.run(model || DEFAULT_WORKERS_AI_MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(category) },
      ],
      temperature: 0.8,
      max_tokens: MAX_RESPONSE_TOKENS,
    });
  } catch {
    throw new WordSourceError("Could not reach the word service.", 502);
  }

  const words = parseWords(extractText(result));
  if (words.length === 0) {
    throw new WordSourceError("No words came back for that category.", 422);
  }
  return words;
}

/** Generate words with an OpenAI-compatible chat-completions endpoint. */
async function generateWithEndpoint(
  category: string,
  endpoint: string,
  apiKey: string,
  model: string | undefined,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        temperature: 0.8,
        max_tokens: MAX_RESPONSE_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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

/**
 * Resolve the game words for a category, preferring the Workers AI binding and
 * falling back to the configured endpoint when the binding is absent or fails.
 */
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

  if (env.ai) {
    try {
      return await generateWithBinding(category, env.ai, env.aiModel);
    } catch (error) {
      if (!env.endpoint || !env.apiKey) throw error;
      console.warn(
        `[words] Workers AI binding failed, using the fallback endpoint: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (env.endpoint && env.apiKey) {
    return generateWithEndpoint(
      category,
      env.endpoint,
      env.apiKey,
      env.model,
      fetchImpl,
    );
  }

  throw new WordSourceError("The word service is not configured.", 503);
}
