# Lucky Plumber Slots — Asset Specification

Every art and audio file below currently ships as a **labeled placeholder**.
To use your own, **overwrite the file at the same path with the same filename**
and (for images) the **same pixel dimensions** — the game picks it up with no
code changes. If you must change a size, count, or file extension, update the
matching value in [`js/config.js`](js/config.js) as noted.

All theme is original ("plumber / mushroom-kingdom" flavor) — **do not use any
trademarked names, logos, or characters** in the art you drop in.

---

## 1. Symbol art — `assets/images/`

- **Format:** PNG, **transparent background**
- **Dimensions:** **160 × 160 px** each (square)
- Displayed inside a reel cell at 160 px. Keep important detail within a ~150 px
  safe circle so nothing clips at the rounded corners.
- If you change the symbol size, edit the `TILE` constant at the top of
  [`js/game.js`](js/game.js) to match.

| File | Symbol | Role | Notes |
|------|--------|------|-------|
| `symbol_hero.png`     | Hero (plumber) | **WILD** | Substitutes for all except Star. Highest payout. |
| `symbol_star.png`     | Star           | **SCATTER** | Pays anywhere on the grid (3+). Not a wild. |
| `symbol_mushroom.png` | Mushroom       | high pay | |
| `symbol_flower.png`   | Flower         | high pay | |
| `symbol_shell.png`    | Shell          | mid pay  | |
| `symbol_pipe.png`     | Pipe           | low pay  | |
| `symbol_block.png`    | Mystery Block  | low pay  | |
| `symbol_coin.png`     | Coin           | low pay  | |

> Payout values and how often each symbol appears (reel weights) live in
> `js/config.js` (`paytable`, `weights`) — tune freely.

---

## 2. UI / theme art — `assets/images/`

| File | Dimensions | Format | Where it appears |
|------|-----------|--------|------------------|
| `background.png` | **1280 × 800 px** | PNG (opaque) | Full-bleed behind the machine. Scaled with `cover` into a 900 × 884 stage, so keep key art centered (safe area ≈ center 900 × 800). |
| `logo.png`       | **640 × 200 px**  | PNG, transparent | Title logo at the top. Displayed ~92 px tall. |
| `spin_button.png`| **200 × 200 px**  | PNG, transparent | Art layered on the round SPIN button (shown at ~70% inside a 120 px circle). Center the icon. |

---

## 3. Animated sequences (sprite sheets) — `assets/images/`

Sprite sheets are a **single horizontal strip**: frame 1 at the far left, each
next frame exactly one frame-width to the right. Transparent background.

| File | Frames | Frame size | Full sheet size | FPS | Plays when |
|------|--------|-----------|-----------------|-----|-----------|
| `coin_burst.png`     | 8 | **200 × 200 px** | **1600 × 200 px** | 16 | On every win, centered over the reels. |
| `hero_celebrate.png` | 6 | **320 × 320 px** | **1920 × 320 px** | 10 | On a **big win** (win ≥ 15× total bet). |

To change frame count, frame size, or fps, edit `animations` in `js/config.js`
(`frames`, `frameW`, `frameH`, `fps`). Set `enabled: false` there to disable a
sequence entirely. The full sheet width **must equal** `frames × frameW`.

---

## 4. Audio — `assets/audio/`

Current files are **cheap synthesized placeholders** (mono 16-bit WAV) — replace
with quality audio when ready. WAV/MP3/OGG all work in modern browsers; if you
change a file's **extension**, update the matching entry in `config.js`
(`audio.files`).

| File | Suggested length | Used for |
|------|------------------|----------|
| `click.wav`     | ~0.1 s | Button presses. |
| `spin.wav`      | ~1.5–2 s | Reel spin whirr (should cover a full spin; looping not required). |
| `reel_stop.wav` | ~0.1 s | Each reel landing (plays 5× per spin, staggered). |
| `coin.wav`      | ~0.2 s | Small win chime accent. |
| `win.wav`       | ~0.5–1 s | Standard win jingle. |
| `bigwin.wav`    | ~1.5–2 s | Big-win fanfare. |
| `music_loop.wav`| 4–16 s | Background loop — make it **seamlessly loopable**. |

Set `audio.enabled: false` or `audio.music: false` in `config.js` to mute by
default. In-game the 🔊 button toggles sound.

---

## Quick regeneration of placeholders

The placeholders were produced by scripts kept with the repo tooling. If you
ever need to regenerate blanks (e.g. after adding a new symbol), see the
generator notes in the project `README` / `CLAUDE.md`. New symbols only need:
a `160×160` PNG here, plus entries in `symbols`, `weights`, and `paytable` in
`config.js`.
