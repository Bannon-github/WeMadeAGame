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

See `README.md` for the owner's own framing of the vision.

## Current phase: concept prototyping on GitHub Pages

The current phase is **rapidly prototyping mini-game concepts** as static browser
games hosted on **GitHub Pages**, so ideas can be playtested on any device (including
mobile) with zero install. Each prototype is a self-contained, dependency-free
HTML/CSS/JS app under `docs/`.

> This is deliberately lightweight: no framework, no build step, no bundler. Prefer
> keeping it that way for prototypes — it maximizes iteration speed and keeps Pages
> deployment trivial. Revisit the stack only when a concept graduates from "is this
> fun / does this monetize" to "let's actually ship it to a store."

## Repository layout

```
WeMadeAGame/
├── README.md                     # owner's vision statement
├── CLAUDE.md                     # this file
├── docs/                         # ← everything here is served by GitHub Pages
│   ├── .nojekyll                 # serve files as-is (no Jekyll processing)
│   ├── index.html                # the "Prototype Arcade" hub linking to each game
│   ├── styles/hub.css            # hub styling
│   └── games/
│       └── lucky-plumber-slots/  # first prototype: a slot machine
│           ├── index.html
│           ├── css/style.css
│           ├── js/config.js      # design dials (paytable, weights, paylines, bet, audio)
│           ├── js/game.js        # engine (reels, spin, win eval, audio, sprites)
│           ├── assets/images/    # 160×160 symbol PNGs + bg/logo/button + sprite sheets
│           ├── assets/audio/     # WAV placeholders
│           ├── ASSETS.md         # exact spec (dimensions/frames/fps) for every asset
│           └── README.md         # how to run & tune this game
└── tools/                        # dev-only, NOT deployed
    └── lucky-plumber-slots/      # scripts that regenerate placeholder art & audio
```

Key convention: **`docs/` is the deployable site; `tools/` is dev-only.** Never put
build scripts, generators, or notes inside `docs/` — they would be published.

## GitHub Pages deployment

- **Source:** deploy from the **`main`** branch, **`/docs`** folder
  (GitHub → repo **Settings → Pages → Build and deployment → Source: Deploy from a
  branch → Branch: `main` `/docs`**). This must be enabled once in repo settings; it
  cannot be toggled from code.
- Once enabled, the arcade is at `https://bannon-github.github.io/WeMadeAGame/` and
  each game at `.../games/<game-name>/`.
- `docs/.nojekyll` is present so files are served verbatim (no Jekyll build).
- Everything is static and self-contained — **no network calls, no external CDNs,
  no secrets.** Keep it that way so Pages "just works" offline and in review.

## Running & testing locally

No build step. Serve `docs/` over HTTP (avoids `file://` restrictions on audio/paths):

```bash
python3 -m http.server -d docs 8000
# Arcade:  http://localhost:8000/
# Slots:   http://localhost:8000/games/lucky-plumber-slots/
```

Headless smoke-testing is done with **Playwright + the preinstalled Chromium**
(`executablePath: '/opt/pw-browsers/chromium'` — do NOT run `playwright install`).
A good smoke test: load a game, assert no console errors / no 4xx (favicon aside),
click **SPIN**, and confirm credits/wins update. There is no formal test suite yet;
if you add one, document the command here.

## Adding a new mini-game prototype

1. Create `docs/games/<kebab-name>/` with its own `index.html`, `css/`, `js/`,
   `assets/`, and a short `README.md`.
2. Keep it self-contained and dependency-free (no external requests).
3. Add a card for it in `docs/index.html` (the arcade hub).
4. If it needs placeholder assets, follow the slots pattern: put generator scripts
   in `tools/<name>/`, ship blank labeled placeholders, and write an `ASSETS.md`
   giving **exact dimensions / frame counts / fps** so the owner can drop in real art.

## Asset conventions (placeholders the owner replaces)

The owner supplies final art and audio. Until then, ship **blank, clearly-labeled
placeholders at the exact target dimensions**, so a real file can overwrite a
placeholder with no code change:

- **Art:** generated with Pillow (`pip install Pillow`). Every placeholder is
  labeled with its name and pixel size. Symbols are transparent PNGs.
- **Audio:** generated with Python's stdlib `wave` module (no dependencies) — cheap
  synthesized beeps/chimes as stand-ins for real audio.
- Regenerate via the scripts in `tools/<game>/` (run from repo root). Always keep the
  generator dimensions, the game's `config.js`, and `ASSETS.md` in sync.
- **Originality:** themes may evoke a genre but must use **entirely original names
  and art** — no trademarked characters, logos, or names (e.g. the slots theme is a
  generic "plumber / mushroom-kingdom" flavor, not any real franchise).

## Conventions for agents

- **Be honest about state.** If something isn't built, tested, or verified, say so.
  Don't describe planned work as done.
- **Verify interactive changes in a real browser** (Playwright/Chromium) before
  claiming a game works — check for console errors and that the core loop runs.
- **Make decisions explicit.** Given the profit-driven mandate, when you propose a
  direction (concept, feature, monetization model), state the reasoning and trade-offs
  so the owner can steer.
- **Keep prototypes cheap and fast.** Favor plain HTML/CSS/JS and static hosting over
  frameworks until a concept is proven worth shipping.
- **Mind gambling/monetization scope.** Casino-style prototypes here use fake credits
  only. Real-money gambling and store publishing carry heavy legal/age-rating/licensing
  requirements per platform and region — flag these rather than silently implementing.
- **Update this file** whenever structure, stack, workflows, or conventions change.
  Treat it as living documentation.

## Git & branch workflow

- **Default branch:** `main`. **Remote:** `origin` → `Bannon-github/WeMadeAGame`.
- Do development on a **feature branch**, not directly on `main`.
- Do NOT commit `node_modules/` or other install artifacts (see `.gitignore`).
- Write clear, descriptive commit messages. Push with `git push -u origin <branch>`.
- **Do not open a pull request unless explicitly asked.**
- If a feature branch's PR has already been merged, treat follow-up work as a fresh
  change: restart the branch from the latest `main` rather than stacking new commits
  on already-merged history.
