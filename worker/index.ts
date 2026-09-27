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
import { handleWordsRequest, resolveWordEnv } from "../src/lib/words-api";

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  AI_ENDPOINT?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/words") {
      return handleWordsRequest(request, resolveWordEnv(env));
    }

    return env.ASSETS.fetch(request);
  },
};
