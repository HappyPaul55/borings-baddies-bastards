/**
 * The `/api/words` HTTP handler, shared by the production Worker and the local
 * dev server so both behave identically. Kept separate from `word-source.ts` so
 * the AI logic can be tested without constructing requests.
 */
import {
  WordSourceError,
  generateWords,
  type AiBinding,
  type WordSourceEnv,
} from "./word-source";
import { CATEGORY_MAX_LENGTH } from "./limits";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function isAiBinding(value: unknown): value is AiBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { run?: unknown }).run === "function"
  );
}

/**
 * Read the word-service settings out of a Worker `env` / process env bag.
 *
 * The Workers AI binding (`env.AI`) is preferred and needs no variables; the
 * optional `WORKERS_AI_MODEL` selects its model. The `AI_*` variables are the
 * optional fallback for runtimes without the binding (local dev). Returns `null`
 * when neither source is available.
 */
export function resolveWordSource(
  env: Record<string, unknown>,
): WordSourceEnv | null {
  const ai = isAiBinding(env.AI) ? env.AI : undefined;
  const aiModel =
    typeof env.WORKERS_AI_MODEL === "string" ? env.WORKERS_AI_MODEL : undefined;
  const endpoint = typeof env.AI_ENDPOINT === "string" ? env.AI_ENDPOINT : "";
  const apiKey = typeof env.AI_API_KEY === "string" ? env.AI_API_KEY : "";
  const model = typeof env.AI_MODEL === "string" ? env.AI_MODEL : undefined;

  if (!ai && (!endpoint || !apiKey)) return null;

  const source: WordSourceEnv = {};
  if (ai) {
    source.ai = ai;
    source.aiModel = aiModel;
  }
  if (endpoint && apiKey) {
    source.endpoint = endpoint;
    source.apiKey = apiKey;
    source.model = model;
  }
  return source;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleWordsRequest(
  request: Request,
  env: WordSourceEnv | null,
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed." }, 405);
  }

  const term = new URL(request.url).searchParams.get("term")?.trim() ?? "";
  if (!term) return json({ error: "A category is required." }, 400);
  if (term.length > CATEGORY_MAX_LENGTH) {
    return json(
      { error: `That category is longer than ${CATEGORY_MAX_LENGTH} characters.` },
      400,
    );
  }
  if (!env) {
    return json({ error: "The word service is not configured." }, 503);
  }

  try {
    return json(await generateWords(term, env), 200);
  } catch (error) {
    if (error instanceof WordSourceError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: "Something went wrong generating words." }, 502);
  }
}
