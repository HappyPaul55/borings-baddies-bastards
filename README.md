# Boring, Baddie & Bastards — B3

A free, pass-the-phone social deduction party game for 3–10 players, built with
[Astro](https://astro.build) and [Tailwind CSS v4](https://tailwindcss.com), with a
[React](https://react.dev) island for the game itself and a small Cloudflare Worker
that generates the secret word via an AI model.

One phone gets passed around the group. Everyone shares a secret word — except the
Baddies — and the room has to work out who is faking it before the votes are
counted. Three roles: **Boring** (sees the word, hunts the fakes), **Baddie**
(blind, blends in) and **Bastard** (sees the word, wants to be accused).

The site is **B3** (`b3.happypaul55.com`); the full game name is set in
`src/content/site/settings.json`.

## Routes

| Route      | What it is                                                        |
| ---------- | ----------------------------------------------------------------- |
| `/`        | Landing page: hero, role cards, round flow, scoring, call to play |
| `/play`    | The game itself (the only page with client-side JavaScript)       |
| `/rules`   | Full rules, round-by-round flow, scoring tables and FAQ           |
| `/privacy` | Privacy notice (rendered from `src/content/legal/privacy.md`)     |
| `/404`     | Not found — `noindex` and excluded from the sitemap               |
| `/api/words` | GET · generates words for a category (server-side, see below)   |

## Local development

```bash
cp .env.example .env   # then fill in AI_ENDPOINT / AI_API_KEY (word generation)
bun install
bun run dev      # dev server on http://localhost:4321
bun run build    # production build into dist/
bun run preview  # serve the built site locally
bun run check    # type-check .astro and .ts/.tsx files (astro check)
bun test         # unit tests for the rules engine, Game class and word service
bun run icons    # regenerate public/icons from public/icons/brand-mark.svg
```

Requires Node.js 20+ and [Bun](https://bun.sh). Use `bun` (never `npm`) and `bunx`
(never `npx`). The lockfile is `bun.lock`; do not add `package-lock.json`,
`yarn.lock` or `pnpm-lock.yaml`. There is no linter; the gates are `bun run check`,
`bun test` and `bun run build`.

`astro dev` serves `/api/words` itself, using the same handler the Worker runs in
production, reading `.env`. Without `AI_ENDPOINT`/`AI_API_KEY` the game still runs
and simply shows the "word service unavailable" state when a round starts.

## Tests

`bun test` covers:

- `src/lib/game.test.ts` — the rules engine (role assignment always keeps Boring in
  the majority, scoring matches the published table).
- `src/lib/game-store.test.ts` — the `Game` class (validation, a full round,
  recovery from a failing word service, reset).
- `src/lib/word-source.test.ts` — prompt/parse behaviour (`parseWords` drops the
  first word and caps at five) and the `/api/words` handler statuses.

35 tests, no external services required (the AI call is stubbed). The test files are
excluded from `astro check`'s tsconfig because they import `bun:test`.

## Word generation

The secret word is produced **server-side** — the AI API key never reaches the
browser. `src/lib/words.ts` (client) calls `GET /api/words?term=…`; the handler in
`src/lib/words-api.ts` and `src/lib/word-source.ts` asks an OpenAI-compatible chat
model for a list of words, then:

- asks for **between 5 and 15** words,
- caps the model's reply at **500 tokens**,
- **ignores the first** word returned (models tend to lead with the category),
- returns **up to 5** words,
- the client picks one at random and shows it only to the roles that may see it.

A category must be 1–60 characters; the limit lives in `src/lib/limits.ts`
(`CATEGORY_MAX_LENGTH`) and is enforced both by the input's `maxLength` and by the
server before any AI call.

Configuration is entirely via environment variables:

| Variable      | Required | Notes                                                        |
| ------------- | -------- | ------------------------------------------------------------ |
| `AI_ENDPOINT` | yes      | Full URL of an OpenAI-compatible chat-completions endpoint   |
| `AI_API_KEY`  | yes      | Secret. `wrangler secret put AI_API_KEY` in production       |
| `AI_MODEL`    | no       | Model id; defaults to `gpt-4o-mini`                          |

For local development put them in `.env` (git-ignored); for `wrangler dev` use
`.dev.vars`; in production set `AI_API_KEY` as a secret and the others as Worker
vars.

## Deployment

The site is static assets plus a small Worker, deployed to **Cloudflare Workers**
via Workers Builds:

```text
Build command:    bun run build
Deploy command:   bunx wrangler deploy
Output directory: dist
```

`wrangler.jsonc` uploads `dist/` as static assets (binding `ASSETS`) and routes
`/api/*` to the Worker first (`run_worker_first`), leaving everything else
asset-first with the pretty 404 page (`not_found_handling: "404-page"`).
**Selective `run_worker_first` needs Wrangler ≥ 4.20.0.** The Worker lives at
`worker/index.ts` and is bundled and deployed by `wrangler`; Astro still builds the
frontend as a plain static site, so no Astro adapter is used.

The production origin is `https://b3.happypaul55.com`, set as `site` in
`astro.config.mjs` and mirrored in `src/content/site/settings.json` (`url`) and
`public/robots.txt`. If the domain changes, change all three and rebuild.

Set production secrets before the first deploy:

```bash
bunx wrangler secret put AI_API_KEY
# and AI_ENDPOINT / AI_MODEL as vars or secrets
```

## Content and code layout

| What                                              | Where                                  |
| ------------------------------------------------- | -------------------------------------- |
| Site metadata, player limits, author, repo/licence | `src/content/site/settings.json`       |
| Page copy and sections                            | `src/components/sections/*.astro`      |
| Header / footer / metadata + JSON-LD              | `src/components/layout/*.astro`        |
| Design tokens and component classes               | `src/styles/global.css` (`@theme`)     |
| Game rules, roles, scoring (single source of truth) | `src/lib/game.ts`                    |
| Game session: the `Game` class + `GameClient`      | `src/lib/game-store.ts`                |
| React game island (views, one per phase)           | `src/components/game/*.tsx`            |
| `/play` page shell that mounts the island          | `src/pages/play.astro`                 |
| Word service: client / handler / prompt+parse      | `src/lib/words.ts` · `words-api.ts` · `word-source.ts` |
| Worker entry (Worker + static assets)              | `worker/index.ts`                      |
| Privacy notice                                    | `src/content/legal/privacy.md`         |
| Zod schemas for the two collections               | `src/content.config.ts`                |
| Icons, favicons, manifest                         | `public/icons/`                        |
| Self-hosted fonts                                 | `public/fonts/`                        |

`src/content/site/settings.json` is an **array** with `id: "main"` (required by
Astro's `file()` loader); the site reads `getEntry("site", "main")`. Adding a field
there without updating the schema in `src/content.config.ts` fails the build.

The role definitions, the "Boring stays a majority" assignment rule and the whole
scoring table live once in `src/lib/game.ts`. Both the game and the `/rules` page
read from it, so the published rules cannot drift from the code.

## How the game is built

The landing, rules, privacy and 404 pages ship **no JavaScript**. Only `/play` does,
because it is an interactive game, and it is a React island
([`@astrojs/react`](https://docs.astro.build/en/guides/integrations-guide-react/),
`client:load`) that Astro server-renders into the page and then hydrates.

- **`src/lib/game.ts`** — pure rules. No DOM, no React, no network.
- **`src/lib/game-store.ts`** — the **`Game` class**, which owns one table's state
  and publishes an immutable `GameSnapshot` for React to read with
  `useSyncExternalStore`.
- **`src/components/game/*.tsx`** — the React views, one component per phase.

Because the UI only reads snapshots and calls `GameClient` methods, a future
multi-device client (a room Durable Object over WebSockets) can implement the same
interface; the components should not need to change.

## Privacy

The game has no accounts, no cookies, no analytics and no server-side storage. The
only data that leaves the browser is the category a player types, which is sent to
this site's own `/api/words` endpoint and then to the configured AI provider to
generate words. `src/content/legal/privacy.md` explains this and must be updated
before anything else that collects personal data is added.

## Icons and fonts

- Icons are generated from `public/icons/brand-mark.svg` (a yellow tile with a
  "B3" monogram) with `bun run icons` (the `favicons` package via
  `scripts/generate-icons.mjs`). Replace the SVG and re-run the script to rebrand.
  The social/Open Graph image is `public/icons/apple-touch-icon-1024x1024.png`.
- Fonts are self-hosted latin-subset woff2 files in `public/fonts/`: Space Grotesk
  (variable, display + body) and Space Mono (400/700, labels). Space Grotesk is
  preloaded in `src/layouts/BaseLayout.astro`. To swap typefaces, update the
  `@font-face` rules, the preload link and the `--font-display` / `--font-body` /
  `--font-mono` tokens in `src/styles/global.css`. `scripts/fetch-fonts.mjs` is a
  one-off Google Fonts helper, not part of the build.

## SEO, headers and caching

- Unique `<title>`, meta description and canonical URL per indexable page; Open
  Graph and Twitter cards; a generated icon set and web manifest.
- JSON-LD `@graph` of `WebApplication` (the game), `Website` and the author
  `Person` (linking to `happypaul55.com`), plus a `BreadcrumbList` on sub-pages.
- `sitemap-index.xml` (via `@astrojs/sitemap`) and `robots.txt`; the 404 is
  `noindex` and excluded from the sitemap.
- `public/_headers` sets security headers (CSP, HSTS, `nosniff`, frame denial) and
  long-lived caching. The CSP is `connect-src 'self'` — the browser only ever talks
  to this origin; the AI call happens server-side.
- `public/_redirects` is present and empty (no legacy URLs yet).

## Licence

The game is released under the **GNU Affero General Public License v3.0** — see
`LICENSE`. The licence is linked from the site footer and recorded in
`settings.json` (`license`, `licenseUrl`).

`GUIDE.md` in the repository root is the build guide this site was produced against.
