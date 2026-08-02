/* ============================================================================
 * Lucky Plumber Slots — GAME CONFIG
 * ----------------------------------------------------------------------------
 * This is the "design dials" file. Almost every gameplay/economy decision lives
 * here so it can be tuned without touching engine code (game.js).
 *
 * Coordinate system for paylines: each payline lists ONE row index per reel,
 * where 0 = top row, 1 = middle row, 2 = bottom row.
 *
 * Payouts are multipliers of the PER-LINE bet (except scatter, which multiplies
 * the TOTAL bet). Example: 3x Mushroom on a line with per-line bet 2 pays 5*2=10.
 * ==========================================================================*/
const CONFIG = {
  title: "Lucky Plumber Slots",
  reels: 5,
  rows: 3,

  economy: {
    startingCredits: 1000, // fake credits for prototyping only — no real money
    minBetPerLine: 1,
    maxBetPerLine: 10,
    betStep: 1,
  },

  // key -> display + art file (in assets/images/) + special roles
  symbols: {
    hero:     { name: "Hero",     img: "symbol_hero.png",     wild: true },   // substitutes for all except scatter
    star:     { name: "Star",     img: "symbol_star.png",     scatter: true },// pays anywhere, 3+
    mushroom: { name: "Mushroom", img: "symbol_mushroom.png" },
    flower:   { name: "Flower",   img: "symbol_flower.png" },
    shell:    { name: "Shell",    img: "symbol_shell.png" },
    pipe:     { name: "Pipe",     img: "symbol_pipe.png" },
    block:    { name: "Block",    img: "symbol_block.png" },
    coin:     { name: "Coin",     img: "symbol_coin.png" },
  },

  // Relative spawn weight per symbol (higher = appears more often). Tune RTP here.
  weights: { coin: 22, pipe: 18, block: 18, shell: 15, flower: 12, mushroom: 10, star: 6, hero: 5 },

  // Payout multiplier of PER-LINE bet for [3-of-a-kind, 4, 5] left-to-right.
  paytable: {
    hero:     [10, 50, 250],
    mushroom: [5, 20, 100],
    flower:   [4, 15, 75],
    shell:    [3, 12, 60],
    pipe:     [2, 8, 40],
    block:    [2, 8, 40],
    coin:     [1, 5, 25],
  },

  // Scatter (star) multiplier of TOTAL bet for [3,4,5] anywhere on the grid.
  scatterPays: { 3: 2, 4: 10, 5: 50 },

  // Active paylines (row per reel). Add/remove lines freely.
  paylines: [
    [1, 1, 1, 1, 1], // 1: middle
    [0, 0, 0, 0, 0], // 2: top
    [2, 2, 2, 2, 2], // 3: bottom
    [0, 1, 2, 1, 0], // 4: V
    [2, 1, 0, 1, 2], // 5: ^
  ],

  // A win >= (totalBet * this) triggers the "BIG WIN" celebration + hero sprite.
  bigWinMultiplier: 15,

  spin: {
    baseDurationMs: 900,   // reel 1 stop time
    reelStaggerMs: 260,    // each subsequent reel stops this much later
    spinTiles: 24,         // random tiles scrolled past before landing (blur length)
    turboFactor: 0.35,     // TURBO shortens durations by this factor
  },

  // Optional animated sprite sheets (horizontal strips). Set enabled:false to skip.
  animations: {
    coinBurst:     { enabled: true, file: "coin_burst.png",     frames: 8, frameW: 200, frameH: 200, fps: 16 },
    heroCelebrate: { enabled: true, file: "hero_celebrate.png", frames: 6, frameW: 320, frameH: 320, fps: 10 },
  },

  audio: {
    enabled: true,
    music: true,
    files: {
      click:    "click.wav",
      spin:     "spin.wav",
      reelStop: "reel_stop.wav",
      coin:     "coin.wav",
      win:      "win.wav",
      bigwin:   "bigwin.wav",
      music:    "music_loop.wav",
    },
  },

  paths: { images: "assets/images/", audio: "assets/audio/" },
};
