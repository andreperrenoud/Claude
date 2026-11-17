# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

Two independent pieces for **Le Club du Vin**, the members' club of the Shopify wine shop bouiboui.vin. They share no code and are not wired together:

- `clubduvin-app/`: a standalone members web app (PWA) with its own login, offers, news and admin area. Node server plus a vanilla-JS frontend.
- `shopify-theme/`: files that are copied into the shop's live Shopify theme ("Lively"). This is the members area that is actually in use. Membership depends on Shopify customer tags, not on the app's database.

All user-facing copy is **Swiss German**: write "ss", never "ß". Members are addressed informally with "du" and the tone mixes in French phrases ("Salut", "Bienvenue au Club!"). Code comments are also in German.

## clubduvin-app

Requires Node ≥ 22.5. The app has **no npm dependencies**: it uses only built-ins (`node:sqlite`, `node:http`, `node:crypto`). Don't add packages unless there is a real need.

```bash
cd clubduvin-app && ADMIN_EMAIL=admin@example.ch ADMIN_PASSWORD='secret' npm start   # http://localhost:3000
cd clubduvin-app && npm test                                                        # node --test test/*.test.js
cd clubduvin-app && node --no-warnings --test --test-name-pattern='Ablauf' test/api.test.js   # single test
```

Environment variables: `PORT` (default 3000), `DB_FILE` (default `data/club.db`, gitignored), `ADMIN_EMAIL`/`ADMIN_PASSWORD` (used only to seed the first admin when none exists; if no password is set, a random one is printed to the console), `NODE_ENV=production` (adds the `Secure` flag to the session cookie).

Architecture (`server.js`, a single file):
- The schema is created inline with `CREATE TABLE IF NOT EXISTS` at startup. There are no migrations, so a schema change on an existing DB needs a manual `ALTER`. Tables: `members`, `sessions` (stores the SHA-256 of the cookie token, never the raw token) and `posts` (with `kind` set to `offer` or `news`).
- `api()` is a hand-written router that works through a sequence of `if` checks. **Order matters**: `/api/login` comes first, then the auth gate (401), then member routes, then a single `role !== 'admin'` gate (403). Every route after that gate is admin-only. A new route must sit in the right section.
- Every non-GET request must have `Content-Type: application/json` and a same-host `Origin`. This is the CSRF protection.
- Input goes through `str()` (trim plus length cap), `safeUrl()` (http/https only) and `postFields()` (whitelisting).
- Any path that is not under `/api/` is served from `public/`, with SPA fallback to `index.html` and a strict CSP (`default-src 'self'`). Inline scripts and third-party script hosts are blocked.
- `module.exports = { server, db }`. The server listens only when the file is run directly. Tests set `DB_FILE` (to a temp dir) and the admin env vars **before** they `require('../server.js')`, then listen on port 0.

Frontend (`public/`): `app.js` is framework-free and sets all content with `textContent`/`el()` to avoid XSS. Keep it that way and don't use `innerHTML` with data. Tabs use the URL hash. `sw.js` caches the app shell and never caches `/api/`. Bump `CACHE` (`clubduvin-v1`) when shell files change.

## shopify-theme

There is no build step and no tooling in this repo. The files are pasted or pushed into the Shopify theme (`sections/club-members.liquid` and `templates/page.club-du-vin.json`). `header-star.css` belongs in the header section's `custom_css` (`sections/header-group.json`), not in a standalone file.

How `sections/club-members.liquid` works:
- **Membership**: a customer is a member if any of their tags matches the comma-separated `member_tag` setting, case-insensitively (`club, Le Club du Vin`). In the theme editor (`request.design_mode`), the member view is always shown.
- **Club price per product**: the metafield `custom.club_preis` (a fixed CHF price) takes precedence over `custom.club_rabatt` (a percent discount). Liquid only *displays* the club price. The real price reduction is a Shopify automatic discount limited to the "Club du Vin" customer segment, and that discount is set up by hand in the admin.
- **Offers**: products in the collection `club-du-vin-angebote`. **News**: articles in the blog `bouiboui-news` that have the tag `club`. Blocks without content are hidden: the news block when there are no club news, the offers block when it is empty and a highlight is set.
- **Highlight**: a members-only featured offer (`highlight_*` settings). It is hidden when `highlight_title` is blank.
- **Self sign-up**: uses `{% form 'customer' %}` with hidden `contact[tags]`. With `instant_access` on, it sets `newsletter` and the first member tag. With it off, it sets `club-anfrage` and an admin approves the request manually. Login is passwordless: Shopify sends the customer a code by email.

`templates/page.club-du-vin.json` is a snapshot of the live template and contains other sections (marquee, AI-generated blocks). When editing it, keep the unrelated sections intact.
