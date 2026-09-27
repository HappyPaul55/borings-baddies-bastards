// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

/**
 * Serves `/api/words` during `astro dev` using the exact handler the Worker runs
 * in production, so local development exercises the real AI path. Reads config
 * from `.env` (and the ambient environment). Dev only — `apply: "serve"`.
 *
 * @returns {import("vite").Plugin}
 */
function devWordsApi() {
  return {
    name: "dev-words-api",
    apply: "serve",
    configureServer(server) {
      const env = {
        ...loadEnv(server.config.mode, process.cwd(), ""),
        ...process.env,
      };

      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        if (path !== "/api/words") {
          next();
          return;
        }

        try {
          const mod = /** @type {typeof import("./src/lib/words-api")} */ (
            await server.ssrLoadModule("/src/lib/words-api.ts")
          );
          const request = new Request(`http://localhost${req.url ?? ""}`);
          const response = await mod.handleWordsRequest(
            request,
            mod.resolveWordEnv(env),
          );

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(
            `[dev-words-api] ${error instanceof Error ? error.message : String(error)}`,
          );
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "The dev word service failed." }));
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
    plugins: [tailwindcss(), devWordsApi()],
  },
});
