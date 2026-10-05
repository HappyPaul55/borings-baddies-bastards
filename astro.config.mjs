// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

/**
 * Serves `/api/words` and `/api/session` during `astro dev` using the exact
 * handlers the Worker runs in production, so local development exercises the
 * real AI and Turnstile paths. Reads config from `.env` (and the ambient
 * environment). Dev only — `apply: "serve"`.
 *
 * @returns {import("vite").Plugin}
 */
function devApi() {
  return {
    name: "dev-api",
    apply: "serve",
    configureServer(server) {
      const env = {
        ...loadEnv(server.config.mode, process.cwd(), ""),
        ...process.env,
      };

      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (path !== "/api/words" && path !== "/api/session") {
          next();
          return;
        }

        try {
          const words = /** @type {typeof import("./src/lib/words-api")} */ (
            await server.ssrLoadModule("/src/lib/words-api.ts")
          );
          const turnstile = /** @type {typeof import("./src/lib/turnstile")} */ (
            await server.ssrLoadModule("/src/lib/turnstile.ts")
          );

          // Forward only the headers the handlers use. The session token rides
          // in `x-turnstile-session`.
          /** @param {string} name */
          const pick = (name) => {
            const value = req.headers[name];
            return Array.isArray(value) ? value[0] : value;
          };
          /** @type {Record<string, string>} */
          const headers = {};
          for (const name of ["content-type", "accept", "x-turnstile-session"]) {
            const value = pick(name);
            if (value) headers[name] = value;
          }

          let body;
          if (req.method !== "GET" && req.method !== "HEAD") {
            /** @type {Buffer[]} */
            const chunks = [];
            for await (const chunk of req) chunks.push(Buffer.from(chunk));
            body = Buffer.concat(chunks);
          }

          const request = new Request(`http://localhost${req.url ?? ""}`, {
            method: req.method,
            headers,
            body,
          });

          const turnstileEnv = turnstile.resolveTurnstileEnv(env);

          let response;
          if (path === "/api/session") {
            response = await turnstile.handleSessionRequest(request, turnstileEnv);
          } else {
            const denial = await turnstile.requireTurnstileSession(
              request,
              turnstileEnv,
            );
            response =
              denial ??
              (await words.handleWordsRequest(
                request,
                words.resolveWordSource(env),
              ));
          }

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(
            `[dev-api] ${error instanceof Error ? error.message : String(error)}`,
          );
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "The dev API failed." }));
        }
      });
    },
  };
}

export default defineConfig({
  site: "https://b3.happypaul55.com",
  build: {
    format: "file",
    inlineStylesheets: "always",
  },
  trailingSlash: "never",
  integrations: [sitemap(), react()],
  vite: {
    plugins: [tailwindcss(), devApi()],
  },
});
