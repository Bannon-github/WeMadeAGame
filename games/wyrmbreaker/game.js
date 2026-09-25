/* Wyrmbreaker — Games Hub Test #3.
   A self-contained 2D action dungeon crawler: 3 heroes, procedural floors across four
   regions, escalating enemies, a boss every third floor with growing trophies.
   All art is drawn in code; audio is synthesised. No assets, no network requests. */
(function () {
  "use strict";

  // ============================================================ constants & helpers
  var VW = 640, VH = 360, TILE = 32, RW = 19, RH = 11, OX = 16, OY = 4;
  var TAU = Math.PI * 2;
  var T_FLOOR = 0, T_WALL = 1, T_PILLAR = 2, T_SPIKE = 3, T_DOOR = 4, T_STAIRS = 5;
  var rnd = Math.random;
  function rr(a, b) { return a + rnd() * (b - a); }
  function ri(a, b) { return Math.floor(rr(a, b + 1)); }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function angTo(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }
  function angDiff(a, b) { var d = ((a - b) % TAU + TAU) % TAU; return d > Math.PI ? d - TAU : d; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function $(id) { return document.getElementById(id); }
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var save = store.get("wyrm.save", null) || { trophies: {}, renown: 0, bestFloor: 0, runs: 0, wins: 0 };
  var muted = !!store.get("wyrm.muted", false);

  // ============================================================ audio
  var ac = null;
  function ensureAudio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === "suspended") ac.resume();
  }
  function tone(f, dur, type, vol, slide, delay) {
    if (muted || !ac) return;
    var t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, hp) {
    if (muted || !ac) return;
    var n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = hp || 800; s.buffer = buf; g.gain.value = vol || 0.05;
    s.connect(f); f.connect(g); g.connect(ac.destination); s.start();
  }
  var sfx = {
    swing: function () { noise(0.12, 0.05, 2200); },
    shoot: function () { tone(880, 0.08, "triangle", 0.04, 440); },
    bolt: function () { tone(300, 0.18, "sawtooth", 0.04, 700); },
    hit: function () { tone(160, 0.08, "square", 0.04, 90); },
    kill: function () { tone(420, 0.1, "triangle", 0.05, 120); },
    hurt: function () { tone(140, 0.25, "sawtooth", 0.07, 60); },
    coin: function () { tone(1200, 0.06, "square", 0.025); tone(1600, 0.08, "square", 0.025, 0, 0.05); },
    magic: function () { tone(520, 0.3, "sine", 0.06, 1560); tone(780, 0.3, "triangle", 0.03, 1200, 0.04); },
    dash: function () { noise(0.18, 0.05, 600); },
    door: function () { tone(90, 0.3, "square", 0.05, 60); },
    boss: function () { tone(70, 1.1, "sawtooth", 0.08, 40); tone(105, 1.1, "sawtooth", 0.05, 52); },
    roar: function () { noise(0.8, 0.08, 200); tone(90, 0.9, "sawtooth", 0.06, 45); },
    trophy: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, 0.35, "triangle", 0.06, 0, i * 0.12); }); },
    stairs: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.25, "sine", 0.05, 0, i * 0.1); }); },
    boom: function () { noise(0.4, 0.09, 150); tone(80, 0.4, "sine", 0.08, 30); }
  };

  // ============================================================ data: heroes
  var HEROES = {
    knight: {
      id: "knight", name: "Brannoc", cls: "Wyrmguard Knight",
      blurb: "An oath-bound knight in dragon-scarred plate. Holds the line, then breaks it.",
      hp: 130, mp: 60, mpRegen: 6, speed: 118, armor: 0.15, r: 10,
      weapon: "Oathblade — wide sword arcs", skill: "Shield Charge — invulnerable dash that bashes foes", magic: "Aegis Nova — holy burst that repels foes and shatters missiles",
      atkName: "Sword", sklName: "Charge", magName: "Nova", atkCd: 0.36, sklCd: 2.4, magCost: 30,
      stats: { might: 0.8, speed: 0.45, magic: 0.45, guard: 0.95 }
    },
    ranger: {
      id: "ranger", name: "Sylra", cls: "Thornshot Ranger",
      blurb: "A ruin-born tracker. Strikes from afar and never stands where the fire lands.",
      hp: 90, mp: 70, mpRegen: 8, speed: 146, armor: 0, r: 9,
      weapon: "Thornbow — fast long-range arrows", skill: "Tumble — dodge-roll; next 3 arrows pierce", magic: "Frostfan — a volley of slowing ice arrows",
      atkName: "Bow", sklName: "Tumble", magName: "Frost", atkCd: 0.27, sklCd: 1.2, magCost: 22,
      stats: { might: 0.55, speed: 0.95, magic: 0.6, guard: 0.35 }
    },
    mage: {
      id: "mage", name: "Ozmund", cls: "Ashveil Mage",
      blurb: "A scholar of dragonfire who learned to throw it back. Fragile, devastating.",
      hp: 75, mp: 120, mpRegen: 13, speed: 124, armor: 0, r: 9,
      weapon: "Emberstaff — exploding firebolts", skill: "Blink — teleport, leaving a flame burst", magic: "Chain Lightning — arcs through up to 5 foes",
      atkName: "Fire", sklName: "Blink", magName: "Storm", atkCd: 0.44, sklCd: 1.9, magCost: 28,
      stats: { might: 0.7, speed: 0.6, magic: 1, guard: 0.2 }
    }
  };

  // ============================================================ data: world
  var REGIONS = [
    { name: "Overgrown Ruins", floor: ["#3a3f30", "#41472f"], wall: "#626650", top: "#8b8f72", accent: "#65a30d", torch: "#f59e0b", deco: "moss" },
    { name: "Sunken Caverns", floor: ["#262c39", "#2c3342"], wall: "#454d5e", top: "#6b7385", accent: "#38bdf8", torch: "#38bdf8", deco: "water" },
    { name: "Obsidian Halls", floor: ["#221a2e", "#281e36"], wall: "#3b2b52", top: "#5d4580", accent: "#c084fc", torch: "#c084fc", deco: "rune" },
    { name: "Dragon's Roost", floor: ["#351c17", "#3d211a"], wall: "#57291e", top: "#7c3a2a", accent: "#f97316", torch: "#fb923c", deco: "lava" }
  ];
  var ENEMIES = {
    skeleton: { hp: 24, spd: 66, r: 10, dmg: 10, gold: [2, 4], ai: "melee" },
    bat: { hp: 12, spd: 112, r: 8, dmg: 7, gold: [1, 3], ai: "bat" },
    slime: { hp: 30, spd: 42, r: 12, dmg: 9, gold: [2, 3], ai: "melee", split: true },
    slimelet: { hp: 10, spd: 72, r: 7, dmg: 5, gold: [0, 1], ai: "melee" },
    archer: { hp: 20, spd: 60, r: 10, dmg: 8, gold: [3, 5], ai: "ranged", range: 170, fire: 2.1, proj: "arrow" },
    cultist: { hp: 34, spd: 50, r: 10, dmg: 9, gold: [4, 6], ai: "caster", range: 210, fire: 2.7 },
    brute: { hp: 85, spd: 44, r: 14, dmg: 18, gold: [6, 10], ai: "brute" },
    imp: { hp: 24, spd: 92, r: 9, dmg: 10, gold: [4, 7], ai: "ranged", range: 140, fire: 1.7, proj: "fire" },
    spiderling: { hp: 8, spd: 128, r: 6, dmg: 5, gold: [0, 1], ai: "melee" }
  };
  var BOSSES = [
    { id: "colossus", name: "Bone Colossus", title: "Warden of the Overgrown Ruins", hp: 520, r: 28, spd: 38, dmg: 20,
      trophy: { name: "Bronze Colossus Skull", tier: "Bronze", value: 250 } },
    { id: "matriarch", name: "The Hollow Matriarch", title: "Queen of the Sunken Caverns", hp: 800, r: 26, spd: 62, dmg: 18,
      trophy: { name: "Silver Venom Fang", tier: "Silver", value: 600 } },
    { id: "lich", name: "Lich-King Varr", title: "Sovereign of the Obsidian Halls", hp: 1000, r: 20, spd: 50, dmg: 16,
      trophy: { name: "Gold Crown of Varr", tier: "Gold", value: 1200 } },
    { id: "dragon", name: "Ashwing the Elder", title: "The Wyrm of the Roost", hp: 1500, r: 36, spd: 70, dmg: 24,
      trophy: { name: "Heart of Ashwing", tier: "Dragon", value: 3000 } }
  ];
  var LOOP_PREFIX = ["", "Mythic ", "Ascendant ", "Eternal "];
  var SOUL_PER_LIFE = 750;       // mana that must be gathered for an extra life
  var MAX_LIVES = 5;

  function floorInfo(n) {
    var loop = Math.floor((n - 1) / 12), within = (n - 1) % 12;
    var region = Math.floor(within / 3);
    return { n: n, loop: loop, region: region, R: REGIONS[region], boss: (within % 3) === 2,
             hpMul: 1 + 0.17 * (n - 1) + 0.5 * loop, dmgMul: 1 + 0.08 * (n - 1) + 0.25 * loop,
             bossMul: 1 + 0.08 * (n - 1) + 0.6 * loop };
  }

  // ============================================================ canvas & scaling
  var cv = $("game"), ctx = cv.getContext("2d");
  var scale = 1;
  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    scale = Math.min(w / VW, h / VH);
    var cssW = Math.floor(VW * scale), cssH = Math.floor(VH * scale);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
    cv.width = Math.floor(cssW * dpr); cv.height = Math.floor(cssH * dpr);
    ctx.setTransform(cv.width / VW, 0, 0, cv.height / VH, 0, 0);
  }
  window.addEventListener("resize", resize); resize();

  // ============================================================ input
  var keys = {}, mouse = { x: VW / 2, y: VH / 2, used: false, down: false, rdown: false };
  var touch = { active: false, mx: 0, my: 0, atk: false, skl: false, mag: false, blk: false };
  var pressed = {};
  var KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
                 KeyJ: "atk", Space: "atk", KeyK: "skl", ShiftLeft: "skl", ShiftRight: "skl", KeyL: "mag", KeyE: "mag", KeyQ: "blk", KeyF: "blk", KeyP: "pause", Escape: "pause" };
  window.addEventListener("keydown", function (e) {
    var a = KEYMAP[e.code]; if (!a) return;
    if (G.state === "play" || a === "pause") e.preventDefault();
    if (!keys[a]) pressed[a] = true;
    keys[a] = true;
  });
  window.addEventListener("keyup", function (e) { var a = KEYMAP[e.code]; if (a) keys[a] = false; });
  window.addEventListener("blur", function () { keys = {}; mouse.down = mouse.rdown = false; if (G.state === "play") pauseGame(); });
  function toView(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH }; }
  cv.addEventListener("mousemove", function (e) { var p = toView(e); mouse.x = p.x; mouse.y = p.y; mouse.used = true; });
  cv.addEventListener("mousedown", function (e) {
    var p = toView(e); mouse.x = p.x; mouse.y = p.y; mouse.used = true;
    if (e.button === 0) { mouse.down = true; pressed.atk = true; } else if (e.button === 2) { mouse.rdown = true; pressed.skl = true; }
  });
  window.addEventListener("mouseup", function (e) { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.rdown = false; });
  cv.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // Touch: virtual stick + buttons
  var stick = $("stick"), knob = $("knob"), stickId = null;
  function stickMove(e) {
    var r = stick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = e.clientX - cx, dy = e.clientY - cy, m = Math.sqrt(dx * dx + dy * dy), max = r.width / 2;
    if (m > max) { dx = dx / m * max; dy = dy / m * max; }
    knob.style.transform = "translate(" + dx + "px," + dy + "px)";
    touch.mx = dx / max; touch.my = dy / max;
  }
  stick.addEventListener("pointerdown", function (e) { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); touch.active = true; mouse.used = false; stickMove(e); });
  stick.addEventListener("pointermove", function (e) { if (e.pointerId === stickId) stickMove(e); });
  function stickEnd(e) { if (e.pointerId === stickId) { stickId = null; touch.mx = touch.my = 0; knob.style.transform = ""; } }
  stick.addEventListener("pointerup", stickEnd); stick.addEventListener("pointercancel", stickEnd);
  [["tAtk", "atk"], ["tSkl", "skl"], ["tMag", "mag"], ["tBlk", "blk"]].forEach(function (b) {
    var el = $(b[0]);
    el.addEventListener("pointerdown", function (e) { e.preventDefault(); touch.active = true; mouse.used = false; touch[b[1]] = true; pressed[b[1]] = true; el.classList.add("on"); });
    var up = function () { touch[b[1]] = false; el.classList.remove("on"); };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("pointerleave", up);
  });
  $("tPause").addEventListener("click", function () { if (G.state === "play") pauseGame(); });
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) touch.active = true;

  // ============================================================ game state
  var G = { state: "title", t: 0, shake: 0, flash: 0, banner: null, hitstop: 0 };
  var P = null;                 // player
  var F = null;                 // current floor
  var room = null;              // current room
  var enemies = [], projs = [], parts = [], pickups = [], texts = [], fx = [], teles = [];

  function newPlayer(id) {
    var H = HEROES[id];
    return { id: id, H: H, x: 0, y: 0, r: H.r, hp: H.hp, maxHp: H.hp, mp: H.mp, maxMp: H.mp, speed: H.speed,
             armor: H.armor, dmgMul: 1, cdMul: 1, magMul: 1, lifesteal: 0, mastery: 0, regen: 0,
             face: 1, aim: 0, moving: false, walkT: 0, atkT: 0, atkDur: 0.22, castT: 0,
             cdA: 0, cdS: 0, inv: 0, dash: null, pierce: 0, gold: 0, trophies: [], kills: 0, hurtT: 0, boons: [],
             lives: 3, breath: 100, maxBreath: id === "knight" ? 130 : 100, winded: 0, blocking: false, blockIdle: 0,
             blockArc: id === "knight" ? 1.65 : 1.2, soul: 0, soulNext: SOUL_PER_LIFE, feathers: 0 };
  }

  // ============================================================ floor generation
  function genFloor(n) {
    var info = floorInfo(n);
    var count = Math.min(5 + n, 16);
    var grid = {}, list = [];
    function key(x, y) { return x + "," + y; }
    function add(x, y) { var r = { gx: x, gy: y, doors: {}, cleared: false, visited: false, known: false, type: "combat" }; grid[key(x, y)] = r; list.push(r); return r; }
    add(4, 4);
    var guard = 0;
    while (list.length < count && guard++ < 2000) {
      var b = pick(list), d = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      var nx = b.gx + d[0], ny = b.gy + d[1];
      if (nx < 0 || ny < 0 || nx > 8 || ny > 8 || grid[key(nx, ny)]) continue;
      var nb = 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (q) { if (grid[key(nx + q[0], ny + q[1])]) nb++; });
      if (nb > 1 && rnd() < 0.7) continue;
      add(nx, ny);
    }
    list.forEach(function (r) {
      if (grid[key(r.gx, r.gy - 1)]) r.doors.n = true;
      if (grid[key(r.gx, r.gy + 1)]) r.doors.s = true;
      if (grid[key(r.gx - 1, r.gy)]) r.doors.w = true;
      if (grid[key(r.gx + 1, r.gy)]) r.doors.e = true;
    });
    // BFS for farthest room
    var start = list[0], q = [start], seen = new Map(); seen.set(start, 0);
    while (q.length) {
      var c = q.shift(), dd = seen.get(c);
      [["n", 0, -1], ["s", 0, 1], ["w", -1, 0], ["e", 1, 0]].forEach(function (s) {
        if (!c.doors[s[0]]) return; var o = grid[key(c.gx + s[1], c.gy + s[2])];
        if (!seen.has(o)) { seen.set(o, dd + 1); q.push(o); }
      });
    }
    var far = start; list.forEach(function (r) { r.depth = seen.get(r); if (r.depth > far.depth) far = r; });
    start.type = "start"; start.cleared = true;
    far.type = info.boss ? "boss" : "exit";
    // treasure room: a dead end that isn't start/far
    if (n >= 2) {
      var ends = list.filter(function (r) { return r.type === "combat" && Object.keys(r.doors).length === 1; });
      if (ends.length) { var tr = pick(ends); tr.type = "treasure"; tr.cleared = true; }
    }
    list.forEach(function (r) { r.cave = r.type === "combat" && rnd() < (info.region === 1 ? 0.7 : 0.35); r.tiles = genTiles(r, info); });
    return { info: info, grid: grid, list: list, start: start, key: key };
  }

  function genTiles(r, info) {
    var t = new Uint8Array(RW * RH);
    for (var y = 0; y < RH; y++) for (var x = 0; x < RW; x++) {
      if (x === 0 || y === 0 || x === RW - 1 || y === RH - 1) t[y * RW + x] = T_WALL;
    }
    var mx = (RW - 1) / 2, my = (RH - 1) / 2;
    if (r.doors.n) for (var i = -1; i <= 1; i++) t[0 * RW + mx + i] = T_DOOR;
    if (r.doors.s) for (i = -1; i <= 1; i++) t[(RH - 1) * RW + mx + i] = T_DOOR;
    if (r.doors.w) for (i = -1; i <= 1; i++) t[(my + i) * RW + 0] = T_DOOR;
    if (r.doors.e) for (i = -1; i <= 1; i++) t[(my + i) * RW + RW - 1] = T_DOOR;
    function free(x, y) { return t[y * RW + x] === T_FLOOR; }
    function reserved(x, y) {
      if (Math.abs(x - mx) <= 2 && Math.abs(y - my) <= 1) return true;             // centre (stairs / spawn)
      if (Math.abs(x - mx) <= 2 && (y <= 2 || y >= RH - 3)) return true;          // N/S door lanes
      if (Math.abs(y - my) <= 2 && (x <= 2 || x >= RW - 3)) return true;          // W/E door lanes
      return false;
    }
    if (r.type === "boss") {
      [[4, 3], [RW - 5, 3], [4, RH - 4], [RW - 5, RH - 4]].forEach(function (p) { t[p[1] * RW + p[0]] = T_PILLAR; });
      return t;
    }
    if (r.type === "start") return t;
    // Obstacles: isolated blobs with a 1-tile free ring, so the room always stays connected.
    var complexity = Math.min(1, info.n / 10);
    var shapes = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]]];
    if (info.n >= 4) shapes.push([[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [0, 1]]);
    var tries = 6 + Math.floor(complexity * 26), placed = 0, want = 2 + Math.floor(complexity * 8) + ri(0, 2);
    for (var k = 0; k < tries * 4 && placed < want; k++) {
      var sh = pick(shapes), ox = ri(2, RW - 5), oy = ri(2, RH - 4), ok = true;
      for (var s = 0; s < sh.length && ok; s++) {
        var cx = ox + sh[s][0], cy = oy + sh[s][1];
        if (cx < 2 || cy < 2 || cx > RW - 3 || cy > RH - 3 || reserved(cx, cy)) { ok = false; break; }
        for (var ddy = -1; ddy <= 1 && ok; ddy++) for (var ddx = -1; ddx <= 1; ddx++) {
          var nx = cx + ddx, ny = cy + ddy, isSelf = sh.some(function (q) { return ox + q[0] === nx && oy + q[1] === ny; });
          if (!isSelf && !free(nx, ny)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      sh.forEach(function (q) { t[(oy + q[1]) * RW + ox + q[0]] = T_PILLAR; });
      placed++;
    }
    // Cavern rooms: boulders that hug the outer wall (never touching each other or door lanes)
    if (r.cave) {
      var bshapes = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0]]];
      for (k = 0; k < 80; k++) {
        var bs = pick(bshapes), side = ri(0, 3), bx0 = side === 0 ? 1 : side === 1 ? RW - 3 : ri(1, RW - 3), by0 = side === 2 ? 1 : side === 3 ? RH - 3 : ri(1, RH - 3);
        var good = true, touchesWall = false;
        for (s = 0; s < bs.length && good; s++) {
          var qx = bx0 + bs[s][0], qy = by0 + bs[s][1];
          if (qx < 1 || qy < 1 || qx > RW - 2 || qy > RH - 2 || reserved(qx, qy) || !free(qx, qy)) { good = false; break; }
          for (var ey = -1; ey <= 1 && good; ey++) for (var ex = -1; ex <= 1; ex++) {
            var zx = qx + ex, zy = qy + ey, self = bs.some(function (q) { return bx0 + q[0] === zx && by0 + q[1] === zy; });
            if (self) continue;
            var tv = t[zy * RW + zx], border = zx === 0 || zy === 0 || zx === RW - 1 || zy === RH - 1;
            if (border) { if (tv === T_DOOR) { good = false; break; } touchesWall = true; continue; }
            if (tv !== T_FLOOR) { good = false; break; }
          }
        }
        if (!good || !touchesWall) continue;
        bs.forEach(function (q) { t[(by0 + q[1]) * RW + bx0 + q[0]] = T_PILLAR; });
      }
    }
    // Spike traps from floor 3 upward
    if (info.n >= 3) {
      var spikes = Math.min(10, Math.floor((info.n - 1) * 0.9));
      for (k = 0; k < spikes * 3 && spikes > 0; k++) {
        var sx = ri(2, RW - 3), sy = ri(2, RH - 3);
        if (!free(sx, sy) || reserved(sx, sy)) continue;
        t[sy * RW + sx] = T_SPIKE; spikes--;
      }
    }
    return t;
  }

  // ============================================================ room lifecycle
  var roomCanvas = document.createElement("canvas"); roomCanvas.width = VW; roomCanvas.height = VH;
  function tileAt(tx, ty) { if (tx < 0 || ty < 0 || tx >= RW || ty >= RH) return T_WALL; return room.tiles[ty * RW + tx]; }
  function solidTile(tx, ty, flying) {
    var t = tileAt(tx, ty);
    if (t === T_WALL) return true;
    if (t === T_PILLAR) return !flying;
    if (t === T_DOOR) return room.locked || !P;
    return false;
  }
  function collides(x, y, r, flying) {
    if (!flying && room.props) for (var i = 0; i < room.props.length; i++) {
      var pr = room.props[i]; if (pr.hp <= 0) continue;
      var ddx = x - pr.x, ddy = y - pr.y, rs = r + pr.r - 2; if (ddx * ddx + ddy * ddy < rs * rs) return true;
    }
    var x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE), y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
    for (var ty = y0; ty <= y1; ty++) for (var tx = x0; tx <= x1; tx++) {
      if (!solidTile(tx, ty, flying)) continue;
      var cx = clamp(x, tx * TILE, tx * TILE + TILE), cy = clamp(y, ty * TILE, ty * TILE + TILE);
      var dx = x - cx, dy = y - cy; if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }
  function moveBody(e, dx, dy, flying) {
    var hit = false;
    if (dx) { if (!collides(e.x + dx, e.y, e.r, flying)) e.x += dx; else hit = true; }
    if (dy) { if (!collides(e.x, e.y + dy, e.r, flying)) e.y += dy; else hit = true; }
    return hit;
  }

  function enterRoom(r, fromDir) {
    room = r; r.visited = true; r.known = true;
    ["n", "s", "w", "e"].forEach(function (d) { if (r.doors[d]) { var o = neighbour(r, d); if (o) o.known = true; } });
    enemies = []; projs = []; pickups = r.pickups || []; teles = []; fx = [];
    var cx = RW * TILE / 2, cy = RH * TILE / 2;
    if (fromDir === "n") { P.x = cx; P.y = TILE * 1.6; }
    else if (fromDir === "s") { P.x = cx; P.y = RH * TILE - TILE * 1.6; }
    else if (fromDir === "w") { P.x = TILE * 1.6; P.y = cy; }
    else if (fromDir === "e") { P.x = RW * TILE - TILE * 1.6; P.y = cy; }
    else { P.x = cx; P.y = cy + TILE; }
    renderRoomBase();
    r.locked = false;
    if (!r.cleared) {
      r.locked = true; sfx.door();
      if (r.type === "boss") { G.bossIntro = 1.4; }
      else spawnWave(r);
    }
    if (!r.seeded) { r.seeded = true; seedRoom(r); }
    if (r.type === "treasure" && !r.looted) {
      r.looted = true;
      pickups.push({ type: "chest", x: cx, y: cy, t: 0 });
    }
    r.pickups = pickups;
  }
  // Breakable shrubs & rocks plus loose coins, placed once per room.
  function seedRoom(r) {
    r.props = [];
    if (r.type === "boss") return;
    var n = F.info.n, want = ri(3, 6) + Math.floor(n / 3), mx = (RW - 1) / 2, my = (RH - 1) / 2;
    var taken = {};
    for (var k = 0; k < 200 && r.props.length < want; k++) {
      var tx = ri(2, RW - 3), ty = ri(2, RH - 3);
      if (Math.abs(tx - mx) <= 2 && Math.abs(ty - my) <= 1) continue;
      if (Math.abs(tx - mx) <= 2 && (ty <= 2 || ty >= RH - 3)) continue;
      if (Math.abs(ty - my) <= 2 && (tx <= 2 || tx >= RW - 3)) continue;
      var ok = true;
      for (var dy = -1; dy <= 1 && ok; dy++) for (var dx = -1; dx <= 1; dx++) {
        var tt = r.tiles[(ty + dy) * RW + tx + dx];
        if ((tt !== T_FLOOR && !(dx === 0 && dy === 0 && tt === T_FLOOR)) || taken[(tx + dx) + "," + (ty + dy)]) { ok = false; break; }
      }
      if (!ok) continue;
      taken[tx + "," + ty] = 1;
      var rock = rnd() < (r.cave ? 0.65 : 0.4);
      r.props.push({ kind: rock ? "rock" : "shrub", x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 + 2, r: 10, hp: rock ? 3 : 1, flash: 0, v: rnd() });
    }
    var coins = r.type === "start" ? ri(1, 3) : ri(2, 5);
    for (var c = 0; c < coins; c++) {
      var sp = randomFloorSpot(0); pickups.push({ type: "gold", v: ri(1, 2 + Math.floor(n / 3)), x: sp.x + rr(-8, 8), y: sp.y + rr(-8, 8), t: 1, still: true });
    }
  }
  function hitProp(pr, dmg) {
    if (pr.hp <= 0) return;
    pr.hp -= dmg >= 30 ? 3 : 1; pr.flash = 0.12;
    burst(pr.x, pr.y, pr.kind === "rock" ? "#a8a29e" : "#4d7c0f", 5, 70);
    if (pr.hp > 0) { sfx.hit(); return; }
    sfx.kill(); burst(pr.x, pr.y, pr.kind === "rock" ? "#78716c" : "#65a30d", 14, 110);
    var n = F.info.n, roll = rnd();
    if (roll < (pr.kind === "rock" ? 0.025 : 0.012)) { pickups.push({ type: "feather", x: pr.x, y: pr.y, t: 0 }); banner("A Phoenix Feather!", 1.4, "A rare relic — grants an extra life"); return; }
    if (rnd() < (pr.kind === "rock" ? 0.7 : 0.55)) { var cc = ri(1, pr.kind === "rock" ? 5 : 3); for (var i = 0; i < cc; i++) pickups.push({ type: "gold", v: ri(1, 2 + Math.floor(n / 4)), x: pr.x, y: pr.y, vx: rr(-70, 70), vy: rr(-70, 70), t: 0 }); }
    if (rnd() < 0.15) pickups.push({ type: "mana", v: ri(8, 14), x: pr.x + rr(-6, 6), y: pr.y, t: 0 });
  }
  function hitPropsInArea(x, y, R, dmg, arcA, arc) {
    if (!room.props) return;
    room.props.forEach(function (pr) {
      if (pr.hp <= 0 || Math.hypot(pr.x - x, pr.y - y) > R + pr.r) return;
      if (arc && Math.abs(angDiff(Math.atan2(pr.y - y, pr.x - x), arcA)) > arc / 2 + 0.2) return;
      hitProp(pr, dmg);
    });
  }
  function neighbour(r, d) {
    var dx = d === "e" ? 1 : d === "w" ? -1 : 0, dy = d === "s" ? 1 : d === "n" ? -1 : 0;
    return F.grid[F.key(r.gx + dx, r.gy + dy)];
  }
  function roomCleared() {
    room.cleared = true; room.locked = false; sfx.door();
    if (room.type === "exit") { room.tiles[((RH - 1) / 2) * RW + (RW - 1) / 2] = T_STAIRS; renderRoomBase(); banner("The way down opens", 1.6); }
    else if (room.type === "combat") {
      if (rnd() < 0.22) { pickups.push({ type: "chest", x: RW * TILE / 2, y: RH * TILE / 2, t: 0 }); banner("A chest appears", 1.2); }
      else if (rnd() < 0.3) pickups.push({ type: "heart", x: RW * TILE / 2, y: RH * TILE / 2, t: 0 });
    }
  }

  function randomFloorSpot(minDist) {
    for (var i = 0; i < 200; i++) {
      var tx = ri(2, RW - 3), ty = ri(2, RH - 3);
      if (tileAt(tx, ty) !== T_FLOOR) continue;
      var p = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
      if (!P || dist(p, P) >= minDist) return p;
    }
    return { x: RW * TILE / 2, y: RH * TILE / 2 };
  }
  function enemyPool(n) {
    var pool = ["skeleton", "skeleton", "bat", "slime"];
    if (n >= 2) pool.push("archer", "skeleton");
    if (n >= 4) pool.push("cultist", "bat");
    if (n >= 5) pool.push("brute");
    if (n >= 7) pool.push("imp", "imp", "cultist");
    if (n >= 10) pool.push("brute", "imp", "archer");
    return pool;
  }
  function spawnWave(r) {
    var n = F.info.n, count = Math.min(18, 3 + Math.floor(n * 0.95) + ri(0, 2));
    var pool = enemyPool(n);
    for (var i = 0; i < count; i++) {
      var p = randomFloorSpot(150), kind = pick(pool);
      var elite = n >= 4 && rnd() < Math.min(0.3, 0.05 + n * 0.02);
      spawnEnemy(kind, p.x, p.y, { delay: 0.5 + i * 0.08, elite: elite });
    }
  }
  function spawnEnemy(kind, x, y, o) {
    o = o || {};
    var d = ENEMIES[kind], info = F.info, em = o.elite ? 2.2 : 1;
    var e = { kind: kind, d: d, x: x, y: y, r: d.r * (o.elite ? 1.25 : 1), hp: d.hp * info.hpMul * em, maxHp: d.hp * info.hpMul * em,
              dmg: d.dmg * info.dmgMul * (o.elite ? 1.3 : 1), spd: d.spd * (o.elite ? 1.08 : 1), elite: !!o.elite,
              t: rnd() * 10, fire: rr(0.8, d.fire || 2), flash: 0, kx: 0, ky: 0, slow: 0, spawn: o.delay || 0.4, face: 1, state: "", st: 0, hitBy: 0 };
    enemies.push(e);
    return e;
  }

  // ============================================================ bosses
  function spawnBoss() {
    var def = BOSSES[F.info.region], m = F.info.bossMul;
    var b = { kind: "boss", boss: def, x: RW * TILE / 2, y: TILE * 3.2, r: def.r, hp: def.hp * m, maxHp: def.hp * m, dmg: def.dmg * F.info.dmgMul,
              spd: def.spd, t: 0, flash: 0, kx: 0, ky: 0, slow: 0, spawn: 0.6, face: 1, state: "idle", st: 1.2, phase: 1, fly: 0, d: { ai: "boss", gold: [40, 60] } };
    enemies.push(b);
    G.boss = b; banner(def.name, 2.2, def.title); sfx.boss();
    $("bossbar").hidden = false; $("bName").textContent = def.name + (F.info.loop ? " · " + LOOP_PREFIX[Math.min(3, F.info.loop)].trim() : "");
  }
  function tele(type, o) { o.type = type; o.t = 0; teles.push(o); return o; }
  function ring(x, y, n, spd, dmg, kind, off) {
    for (var i = 0; i < n; i++) { var a = (i / n) * TAU + (off || 0); eShot(x, y, a, spd, dmg, kind); }
  }
  function eShot(x, y, a, spd, dmg, kind, extra) {
    var p = { x: x, y: y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: kind === "fireball" ? 8 : kind === "orb" ? 6 : 4, dmg: dmg, owner: "e", kind: kind || "orb", life: 5, t: 0 };
    if (extra) for (var k in extra) p[k] = extra[k];
    projs.push(p); return p;
  }
  function bossUpdate(b, dt) {
    var def = b.boss, enr = b.hp < b.maxHp * 0.5, speedUp = enr ? 0.7 : 1;
    if (enr && b.phase === 1) { b.phase = 2; banner(def.name + " is enraged!", 1.4); sfx.roar(); G.shake = 0.6; }
    b.face = P.x < b.x ? -1 : 1;
    b.st -= dt;
    var a = angTo(b, P), minions = enemies.length - 1;
    if (b.state === "idle") {
      // drift toward the player between attacks
      var dd = dist(b, P), want = def.id === "lich" ? 150 : def.id === "dragon" ? 110 : 40;
      var dir = dd > want ? 1 : -0.6;
      moveBody(b, Math.cos(a) * b.spd * dir * dt, Math.sin(a) * b.spd * dir * dt, def.id === "dragon");
      if (b.st <= 0) chooseBossMove(b, enr, minions);
    } else if (b.state === "charge") {
      var hit = moveBody(b, b.vx * dt, b.vy * dt, false);
      if (dist(b, P) < b.r + P.r) hurtPlayer(b.dmg * 1.1, b);
      if (hit || b.st <= 0) { b.state = "idle"; b.st = 1.0 * speedUp; G.shake = 0.3; if (hit) { sfx.boom(); ring(b.x, b.y, 8, 140, b.dmg * 0.5, "bone"); } }
    } else if (b.state === "leap") {
      var k = 1 - Math.max(0, b.st) / b.leapDur;
      b.x = lerp(b.lx0, b.lx1, k); b.y = lerp(b.ly0, b.ly1, k); b.fly = Math.sin(k * Math.PI) * 40;
      if (b.st <= 0) { b.fly = 0; b.state = "idle"; b.st = 0.9 * speedUp; }
    } else if (b.state === "breath") {
      b.aim = b.aim + clamp(angDiff(a, b.aim), -0.9 * dt, 0.9 * dt);
      b.bt = (b.bt || 0) - dt;
      if (b.bt <= 0) { b.bt = 0.045; eShot(b.x + Math.cos(b.aim) * 28, b.y + Math.sin(b.aim) * 28 - 6, b.aim + rr(-0.28, 0.28), rr(190, 240), b.dmg * 0.35, "flame", { life: 1.1 }); }
      if (b.st <= 0) { b.state = "idle"; b.st = 1.2 * speedUp; }
    } else if (b.state === "swoop") {
      moveBody(b, b.vx * dt, b.vy * dt, true); b.fly = 18;
      if (dist(b, P) < b.r + P.r) hurtPlayer(b.dmg, b);
      b.bt = (b.bt || 0) - dt; if (b.bt <= 0) { b.bt = 0.12; eShot(b.x, b.y, rr(0, TAU), 40, b.dmg * 0.3, "flame", { life: 1.6 }); }
      if (b.st <= 0) { b.state = "idle"; b.fly = 0; b.st = 1.0 * speedUp; }
    } else if (b.state === "wait") {
      if (b.st <= 0) { b.state = "idle"; b.st = 0.8 * speedUp; }
    }
  }
  function chooseBossMove(b, enr, minions) {
    var def = b.boss, sp = enr ? 0.7 : 1, a = angTo(b, P), m;
    if (def.id === "colossus") {
      m = pick(minions < 4 ? ["slam", "slam", "charge", "summon"] : ["slam", "charge"]);
      if (m === "slam") {
        var tx = P.x, ty = P.y;
        tele("circle", { x: tx, y: ty, r: 64, dur: 0.95 * sp, fire: function () {
          sfx.boom(); G.shake = 0.5; if (Math.hypot(P.x - tx, P.y - ty) < 64 + P.r) hurtPlayer(b.dmg, b, true);
          ring(tx, ty, enr ? 14 : 10, 150, b.dmg * 0.5, "bone"); burst(tx, ty, "#d6d3c4", 24, 160);
        } });
        b.state = "wait"; b.st = 1.1 * sp;
      } else if (m === "charge") {
        b.vx = Math.cos(a) * 420; b.vy = Math.sin(a) * 420;
        tele("line", { x: b.x, y: b.y, a: a, len: 520, w: b.r * 2, dur: 0.7 * sp, fire: function () { b.state = "charge"; b.st = 0.9; sfx.dash(); } });
        b.state = "wait"; b.st = 5;
      } else {
        for (var i = 0; i < 3; i++) { var p = randomFloorSpot(90); spawnEnemy("skeleton", p.x, p.y, { delay: 0.6 }); }
        b.state = "wait"; b.st = 0.9 * sp; sfx.magic();
      }
    } else if (def.id === "matriarch") {
      m = pick(minions < 6 ? ["web", "web", "leap", "brood"] : ["web", "leap"]);
      if (m === "web") {
        var n = enr ? 9 : 5; for (var j = 0; j < n; j++) eShot(b.x, b.y, a + (j - (n - 1) / 2) * 0.18, 170, b.dmg * 0.55, "web", { slow: 1.6 });
        b.state = "wait"; b.st = 0.8 * sp; sfx.shoot();
      } else if (m === "leap") {
        var lx = clamp(P.x, TILE * 2, RW * TILE - TILE * 2), ly = clamp(P.y, TILE * 2, RH * TILE - TILE * 2);
        b.lx0 = b.x; b.ly0 = b.y; b.lx1 = lx; b.ly1 = ly; b.leapDur = 0.85 * sp; b.state = "leap"; b.st = b.leapDur;
        tele("circle", { x: lx, y: ly, r: 56, dur: b.leapDur, fire: function () {
          sfx.boom(); G.shake = 0.5; if (Math.hypot(P.x - lx, P.y - ly) < 56 + P.r) hurtPlayer(b.dmg * 1.2, b, true);
          burst(lx, ly, "#7dd3fc", 20, 140); if (enr) ring(lx, ly, 8, 130, b.dmg * 0.4, "web");
        } });
      } else {
        for (var s = 0; s < 4; s++) spawnEnemy("spiderling", b.x + rr(-30, 30), b.y + rr(-20, 30), { delay: 0.3 });
        b.state = "wait"; b.st = 0.8 * sp;
      }
    } else if (def.id === "lich") {
      m = pick(enr && minions < 3 ? ["ring", "skulls", "blink", "raise"] : ["ring", "skulls", "blink"]);
      if (m === "ring") {
        ring(b.x, b.y, 16, 120, b.dmg * 0.6, "orb", 0);
        if (enr) setTimeout(function () { if (G.boss === b && b.hp > 0) ring(b.x, b.y, 16, 120, b.dmg * 0.6, "orb", TAU / 32); }, 350);
        b.state = "wait"; b.st = 1.0 * sp; sfx.magic();
      } else if (m === "skulls") {
        for (var q = 0; q < (enr ? 4 : 3); q++) eShot(b.x, b.y, a + (q - 1) * 0.7, 110, b.dmg * 0.8, "skull", { homing: 2.2, life: 4.5 });
        b.state = "wait"; b.st = 1.2 * sp; sfx.bolt();
      } else if (m === "blink") {
        burst(b.x, b.y, "#c084fc", 18, 120); var np = randomFloorSpot(120); b.x = np.x; b.y = np.y; burst(b.x, b.y, "#c084fc", 18, 120);
        b.state = "wait"; b.st = 0.5; sfx.dash();
      } else {
        for (var c = 0; c < 2; c++) { var cp = randomFloorSpot(100); spawnEnemy("cultist", cp.x, cp.y, { delay: 0.6 }); }
        b.state = "wait"; b.st = 0.8;
      }
    } else if (def.id === "dragon") {
      m = pick(enr && minions < 3 ? ["breath", "barrage", "swoop", "roar"] : ["breath", "barrage", "swoop", "breath"]);
      if (m === "breath") { b.state = "breath"; b.aim = a; b.st = enr ? 2.0 : 1.5; sfx.roar(); }
      else if (m === "barrage") {
        var nb = enr ? 7 : 5;
        for (var f = 0; f < nb; f++) (function (f) {
          var fx0 = clamp(P.x + rr(-90, 90), TILE * 1.5, RW * TILE - TILE * 1.5), fy0 = clamp(P.y + rr(-70, 70), TILE * 1.5, RH * TILE - TILE * 1.5);
          if (f === 0) { fx0 = P.x; fy0 = P.y; }
          tele("circle", { x: fx0, y: fy0, r: 40, dur: 0.9 + f * 0.12, fire: function () {
            sfx.boom(); G.shake = 0.35; burst(fx0, fy0, "#fb923c", 22, 150);
            if (Math.hypot(P.x - fx0, P.y - fy0) < 40 + P.r) hurtPlayer(b.dmg * 0.8, { x: fx0, y: fy0 }, true);
          } });
        })(f);
        b.state = "wait"; b.st = 1.4 * sp;
      } else if (m === "swoop") {
        b.vx = Math.cos(a) * 360; b.vy = Math.sin(a) * 360;
        tele("line", { x: b.x, y: b.y, a: a, len: 600, w: 60, dur: 0.75 * sp, fire: function () { b.state = "swoop"; b.st = 1.0; sfx.dash(); } });
        b.state = "wait"; b.st = 5;
      } else {
        for (var im = 0; im < 2; im++) { var ip = randomFloorSpot(100); spawnEnemy("imp", ip.x, ip.y, { delay: 0.6 }); }
        b.state = "wait"; b.st = 0.9; sfx.roar(); G.shake = 0.5;
      }
    }
  }

  // ============================================================ combat
  function hurtPlayer(dmg, src, unblockable) {
    if (P.inv > 0 || P.dash || G.state !== "play") return;
    if (P.blocking && src && !unblockable && Math.abs(angDiff(angTo(P, src), P.aim)) < P.blockArc) {
      var cost = dmg * (P.id === "knight" ? 0.9 : 1.3);
      if (P.breath >= cost) {
        P.breath -= cost; P.blockIdle = 0.8; P.inv = 0.25;
        text(P.x, P.y - 20, "Blocked", "#e5e7eb"); sfx.hit(); burst(P.x + Math.cos(P.aim) * 12, P.y - 4 + Math.sin(P.aim) * 12, "#fef3c7", 8, 90);
        if (src.kind && src.kind !== "boss" && src.hp > 0 && src.d) { var ka = angTo(P, src); src.kx += Math.cos(ka) * (P.id === "knight" ? 260 : 150); src.ky += Math.sin(ka) * (P.id === "knight" ? 260 : 150); }
        return;
      }
      P.breath = 0; P.winded = 1.6; text(P.x, P.y - 26, "Guard broken!", "#fca5a5");
    }
    var d = Math.max(1, Math.round(dmg * (1 - P.armor)));
    P.hp -= d; P.inv = 0.75; P.hurtT = 0.25; G.shake = Math.max(G.shake, 0.35); G.flash = 0.25; sfx.hurt();
    text(P.x, P.y - 18, "-" + d, "#f87171");
    if (src) { var a = angTo(src, P); moveBody(P, Math.cos(a) * 10, Math.sin(a) * 10); }
    if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) {}
    if (P.hp <= 0) { P.hp = 0; loseLife(); }
  }
  function loseLife() {
    P.lives--;
    if (P.lives <= 0) { P.lives = 0; endRun(false); return; }
    P.hp = P.maxHp; P.breath = P.maxBreath; P.winded = 0; P.inv = 2.5; P.mp = Math.max(P.mp, P.maxMp * 0.5);
    projs = projs.filter(function (p) { return p.owner === "p"; });
    enemies.forEach(function (e) { if (e.kind !== "boss") { var a = angTo(P, e); e.kx += Math.cos(a) * 320; e.ky += Math.sin(a) * 320; } });
    fx.push({ type: "nova", x: P.x, y: P.y, r: 120, t: 0, dur: 0.6 }); burst(P.x, P.y, "#fb923c", 40, 180);
    G.hitstop = 0.4; sfx.roar();
    banner("A life is lost", 1.8, P.lives === 1 ? "Last life — fight carefully" : P.lives + " lives remain");
  }
  function gainLife(why) {
    if (P.lives >= MAX_LIVES) { P.gold += 250; text(P.x, P.y - 28, "Lives full: +250 gold", "#fde047"); return; }
    P.lives++; sfx.trophy(); burst(P.x, P.y, "#f472b6", 30, 150);
    banner("Extra life!", 1.6, why);
  }
  function gainMana(v) {
    P.mp = Math.min(P.maxMp, P.mp + v); P.soul += v;
    while (P.soul >= P.soulNext) { P.soul -= P.soulNext; gainLife("Your soul overflows with mana"); }
  }
  function damageEnemy(e, dmg, a, kb, col) {
    if (e.spawn > 0 || e.hp <= 0) return;
    var crit = rnd() < 0.08, d = Math.round(dmg * (crit ? 1.8 : 1));
    e.hp -= d; e.flash = 0.12;
    if (kb && e.kind !== "boss") { e.kx += Math.cos(a) * kb * (e.kind === "brute" ? 0.4 : 1); e.ky += Math.sin(a) * kb * (e.kind === "brute" ? 0.4 : 1); }
    text(e.x + rr(-6, 6), e.y - e.r - 8, (crit ? d + "!" : String(d)), crit ? "#fde047" : "#fff7ed");
    burst(e.x, e.y, col || "#fef3c7", 5, 80);
    sfx.hit();
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    sfx.kill(); P.kills++;
    burst(e.x, e.y, e.kind === "slime" || e.kind === "slimelet" ? "#84cc16" : e.kind === "boss" ? "#fbbf24" : "#e7e5e4", e.kind === "boss" ? 60 : 14, e.kind === "boss" ? 220 : 120);
    if (P.lifesteal) P.hp = Math.min(P.maxHp, P.hp + P.lifesteal);
    var g = e.d.gold, amt = ri(g[0], g[1]) * (e.elite ? 3 : 1);
    for (var i = 0; i < Math.min(8, amt); i++) pickups.push({ type: "gold", v: Math.ceil(amt / Math.min(8, amt)), x: e.x + rr(-8, 8), y: e.y + rr(-8, 8), vx: rr(-60, 60), vy: rr(-60, 60), t: 0 });
    var mo = e.kind === "boss" ? 10 : e.elite ? 3 : ri(1, 2);
    for (var m = 0; m < mo; m++) pickups.push({ type: "mana", v: e.kind === "boss" ? 20 : ri(5, 9) + Math.floor(F.info.n / 3), x: e.x + rr(-6, 6), y: e.y + rr(-6, 6), vx: rr(-50, 50), vy: rr(-50, 50), t: 0 });
    if (rnd() < 0.06) pickups.push({ type: "heart", x: e.x, y: e.y, t: 0 });
    if (e.d.split) for (var s = 0; s < 2; s++) spawnEnemy("slimelet", e.x + rr(-8, 8), e.y + rr(-8, 8), { delay: 0.05 });
    if (e.kind === "boss") bossDefeated(e);
  }
  function bossDefeated(b) {
    G.boss = null; $("bossbar").hidden = true;
    projs = projs.filter(function (p) { return p.owner === "p"; });
    teles = [];
    enemies.forEach(function (e) { if (e !== b && e.hp > 0) { e.hp = 0; burst(e.x, e.y, "#e7e5e4", 8, 90); } });
    G.shake = 1; G.hitstop = 0.35; sfx.roar();
    var def = b.boss, loop = F.info.loop, n = F.info.n;
    var val = Math.round(def.trophy.value * (1 + loop) * (1 + 0.05 * (n - 1)));
    pickups.push({ type: "trophy", x: b.x, y: b.y, t: 0, trophy: { id: def.id, name: LOOP_PREFIX[Math.min(3, loop)] + def.trophy.name, tier: def.trophy.tier, value: val, loop: loop, floor: n, boss: def.name } });
  }
  function nearestEnemy(from, maxD, cone, aim) {
    var best = null, bd = maxD;
    enemies.forEach(function (e) {
      if (e.hp <= 0 || e.spawn > 0) return;
      var d = dist(from, e);
      if (d < bd && (!cone || Math.abs(angDiff(angTo(from, e), aim)) < cone)) { bd = d; best = e; }
    });
    return best;
  }

  // Hero actions
  function doAttack() {
    var H = P.H;
    P.cdA = H.atkCd * P.cdMul; P.atkT = P.atkDur;
    if (P.id === "knight") {
      sfx.swing();
      var arc = (110 + P.mastery * 25) * Math.PI / 180, reach = 46 + P.mastery * 4, dmg = 15 * P.dmgMul;
      fx.push({ type: "slash", x: P.x, y: P.y, a: P.aim, arc: arc, r: reach, t: 0, dur: 0.18 });
      enemies.forEach(function (e) {
        if (dist(P, e) < reach + e.r && Math.abs(angDiff(angTo(P, e), P.aim)) < arc / 2 + 0.2) damageEnemy(e, dmg, angTo(P, e), 180);
      });
      projs.forEach(function (p) { if (p.owner === "e" && dist(P, p) < reach && Math.abs(angDiff(angTo(P, p), P.aim)) < arc / 2) { p.life = 0; burst(p.x, p.y, "#fde68a", 4, 60); } });
      hitPropsInArea(P.x, P.y, reach, dmg, P.aim, arc);
    } else if (P.id === "ranger") {
      sfx.shoot();
      var n = 1 + P.mastery, spread = 0.12;
      for (var i = 0; i < n; i++) {
        var a = P.aim + (i - (n - 1) / 2) * spread;
        projs.push({ x: P.x, y: P.y - 2, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, r: 4, dmg: 11 * P.dmgMul, owner: "p", kind: "arrow", life: 1.2, t: 0, pierce: P.pierce > 0 ? 3 : 0, hitSet: [] });
      }
      if (P.pierce > 0) P.pierce--;
    } else {
      sfx.bolt();
      var nb = 1 + (P.mastery >= 2 ? 1 : 0);
      for (var j = 0; j < nb; j++) {
        var ba = P.aim + (j - (nb - 1) / 2) * 0.16;
        projs.push({ x: P.x + Math.cos(ba) * 10, y: P.y - 4 + Math.sin(ba) * 10, vx: Math.cos(ba) * 290, vy: Math.sin(ba) * 290, r: 6, dmg: 14 * P.dmgMul, owner: "p", kind: "firebolt", life: 1.4, t: 0, explode: 30 + P.mastery * 10 });
      }
    }
  }
  function doSkill() {
    var H = P.H; P.cdS = H.sklCd * P.cdMul;
    if (P.id === "knight") {
      sfx.dash(); P.dash = { vx: Math.cos(P.aim) * 640, vy: Math.sin(P.aim) * 640, t: 0.22, hit: [] , bash: 24 * P.dmgMul };
    } else if (P.id === "ranger") {
      sfx.dash(); P.dash = { vx: Math.cos(P.moveA != null ? P.moveA : P.aim) * 470, vy: Math.sin(P.moveA != null ? P.moveA : P.aim) * 470, t: 0.28, roll: true, hit: [] };
      P.pierce = 3; text(P.x, P.y - 20, "Piercing!", "#bbf7d0");
    } else {
      sfx.magic();
      var ox = P.x, oy = P.y, best = { x: P.x, y: P.y };
      for (var d = 8; d <= 150; d += 8) {
        var nx = ox + Math.cos(P.aim) * d, ny = oy + Math.sin(P.aim) * d;
        if (!collides(nx, ny, P.r, false)) best = { x: nx, y: ny };
      }
      burst(ox, oy, "#fb923c", 18, 140); P.x = best.x; P.y = best.y; burst(P.x, P.y, "#c084fc", 14, 100);
      fx.push({ type: "ring", x: ox, y: oy, r: 40, t: 0, dur: 0.3, col: "#fb923c" });
      enemies.forEach(function (e) { if (Math.hypot(e.x - ox, e.y - oy) < 40 + e.r) damageEnemy(e, 14 * P.magMul, angTo({ x: ox, y: oy }, e), 120, "#fb923c"); });
      P.inv = Math.max(P.inv, 0.2);
    }
  }
  function doMagic() {
    var H = P.H; P.mp -= H.magCost; P.castT = 0.35; sfx.magic();
    if (P.id === "knight") {
      var R = 112;
      fx.push({ type: "nova", x: P.x, y: P.y, r: R, t: 0, dur: 0.4 });
      enemies.forEach(function (e) { if (dist(P, e) < R + e.r) damageEnemy(e, 34 * P.magMul, angTo(P, e), 320, "#fde68a"); });
      hitPropsInArea(P.x, P.y, R, 40);
      projs.forEach(function (p) { if (p.owner === "e" && dist(P, p) < R) { p.life = 0; burst(p.x, p.y, "#fde68a", 3, 60); } });
      P.inv = Math.max(P.inv, 1.1); G.shake = 0.3;
    } else if (P.id === "ranger") {
      var n = 7 + P.mastery * 2;
      for (var i = 0; i < n; i++) {
        var a = P.aim + (i - (n - 1) / 2) * 0.13;
        projs.push({ x: P.x, y: P.y - 2, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 5, dmg: 16 * P.magMul, owner: "p", kind: "frost", life: 1.2, t: 0, pierce: 2, hitSet: [], slow: 2.2 });
      }
    } else {
      var from = { x: P.x, y: P.y - 6 }, hit = [], jumps = 5 + P.mastery, dmg = 32 * P.magMul;
      var tgt = nearestEnemy(P, 280, 1.2, P.aim) || nearestEnemy(P, 280);
      var pts = [from];
      while (tgt && hit.length < jumps) {
        hit.push(tgt); pts.push({ x: tgt.x, y: tgt.y });
        damageEnemy(tgt, dmg, angTo(from, tgt), 60, "#bfdbfe"); dmg *= 0.88;
        from = tgt; tgt = null; var bd = 150;
        enemies.forEach(function (e) { if (e.hp > 0 && e.spawn <= 0 && hit.indexOf(e) < 0) { var d = dist(from, e); if (d < bd) { bd = d; tgt = e; } } });
      }
      if (pts.length === 1) pts.push({ x: P.x + Math.cos(P.aim) * 120, y: P.y + Math.sin(P.aim) * 120 });
      fx.push({ type: "bolt", pts: pts, t: 0, dur: 0.3 });
    }
  }

  // ============================================================ particles & text
  function burst(x, y, col, n, spd) {
    if (reduceMotion) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) { var a = rr(0, TAU), s = rr(0.3, 1) * spd; parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rr(0.3, 0.7), max: 0.7, col: col, sz: rr(1.5, 3.2) }); }
  }
  function text(x, y, s, col) { texts.push({ x: x, y: y, s: s, col: col, t: 0 }); }
  function banner(s, dur, sub) { G.banner = { s: s, sub: sub || "", t: 0, dur: dur || 1.6 }; }

  // ============================================================ update
  function update(dt) {
    G.t += dt;
    if (G.hitstop > 0) { G.hitstop -= dt; return; }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 2);
    if (G.flash > 0) G.flash = Math.max(0, G.flash - dt);
    if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur) G.banner = null; }
    if (G.bossIntro > 0) { G.bossIntro -= dt; if (G.bossIntro <= 0) spawnBoss(); }

    updatePlayer(dt);
    if (G.state !== "play") return;

    // enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.hp <= 0) continue;
      e.t += dt; if (e.flash > 0) e.flash -= dt; if (e.slow > 0) e.slow -= dt;
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      // knockback
      if (e.kx || e.ky) { moveBody(e, e.kx * dt, e.ky * dt, e.d.ai === "bat"); e.kx *= Math.pow(0.001, dt); e.ky *= Math.pow(0.001, dt); if (Math.abs(e.kx) + Math.abs(e.ky) < 4) e.kx = e.ky = 0; }
      if (e.kind === "boss") { bossUpdate(e, dt); if (dist(e, P) < e.r + P.r - 4 && !e.fly) hurtPlayer(e.dmg * 0.6, e); continue; }
      enemyAI(e, dt);
      if (dist(e, P) < e.r + P.r) hurtPlayer(e.dmg, e);
    }
    // separation
    for (i = 0; i < enemies.length; i++) for (var j = i + 1; j < enemies.length; j++) {
      var a = enemies[i], b = enemies[j]; if (a.hp <= 0 || b.hp <= 0 || a.kind === "boss" || b.kind === "boss") continue;
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, m = a.r + b.r;
      if (d < m) { var push = (m - d) / 2 / d; moveBody(a, -dx * push, -dy * push); moveBody(b, dx * push, dy * push); }
    }
    enemies = enemies.filter(function (e) { return e.hp > 0; });

    // projectiles
    for (i = projs.length - 1; i >= 0; i--) {
      var p = projs[i]; p.t += dt; p.life -= dt;
      if (p.homing) { var ha = Math.atan2(p.vy, p.vx), ta = angTo(p, P), sp = Math.hypot(p.vx, p.vy); ha += clamp(angDiff(ta, ha), -p.homing * dt, p.homing * dt); p.vx = Math.cos(ha) * sp; p.vy = Math.sin(ha) * sp; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      var tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE), tt = tileAt(tx, ty);
      if (tt === T_WALL || (tt === T_DOOR && room.locked) || (tt === T_PILLAR && p.kind !== "flame")) { p.life = 0; if (p.kind === "firebolt") explode(p); else burst(p.x, p.y, "#a8a29e", 3, 50); }
      if (p.life > 0 && p.owner === "p" && room.props) {
        for (var pi = 0; pi < room.props.length; pi++) {
          var pr = room.props[pi]; if (pr.hp <= 0 || (p.hitSet && p.hitSet.indexOf(pr) >= 0)) continue;
          if (Math.hypot(p.x - pr.x, p.y - pr.y) < p.r + pr.r) {
            if (p.kind === "firebolt") { explode(p); p.life = 0; break; }
            hitProp(pr, p.dmg); if (p.pierce > 0) { p.pierce--; p.hitSet.push(pr); } else { p.life = 0; break; }
          }
        }
      }
      if (p.life > 0 && p.owner === "p") {
        for (var k = 0; k < enemies.length; k++) {
          var en = enemies[k]; if (en.hp <= 0 || en.spawn > 0) continue;
          if (p.hitSet && p.hitSet.indexOf(en) >= 0) continue;
          if (dist(p, en) < p.r + en.r) {
            if (p.kind === "firebolt") { explode(p); p.life = 0; break; }
            damageEnemy(en, p.dmg, Math.atan2(p.vy, p.vx), p.kind === "frost" ? 60 : 110, p.kind === "frost" ? "#bae6fd" : null);
            if (p.slow) en.slow = p.slow;
            if (p.pierce > 0) { p.pierce--; p.hitSet.push(en); } else { p.life = 0; break; }
          }
        }
      } else if (p.life > 0 && p.owner === "e" && dist(p, P) < p.r + P.r - 1) {
        if (!P.dash && P.inv <= 0) { hurtPlayer(p.dmg, p); if (p.slow) P.slowT = p.slow; p.life = 0; }
      }
      if (p.life <= 0) projs.splice(i, 1);
    }

    // telegraphs
    for (i = teles.length - 1; i >= 0; i--) { var tl = teles[i]; tl.t += dt; if (tl.t >= tl.dur) { teles.splice(i, 1); if (tl.fire) tl.fire(); } }

    // pickups
    for (i = pickups.length - 1; i >= 0; i--) {
      var pk = pickups[i]; pk.t += dt;
      if (pk.vx) { pk.x += pk.vx * dt; pk.y += pk.vy * dt; pk.vx *= Math.pow(0.02, dt); pk.vy *= Math.pow(0.02, dt); }
      var dd = dist(pk, P);
      if ((pk.type === "gold" || pk.type === "heart" || pk.type === "mana" || pk.type === "feather") && dd < (pk.still ? 40 : 75) && pk.t > 0.3) { var ma = angTo(pk, P); pk.x += Math.cos(ma) * 260 * dt; pk.y += Math.sin(ma) * 260 * dt; }
      if (dd < P.r + 10 && pk.t > 0.25) {
        if (pk.type === "gold") { P.gold += pk.v; sfx.coin(); }
        else if (pk.type === "heart") { var h = Math.round(P.maxHp * 0.2); P.hp = Math.min(P.maxHp, P.hp + h); text(P.x, P.y - 20, "+" + h, "#86efac"); sfx.coin(); }
        else if (pk.type === "mana") { var mv = pk.v || 30; gainMana(mv); text(P.x, P.y - 20, "+" + mv, "#93c5fd"); tone(900 + rnd() * 300, 0.07, "sine", 0.03); }
        else if (pk.type === "feather") { P.feathers++; gainLife("The Phoenix Feather burns bright"); }
        else if (pk.type === "chest") {
          sfx.trophy(); var gold = 60 + F.info.n * 30 + ri(0, 40);
          text(pk.x, pk.y - 22, "Treasure! " + gold + " gold", "#fde047");
          var nc = 16; for (var ci = 0; ci < nc; ci++) { var ca = rr(0, TAU), cs = rr(60, 170); pickups.push({ type: "gold", v: Math.ceil(gold / nc), x: pk.x, y: pk.y - 4, vx: Math.cos(ca) * cs, vy: Math.sin(ca) * cs, t: 0 }); }
          burst(pk.x, pk.y, "#fbbf24", 30, 150); P.hp = Math.min(P.maxHp, P.hp + Math.round(P.maxHp * 0.25));
          pickups.push({ type: "mana", v: 40, x: pk.x + 20, y: pk.y + 10, t: 0 });
          if (rnd() < 0.06) pickups.push({ type: "feather", x: pk.x - 20, y: pk.y + 10, t: 0 });
        } else if (pk.type === "trophy") { pickups.splice(i, 1); awardTrophy(pk.trophy); return; }
        pickups.splice(i, 1);
      }
    }
    // clear check
    if (room.locked && !G.bossIntro && enemies.length === 0 && room.type !== "boss") roomCleared();
    if (room.locked && room.type === "boss" && !G.boss && !G.bossIntro && enemies.length === 0 && room.bossDone) roomCleared();

    // particles, text, fx
    for (i = parts.length - 1; i >= 0; i--) { var q = parts[i]; q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; if (q.life <= 0) parts.splice(i, 1); }
    for (i = texts.length - 1; i >= 0; i--) { texts[i].t += dt; texts[i].y -= 22 * dt; if (texts[i].t > 0.8) texts.splice(i, 1); }
    for (i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > fx[i].dur) fx.splice(i, 1); }
    if (parts.length > 500) parts.splice(0, parts.length - 500);
  }

  function explode(p) {
    var R = p.explode || 30; sfx.boom();
    fx.push({ type: "ring", x: p.x, y: p.y, r: R, t: 0, dur: 0.25, col: "#fb923c" }); burst(p.x, p.y, "#fb923c", 12, 120);
    enemies.forEach(function (e) { if (Math.hypot(e.x - p.x, e.y - p.y) < R + e.r) damageEnemy(e, p.dmg, Math.atan2(e.y - p.y, e.x - p.x), 140, "#fdba74"); });
    hitPropsInArea(p.x, p.y, R, p.dmg);
  }

  function enemyAI(e, dt) {
    var d = e.d, a = angTo(e, P), dd = dist(e, P), spd = e.spd * (e.slow > 0 ? 0.45 : 1), mx = 0, my = 0;
    e.face = P.x < e.x ? -1 : 1;
    if (d.ai === "melee") { mx = Math.cos(a); my = Math.sin(a); }
    else if (d.ai === "bat") { var wob = Math.sin(e.t * 5) * 1.2; mx = Math.cos(a + wob); my = Math.sin(a + wob); }
    else if (d.ai === "ranged" || d.ai === "caster") {
      if (dd > d.range) { mx = Math.cos(a); my = Math.sin(a); }
      else if (dd < d.range * 0.6) { mx = -Math.cos(a); my = -Math.sin(a); }
      else { mx = Math.cos(a + Math.PI / 2) * 0.5; my = Math.sin(a + Math.PI / 2) * 0.5; }
      e.fire -= dt;
      if (e.fire <= 0 && dd < d.range * 1.3) {
        e.fire = d.fire * rr(0.8, 1.2) / (e.elite ? 1.3 : 1);
        if (d.ai === "caster") { for (var i = -1; i <= 1; i++) eShot(e.x, e.y, a + i * 0.25, 120, e.dmg * 0.8, "orb"); if (rnd() < 0.3) { var np = randomFloorSpot(120); burst(e.x, e.y, "#a855f7", 10, 80); e.x = np.x; e.y = np.y; } }
        else eShot(e.x, e.y, a, d.proj === "fire" ? 200 : 240, e.dmg, d.proj === "fire" ? "fire" : "arrowE", { r: 4 });
        e.shootT = 0.25;
      }
      if (e.shootT > 0) e.shootT -= dt;
    } else if (d.ai === "brute") {
      if (e.state === "charge") {
        var hit = moveBody(e, e.vx * dt, e.vy * dt); e.st -= dt;
        if (hit || e.st <= 0) { e.state = "rest"; e.st = 1.0; if (hit) { G.shake = 0.2; sfx.boom(); } }
        return;
      } else if (e.state === "wind") { e.st -= dt; if (e.st <= 0) { e.state = "charge"; e.st = 0.7; e.vx = Math.cos(e.ca) * 300; e.vy = Math.sin(e.ca) * 300; } return; }
      else if (e.state === "rest") { e.st -= dt; if (e.st <= 0) e.state = ""; spd *= 0.3; }
      mx = Math.cos(a); my = Math.sin(a);
      if (!e.state && dd < 190 && dd > 50 && rnd() < dt * 0.9) { e.state = "wind"; e.st = 0.55; e.ca = a; }
    }
    moveBody(e, mx * spd * dt, my * spd * dt, d.ai === "bat");
  }

  function updatePlayer(dt) {
    // movement input
    var mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (touch.mx || touch.my) { mx = touch.mx; my = touch.my; }
    var m = Math.sqrt(mx * mx + my * my);
    if (m > 1) { mx /= m; my /= m; m = 1; }
    P.moving = m > 0.15;
    if (P.moving) P.moveA = Math.atan2(my, mx);
    // aim
    if (mouse.used && !touch.active) P.aim = Math.atan2(mouse.y - (P.y + OY - 4), mouse.x - (P.x + OX));
    else {
      var baseA = P.moveA != null ? P.moveA : 0;
      var tgt = nearestEnemy(P, 320, touch.active ? 0 : 1.3, baseA) || (touch.active ? null : null);
      if (touch.active) tgt = nearestEnemy(P, 320);
      P.aim = tgt ? angTo(P, tgt) : baseA;
    }
    P.face = Math.cos(P.aim) < 0 ? -1 : 1;

    if (P.cdA > 0) P.cdA -= dt; if (P.cdS > 0) P.cdS -= dt; if (P.inv > 0) P.inv -= dt;
    if (P.atkT > 0) P.atkT -= dt; if (P.castT > 0) P.castT -= dt; if (P.hurtT > 0) P.hurtT -= dt;
    if (P.slowT > 0) P.slowT -= dt;
    if (P.winded > 0) P.winded -= dt;
    P.blocking = !!(keys.blk || touch.blk) && P.winded <= 0 && P.breath > 1 && !P.dash;
    if (P.blocking) { P.breath = Math.max(0, P.breath - 5 * dt); P.blockIdle = Math.max(P.blockIdle, 0.3); if (P.breath <= 1) { P.winded = 1.2; text(P.x, P.y - 22, "Out of breath", "#fca5a5"); } }
    else if (P.blockIdle > 0) P.blockIdle -= dt;
    else P.breath = Math.min(P.maxBreath, P.breath + (P.winded > 0 ? 14 : 30) * dt);
    P.mp = Math.min(P.maxMp, P.mp + P.H.mpRegen * dt);
    if (P.regen) P.hp = Math.min(P.maxHp, P.hp + P.regen * dt);

    if (P.dash) {
      moveBody(P, P.dash.vx * dt, P.dash.vy * dt); P.dash.t -= dt;
      if (rnd() < 0.8) parts.push({ x: P.x + rr(-4, 4), y: P.y + rr(-4, 8), vx: 0, vy: 0, life: 0.3, max: 0.3, col: P.id === "knight" ? "#fde68a" : "#bbf7d0", sz: 2.5 });
      if (P.dash.bash) {
        enemies.forEach(function (e) { if (P.dash.hit.indexOf(e) < 0 && dist(P, e) < P.r + e.r + 6) { P.dash.hit.push(e); damageEnemy(e, P.dash.bash, angTo(P, e), 260); } });
        if (room.props) room.props.forEach(function (pr) { if (pr.hp > 0 && P.dash.hit.indexOf(pr) < 0 && dist(P, pr) < P.r + pr.r + 8) { P.dash.hit.push(pr); hitProp(pr, 40); } });
      }
      if (P.dash.t <= 0) { P.dash = null; P.inv = Math.max(P.inv, 0.12); }
    } else {
      var sp = P.speed * (P.slowT > 0 ? 0.55 : 1) * ((P.atkT > 0 && P.id === "ranger") ? 0.8 : 1) * (P.blocking ? 0.45 : 1);
      moveBody(P, mx * sp * dt, my * sp * dt);
    }
    if (P.moving || P.dash) P.walkT += dt * (P.dash ? 16 : 10);

    // actions
    var wantA = keys.atk || mouse.down || touch.atk || pressed.atk;
    if (wantA && P.cdA <= 0 && !P.dash && !P.blocking && G.state === "play") doAttack();
    if (pressed.skl && P.cdS <= 0 && !P.dash) doSkill();
    else if ((keys.skl || touch.skl || mouse.rdown) && P.cdS <= 0 && !P.dash) doSkill();
    if (pressed.mag) { if (P.mp >= P.H.magCost) doMagic(); else { text(P.x, P.y - 20, "Not enough mana", "#93c5fd"); } }
    if (pressed.pause) pauseGame();
    pressed = {};

    // tiles: spikes, stairs, doors
    var tx = Math.floor(P.x / TILE), ty = Math.floor(P.y / TILE), tt = tileAt(tx, ty);
    if (tt === T_SPIKE && spikeUp() && !P.dash) hurtPlayer(8 * F.info.dmgMul, null);
    if (tt === T_STAIRS && !room.locked) { descend(); return; }
    if (!room.locked) {
      var edge = TILE * 0.45;
      if (P.x < edge && room.doors.w) go("w"); else if (P.x > RW * TILE - edge && room.doors.e) go("e");
      else if (P.y < edge && room.doors.n) go("n"); else if (P.y > RH * TILE - edge && room.doors.s) go("s");
    }
  }
  function spikeUp() { return (G.t % 2.2) > 1.3; }
  function go(d) {
    var o = neighbour(room, d); if (!o) return;
    var opp = { n: "s", s: "n", w: "e", e: "w" }[d];
    enterRoom(o, opp);
  }

  // ============================================================ flow
  function startRun(id) {
    ensureAudio();
    P = newPlayer(id); save.runs++; store.set("wyrm.save", save);
    startFloor(1);
    showOnly(null); G.state = "play";
    $("hud").hidden = false; $("abil").hidden = false; $("touch").hidden = !touch.active;
    $("hName").textContent = P.H.name + " · " + P.H.cls;
    $("abAn").textContent = P.H.atkName; $("abSn").textContent = P.H.sklName; $("abMn").textContent = P.H.magName;
  }
  function startFloor(n) {
    F = genFloor(n); parts = []; texts = [];
    G.boss = null; G.bossIntro = 0; $("bossbar").hidden = true;
    enterRoom(F.start, null);
    banner("Floor " + n + " — " + F.info.R.name, 2.2, F.info.boss ? "A guardian stirs somewhere below…" : (F.info.loop ? "Deeper than any slayer has gone" : ""));
    if (n > save.bestFloor) { save.bestFloor = n; store.set("wyrm.save", save); }
  }
  function descend() {
    sfx.stairs(); G.state = "shrine"; showShrine();
  }
  function awardTrophy(tr) {
    P.trophies.push(tr); P.gold += tr.value;
    room.bossDone = true;
    var list = save.trophies[tr.id] || (save.trophies[tr.id] = []);
    list.push({ loop: tr.loop, value: tr.value, hero: P.id, floor: tr.floor });
    save.renown += tr.value; if (tr.id === "dragon") save.wins++;
    store.set("wyrm.save", save);
    sfx.trophy(); G.state = "trophy";
    $("trKick").textContent = tr.boss + " defeated · Floor " + tr.floor;
    $("trName").textContent = tr.name;
    $("trText").innerHTML = "A <b>" + tr.tier + "</b>-tier trophy worth <b style='color:var(--gold)'>" + tr.value + " gold</b>. " +
      (tr.id === "dragon" ? "The Elder Wyrm is broken. The roost falls silent… but older fires burn deeper still." : "Each guardian below guards a greater prize.");
    trophyAnim = { kind: tr.id, t: 0, loop: tr.loop };
    showOnly("ovTrophy"); $("bTrophyOk").focus();
  }
  var trophyAnim = null;
  $("bTrophyOk").addEventListener("click", function () {
    trophyAnim = null; showOnly(null); G.state = "play";
    if (room.type === "boss") { room.tiles[((RH - 1) / 2) * RW + (RW - 1) / 2] = T_STAIRS; room.cleared = true; room.locked = false; renderRoomBase(); sfx.door(); banner(F.info.region === 3 ? "Descend deeper?" : "The way down opens", 1.6); }
  });

  function endRun(victory) {
    G.state = "end"; $("bossbar").hidden = true; $("touch").hidden = true;
    var total = P.trophies.reduce(function (s, t) { return s + t.value; }, 0);
    $("endKick").textContent = victory ? "Victory" : "Fallen on floor " + F.info.n;
    $("endTitle").textContent = victory ? "The wyrm is slain" : P.H.name + "'s run has ended";
    $("endSummary").innerHTML = "<span>Slayer</span><span>" + P.H.name + " · " + P.H.cls + "</span><span>Deepest floor</span><span>" + F.info.n + " (" + F.info.R.name + ")</span>" +
      "<span>Foes defeated</span><span>" + P.kills + "</span><span>Gold</span><span>" + P.gold + "</span><span>Trophies</span><span>" + P.trophies.length + (total ? " · worth " + total + " gold" : "") + "</span>";
    showOnly("ovEnd"); $("bEndMain").focus();
  }
  function pauseGame() { if (G.state !== "play") return; G.state = "pause"; showOnly("ovPause"); $("bResume").focus(); }
  $("bResume").addEventListener("click", function () { showOnly(null); G.state = "play"; last = performance.now(); });
  $("bQuit").addEventListener("click", function () { endRun(false); });

  // ============================================================ boons (shrine)
  var BOONS = [
    { id: "vit", ico: "❤", name: "Dragonblood", rar: "Common", desc: "+25 max HP and heal fully.", apply: function () { P.maxHp += 25; P.hp = P.maxHp; } },
    { id: "str", ico: "⚔", name: "Tempered Edge", rar: "Common", desc: "+18% weapon damage.", apply: function () { P.dmgMul *= 1.18; } },
    { id: "haste", ico: "➹", name: "Wind-step", rar: "Common", desc: "+10% move speed.", apply: function () { P.speed *= 1.1; } },
    { id: "cd", ico: "⌛", name: "Battle Rhythm", rar: "Rare", desc: "Attacks and skills recover 14% faster.", apply: function () { P.cdMul *= 0.86; } },
    { id: "mana", ico: "✦", name: "Deep Well", rar: "Common", desc: "+30 max mana and refill it.", apply: function () { P.maxMp += 30; P.mp = P.maxMp; } },
    { id: "arc", ico: "✺", name: "Arcane Resonance", rar: "Rare", desc: "+25% magic power.", apply: function () { P.magMul *= 1.25; } },
    { id: "leech", ico: "☽", name: "Soul Harvest", rar: "Rare", desc: "Heal 3 HP on every kill.", apply: function () { P.lifesteal += 3; } },
    { id: "ward", ico: "⛨", name: "Scaleward", rar: "Rare", desc: "Take 10% less damage.", apply: function () { P.armor = Math.min(0.6, P.armor + 0.1); } },
    { id: "regen", ico: "✚", name: "Ember Heart", rar: "Rare", desc: "Regenerate 1.5 HP per second.", apply: function () { P.regen += 1.5; } },
    { id: "mast", ico: "★", name: "Weapon Mastery", rar: "Epic", desc: "", apply: function () { P.mastery++; } }
  ];
  function masteryDesc() {
    return P.id === "knight" ? "Wider, longer sword arcs (+25°)." : P.id === "ranger" ? "Fire one extra arrow per shot." : (P.mastery >= 1 ? "Twin firebolts and bigger blasts." : "Bigger firebolt explosions (+10 radius).");
  }
  function showShrine() {
    var picks = [], pool = BOONS.slice();
    if (P.mastery >= 3) pool = pool.filter(function (b) { return b.id !== "mast"; });
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    $("shrineKick").textContent = "Floor " + F.info.n + " cleared · " + P.gold + " gold";
    var box = $("boons"); box.innerHTML = "";
    picks.forEach(function (b, i) {
      var el = document.createElement("button"); el.className = "card"; el.type = "button";
      var col = b.rar === "Epic" ? "#c084fc" : b.rar === "Rare" ? "#60a5fa" : "#a8977f";
      el.innerHTML = "<div class='ico'>" + b.ico + "</div><div class='rar' style='color:" + col + "'>" + b.rar + "</div><h4>" + b.name + "</h4><p>" + (b.id === "mast" ? masteryDesc() : b.desc) + "</p>";
      el.addEventListener("click", function () {
        b.apply(); P.boons.push(b.id); showOnly(null);
        P.hp = Math.min(P.maxHp, P.hp + Math.round(P.maxHp * 0.15));
        startFloor(F.info.n + 1); G.state = "play"; last = performance.now();
      });
      box.appendChild(el);
      if (i === 0) setTimeout(function () { el.focus(); }, 30);
    });
    showOnly("ovShrine");
  }

  // ============================================================ rendering: room
  function hash(x, y) { var h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
  function renderRoomBase() {
    var c = roomCanvas.getContext("2d"), R = F.info.R;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = "#07060a"; c.fillRect(0, 0, VW, VH);
    c.translate(OX, OY);
    for (var y = 0; y < RH; y++) for (var x = 0; x < RW; x++) {
      var t = room.tiles[y * RW + x], px = x * TILE, py = y * TILE, h = hash(x + room.gx * 31, y + room.gy * 17);
      if (t === T_WALL || t === T_DOOR) {
        if (t === T_DOOR) { floorTile(c, px, py, R, h); continue; }
        c.fillStyle = R.wall; c.fillRect(px, py, TILE, TILE);
        c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 1;
        for (var row = 0; row < 4; row++) { c.beginPath(); c.moveTo(px, py + row * 8 + 0.5); c.lineTo(px + TILE, py + row * 8 + 0.5); c.stroke();
          var off = (row % 2) * 8; for (var bx = off; bx < TILE; bx += 16) { c.beginPath(); c.moveTo(px + bx + 0.5, py + row * 8); c.lineTo(px + bx + 0.5, py + row * 8 + 8); c.stroke(); } }
        if (y < RH - 1 && room.tiles[(y + 1) * RW + x] !== T_WALL) { c.fillStyle = R.top; c.fillRect(px, py + TILE - 6, TILE, 6); c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(px, py + TILE, TILE, 4); }
        if (R.deco === "moss" && h < 0.35) { c.fillStyle = "rgba(101,163,13,.55)"; c.beginPath(); c.ellipse(px + h * 60 % TILE, py + 4, 7, 4, 0, 0, TAU); c.fill(); }
      } else {
        floorTile(c, px, py, R, h);
        if (t === T_PILLAR) pillar(c, px, py, R, h);
        if (t === T_STAIRS) {
          c.fillStyle = "#050404"; c.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          for (var s = 0; s < 4; s++) { c.fillStyle = "rgba(255,255,255," + (0.18 - s * 0.04) + ")"; c.fillRect(px + 4 + s * 2, py + 5 + s * 6, TILE - 8 - s * 4, 3); }
        }
      }
    }
  }
  function floorTile(c, px, py, R, h) {
    c.fillStyle = h < 0.5 ? R.floor[0] : R.floor[1]; c.fillRect(px, py, TILE, TILE);
    c.strokeStyle = "rgba(0,0,0,.22)"; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    if (h > 0.82) { c.strokeStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.moveTo(px + 6, py + 8 + h * 10); c.lineTo(px + 14, py + 14); c.lineTo(px + 22, py + 11 + h * 6); c.stroke(); }
    if (R.deco === "moss" && h < 0.12) { c.fillStyle = "rgba(101,163,13,.35)"; c.beginPath(); c.ellipse(px + 16, py + 20, 9, 5, 0, 0, TAU); c.fill(); }
    if (R.deco === "water" && h < 0.1) { c.fillStyle = "rgba(56,189,248,.14)"; c.fillRect(px + 2, py + 2, TILE - 4, TILE - 4); }
    if (R.deco === "rune" && h < 0.06) { c.strokeStyle = "rgba(192,132,252,.35)"; c.beginPath(); c.arc(px + 16, py + 16, 9, 0, TAU); c.moveTo(px + 16, py + 7); c.lineTo(px + 16, py + 25); c.stroke(); }
    if (R.deco === "lava" && h < 0.1) { c.strokeStyle = "rgba(249,115,22,.55)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px + 4, py + 10 + h * 50); c.lineTo(px + 14, py + 16); c.lineTo(px + 27, py + 12); c.stroke(); }
  }
  function pillar(c, px, py, R, h) {
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(px + 16, py + 27, 13, 5, 0, 0, TAU); c.fill();
    c.fillStyle = R.wall; c.fillRect(px + 5, py + 6, 22, 22);
    c.fillStyle = R.top; c.fillRect(px + 3, py + 2, 26, 7);
    c.fillStyle = "rgba(255,255,255,.08)"; c.fillRect(px + 7, py + 9, 4, 18);
    c.fillStyle = "rgba(0,0,0,.2)"; c.fillRect(px + 21, py + 9, 5, 18);
    if (h < 0.3) { c.fillStyle = "#07060a"; c.beginPath(); c.moveTo(px + 20, py + 2); c.lineTo(px + 29, py + 2); c.lineTo(px + 29, py + 8); c.fill(); }
  }

  function drawRoomDynamic() {
    var R = F.info.R, mx = (RW - 1) / 2, my = (RH - 1) / 2;
    ctx.save(); ctx.translate(OX, OY);
    // doors
    ["n", "s", "w", "e"].forEach(function (d) {
      if (!room.doors[d]) return;
      var x = d === "w" ? 0 : d === "e" ? (RW - 1) * TILE : (mx - 1) * TILE, y = d === "n" ? 0 : d === "s" ? (RH - 1) * TILE : (my - 1) * TILE;
      var w = d === "n" || d === "s" ? TILE * 3 : TILE, h = d === "n" || d === "s" ? TILE : TILE * 3;
      if (room.locked) {
        ctx.fillStyle = "#1c1410"; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#6b5b45";
        if (w > h) for (var i = 4; i < w; i += 9) ctx.fillRect(x + i, y + 2, 3, h - 4);
        else for (i = 4; i < h; i += 9) ctx.fillRect(x + 2, y + i, w - 4, 3);
      } else {
        var g = d === "n" ? ctx.createLinearGradient(0, y, 0, y + h) : d === "s" ? ctx.createLinearGradient(0, y + h, 0, y) : d === "w" ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(x + w, 0, x, 0);
        g.addColorStop(0, "rgba(0,0,0,.85)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      }
    });
    // spikes
    var up = spikeUp(), warn = (G.t % 2.2) > 1.0;
    for (var y = 1; y < RH - 1; y++) for (var x = 1; x < RW - 1; x++) {
      if (room.tiles[y * RW + x] !== T_SPIKE) continue;
      var px = x * TILE, py = y * TILE;
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
      for (var sy = 0; sy < 3; sy++) for (var sx = 0; sx < 3; sx++) {
        var cx = px + 8 + sx * 8, cy = py + 10 + sy * 8;
        if (up) { ctx.fillStyle = "#d6d3d1"; ctx.beginPath(); ctx.moveTo(cx - 3, cy + 2); ctx.lineTo(cx, cy - 6); ctx.lineTo(cx + 3, cy + 2); ctx.fill(); }
        else { ctx.fillStyle = warn ? "#a16207" : "#44403c"; ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, TAU); ctx.fill(); }
      }
    }
    // stairs glow
    var st = room.tiles[my * RW + mx] === T_STAIRS;
    if (st) { var pulse = 0.5 + 0.5 * Math.sin(G.t * 3); ctx.strokeStyle = "rgba(251,191,36," + (0.4 + pulse * 0.4) + ")"; ctx.lineWidth = 2; ctx.strokeRect(mx * TILE + 1, my * TILE + 1, TILE - 2, TILE - 2); }
    // torches on top wall
    [3, RW - 4].forEach(function (tx) {
      var px = tx * TILE + 16, py = 18, fl = Math.sin(G.t * 12 + tx) * 1.5;
      ctx.fillStyle = "#3f2d1e"; ctx.fillRect(px - 2, py, 4, 9);
      var g = ctx.createRadialGradient(px, py, 1, px, py, 60); g.addColorStop(0, hexA(R.torch, 0.28)); g.addColorStop(1, hexA(R.torch, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 60, 0, TAU); ctx.fill();
      ctx.fillStyle = R.torch; ctx.beginPath(); ctx.ellipse(px, py - 3 + fl * 0.3, 3.5, 6 + fl, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff7d6"; ctx.beginPath(); ctx.ellipse(px, py - 1, 1.5, 3, 0, 0, TAU); ctx.fill();
    });
    ctx.restore();
  }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; }

  // ============================================================ rendering: heroes
  function drawHero(c, id, x, y, o) {
    // o: { t, walk, moving, face, aim, atk (0..1), cast, hurt, inv, dash }
    var t = o.t, ph = o.walk || 0, sw = o.moving ? Math.sin(ph) * 3.5 : 0, bob = o.moving ? Math.abs(Math.sin(ph)) * 1.4 : Math.sin(t * 2) * 0.5;
    c.save(); c.translate(x, y);
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(0, 12, 10, 3.5, 0, 0, TAU); c.fill();
    if (o.inv && Math.floor(t * 20) % 2 === 0) c.globalAlpha = 0.45;
    var aimL = Math.cos(o.aim) < 0;
    // weapon behind body when aiming up
    var behind = Math.sin(o.aim) < -0.3;
    if (behind) drawWeapon(c, id, o, bob);
    c.save(); c.scale(o.face, 1); c.translate(0, -bob);
    if (id === "knight") {
      // cape
      var cs = Math.sin(t * 4 + ph) * 2 + (o.moving ? -3 : 0);
      c.fillStyle = "#991b1b"; c.beginPath(); c.moveTo(-5, -9); c.quadraticCurveTo(-12 + cs, 2, -10 + cs, 11); c.lineTo(-2, 9); c.closePath(); c.fill();
      legs(c, sw, "#3f3f46", "#27272a");
      c.fillStyle = "#9ca3af"; rrect(c, -7, -9, 14, 14, 3); c.fill();
      c.fillStyle = "#d1d5db"; rrect(c, -5, -8, 7, 6, 2); c.fill();
      c.fillStyle = "#78350f"; c.fillRect(-7, 2, 14, 2); c.fillStyle = "#f59e0b"; c.fillRect(-1, 2, 3, 2);
      c.fillStyle = "#94a3b8"; c.beginPath(); c.arc(0, -14, 6.5, 0, TAU); c.fill();
      c.fillStyle = "#cbd5e1"; c.beginPath(); c.arc(-1, -15.5, 4, Math.PI, TAU); c.fill();
      c.fillStyle = "#0f172a"; c.fillRect(0, -14.5, 6, 1.8);
      c.fillStyle = "#dc2626"; c.beginPath(); c.moveTo(-2, -20); c.quadraticCurveTo(-9, -26 + Math.sin(t * 5), -12, -18); c.quadraticCurveTo(-6, -21, -2, -18); c.fill();
      // shield on off-arm
      c.fillStyle = "#1e3a8a"; c.beginPath(); c.moveTo(-9, -6); c.lineTo(-3, -6); c.lineTo(-3, 1); c.quadraticCurveTo(-6, 5, -9, 1); c.closePath(); c.fill();
      c.fillStyle = "#fbbf24"; c.fillRect(-6.6, -5, 1.4, 7); c.fillRect(-8.2, -3, 4.6, 1.4);
    } else if (id === "ranger") {
      c.fillStyle = "#14532d"; c.beginPath(); c.moveTo(-6, -10); c.quadraticCurveTo(-11 + Math.sin(t * 4) * 1.5, 1, -8, 10); c.lineTo(4, 8); c.lineTo(5, -8); c.closePath(); c.fill();
      c.fillStyle = "#78350f"; c.fillRect(-8, -9, 3, 12); // quiver
      c.fillStyle = "#e5e7eb"; c.fillRect(-8, -12, 1, 3); c.fillRect(-6.5, -12.5, 1, 3);
      legs(c, sw, "#57534e", "#292524");
      c.fillStyle = "#854d0e"; rrect(c, -6, -8, 12, 12, 3); c.fill();
      c.fillStyle = "#166534"; c.fillRect(-6, -2, 12, 3);
      c.fillStyle = "#a16207"; c.fillRect(-6, 2, 12, 1.5);
      c.fillStyle = "#15803d"; c.beginPath(); c.arc(0, -14, 6.5, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(-5, -18); c.lineTo(-10, -12); c.lineTo(-4, -11); c.fill();
      c.fillStyle = "#fcd9b6"; c.beginPath(); c.arc(1.5, -13, 4, 0, TAU); c.fill();
      c.fillStyle = "#166534"; c.beginPath(); c.arc(0, -15.5, 5.5, Math.PI * 1.05, Math.PI * 1.95); c.fill();
      c.fillStyle = "#1c1917"; c.fillRect(3, -14, 1.5, 1.5);
      c.fillStyle = "#b45309"; c.fillRect(-3, -11, 2, 5); // braid
    } else {
      c.fillStyle = "#4c1d95"; c.beginPath(); c.moveTo(-9, 11); c.lineTo(9, 11); c.lineTo(5, -8); c.lineTo(-5, -8); c.closePath(); c.fill();
      var hem = o.moving ? sw * 0.6 : 0;
      c.fillStyle = "#6d28d9"; c.beginPath(); c.moveTo(-9 + hem, 11); c.lineTo(9 + hem, 11); c.lineTo(7, 6); c.lineTo(-7, 6); c.fill();
      c.fillStyle = "#f59e0b"; c.fillRect(-8, 9, 16, 1.5); c.fillRect(-4.5, -3, 9, 1.8);
      c.fillStyle = "#fcd9b6"; c.beginPath(); c.arc(0, -12, 4.5, 0, TAU); c.fill();
      c.fillStyle = "#e5e7eb"; c.beginPath(); c.moveTo(-3, -10); c.quadraticCurveTo(2, -2 + Math.sin(t * 3), 5, -10); c.fill();
      c.fillStyle = "#1c1917"; c.fillRect(1.5, -13, 1.5, 1.5);
      c.fillStyle = "#5b21b6"; c.beginPath(); c.ellipse(0, -15.5, 9, 2.5, 0, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(-6, -16); c.quadraticCurveTo(-1, -24, -4 + Math.sin(t * 2) * 2, -31); c.lineTo(6, -16); c.fill();
      c.fillStyle = "#fbbf24"; star(c, 0, -20, 2.2);
    }
    c.restore();
    if (!behind) drawWeapon(c, id, o, bob);
    if (o.hurt > 0) { c.globalCompositeOperation = "source-atop"; }
    c.restore();
  }
  function legs(c, sw, a, b) { c.fillStyle = a; c.fillRect(-4 + sw * 0.4, 3, 3.5, 8); c.fillRect(1 - sw * 0.4, 3, 3.5, 8); c.fillStyle = b; c.fillRect(-4.5 + sw * 0.6, 9.5, 4.5, 2.5); c.fillRect(0.5 - sw * 0.6, 9.5, 4.5, 2.5); }
  function star(c, x, y, r) { c.beginPath(); for (var i = 0; i < 10; i++) { var a = i / 10 * TAU - Math.PI / 2, rr2 = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } c.closePath(); c.fill(); }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawWeapon(c, id, o, bob) {
    c.save(); c.translate(0, -4 - bob);
    var atk = o.atk || 0;
    if (id === "knight") {
      var swing = atk > 0 ? lerp(-1.5, 1.4, 1 - atk) : 0.9;
      c.rotate(o.aim + swing * (Math.cos(o.aim) < 0 ? -1 : 1));
      c.fillStyle = "#78350f"; c.fillRect(4, -1.5, 5, 3);
      c.fillStyle = "#f59e0b"; c.fillRect(8, -4, 2.5, 8);
      c.fillStyle = "#e5e7eb"; c.beginPath(); c.moveTo(10.5, -2.2); c.lineTo(28, -1); c.lineTo(31, 0); c.lineTo(28, 1); c.lineTo(10.5, 2.2); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,.7)"; c.fillRect(11, -0.4, 16, 0.8);
    } else if (id === "ranger") {
      c.rotate(o.aim);
      var pull = atk > 0 ? atk / 0.22 * 5 : 0;
      c.strokeStyle = "#92400e"; c.lineWidth = 2.2; c.beginPath(); c.arc(6, 0, 11, -1.25, 1.25); c.stroke();
      var ex = 6 + Math.cos(1.25) * 11, ey = Math.sin(1.25) * 11;
      c.strokeStyle = "#e7e5e4"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex, -ey); c.lineTo(6 - pull, 0); c.lineTo(ex, ey); c.stroke();
      if (atk > 0.05) { c.fillStyle = "#d6d3d1"; c.fillRect(6 - pull, -0.6, 16, 1.2); c.fillStyle = "#e5e7eb"; c.beginPath(); c.moveTo(22 - pull, -2); c.lineTo(26 - pull, 0); c.lineTo(22 - pull, 2); c.fill(); }
    } else {
      var raise = o.cast > 0 ? -0.9 : atk > 0 ? -0.3 : 0.35;
      c.rotate(o.aim + raise * (Math.cos(o.aim) < 0 ? -1 : 1));
      c.fillStyle = "#78350f"; c.fillRect(-6, -1.2, 26, 2.4);
      c.fillStyle = "#a16207"; c.fillRect(18, -3, 3, 6);
      var glow = 0.6 + 0.4 * Math.sin(o.t * 6) + (atk > 0 ? 0.6 : 0);
      var g = c.createRadialGradient(23, 0, 0, 23, 0, 9); g.addColorStop(0, "rgba(253,186,116," + Math.min(1, glow) + ")"); g.addColorStop(1, "rgba(249,115,22,0)");
      c.fillStyle = g; c.beginPath(); c.arc(23, 0, 9, 0, TAU); c.fill();
      c.fillStyle = "#fb923c"; c.beginPath(); c.arc(23, 0, 3, 0, TAU); c.fill();
    }
    c.restore();
  }

  // ============================================================ rendering: enemies & bosses
  function drawEnemy(e) {
    var x = e.x, y = e.y, t = e.t, k = e.kind, s = e.elite ? 1.25 : 1;
    ctx.save(); ctx.translate(x, y);
    if (e.spawn > 0) {
      var p = 1 - e.spawn / 0.6;
      ctx.strokeStyle = "rgba(168,85,247," + (0.3 + p * 0.5) + ")"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 8, 14 * (1 - p * 0.3), 5, 0, 0, TAU); ctx.stroke();
      ctx.restore(); return;
    }
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, e.r * 0.9, e.r * 0.95, e.r * 0.35, 0, 0, TAU); ctx.fill();
    if (e.elite) { ctx.strokeStyle = "rgba(251,191,36," + (0.5 + 0.3 * Math.sin(t * 5)) + ")"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, e.r * 0.9, e.r + 3, e.r * 0.45, 0, 0, TAU); ctx.stroke(); }
    ctx.scale(e.face * s, s);
    var wl = Math.sin(t * 10) * 2.5;
    if (k === "skeleton") {
      ctx.fillStyle = "#d6d3c4"; ctx.fillRect(-3 + wl * 0.3, 3, 2, 7); ctx.fillRect(1 - wl * 0.3, 3, 2, 7);
      ctx.fillRect(-1, -6, 2, 10); for (var i = 0; i < 3; i++) ctx.fillRect(-5, -5 + i * 3, 10, 1.5);
      ctx.beginPath(); ctx.arc(0, -10, 5, 0, TAU); ctx.fill(); ctx.fillRect(-3, -7, 6, 3);
      ctx.fillStyle = "#1c1917"; ctx.fillRect(0, -11, 2, 2); ctx.fillRect(3, -11, 1.5, 2);
      ctx.fillStyle = "#a8a29e"; ctx.save(); ctx.translate(4, -2); ctx.rotate(0.6 + Math.sin(t * 6) * 0.3); ctx.fillRect(0, -1, 11, 2); ctx.restore();
    } else if (k === "bat") {
      var fl = Math.sin(t * 22) * 5;
      ctx.fillStyle = "#44403c"; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(-12, -4 - fl); ctx.lineTo(-7, 2); ctx.lineTo(-3, 1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(12, -4 - fl); ctx.lineTo(7, 2); ctx.lineTo(3, 1); ctx.fill();
      ctx.fillStyle = "#292524"; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ef4444"; ctx.fillRect(0.5, -1.5, 1.5, 1.5); ctx.fillRect(2.5, -1.5, 1.5, 1.5);
    } else if (k === "slime" || k === "slimelet") {
      var sq = 1 + Math.sin(t * 6) * 0.12, r = k === "slime" ? 11 : 7;
      ctx.fillStyle = "rgba(132,204,22,.85)"; ctx.beginPath(); ctx.ellipse(0, 4 - r * (sq - 1), r * (2 - sq), r * sq * 0.85, 0, Math.PI, 0); ctx.lineTo(r * (2 - sq), 6); ctx.lineTo(-r * (2 - sq), 6); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.3, r * 0.2, r * 0.3, -0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1a2e05"; ctx.fillRect(r * 0.1, -r * 0.2, 2, 2.5); ctx.fillRect(r * 0.45, -r * 0.2, 2, 2.5);
    } else if (k === "archer" || k === "imp") {
      var body = k === "archer" ? "#4d7c0f" : "#b91c1c", dark = k === "archer" ? "#365314" : "#7f1d1d";
      ctx.fillStyle = dark; ctx.fillRect(-3 + wl * 0.3, 3, 2.5, 6); ctx.fillRect(1 - wl * 0.3, 3, 2.5, 6);
      ctx.fillStyle = k === "archer" ? "#78350f" : body; rrect(ctx, -5, -5, 10, 10, 3); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, -9, 5.5, 0, TAU); ctx.fill();
      if (k === "archer") { ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(-10, -13); ctx.lineTo(-4, -7); ctx.fill(); ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(9, -13); ctx.lineTo(4, -7); ctx.fill(); }
      else { ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.moveTo(-3, -13); ctx.lineTo(-5, -19); ctx.lineTo(-1, -14); ctx.fill(); ctx.beginPath(); ctx.moveTo(3, -13); ctx.lineTo(5, -19); ctx.lineTo(1, -14); ctx.fill();
        ctx.strokeStyle = body; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, 4); ctx.quadraticCurveTo(-11, 6, -10, -2 + Math.sin(t * 5) * 2); ctx.stroke(); }
      ctx.fillStyle = "#fde047"; ctx.fillRect(1, -10, 2, 2); ctx.fillRect(3.5, -10, 1.5, 2);
      if (k === "archer") { ctx.strokeStyle = "#92400e"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(6, 0, 7, -1.2, 1.2); ctx.stroke(); }
      else { ctx.fillStyle = "#fb923c"; ctx.beginPath(); ctx.arc(8, -2, 3 + Math.sin(t * 12), 0, TAU); ctx.fill(); }
    } else if (k === "cultist") {
      ctx.fillStyle = "#1e1b4b"; ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(8, 10); ctx.lineTo(4, -8); ctx.lineTo(-4, -8); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -10, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(1.5, -9, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#c084fc"; ctx.fillRect(1, -10, 1.5, 1.5); ctx.fillRect(3.5, -10, 1.5, 1.5);
      var gl = 0.5 + 0.5 * Math.sin(t * 5); ctx.fillStyle = "rgba(168,85,247," + gl + ")"; ctx.beginPath(); ctx.arc(8, -1, 3.5, 0, TAU); ctx.fill();
    } else if (k === "brute") {
      var wind = e.state === "wind" ? Math.sin(t * 40) * 1.5 : 0;
      ctx.translate(wind, 0);
      ctx.fillStyle = "#292524"; ctx.fillRect(-7 + wl * 0.3, 5, 5, 8); ctx.fillRect(2 - wl * 0.3, 5, 5, 8);
      ctx.fillStyle = "#57534e"; rrect(ctx, -11, -10, 22, 17, 5); ctx.fill();
      ctx.fillStyle = "#78716c"; rrect(ctx, -9, -9, 10, 8, 3); ctx.fill();
      ctx.fillStyle = "#44403c"; ctx.beginPath(); ctx.arc(0, -14, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = e.state === "wind" ? "#ef4444" : "#f97316"; ctx.fillRect(1, -15, 5, 2);
      ctx.fillStyle = "#a8a29e"; ctx.beginPath(); ctx.moveTo(-6, -19); ctx.lineTo(-9, -25); ctx.lineTo(-3, -20); ctx.fill(); ctx.beginPath(); ctx.moveTo(6, -19); ctx.lineTo(9, -25); ctx.lineTo(3, -20); ctx.fill();
      ctx.fillStyle = "#78350f"; ctx.fillRect(9, -12, 3, 22); ctx.fillStyle = "#d6d3d1"; ctx.beginPath(); ctx.moveTo(12, -12); ctx.quadraticCurveTo(22, -6, 12, 0); ctx.fill();
    } else if (k === "spiderling") {
      ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 1.2;
      for (i = 0; i < 4; i++) { var la = Math.sin(t * 20 + i) * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -3 + i * 2 + la); ctx.moveTo(0, 0); ctx.lineTo(7, -3 + i * 2 - la); ctx.stroke(); }
      ctx.fillStyle = "#334155"; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7dd3fc"; ctx.fillRect(1, -2, 1.5, 1.5); ctx.fillRect(3, -2, 1.5, 1.5);
    } else if (k === "boss") drawBoss(e);
    if (e.flash > 0) { ctx.globalCompositeOperation = "source-atop"; }
    ctx.restore();
    if (e.flash > 0 && k !== "boss") { ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.arc(x, y - 3, e.r + 2, 0, TAU); ctx.fill(); }
    if (e.slow > 0) { ctx.strokeStyle = "rgba(125,211,252,.8)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y - 2, e.r + 3, 0, TAU); ctx.stroke(); }
    if (k !== "boss" && e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x - 10, y - e.r - 14 * s, 20, 3);
      ctx.fillStyle = e.elite ? "#fbbf24" : "#ef4444"; ctx.fillRect(x - 10, y - e.r - 14 * s, 20 * Math.max(0, e.hp / e.maxHp), 3);
    }
    if (e.state === "wind") { ctx.fillStyle = "#fbbf24"; ctx.font = "bold 12px Georgia"; ctx.textAlign = "center"; ctx.fillText("!", x, y - e.r - 18); }
  }

  function drawBoss(b) {
    var id = b.boss.id, t = b.t, fl = b.fly || 0;
    if (fl) ctx.translate(0, -fl);
    var flash = b.flash > 0;
    if (id === "colossus") {
      var st = Math.sin(t * 3) * 2;
      ctx.fillStyle = "#57534e"; ctx.fillRect(-14 + st, 12, 8, 16); ctx.fillRect(6 - st, 12, 8, 16);
      ctx.fillStyle = flash ? "#fff" : "#d6d3c4";
      ctx.fillRect(-3, -14, 6, 28);
      for (var i = 0; i < 5; i++) { ctx.fillRect(-16 + i, -12 + i * 5, 32 - i * 2, 3); }
      ctx.fillRect(-26, -16, 12, 7); ctx.fillRect(14, -16, 12, 7);
      ctx.save(); ctx.translate(-22, -10); ctx.rotate(0.3 + Math.sin(t * 2) * 0.2); ctx.fillRect(-3, 0, 6, 22); ctx.fillStyle = "#78716c"; ctx.fillRect(-8, 20, 16, 10); ctx.restore();
      ctx.fillStyle = flash ? "#fff" : "#d6d3c4"; ctx.save(); ctx.translate(22, -10); ctx.rotate(-0.3 - Math.sin(t * 2) * 0.2); ctx.fillRect(-3, 0, 6, 22); ctx.restore();
      ctx.beginPath(); ctx.arc(0, -26, 12, 0, TAU); ctx.fill(); ctx.fillRect(-7, -20, 14, 8);
      ctx.fillStyle = "#1c1917"; ctx.beginPath(); ctx.arc(-4, -27, 3.5, 0, TAU); ctx.arc(5, -27, 3.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.arc(-4, -27, 1.5, 0, TAU); ctx.arc(5, -27, 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#65a30d"; ctx.beginPath(); ctx.ellipse(-8, -36, 7, 3, -0.4, 0, TAU); ctx.fill();
    } else if (id === "matriarch") {
      ctx.strokeStyle = flash ? "#fff" : "#1e293b"; ctx.lineWidth = 3;
      for (i = 0; i < 4; i++) { var la = Math.sin(t * 8 + i) * 4; ctx.beginPath(); ctx.moveTo(-6, -2 + i * 3); ctx.quadraticCurveTo(-26, -18 + i * 8, -30, 4 + i * 7 + la); ctx.moveTo(6, -2 + i * 3); ctx.quadraticCurveTo(26, -18 + i * 8, 30, 4 + i * 7 - la); ctx.stroke(); }
      ctx.fillStyle = flash ? "#fff" : "#334155"; ctx.beginPath(); ctx.ellipse(-4, 8, 18, 14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7dd3fc"; ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(-4, 14); ctx.lineTo(2, 4); ctx.lineTo(-4, 0); ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#1e293b"; ctx.beginPath(); ctx.arc(8, -8, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7dd3fc"; [[6, -11], [10, -11], [13, -8], [8, -7]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 1.6, 0, TAU); ctx.fill(); });
      ctx.fillStyle = "#e2e8f0"; ctx.beginPath(); ctx.moveTo(10, -1); ctx.lineTo(12, 6); ctx.lineTo(14, -1); ctx.fill();
    } else if (id === "lich") {
      var hov = Math.sin(t * 2.5) * 3; ctx.translate(0, hov - 6);
      var g = ctx.createRadialGradient(0, 0, 4, 0, 0, 34); g.addColorStop(0, "rgba(192,132,252,.35)"); g.addColorStop(1, "rgba(192,132,252,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#1e1b4b"; ctx.beginPath(); ctx.moveTo(-14, 20); ctx.quadraticCurveTo(-4, 14 + Math.sin(t * 4) * 3, 0, 22); ctx.quadraticCurveTo(6, 14, 14, 20); ctx.lineTo(8, -8); ctx.lineTo(-8, -8); ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#312e81"; ctx.fillRect(-12, -10, 24, 6);
      ctx.fillStyle = "#e7e5e4"; ctx.beginPath(); ctx.arc(0, -15, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = "#000"; ctx.fillRect(-4, -17, 3, 3); ctx.fillRect(2, -17, 3, 3);
      ctx.fillStyle = "#c084fc"; ctx.fillRect(-3.5, -16.5, 2, 2); ctx.fillRect(2.5, -16.5, 2, 2);
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.moveTo(-8, -20); ctx.lineTo(-8, -27); ctx.lineTo(-4, -23); ctx.lineTo(0, -29); ctx.lineTo(4, -23); ctx.lineTo(8, -27); ctx.lineTo(8, -20); ctx.fill();
      ctx.fillStyle = "#78350f"; ctx.fillRect(14, -26, 2.5, 44);
      ctx.fillStyle = "#c084fc"; ctx.beginPath(); ctx.arc(15, -29, 4 + Math.sin(t * 6), 0, TAU); ctx.fill();
    } else if (id === "dragon") {
      var wf = Math.sin(t * (b.fly ? 12 : 3)) * (b.fly ? 12 : 4);
      ctx.fillStyle = flash ? "#fff" : "#7f1d1d";
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-44, -30 - wf); ctx.lineTo(-38, -10 - wf * 0.5); ctx.lineTo(-30, -16 - wf * 0.6); ctx.lineTo(-24, 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(40, -32 - wf); ctx.lineTo(34, -12 - wf * 0.5); ctx.lineTo(26, -16 - wf * 0.6); ctx.lineTo(20, 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#991b1b";
      ctx.beginPath(); ctx.moveTo(-12, 12); ctx.quadraticCurveTo(-34, 22, -40, 10 + Math.sin(t * 3) * 4); ctx.lineTo(-36, 16); ctx.quadraticCurveTo(-28, 26, -8, 18); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 4, 20, 15, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.ellipse(3, 8, 11, 9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#b45309"; ctx.lineWidth = 1; for (i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-6, 2 + i * 4); ctx.lineTo(12, 2 + i * 4); ctx.stroke(); }
      ctx.fillStyle = flash ? "#fff" : "#991b1b"; ctx.beginPath(); ctx.moveTo(8, -6); ctx.quadraticCurveTo(14, -18, 20, -20); ctx.lineTo(26, -14); ctx.quadraticCurveTo(18, -10, 16, -2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(26, -20, 11, 7, 0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(30, -18); ctx.lineTo(40, -14); ctx.lineTo(30, -13); ctx.fill();
      ctx.fillStyle = "#e7e5e4"; ctx.beginPath(); ctx.moveTo(20, -26); ctx.lineTo(14, -36); ctx.lineTo(24, -27); ctx.fill(); ctx.beginPath(); ctx.moveTo(25, -27); ctx.lineTo(22, -38); ctx.lineTo(29, -26); ctx.fill();
      ctx.fillStyle = b.phase === 2 ? "#fde047" : "#f97316"; ctx.beginPath(); ctx.arc(28, -22, 2, 0, TAU); ctx.fill();
      if (b.state === "breath") { var g2 = ctx.createRadialGradient(40, -15, 0, 40, -15, 14); g2.addColorStop(0, "rgba(253,224,71,.9)"); g2.addColorStop(1, "rgba(249,115,22,0)"); ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(40, -15, 14, 0, TAU); ctx.fill(); }
    }
  }

  // ============================================================ rendering: props & relics
  function drawProp(c, pr) {
    var R = F.info.R, sh = pr.flash > 0 ? rr(-1.5, 1.5) : 0; if (pr.flash > 0) pr.flash -= 1 / 60;
    c.save(); c.translate(pr.x + sh, pr.y);
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(0, 8, 11, 4, 0, 0, TAU); c.fill();
    if (pr.kind === "rock") {
      var dmg = 3 - pr.hp;
      c.fillStyle = R.deco === "lava" ? "#44291f" : R.deco === "rune" ? "#3b3350" : "#6b665c";
      c.beginPath(); c.moveTo(-11, 7); c.lineTo(-10, -3); c.lineTo(-4, -9); c.lineTo(5, -8); c.lineTo(11, -1); c.lineTo(10, 7); c.closePath(); c.fill();
      c.fillStyle = "rgba(255,255,255,.14)"; c.beginPath(); c.moveTo(-8, -3); c.lineTo(-3, -7); c.lineTo(3, -6); c.lineTo(-2, -2); c.fill();
      c.strokeStyle = "rgba(0,0,0,.45)"; c.lineWidth = 1;
      if (dmg >= 1) { c.beginPath(); c.moveTo(-2, -8); c.lineTo(1, -2); c.lineTo(-1, 3); c.stroke(); }
      if (dmg >= 2) { c.beginPath(); c.moveTo(8, -1); c.lineTo(3, 1); c.lineTo(5, 6); c.stroke(); }
      if (pr.v < 0.25) { c.fillStyle = "#fbbf24"; c.fillRect(4, 2, 2, 2); }
    } else {
      var sway = Math.sin(G.t * 2 + pr.v * 9) * 0.8, leaf = R.deco === "lava" ? "#57534e" : R.deco === "water" ? "#0f766e" : R.deco === "rune" ? "#6d28d9" : "#3f6212";
      var leaf2 = R.deco === "lava" ? "#78716c" : R.deco === "water" ? "#14b8a6" : R.deco === "rune" ? "#8b5cf6" : "#65a30d";
      c.fillStyle = leaf; c.beginPath(); c.arc(-5 + sway, 0, 7, 0, TAU); c.arc(5 + sway, 1, 7, 0, TAU); c.arc(0 + sway, -5, 8, 0, TAU); c.fill();
      c.fillStyle = leaf2; c.beginPath(); c.arc(-3 + sway, -6, 3.5, 0, TAU); c.arc(4 + sway, -3, 3, 0, TAU); c.fill();
      if (pr.v > 0.6) { c.fillStyle = R.deco === "lava" ? "#f97316" : "#ef4444"; c.beginPath(); c.arc(-4 + sway, 2, 1.4, 0, TAU); c.arc(3 + sway, -1, 1.4, 0, TAU); c.fill(); }
    }
    c.restore();
  }
  function drawFeather(c, x, y, t) {
    c.save(); c.translate(x, y); c.rotate(Math.sin(t * 2) * 0.25);
    var g = c.createRadialGradient(0, 0, 1, 0, 0, 18); g.addColorStop(0, "rgba(251,146,60,.6)"); g.addColorStop(1, "rgba(244,114,182,0)");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 18, 0, TAU); c.fill();
    c.fillStyle = "#f97316"; c.beginPath(); c.moveTo(0, -10); c.quadraticCurveTo(7, -2, 1, 9); c.quadraticCurveTo(-6, 0, 0, -10); c.fill();
    c.fillStyle = "#fde047"; c.beginPath(); c.moveTo(0, -7); c.quadraticCurveTo(3, -1, 0.5, 6); c.quadraticCurveTo(-2, 0, 0, -7); c.fill();
    c.strokeStyle = "#7c2d12"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, -8); c.lineTo(1, 11); c.stroke();
    c.restore();
  }

  // ============================================================ rendering: trophies
  function drawTrophy(c, id, x, y, s, t, loop) {
    c.save(); c.translate(x, y); c.scale(s, s);
    var glow = c.createRadialGradient(0, 0, 2, 0, 0, 40);
    var gc = id === "dragon" ? "249,115,22" : id === "lich" ? "250,204,21" : id === "matriarch" ? "203,213,225" : "217,119,6";
    glow.addColorStop(0, "rgba(" + gc + ",.45)"); glow.addColorStop(1, "rgba(" + gc + ",0)");
    c.fillStyle = glow; c.beginPath(); c.arc(0, 0, 40, 0, TAU); c.fill();
    c.fillStyle = "#3f2d1e"; c.fillRect(-16, 20, 32, 7); c.fillStyle = "#57412b"; c.fillRect(-12, 16, 24, 5);
    c.rotate(Math.sin(t * 1.5) * 0.04);
    if (id === "colossus") {
      c.fillStyle = "#b45309"; c.beginPath(); c.arc(0, -2, 15, 0, TAU); c.fill(); c.fillRect(-9, 6, 18, 9);
      c.fillStyle = "#d97706"; c.beginPath(); c.arc(-4, -6, 7, 0, TAU); c.fill();
      c.fillStyle = "#1c1917"; c.beginPath(); c.arc(-5, -1, 4, 0, TAU); c.arc(6, -1, 4, 0, TAU); c.fill();
      c.fillRect(-6, 9, 2, 5); c.fillRect(-1, 9, 2, 5); c.fillRect(4, 9, 2, 5);
    } else if (id === "matriarch") {
      c.fillStyle = "#e2e8f0"; c.beginPath(); c.moveTo(-8, -20); c.quadraticCurveTo(10, -8, 2, 16); c.quadraticCurveTo(-2, 0, -8, -20); c.fill();
      c.fillStyle = "#94a3b8"; c.beginPath(); c.moveTo(-8, -20); c.quadraticCurveTo(-2, -6, 2, 16); c.quadraticCurveTo(-4, 0, -8, -20); c.fill();
      c.fillStyle = "#7dd3fc"; c.beginPath(); c.arc(2, 14, 2.5, 0, TAU); c.fill();
    } else if (id === "lich") {
      c.fillStyle = "#facc15"; c.beginPath(); c.moveTo(-18, 10); c.lineTo(-18, -8); c.lineTo(-9, 0); c.lineTo(0, -16); c.lineTo(9, 0); c.lineTo(18, -8); c.lineTo(18, 10); c.fill();
      c.fillStyle = "#ca8a04"; c.fillRect(-18, 6, 36, 5);
      c.fillStyle = "#a855f7"; c.beginPath(); c.arc(0, 2, 3.5, 0, TAU); c.fill(); c.fillStyle = "#ef4444"; c.beginPath(); c.arc(-11, 4, 2.2, 0, TAU); c.arc(11, 4, 2.2, 0, TAU); c.fill();
    } else {
      var beat = 1 + Math.sin(t * 5) * 0.05; c.scale(beat, beat);
      c.fillStyle = "#b91c1c"; c.beginPath(); c.moveTo(0, 16); c.bezierCurveTo(-24, 0, -14, -20, 0, -8); c.bezierCurveTo(14, -20, 24, 0, 0, 16); c.fill();
      c.fillStyle = "#f97316"; c.beginPath(); c.moveTo(0, 10); c.bezierCurveTo(-12, 0, -8, -10, 0, -3); c.bezierCurveTo(8, -10, 12, 0, 0, 10); c.fill();
      c.fillStyle = "#fde047"; c.beginPath(); c.arc(0, 1, 3, 0, TAU); c.fill();
    }
    if (loop) { c.fillStyle = "#e879f9"; for (var i = 0; i < Math.min(3, loop); i++) star(c, -8 + i * 8, -26, 3); }
    c.restore();
  }

  // ============================================================ render frame
  function render() {
    ctx.fillStyle = "#07060a"; ctx.fillRect(0, 0, VW, VH);
    if (!F || !room) { drawTitleBackdrop(); return; }
    ctx.save();
    if (G.shake > 0 && !reduceMotion) ctx.translate(rr(-1, 1) * G.shake * 6, rr(-1, 1) * G.shake * 6);
    ctx.drawImage(roomCanvas, 0, 0, VW, VH);
    drawRoomDynamic();
    ctx.save(); ctx.translate(OX, OY);
    // telegraphs
    teles.forEach(function (tl) {
      var k = tl.t / tl.dur;
      ctx.fillStyle = "rgba(239,68,68," + (0.12 + k * 0.25) + ")"; ctx.strokeStyle = "rgba(239,68,68,.7)"; ctx.lineWidth = 1.5;
      if (tl.type === "circle") { ctx.beginPath(); ctx.arc(tl.x, tl.y, tl.r, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(tl.x, tl.y, tl.r * k, 0, TAU); ctx.fill(); }
      else { ctx.save(); ctx.translate(tl.x, tl.y); ctx.rotate(tl.a); ctx.fillRect(0, -tl.w / 2, tl.len * Math.min(1, k * 1.6), tl.w); ctx.strokeRect(0, -tl.w / 2, tl.len, tl.w); ctx.restore(); }
    });
    // pickups
    pickups.forEach(function (pk) {
      var b = Math.sin(pk.t * 5) * 2;
      if (pk.type === "gold") { ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.ellipse(pk.x, pk.y + b, 3.5, 3.5 * Math.abs(Math.cos(pk.t * 6)) + 0.8, 0, 0, TAU); ctx.fill(); }
      else if (pk.type === "heart") { ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.moveTo(pk.x, pk.y + 5 + b); ctx.bezierCurveTo(pk.x - 8, pk.y - 1 + b, pk.x - 4, pk.y - 7 + b, pk.x, pk.y - 3 + b); ctx.bezierCurveTo(pk.x + 4, pk.y - 7 + b, pk.x + 8, pk.y - 1 + b, pk.x, pk.y + 5 + b); ctx.fill(); }
      else if (pk.type === "mana") { ctx.fillStyle = "#60a5fa"; ctx.beginPath(); ctx.moveTo(pk.x, pk.y - 6 + b); ctx.lineTo(pk.x + 4, pk.y + b); ctx.lineTo(pk.x, pk.y + 6 + b); ctx.lineTo(pk.x - 4, pk.y + b); ctx.fill(); }
      else if (pk.type === "chest") {
        ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(pk.x, pk.y + 10, 14, 4, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#78350f"; ctx.fillRect(pk.x - 12, pk.y - 6, 24, 16); ctx.fillStyle = "#92400e"; ctx.fillRect(pk.x - 12, pk.y - 10, 24, 6);
        ctx.fillStyle = "#fbbf24"; ctx.fillRect(pk.x - 12, pk.y - 5, 24, 2); ctx.fillRect(pk.x - 2, pk.y - 5, 4, 6);
        var g = 0.5 + 0.5 * Math.sin(pk.t * 3); ctx.strokeStyle = "rgba(251,191,36," + g + ")"; ctx.strokeRect(pk.x - 14, pk.y - 12, 28, 24);
      } else if (pk.type === "trophy") { drawTrophy(ctx, pk.trophy.id, pk.x, pk.y - 6 + b, 0.6, pk.t, pk.trophy.loop); }
      else if (pk.type === "feather") { drawFeather(ctx, pk.x, pk.y - 4 + b, pk.t); }
    });
    // sort entities by y
    var ents = enemies.slice(); ents.push(P);
    if (room.props) room.props.forEach(function (pr) { if (pr.hp > 0) ents.push(pr); });
    ents.sort(function (a, b) { return a.y - b.y; });
    ents.forEach(function (e) {
      if (e === P) {
        drawHero(ctx, P.id, P.x, P.y, { t: G.t, walk: P.walkT, moving: P.moving || !!P.dash, face: P.face, aim: P.aim, atk: P.atkT > 0 ? P.atkT : 0, cast: P.castT, inv: P.inv > 0 && !P.dash, hurt: P.hurtT, block: P.blocking });
        if (P.blocking) {
          var bc = P.id === "knight" ? "253,230,138" : P.id === "ranger" ? "187,247,208" : "216,180,254", ba = 0.35 + 0.5 * (P.breath / P.maxBreath);
          ctx.strokeStyle = "rgba(" + bc + "," + ba + ")"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P.x, P.y - 3, 18, P.aim - P.blockArc, P.aim + P.blockArc); ctx.stroke();
          ctx.fillStyle = "rgba(" + bc + ",.08)"; ctx.beginPath(); ctx.moveTo(P.x, P.y - 3); ctx.arc(P.x, P.y - 3, 18, P.aim - P.blockArc, P.aim + P.blockArc); ctx.fill();
        }
        if (P.winded > 0) { ctx.fillStyle = "#fca5a5"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.fillText("winded", P.x, P.y - 30); }
      }
      else if (e.kind === "rock" || e.kind === "shrub") drawProp(ctx, e);
      else drawEnemy(e);
    });
    // projectiles
    projs.forEach(function (p) {
      var a = Math.atan2(p.vy, p.vx);
      if (p.kind === "arrow" || p.kind === "arrowE" || p.kind === "frost") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.fillStyle = p.kind === "frost" ? "#bae6fd" : "#d6d3d1"; ctx.fillRect(-9, -0.8, 12, 1.6);
        ctx.fillStyle = p.kind === "frost" ? "#e0f2fe" : p.kind === "arrowE" ? "#ef4444" : "#f5f5f4"; ctx.beginPath(); ctx.moveTo(3, -2.5); ctx.lineTo(7, 0); ctx.lineTo(3, 2.5); ctx.fill();
        if (p.kind === "frost") { ctx.fillStyle = "rgba(186,230,253,.4)"; ctx.fillRect(-16, -1.5, 8, 3); }
        ctx.restore();
      } else if (p.kind === "firebolt" || p.kind === "fire" || p.kind === "flame" || p.kind === "fireball") {
        var rr3 = p.kind === "flame" ? 4 + p.t * 8 : p.r + 1;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr3 * 1.8);
        g.addColorStop(0, "rgba(254,240,138," + (p.kind === "flame" ? Math.max(0, 0.9 - p.t) : 1) + ")"); g.addColorStop(0.4, "rgba(249,115,22,.8)"); g.addColorStop(1, "rgba(239,68,68,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rr3 * 1.8, 0, TAU); ctx.fill();
      } else if (p.kind === "orb" || p.kind === "skull") {
        ctx.fillStyle = p.kind === "skull" ? "#e7e5e4" : "#a855f7"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.fillStyle = p.kind === "skull" ? "#7c3aed" : "#f0abfc"; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, TAU); ctx.fill();
      } else if (p.kind === "web") {
        ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1; ctx.beginPath();
        for (var i = 0; i < 4; i++) { var wa = i / 4 * Math.PI + p.t * 3; ctx.moveTo(p.x + Math.cos(wa) * 5, p.y + Math.sin(wa) * 5); ctx.lineTo(p.x - Math.cos(wa) * 5, p.y - Math.sin(wa) * 5); }
        ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.stroke();
      } else if (p.kind === "bone") { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t * 10); ctx.fillStyle = "#d6d3c4"; ctx.fillRect(-5, -1.2, 10, 2.4); ctx.fillRect(-6, -2.5, 2.5, 5); ctx.fillRect(3.5, -2.5, 2.5, 5); ctx.restore(); }
    });
    // fx
    fx.forEach(function (f) {
      var k = f.t / f.dur;
      if (f.type === "slash") {
        ctx.strokeStyle = "rgba(255,247,214," + (1 - k) + ")"; ctx.lineWidth = 5 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(f.x, f.y - 4, f.r * (0.7 + k * 0.3), f.a - f.arc / 2, f.a + f.arc / 2); ctx.stroke();
      } else if (f.type === "nova") {
        ctx.strokeStyle = "rgba(253,230,138," + (1 - k) + ")"; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k, 0, TAU); ctx.stroke();
        ctx.fillStyle = "rgba(254,243,199," + (0.25 * (1 - k)) + ")"; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k, 0, TAU); ctx.fill();
      } else if (f.type === "ring") {
        ctx.strokeStyle = hexA(f.col, 1 - k); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + k * 0.6), 0, TAU); ctx.stroke();
      } else if (f.type === "bolt") {
        ctx.strokeStyle = "rgba(191,219,254," + (1 - k) + ")"; ctx.lineWidth = 2.5; ctx.shadowColor = "#60a5fa"; ctx.shadowBlur = 10;
        ctx.beginPath();
        for (var s = 0; s < f.pts.length - 1; s++) {
          var a0 = f.pts[s], a1 = f.pts[s + 1]; ctx.moveTo(a0.x, a0.y);
          for (var j = 1; j <= 5; j++) { var u = j / 5; ctx.lineTo(lerp(a0.x, a1.x, u) + (j < 5 ? rr(-6, 6) : 0), lerp(a0.y, a1.y, u) + (j < 5 ? rr(-6, 6) : 0)); }
        }
        ctx.stroke(); ctx.shadowBlur = 0;
      }
    });
    parts.forEach(function (q) { ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.col; ctx.fillRect(q.x - q.sz / 2, q.y - q.sz / 2, q.sz, q.sz); });
    ctx.globalAlpha = 1;
    ctx.font = "bold 10px system-ui, sans-serif"; ctx.textAlign = "center";
    texts.forEach(function (tx) { ctx.globalAlpha = Math.max(0, 1 - tx.t / 0.8); ctx.fillStyle = "#000"; ctx.fillText(tx.s, tx.x + 1, tx.y + 1); ctx.fillStyle = tx.col; ctx.fillText(tx.s, tx.x, tx.y); });
    ctx.globalAlpha = 1;
    ctx.restore();
    // vignette + damage flash
    var v = ctx.createRadialGradient(VW / 2, VH / 2, 120, VW / 2, VH / 2, 400); v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)");
    ctx.fillStyle = v; ctx.fillRect(0, 0, VW, VH);
    if (G.flash > 0) { ctx.fillStyle = "rgba(220,38,38," + (G.flash * 0.8) + ")"; ctx.fillRect(0, 0, VW, VH); }
    ctx.restore();
    drawMinimap();
    if (G.banner) {
      var bk = G.banner.t / G.banner.dur, al = bk < 0.15 ? bk / 0.15 : bk > 0.8 ? (1 - bk) / 0.2 : 1;
      ctx.globalAlpha = al; ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, VH / 2 - 34, VW, G.banner.sub ? 62 : 44);
      ctx.fillStyle = "#fde68a"; ctx.font = "bold 24px Georgia, serif"; ctx.fillText(G.banner.s, VW / 2, VH / 2 - 4);
      if (G.banner.sub) { ctx.fillStyle = "#d6c7ae"; ctx.font = "italic 13px Georgia, serif"; ctx.fillText(G.banner.sub, VW / 2, VH / 2 + 18); }
      ctx.globalAlpha = 1;
    }
  }
  function drawMinimap() {
    var cs = 7, gap = 2, minx = 99, miny = 99, maxx = 0, maxy = 0;
    F.list.forEach(function (r) { if (!r.known) return; minx = Math.min(minx, r.gx); miny = Math.min(miny, r.gy); maxx = Math.max(maxx, r.gx); maxy = Math.max(maxy, r.gy); });
    var w = (maxx - minx + 1) * (cs + gap), x0 = VW - w - 22, y0 = 26;
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(x0 - 4, y0 - 4, w + 6, (maxy - miny + 1) * (cs + gap) + 6);
    F.list.forEach(function (r) {
      if (!r.known) return;
      var x = x0 + (r.gx - minx) * (cs + gap), y = y0 + (r.gy - miny) * (cs + gap);
      ctx.fillStyle = r === room ? "#fde68a" : r.visited ? "#78716c" : "#3f3a35";
      ctx.fillRect(x, y, cs, cs);
      if ((r.type === "boss") && r.visited !== undefined && r.known) { ctx.fillStyle = "#ef4444"; ctx.fillRect(x + 2, y + 2, 3, 3); }
      if (r.type === "treasure" && r.known) { ctx.fillStyle = "#fbbf24"; ctx.fillRect(x + 2, y + 2, 3, 3); }
      if (r.type === "exit" && r.visited) { ctx.fillStyle = "#a3e635"; ctx.fillRect(x + 2, y + 2, 3, 3); }
    });
  }
  function drawTitleBackdrop() {
    var t = performance.now() / 1000;
    var g = ctx.createRadialGradient(VW / 2, VH * 0.8, 10, VW / 2, VH * 0.8, 420); g.addColorStop(0, "#3b1d0e"); g.addColorStop(1, "#07060a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    for (var i = 0; i < 40; i++) {
      var x = (i * 97 + t * 12 * (1 + i % 3)) % VW, y = VH - ((i * 53 + t * 30 * (1 + i % 4)) % VH);
      ctx.fillStyle = "rgba(251,146,60," + (0.25 + (i % 5) * 0.12) + ")"; ctx.fillRect(x, y, 2, 2);
    }
  }

  // ============================================================ HUD
  var hudEls = { lives: $("hLives"), br: $("brBar"), soul: $("soulBar"), soulT: $("soulTxt"), hp: $("hpBar"), hpT: $("hpTxt"), mp: $("mpBar"), mpT: $("mpTxt"), fl: $("hFloor"), rg: $("hRegion"), gold: $("hGold"), tro: $("hTro"),
                 cdA: $("cdA"), cdS: $("cdS"), cdM: $("cdM"), abM: $("abM"), bb: $("bBar") };
  function updateHud() {
    if (!P || !F) return;
    hudEls.hp.style.transform = "scaleX(" + Math.max(0, P.hp / P.maxHp) + ")"; hudEls.hpT.textContent = Math.ceil(P.hp) + "/" + P.maxHp;
    hudEls.mp.style.transform = "scaleX(" + Math.max(0, P.mp / P.maxMp) + ")"; hudEls.mpT.textContent = Math.floor(P.mp) + "/" + P.maxMp;
    hudEls.br.style.transform = "scaleX(" + Math.max(0, P.breath / P.maxBreath) + ")"; hudEls.br.parentNode.classList.toggle("winded", P.winded > 0);
    hudEls.soul.style.transform = "scaleX(" + Math.max(0, P.soul / P.soulNext) + ")"; hudEls.soulT.textContent = Math.floor(P.soul) + "/" + P.soulNext;
    var lv = ""; for (var li = 0; li < Math.max(3, P.lives); li++) lv += li < P.lives ? "♥" : "♡"; if (hudEls.lives.textContent !== lv) hudEls.lives.textContent = lv;
    hudEls.fl.textContent = "Floor " + F.info.n + (F.info.loop ? " · " + LOOP_PREFIX[Math.min(3, F.info.loop)].trim() : "");
    hudEls.rg.textContent = F.info.R.name; hudEls.gold.textContent = P.gold; hudEls.tro.textContent = P.trophies.length;
    hudEls.cdA.style.transform = "scaleY(" + clamp(P.cdA / (P.H.atkCd * P.cdMul), 0, 1) + ")";
    hudEls.cdS.style.transform = "scaleY(" + clamp(P.cdS / (P.H.sklCd * P.cdMul), 0, 1) + ")";
    hudEls.cdM.style.transform = "scaleY(" + clamp(1 - P.mp / P.H.magCost, 0, 1) + ")";
    hudEls.abM.classList.toggle("nomana", P.mp < P.H.magCost);
    if (G.boss) hudEls.bb.style.transform = "scaleX(" + Math.max(0, G.boss.hp / G.boss.maxHp) + ")";
  }

  // ============================================================ menus
  var OVS = ["ovTitle", "ovSelect", "ovShrine", "ovTrophy", "ovPause", "ovEnd", "ovHall"];
  function showOnly(id) { OVS.forEach(function (o) { $(o).hidden = o !== id; }); }
  function syncMute() { var s = "Sound: " + (muted ? "off" : "on"); $("bMute").textContent = s; $("bMute2").textContent = s; }
  function toggleMute() { muted = !muted; store.set("wyrm.muted", muted); syncMute(); }
  $("bMute").addEventListener("click", toggleMute); $("bMute2").addEventListener("click", toggleMute); syncMute();
  $("bPlay").addEventListener("click", function () { ensureAudio(); openSelect(); });
  $("bHall").addEventListener("click", function () { openHall("ovTitle"); });
  $("bSelBack").addEventListener("click", function () { G.state = "title"; showOnly("ovTitle"); });
  $("bHallBack").addEventListener("click", function () { showOnly(hallReturn); G.state = hallReturn === "ovEnd" ? "end" : "title"; });
  $("bEndMain").addEventListener("click", function () { openSelect(); });
  $("bEndAlt").addEventListener("click", function () { openHall("ovEnd"); });

  var previews = [];
  function openSelect() {
    G.state = "select"; $("hud").hidden = true; $("abil").hidden = true; $("bossbar").hidden = true; $("touch").hidden = true;
    F = null; room = null;
    var box = $("heroes"); box.innerHTML = ""; previews = [];
    ["knight", "ranger", "mage"].forEach(function (id, i) {
      var H = HEROES[id], el = document.createElement("button"); el.className = "hero"; el.type = "button";
      el.setAttribute("data-meta", "card:hero-" + id);
      var bars = ["might", "speed", "magic", "guard"].map(function (k) { return "<span>" + k + "</span><span class='s'><i style='width:" + Math.round(H.stats[k] * 100) + "%'></i></span>"; }).join("");
      el.innerHTML = "<canvas width='320' height='150'></canvas><div class='cls'>" + H.cls + "</div><h3>" + H.name + "</h3><p>" + H.blurb + "</p>" +
        "<div class='stats'>" + bars + "</div><dl><dt>Weapon</dt><dd>" + H.weapon + "</dd><dt>Skill</dt><dd>" + H.skill + "</dd><dt>Magic</dt><dd>" + H.magic + "</dd><dt>Vitals</dt><dd>" + H.hp + " HP · " + H.mp + " mana</dd></dl>";
      el.addEventListener("click", function () { startRun(id); });
      box.appendChild(el);
      previews.push({ id: id, c: el.querySelector("canvas").getContext("2d"), el: el });
      if (i === 0) setTimeout(function () { el.focus(); }, 30);
    });
    showOnly("ovSelect");
  }
  function drawPreviews(t) {
    previews.forEach(function (p, i) {
      var c = p.c, hover = p.el.matches(":hover") || document.activeElement === p.el;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 320, 150);
      c.setTransform(3, 0, 0, 3, 160, 92);
      var cyc = (t * 0.8 + i * 0.7) % 3, atk = hover && (t * 2 % 1) < 0.25 ? 0.22 - (t * 2 % 1) : 0;
      drawHero(c, p.id, 0, 0, { t: t, walk: t * 10, moving: hover, face: 1, aim: hover ? -0.2 : 0.3 + Math.sin(t) * 0.1, atk: atk, cast: cyc > 2.7 ? 0.2 : 0 });
    });
  }
  var hallReturn = "ovTitle";
  var hallCanvases = [];
  function openHall(ret) {
    hallReturn = ret; G.state = "hall";
    var box = $("hall"); box.innerHTML = ""; hallCanvases = [];
    BOSSES.forEach(function (b) {
      var list = save.trophies[b.id] || [], best = list.reduce(function (m, x) { return Math.max(m, x.value); }, 0), bestLoop = list.reduce(function (m, x) { return Math.max(m, x.loop); }, 0);
      var d = document.createElement("div"); if (!list.length) d.className = "locked";
      d.innerHTML = "<canvas width='128' height='128'></canvas><b>" + (list.length ? LOOP_PREFIX[Math.min(3, bestLoop)] + b.trophy.name : "???") + "</b>" + b.name + "<br>" + (list.length ? "×" + list.length + " · best " + best + "g" : "Not yet claimed");
      box.appendChild(d); hallCanvases.push({ c: d.querySelector("canvas").getContext("2d"), id: b.id, loop: bestLoop, got: list.length > 0 });
    });
    $("hallStats").textContent = "Renown " + save.renown + " · Deepest floor " + save.bestFloor + " · Runs " + save.runs + " · Dragons slain " + save.wins;
    showOnly("ovHall");
  }

  // ============================================================ main loop
  var last = performance.now(), acc = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.state === "play") update(dt);
    else if (G.state === "trophy" || G.state === "shrine") { G.t += dt; }
    render();
    if (G.state === "play" || G.state === "pause" || G.state === "trophy" || G.state === "shrine") updateHud();
    var t = now / 1000;
    if (G.state === "select") drawPreviews(t);
    if (G.state === "hall") hallCanvases.forEach(function (h) { h.c.setTransform(1, 0, 0, 1, 0, 0); h.c.clearRect(0, 0, 128, 128); if (h.got) drawTrophy(h.c, h.id, 64, 60, 1.6, t, h.loop); else { h.c.globalAlpha = 0.25; drawTrophy(h.c, h.id, 64, 60, 1.6, 0, 0); h.c.globalAlpha = 1; } });
    if (trophyAnim) { var tc = $("trCanvas").getContext("2d"); trophyAnim.t += dt; tc.setTransform(1, 0, 0, 1, 0, 0); tc.clearRect(0, 0, 360, 360); drawTrophy(tc, trophyAnim.kind, 180, 170, 4.2, trophyAnim.t, trophyAnim.loop); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Test/debug hook (used by the headless smoke test)
  window.__wyrm = {
    state: function () { return { state: G.state, floor: F && F.info.n, hp: P && P.hp, lives: P && P.lives, breath: P && Math.round(P.breath), soul: P && Math.round(P.soul), props: room && room.props ? room.props.filter(function (p) { return p.hp > 0; }).length : 0, pickups: pickups.length, gold: P && P.gold, enemies: enemies.length, room: room && room.type, boss: G.boss ? Math.round(G.boss.hp) : null, trophies: P ? P.trophies.length : 0 }; },
    start: function (id) { startRun(id); },
    god: function () { if (P) { P.maxHp = 99999; P.hp = 99999; P.dmgMul = 40; P.magMul = 40; } },
    warp: function (n) { startFloor(n); G.state = "play"; showOnly(null); },
    toBoss: function () { var b = F.list.filter(function (r) { return r.type === "boss" || r.type === "exit"; })[0]; enterRoom(b, "s"); },
    cast: function (k) { pressed[k] = true; }
  };
})();
