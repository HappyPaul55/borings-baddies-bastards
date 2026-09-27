# AGENTS.md

## What this repo is

A standalone **game site** for **Borings, Baddies & Bastards** — brand **B3**
(`b3.happypaul55.com`). It follows the agency client-site standard: one
self-contained repository, no monorepo, no shared template, no workspace or
submodule dependency. Structure follows the Lexiphanic reference build; the
**visual style follows `client-happypaul55-com`** (the engineer's-notebook look),
with role accents added on top.

The marketing pages (`/`, `/rules`, `/privacy`, `/404`) are plain Astro and ship no
JavaScript. **`/play` is a React island** (`@astrojs/react`, `client:load`) because
it is an interactive game. A small **Cloudflare Worker** (`worker/index.ts`) serves
`GET /api/words`.

Routes: `/` (landing), `/play` (the game), `/rules`, `/privacy`, `/404`,
`/api/words`.

## Commands

```bash
cp .env.example .env   # word-generation config for local dev
bun install
bun run dev      # dev server on http://localhost:4321 (serves /api/words itself)
bun run build    # static build into dist/
bun run preview  # serve the built site
bun run check    # astro check — types for everything except the tests
bun test         # unit tests for the rules engine, Game class and word service
bun run icons    # regenerate public/icons from public/icons/brand-mark.svg
```

Use **Bun** for everything: `bun` (never `npm`) and `bunx` (never `npx`). The
lockfile is `bun.lock`; do not add `package-lock.json`, `yarn.lock` or
`pnpm-lock.yaml`. Verify every change with `bun run check`, `bun test` and
`bun run build`. There is no linter.

`src/lib/*.test.ts` are excluded from the `astro check` tsconfig because they import
`bun:test`; Bun runs and transpiles them natively (`bun test`).

## Key files

- `src/lib/game.ts` — pure rules. Roles (`ROLES`), scoring (`SCORING`), round steps
  (`ROUND_STEPS`), `assignRoles`, `calculateRoundScores`, `generatePlayerOrder`,
  `shuffle`, `rankPlayers`. No DOM, no React, no network. The game **and** the
  `/rules` page read from it.
- `src/lib/game-store.ts` — the **`Game` class** (stateful session) plus the
  `GameClient` interface and `GameSnapshot`. Publishes an immutable snapshot via
  `subscribe` / `getSnapshot` (consumed with `useSyncExternalStore`). A future
  WebSocket room client implements the same `GameClient` interface.
- `src/lib/word-source.ts` — the AI prompt, `parseWords` and `generateWords`. Drops
  the first word and caps at five. Runtime-free so the Worker and dev server share
  it.
- `src/lib/words-api.ts` — the `/api/words` HTTP handler and `resolveWordEnv`. Used
  by both `worker/index.ts` and the dev plugin in `astro.config.mjs`.
- `src/lib/words.ts` — the browser client for `/api/words`; typed `WordApiError`
  kinds (`network` / `server` / `format` / `empty`).
- `worker/index.ts` — the Worker entry. Serves `/api/words` and otherwise
  `env.ASSETS.fetch(request)`. Types are declared inline on purpose (see gotchas).
- `src/components/game/*.tsx` — the React island. `GameApp.tsx` is the root;
  `GameContext.ts` provides the client and the `useGameSnapshot` hook; one component
  per phase plus small shared pieces.
- `src/lib/*.test.ts` — `bun test` suites (rules engine, `Game` class, word service).
- `src/lib/site.ts` — `SiteSettings`, derived from the Zod schema; Astro components
  type their `settings` prop with it.
- `src/lib/button.ts` — button class names shared by `Button.astro` and `Button.tsx`.
- `src/content/site/settings.json` — site metadata, player limits, author/repo and
  licence. The `file()` loader requires an **array** with `id: "main"`.
- `src/content.config.ts` — Astro 5+ location (NOT `src/content/config.ts`).
- `src/components/layout/Seo.astro` — metadata + JSON-LD (`WebApplication` +
  `WebSite` + author `Person` + `BreadcrumbList`).
- `src/styles/global.css` — Tailwind v4 `@import` + `@theme` tokens, the notebook
  component classes, the game classes, and the print styles.

## Word generation

Server-side only; the API key must never reach the browser. `words.ts` calls
`GET /api/words?term=…`; `words-api.ts` validates and delegates to
`word-source.ts`, which asks an OpenAI-compatible chat endpoint for **5–15** words,
**ignores the first**, and returns **up to 5**; the client picks one at random.

Env vars: `AI_ENDPOINT` (required), `AI_API_KEY` (required secret), `AI_MODEL`
(optional, defaults to `gpt-4o-mini`). Local dev reads `.env`; `wrangler dev` reads
`.dev.vars`; production uses `wrangler secret put AI_API_KEY`. Do not add these to
`settings.json` or any client code.

Categories are limited to 1–60 characters (`CATEGORY_MAX_LENGTH` in
`src/lib/limits.ts`), enforced by the input's `maxLength` **and** server-side in
`words-api.ts` / `word-source.ts`. The request caps the model reply at 500 tokens
(`max_tokens`).

## Client-side architecture

Only `/play` ships JavaScript; the other pages stay static and script-free
(prefetch is off). Keep it that way.

- Do not add any other client framework, and do not make the marketing pages
  interactive. React belongs on `/play` only.
- Keep rules in `src/lib/game.ts`, state in `src/lib/game-store.ts` and rendering in
  `src/components/game/`. Never put game logic in components.
- `useSyncExternalStore` requires `getSnapshot()` to return a **stable reference**
  between changes. `Game` rebuilds its snapshot only inside `emit()`.
- Render text as children, never with `dangerouslySetInnerHTML` — player names are
  user input.

## Design constraints (do not regress)

- The look is an **engineer's notebook**: ink (`--color-ink`), off-white paper
  (`--color-paper`) and electric yellow (`--color-yellow`).
- Type is **Space Grotesk** (display + body) + **Space Mono** (labels). Do not swap
  in other clients' pairings.
- Structural motifs: graph-paper grid on light sections, dot grid on dark ones,
  monospace `//` "comment" labels, the yellow `.mark` highlighter, hard offset
  shadows, and a black header with a permanent yellow rule.
- Three **role accents** sit on top of the base palette: teal `--color-boring`, red
  `--color-baddie`, amber `--color-bastard`, each with an ink-safe `-ink` variant.
  Use them for role names, chips, card edges and result cards only.
- Brand mark is **B3** (`public/icons/brand-mark.svg`, `Mark.astro`).

## Gotchas

- URL policy is `trailingSlash: "never"` + `build.format: "file"`. Output is
  `index.html` / `play.html` / etc.; canonical and sitemap URLs have no trailing
  slash. Active-nav logic in `Header.astro` normalises both `.html` and trailing
  slashes. Check `aria-current` in `dist/*.html`, not just in dev.
- **CSP is `connect-src 'self'`.** The browser only talks to this origin; the AI
  call happens in the Worker. If you ever call a third party from the browser,
  extend `public/_headers`.
- **`run_worker_first: ["/api/*"]` needs Wrangler ≥ 4.20.0**, and
  `assets.binding: "ASSETS"` must be set for `env.ASSETS.fetch` to work.
- `worker/index.ts` declares its `Env` type inline instead of using
  `@cloudflare/workers-types`, which clashes with the DOM lib on the Astro/React
  side. `Env` is a `type` alias (not an `interface`) so it is assignable to
  `Record<string, unknown>` in `resolveWordEnv`.
- The site collects **no personal data**, but the category a player types is sent
  server-side and on to the AI provider. Keep `src/content/legal/privacy.md` in step
  with anything new.
- Icons are generated with the `favicons` package (`bun run icons`), not hand-made.
  `brand-mark.svg` is the source of truth for the wordmark and favicons.
- TypeScript is on 6.x: `astro check` refuses TypeScript 7 (`@astrojs/check` peer
  range is `^5.0.0 || ^6.0.0`). Do not bump to 7.
- The pretty 404 depends on `wrangler.jsonc` setting
  `assets.not_found_handling: "404-page"`.

## Deployment and handover

- Deployed as a **Cloudflare Worker with static assets** via Workers Builds
  (`bun run build` → `bunx wrangler deploy`), configured by `wrangler.jsonc`
  (`name: borings-baddies-bastards`, `main: worker/index.ts`, `assets.directory:
  ./dist`, `assets.binding: ASSETS`, `run_worker_first: ["/api/*"]`).
- Set `AI_API_KEY` (secret) and `AI_ENDPOINT` / `AI_MODEL` before the first deploy.
- `site` is `https://b3.happypaul55.com`; keep `astro.config.mjs`,
  `settings.json.url` and `public/robots.txt` in step if the domain changes.
- Keep `README.md` accurate for handover: commands, build/output, deploy location,
  where data and copy live, the word service and its env vars, the no-personal-data
  rule, icon/font replacement, and the AGPL-3.0 licence.
