# Lucky Plumber Slots

A browser slot-machine **prototype**. 5 reels × 3 rows, 5 paylines, a wild
(Hero), and a scatter (Star). Pure HTML/CSS/JS — no build step, no dependencies,
no network. Plays with fake credits only; there is **no real-money gambling**.

## Play

- **Hosted:** open the [Prototype Arcade](../../index.html) and pick this game
  (served via GitHub Pages once enabled — see the repo root `CLAUDE.md`).
- **Locally:** from the repo root, serve `docs/` over HTTP and open the game.
  Opening the file directly with `file://` works too, but a local server avoids
  browser restrictions:

  ```bash
  python3 -m http.server -d docs 8000
  # then visit http://localhost:8000/games/lucky-plumber-slots/
  ```

Controls: **SPIN** (or Space/Enter), bet **−/+**, **MAX**, **AUTO ×10**,
**TURBO** (faster spins), 🔊 mute.

## Files

```
lucky-plumber-slots/
├── index.html          # markup + HUD
├── css/style.css       # all styling; layout is a fixed #stage scaled to fit
├── js/config.js        # ★ design dials: symbols, weights, paytable, paylines, bet, audio
├── js/game.js          # engine: reels, spin animation, win evaluation, audio, sprites
├── assets/images/      # 160×160 symbol PNGs + background/logo/button + sprite sheets
├── assets/audio/       # placeholder WAVs
└── ASSETS.md           # ★ exact dimensions/specs for every art & audio file
```

## Tuning the game

Almost everything is data in **`js/config.js`** — edit it and refresh:

- **Payouts:** `paytable` (multiplier of per-line bet for 3/4/5-of-a-kind) and
  `scatterPays`.
- **Odds / RTP:** `weights` (how often each symbol lands — higher = more common).
- **Paylines:** `paylines` (one row index per reel; add or remove lines).
- **Bet & bankroll:** `economy`.
- **Feel:** `spin` (durations, stagger, turbo), `bigWinMultiplier`.
- **Media:** `animations`, `audio`.

Adding a **new symbol**: drop a `160×160` PNG in `assets/images/`, then add it to
`symbols`, `weights`, and (if it pays) `paytable`.

## Swapping in real art & audio

See **`ASSETS.md`** — overwrite each placeholder with a same-named file at the
same dimensions and it appears automatically.

> ⚠️ Prototype scope only. Real-money or store-published gambling apps have
> significant legal/licensing/age-rating requirements per platform and region —
> out of scope for this concept test.
