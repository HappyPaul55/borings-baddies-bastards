/**
 * Cloudflare Worker entry point.
 *
 * Static assets are uploaded from `dist/` and served by the asset server.
 * `run_worker_first: ["/api/*"]` in wrangler.jsonc sends only the API routes
 * here; everything else is served as a static asset (with the pretty 404 page).
 *
 * Types are declared inline rather than pulling in `@cloudflare/workers-types`,
 * which would clash with the DOM lib used by the Astro/React side of the repo.
 */
import { handleWordsRequest, resolveWordSource } from "../src/lib/words-api";
import type { AiBinding } from "../src/lib/word-source";
import {
  handleSessionRequest,
  requireTurnstileSession,
  resolveTurnstileEnv,
} from "../src/lib/turnstile";

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Workers AI binding, configured by the `ai` block in wrangler.jsonc. */
  AI?: AiBinding;
  /** Workers AI model id for the binding; defaults in code if unset. */
  WORKERS_AI_MODEL?: string;
  /** Optional fallback used when the AI binding is unavailable or fails. */
  AI_ENDPOINT?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_HOSTNAMES?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const turnstile = resolveTurnstileEnv(env);

    if (pathname === "/api/session") {
      return handleSessionRequest(request, turnstile);
    }

    if (pathname === "/api/words") {
      const denial = await requireTurnstileSession(request, turnstile);
      if (denial) return denial;
      return handleWordsRequest(request, resolveWordSource(env));
    }

    return env.ASSETS.fetch(request);
  },
};
