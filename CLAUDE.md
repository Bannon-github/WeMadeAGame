# CLAUDE.md

Guidance for AI assistants (Claude Code and other agents) working in this repository.

## What this project is

**WeMadeAGame** is an experiment in AI-driven product development. The goal is to
use AI agents to **research, plan, execute, test, iterate, and polish** a product
until it qualifies for publishing in one or more major app stores (Apple App Store,
Google Play, Steam, etc.).

Direction comes from the repository owner, and decisions are meant to be driven by
**profit-based calculations** — weigh effort, market fit, and monetization potential
when proposing choices, and surface the trade-offs rather than deciding silently.

See `README.md` for the owner's vision, and the root `instructions` /
`instructions-formatted.md` files for the owner's explicit build directives (site
structure, overview/tracking pages, glossary, media handling).

## Current phase: concept prototyping on GitHub Pages

The current phase is **rapidly prototyping mini-game concepts** as static browser
games hosted on **GitHub Pages**, so ideas can be playtested on any device (including
mobile) with zero install. Everything is plain HTML/CSS/JS — no framework, no build
step, no bundler, no external requests. Keep it that way for prototypes: it maximizes
iteration speed and keeps Pages deployment trivial. Revisit the stack only when a
concept graduates from "is this fun / does this monetize" to "let's ship it."

## Canonical site: `/games/` (served from the repo root)

Per the owner's `instructions`, the live site is a multi-page "Game Lab" under
**`games/`**, deployed via **GitHub Pages from the `main` branch, `/(root)` folder**:

```
WeMadeAGame/
├── index.html                    # root landing → redirects to games/ (base URL entry)
├── .nojekyll                     # serve files as-is (no Jekyll processing)
├── README.md                     # owner's vision statement
├── CLAUDE.md                     # this file
├── instructions                  # owner's raw build directives
├── instructions-formatted.md     # cleaned-up version of the above
├── games/                        # ← the canonical GitHub Pages site
│   ├── index.html                # "Game Lab" hub — cards linking to each game
│   ├── overview.html             # project overview, #hashtag comments, Human Requirements checklist
│   ├── glossary.html             # element glossary (what/why/how/when/where)
│   ├── assets/css/theme.css      # shared design system (CSS variables, components)
│   └── casino-slots/
│       ├── index.html            # Test #1: configurable 3-reel slot machine
│       ├── edit.html             # Browser-local symbols, odds, rows, and audio editor
│       └── config.js             # Shared defaults and local media persistence
├── docs/                         # ⚠️ SUPERSEDED earlier prototype (see note below)
│   └── games/lucky-plumber-slots/
└── tools/                        # dev-only, NOT deployed (placeholder-asset generators)
    └── lucky-plumber-slots/
```

### Conventions for the `games/` site

- **Every element carries a `data-meta="..."` tag** and HTML comments describing
  what/why/how/when/where. Maintain the **glossary** (`glossary.html`) as elements
  are added.
