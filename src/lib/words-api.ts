/**
 * The `/api/words` HTTP handler, shared by the production Worker and the local
 * dev server so both behave identically. Kept separate from `word-source.ts` so
 * the AI logic can be tested without constructing requests.
 */
import { WordSourceError, generateWords, type WordSourceEnv } from "./word-source";
import { CATEGORY_MAX_LENGTH } from "./limits";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

/** Read the AI settings out of a Worker `env` / process env bag. */
export function resolveWordEnv(env: Record<string, unknown>): WordSourceEnv | null {
  const endpoint = typeof env.AI_ENDPOINT === "string" ? env.AI_ENDPOINT : "";
  const apiKey = typeof env.AI_API_KEY === "string" ? env.AI_API_KEY : "";
  const model = typeof env.AI_MODEL === "string" ? env.AI_MODEL : undefined;

  if (!endpoint || !apiKey) return null;
  return { endpoint, apiKey, model };
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
