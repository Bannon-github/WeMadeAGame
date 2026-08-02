/* ============================================================================
 * Lucky Plumber Slots — ENGINE
 * Vanilla JS, no dependencies, no network. Reads all design values from CONFIG.
 * ==========================================================================*/
(() => {
  "use strict";
  const C = CONFIG;
  const TILE = 160; // display px per symbol cell (matches 160x160 art)
  const $ = (sel) => document.querySelector(sel);

  // ---- State -------------------------------------------------------------
  const state = {
    credits: C.economy.startingCredits,
    betPerLine: C.economy.minBetPerLine,
    spinning: false,
    turbo: false,
    auto: 0, // remaining autoplay spins
    grid: [], // grid[reel][row] = symbolKey
  };
  const totalBet = () => state.betPerLine * C.paylines.length;

  // ---- Weighted RNG ------------------------------------------------------
  const symbolKeys = Object.keys(C.symbols);
  const weightBag = [];
  for (const [k, w] of Object.entries(C.weights)) {
    for (let i = 0; i < w; i++) weightBag.push(k);
  }
  const randSymbol = () => weightBag[(Math.random() * weightBag.length) | 0];

  // ---- Audio -------------------------------------------------------------
  const Audio_ = {
    buffers: {},
    music: null,
    unlocked: false,
    load() {
      if (!C.audio.enabled) return;
      for (const [k, f] of Object.entries(C.audio.files)) {
        const a = new Audio(C.paths.audio + f);
        a.preload = "auto";
        this.buffers[k] = a;
      }
      if (this.buffers.music) {
        this.music = this.buffers.music;
        this.music.loop = true;
        this.music.volume = 0.35;
      }
    },
    play(k, vol = 1) {
      if (!C.audio.enabled || !this.buffers[k]) return;
      try {
        const node = this.buffers[k].cloneNode();
        node.volume = vol;
        node.play().catch(() => {});
      } catch (_) {}
    },
    // Browsers block audio until a user gesture; start music on first interaction.
    unlock() {
      if (this.unlocked || !C.audio.enabled) return;
      this.unlocked = true;
      if (C.audio.music && this.music) this.music.play().catch(() => {});
    },
  };

  // ---- Sprite-sheet animation player ------------------------------------
  function playSprite(cfg, container) {
    if (!cfg || !cfg.enabled) return;
    const el = document.createElement("div");
    el.className = "sprite";
    el.style.width = cfg.frameW + "px";
    el.style.height = cfg.frameH + "px";
    el.style.backgroundImage = `url(${C.paths.images + cfg.file})`;
    el.style.backgroundPosition = "0 0";
    container.appendChild(el);
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      if (frame >= cfg.frames) {
        clearInterval(timer);
        el.remove();
        return;
      }
      el.style.backgroundPosition = `-${frame * cfg.frameW}px 0`;
    }, 1000 / cfg.fps);
  }

  // ---- Build the reels DOM ----------------------------------------------
  const reelsEl = $("#reels");
  const reelStrips = [];
  function cell(symKey) {
    const d = document.createElement("div");
    d.className = "cell";
    const img = document.createElement("img");
    img.src = C.paths.images + C.symbols[symKey].img;
    img.alt = C.symbols[symKey].name;
    img.draggable = false;
    d.appendChild(img);
    return d;
  }
  function buildReels() {
    reelsEl.style.setProperty("--tile", TILE + "px");
    reelsEl.style.setProperty("--rows", C.rows);
    for (let r = 0; r < C.reels; r++) {
      const reel = document.createElement("div");
      reel.className = "reel";
      const strip = document.createElement("div");
      strip.className = "reel-strip";
      const col = [];
      for (let row = 0; row < C.rows; row++) {
        const k = randSymbol();
        col.push(k);
        strip.appendChild(cell(k));
      }
      reel.appendChild(strip);
      reelsEl.appendChild(reel);
      reelStrips.push(strip);
      state.grid[r] = col;
    }
  }

  // ---- Spin --------------------------------------------------------------
  function spin() {
    if (state.spinning) return;
    const bet = totalBet();
    if (state.credits < bet) {
      flashMessage("Not enough credits — lower your bet.");
      state.auto = 0;
      updateAutoBtn();
      return;
    }
    Audio_.unlock();
    state.spinning = true;
    state.credits -= bet;
    render();
    clearWinHighlights();
    setControlsEnabled(false);
    Audio_.play("spin", 0.5);

    const durMul = state.turbo ? C.spin.turboFactor : 1;
    const spinTiles = C.spin.spinTiles;
    const finalGrid = [];

    for (let r = 0; r < C.reels; r++) {
      const finalCol = [];
      for (let row = 0; row < C.rows; row++) finalCol.push(randSymbol());
      finalGrid[r] = finalCol;

      const strip = reelStrips[r];
      strip.innerHTML = "";
      strip.classList.add("blur");
      // top: random spinner tiles, then the final `rows` tiles at the bottom
      for (let i = 0; i < spinTiles; i++) strip.appendChild(cell(randSymbol()));
      for (let row = 0; row < C.rows; row++) strip.appendChild(cell(finalCol[row]));

      strip.style.transition = "none";
      strip.style.transform = "translateY(0)";
      void strip.offsetHeight; // force reflow so the next transform animates

      const dur = (C.spin.baseDurationMs + r * C.spin.reelStaggerMs) * durMul;
      strip.style.transition = `transform ${dur}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
      strip.style.transform = `translateY(-${spinTiles * TILE}px)`;

      const onEnd = () => {
        strip.removeEventListener("transitionend", onEnd);
        strip.classList.remove("blur");
        // Collapse strip back to just the final visible tiles for a clean state
        strip.style.transition = "none";
        strip.style.transform = "translateY(0)";
        strip.innerHTML = "";
        for (let row = 0; row < C.rows; row++) strip.appendChild(cell(finalCol[row]));
        Audio_.play("reelStop", 0.5);
        if (r === C.reels - 1) settle(finalGrid);
      };
      strip.addEventListener("transitionend", onEnd);
    }
  }

  // ---- Evaluate wins -----------------------------------------------------
  function evaluate(grid, bet, perLine) {
    const wins = []; // {type, symbol, count, amount, cells:[[r,row]...]}
    const isWildOrSame = (k, target) => k === target || k === "hero";

    // Paylines (left-to-right, wild substitutes)
    C.paylines.forEach((line, li) => {
      const seq = line.map((row, reel) => grid[reel][row]);
      // determine line symbol: first non-wild, or hero if all wild
      let sym = null;
      for (const k of seq) {
        if (C.symbols[k].scatter) { sym = null; break; } // scatter never lines
        if (k !== "hero") { sym = k; break; }
      }
      if (sym === null) {
        if (seq.every((k) => k === "hero")) sym = "hero";
        else return;
      }
      if (C.symbols[sym].scatter) return;
      let count = 0;
      const cells = [];
      for (let reel = 0; reel < seq.length; reel++) {
        if (isWildOrSame(seq[reel], sym) && !C.symbols[seq[reel]].scatter) {
          count++;
          cells.push([reel, line[reel]]);
        } else break;
      }
      const table = C.paytable[sym];
      if (count >= 3 && table && table[count - 3]) {
        wins.push({ type: "line", line: li + 1, symbol: sym, count, amount: table[count - 3] * perLine, cells });
      }
    });

    // Scatter (star) — count anywhere
    let scatterCount = 0;
    const scatterCells = [];
    for (let r = 0; r < C.reels; r++)
      for (let row = 0; row < C.rows; row++)
        if (C.symbols[grid[r][row]].scatter) { scatterCount++; scatterCells.push([r, row]); }
    if (C.scatterPays[scatterCount]) {
      wins.push({ type: "scatter", symbol: "star", count: scatterCount, amount: C.scatterPays[scatterCount] * bet, cells: scatterCells });
    }
    return wins;
  }

  function settle(grid) {
    state.grid = grid;
    const bet = totalBet();
    const wins = evaluate(grid, bet, state.betPerLine);
    const total = wins.reduce((s, w) => s + w.amount, 0);

    if (total > 0) {
      state.credits += total;
      highlightWins(wins);
      showWins(wins, total);
      const big = total >= bet * C.bigWinMultiplier;
      if (big) {
        Audio_.play("bigwin");
        banner(`BIG WIN!  +${total}`, true);
        playSprite(C.animations.heroCelebrate, $("#overlay"));
      } else {
        Audio_.play("win");
        Audio_.play("coin", 0.6);
      }
      playSprite(C.animations.coinBurst, $("#overlay"));
    } else {
      showWins([], 0);
    }

    render();
    state.spinning = false;
    setControlsEnabled(true);

    if (state.auto > 0) {
      state.auto--;
      updateAutoBtn();
      if (state.credits >= totalBet()) setTimeout(spin, state.turbo ? 250 : 700);
      else { state.auto = 0; updateAutoBtn(); }
    }
  }

  // ---- Rendering / UI ----------------------------------------------------
  function highlightWins(wins) {
    const reels = reelsEl.querySelectorAll(".reel");
    wins.forEach((w) =>
      w.cells.forEach(([r, row]) => {
        const strip = reels[r].querySelector(".reel-strip");
        const c = strip.children[row];
        if (c) c.classList.add("win");
      })
    );
  }
  function clearWinHighlights() {
    reelsEl.querySelectorAll(".cell.win").forEach((c) => c.classList.remove("win"));
    $("#winlist").innerHTML = "";
    $("#banner").classList.remove("show");
  }
  function showWins(wins, total) {
    const list = $("#winlist");
    list.innerHTML = "";
    wins.forEach((w) => {
      const li = document.createElement("li");
      const label =
        w.type === "scatter"
          ? `${w.count}x ${C.symbols.star.name} (scatter)`
          : `Line ${w.line}: ${w.count}x ${C.symbols[w.symbol].name}`;
      li.textContent = `${label} — +${w.amount}`;
      list.appendChild(li);
    });
    $("#winAmount").textContent = total > 0 ? "+" + total : "0";
  }
  function banner(text, big) {
    const b = $("#banner");
    b.textContent = text;
    b.classList.toggle("big", !!big);
    b.classList.add("show");
    setTimeout(() => b.classList.remove("show"), 2200);
  }
  function flashMessage(text) { banner(text, false); }

  function render() {
    $("#credits").textContent = state.credits;
    $("#bet").textContent = totalBet();
    $("#betPerLine").textContent = state.betPerLine;
    $("#lines").textContent = C.paylines.length;
  }

  // ---- Controls ----------------------------------------------------------
  function setControlsEnabled(on) {
    ["#spinBtn", "#betUp", "#betDown", "#maxBet", "#autoBtn"].forEach((s) => {
      const el = $(s);
      if (el) el.disabled = !on;
    });
  }
  function changeBet(delta) {
    Audio_.unlock();
    Audio_.play("click", 0.4);
    const e = C.economy;
    state.betPerLine = Math.max(e.minBetPerLine, Math.min(e.maxBetPerLine, state.betPerLine + delta));
    render();
  }
  function updateAutoBtn() {
    const b = $("#autoBtn");
    b.textContent = state.auto > 0 ? `AUTO (${state.auto})` : "AUTO ×10";
    b.classList.toggle("active", state.auto > 0);
  }

  // ---- Wire up -----------------------------------------------------------
  function init() {
    Audio_.load();
    buildReels();
    render();

    $("#spinBtn").addEventListener("click", () => { Audio_.play("click", 0.4); spin(); });
    $("#betUp").addEventListener("click", () => changeBet(+C.economy.betStep));
    $("#betDown").addEventListener("click", () => changeBet(-C.economy.betStep));
    $("#maxBet").addEventListener("click", () => { state.betPerLine = C.economy.maxBetPerLine; Audio_.play("click", 0.4); render(); });
    $("#autoBtn").addEventListener("click", () => {
      Audio_.unlock();
      Audio_.play("click", 0.4);
      if (state.auto > 0) { state.auto = 0; }
      else { state.auto = 10; if (!state.spinning) spin(); }
      updateAutoBtn();
    });
    $("#turboBtn").addEventListener("click", (e) => {
      state.turbo = !state.turbo;
      e.currentTarget.classList.toggle("active", state.turbo);
      Audio_.play("click", 0.4);
    });
    $("#muteBtn").addEventListener("click", (e) => {
      C.audio.enabled = !C.audio.enabled;
      if (!C.audio.enabled && Audio_.music) Audio_.music.pause();
      else if (Audio_.music && C.audio.music) { Audio_.unlocked = false; Audio_.unlock(); }
      e.currentTarget.classList.toggle("active", !C.audio.enabled);
      e.currentTarget.textContent = C.audio.enabled ? "🔊" : "🔇";
    });

    // Keyboard: space/enter to spin
    document.addEventListener("keydown", (e) => {
      if ((e.code === "Space" || e.code === "Enter") && !state.spinning) {
        e.preventDefault();
        $("#spinBtn").click();
      }
    });

    fit();
    window.addEventListener("resize", fit);
  }

  // Scale the fixed-size stage to fit the viewport.
  function fit() {
    const stage = $("#stage");
    const wrap = $("#stageWrap");
    const sw = stage.offsetWidth, sh = stage.offsetHeight;
    const availW = wrap.clientWidth;
    const availH = window.innerHeight - wrap.getBoundingClientRect().top - 12;
    const scale = Math.min(availW / sw, availH / sh, 1);
    stage.style.transform = `scale(${scale})`;
    wrap.style.height = sh * scale + "px";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