- **Overview page** (`overview.html`) tracks all game tests, supports `#hashtag`
  comments (saved to the visitor's `localStorage`), and holds the **Human
  Requirements** checklist — the list of things only the owner can do (enable Pages,
  supply custom media with exact dimensions/formats, give direction, confirm store
  compliance). Keep this checklist current; it is the owner's action list.
- **Custom media** the owner must supply is enumerated in Human Requirements with
  **exact dimensions, formats, meta tags, and save paths** — not hard-coded blind.
- Self-contained and dependency-free: no external CDNs, no network calls, no secrets.
- Casino Slots editor settings are device/browser-local. Small settings use
  `localStorage`; normalized 256×256 WebP symbol art and event audio use IndexedDB.

## GitHub Pages deployment

- **Source:** GitHub → repo **Settings → Pages → Build and deployment → Source:
  Deploy from a branch → Branch: `main` `/(root)`**. Must be enabled once in repo
  settings; it cannot be toggled from code. The repo must be **public** (or Pages
  enabled for private) to serve.
- Once enabled:
  - Base URL `https://bannon-github.github.io/WeMadeAGame/` → root `index.html`
    redirects into the Game Lab.
  - Hub: `.../games/` · Overview: `.../games/overview.html` · Slots:
    `.../games/casino-slots/`
- `/.nojekyll` is present so files are served verbatim (no Jekyll build).

## ⚠️ The `docs/` directory is a superseded duplicate

`docs/games/lucky-plumber-slots/` is an **earlier, parallel** slot-machine prototype
(image-based symbol pipeline + placeholder audio + wild/scatter mechanics) built
before the `/games` structure was chosen. It is **not** the canonical site. Under the
root Pages deploy the `docs/` files are still publicly reachable at `.../docs/`, but
nothing links to them and they are not part of the Game Lab. The owner's `instructions`
call for a single, uncluttered `/games` site, so `docs/` (and its `tools/` generators) is a
candidate for **removal or for having its richer features ported into
`games/casino-slots/`**. Do not extend `docs/` further without owner direction.

## Running & testing locally

No build step. Serve the **repo root** over HTTP (root Pages mirrors this):

```bash
python3 -m http.server 8000
# Entry:     http://localhost:8000/            (redirects to the Game Lab)
# Hub:       http://localhost:8000/games/
# Overview:  http://localhost:8000/games/overview.html
# Slots:     http://localhost:8000/games/casino-slots/
```

Headless smoke-testing uses **Playwright + the preinstalled Chromium**
(`executablePath: '/opt/pw-browsers/chromium'` — do NOT run `playwright install`).
A good smoke test: load a page, assert no console/page errors and no 4xx, click
**SPIN**, and confirm credits/win update. There is no formal test suite yet; if you
add one, document the command here.

## Adding a new mini-game prototype

1. Create `games/<kebab-name>/index.html` (self-contained; use `assets/css/theme.css`).
2. Give every element a `data-meta` tag; add its terms to `glossary.html`.
3. Add a card for it on the `games/index.html` hub.
4. Add a Game Test entry and any new Human Requirements (with exact media specs) to
   `overview.html`.
5. Keep it dependency-free (no external requests).

## Asset conventions (placeholders the owner replaces)

The owner supplies final art and audio. Until then, either use emoji/CSS stand-ins
(as `games/casino-slots` does) or ship **blank, clearly-labeled placeholders at the
exact target dimensions** so a real file can overwrite a placeholder with no code
change. Whenever a game needs custom media, **list it in the Overview's Human
Requirements** with exact dimensions, format, meta tag, and save path.

- **Originality:** themes may evoke a genre but must use **entirely original names
  and art** — no trademarked characters, logos, or names.
- The `tools/` scripts (dev-only) can generate labeled PNG placeholders (Pillow) and
  cheap synthesized WAV audio (Python stdlib `wave`); run from the repo root.

## Conventions for agents

- **Be honest about state.** If something isn't built, tested, or verified, say so.
- **Verify interactive changes in a real browser** (Playwright/Chromium) before
  claiming a game works — check for console errors and that the core loop runs.
- **Make decisions explicit.** Given the profit-driven mandate, state reasoning and
  trade-offs so the owner can steer — especially on anything hard to reverse.
- **Keep prototypes cheap and fast.** Plain HTML/CSS/JS + static hosting until a
  concept is proven worth shipping.
- **Mind gambling/monetization scope.** Casino-style prototypes here use fake credits
  only. Real-money gambling and store publishing carry heavy legal/age-rating/
  licensing requirements per platform and region — flag these, don't silently build.
- **Update this file** whenever structure, stack, workflows, or conventions change.

## Git & branch workflow

- **Default branch:** `main`. **Remote:** `origin` → `Bannon-github/WeMadeAGame`.
- Do development on a **feature branch**, not directly on `main`.
- Do NOT commit `node_modules/` or other install artifacts (see `.gitignore`).
- Write clear, descriptive commit messages. Push with `git push -u origin <branch>`.
- **Do not open a pull request unless explicitly asked.**
- If a feature branch's PR has already been merged, treat follow-up work as a fresh
  change: restart the branch from the latest `main` rather than stacking new commits
  on already-merged history.
