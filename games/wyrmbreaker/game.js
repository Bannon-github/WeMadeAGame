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

  // ============================================================ art direction
  // "Outlined HD-pixel": every character/prop is painted with flat colour ramps
  // (shadow / base / light), light comes from the top-left, then baked into an
  // offscreen canvas with a 1px warm-black outline and a top-left rim light.
  // Enemies/props are cached per animation frame; the hero and bosses are baked
  // live each frame (one sprite each). The environment is lit by a low-res light
  // map (torches, hero, fire, runes, lava) and characters are drawn on top at full
  // brightness so they always read clearly.
  var OUTL = "#0d0806", RIM = "rgba(255,244,222,.5)";
  function frac(v) { return v - Math.floor(v); }
  function hexRGB(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function toHex(r, g, b) { return "#" + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1); }
  function mixHex(a, b, t) { var A = hexRGB(a), B = hexRGB(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  function shade(h, f) { return f < 0 ? mixHex(h, "#000000", -f) : mixHex(h, "#ffffff", f); }
  function fe(c, x, y, rx, ry, col, rot) { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, TAU); c.fill(); }
  function fc(c, x, y, r, col) { fe(c, x, y, r, r, col); }
  function fr(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }
  function fp(c, col, p) { c.fillStyle = col; c.beginPath(); c.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); c.fill(); }
  function sl(c, col, w, p) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(p[0], p[1]); for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.stroke(); }
  function mkCanvas(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

  // ---- sprite pipeline
  var ART = { k: 2, cache: {}, n: 0 };
  function artK() { var k = Math.max(1, Math.min(3, Math.ceil(cv.width / VW - 0.05))); if (k !== ART.k) { ART.k = k; ART.cache = {}; ART.n = 0; } return k; }
  var SCR = mkCanvas(64, 64), SCR2 = mkCanvas(64, 64);
  function fitScr(cn, w, h) { if (cn.width < w || cn.height < h) { cn.width = Math.max(cn.width, w); cn.height = Math.max(cn.height, h); } var x = cn.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.clearRect(0, 0, w, h); return x; }
  function ctxK(c) { if (c.getTransform) { var m = c.getTransform(); return Math.max(1, Math.min(3, Math.ceil(Math.sqrt(m.a * m.a + m.b * m.b) - 0.05))); } return ART.k; }
  function bake(dst, k, bx, fn, ol, rim, tint, fast) {
    var W = dst.width, H = dst.height, s = fitScr(SCR, W, H);
    s.setTransform(k, 0, 0, k, bx.ax * k, bx.ay * k); fn(s); s.setTransform(1, 0, 0, 1, 0, 0);
    var d = dst.getContext("2d"); d.setTransform(1, 0, 0, 1, 0, 0); d.globalAlpha = 1; d.globalCompositeOperation = "source-over"; d.clearRect(0, 0, W, H);
    var o = Math.max(1, Math.round(k * 0.85));
    if (ol) {
      var nO = fast ? 4 : 8;
      for (var i = 0; i < nO; i++) { var a = i / nO * TAU; d.drawImage(SCR, 0, 0, W, H, Math.round(Math.cos(a) * o), Math.round(Math.sin(a) * o), W, H); }
      d.globalCompositeOperation = "source-in"; d.fillStyle = ol; d.fillRect(0, 0, W, H); d.globalCompositeOperation = "source-over";
    }
    d.drawImage(SCR, 0, 0, W, H, 0, 0, W, H);
    if (rim) {
      var r = fitScr(SCR2, W, H);
      r.drawImage(SCR, 0, 0, W, H, 0, 0, W, H);
      r.globalCompositeOperation = "source-in"; r.fillStyle = rim; r.fillRect(0, 0, W, H);
      r.globalCompositeOperation = "destination-out"; r.drawImage(SCR, 0, 0, W, H, o, o, W, H);
      r.globalCompositeOperation = "source-over";
      d.drawImage(SCR2, 0, 0, W, H, 0, 0, W, H);
    }
    if (tint) { d.globalCompositeOperation = "source-atop"; d.fillStyle = tint; d.fillRect(0, 0, W, H); d.globalCompositeOperation = "source-over"; }
  }
  // cached sprite (per animation frame); key must encode everything the drawing depends on
  function sprite(c, key, bx, fn, o) {
    var ent = ART.cache[key];
    if (!ent) {
      if (ART.n > 520) { ART.cache = {}; ART.n = 0; }
      ent = mkCanvas(bx.w * ART.k, bx.h * ART.k);
      bake(ent, ART.k, bx, fn, o && o.ol !== undefined ? o.ol : OUTL, o && o.rim !== undefined ? o.rim : RIM, o && o.tint);
      ART.cache[key] = ent; ART.n++;
    }
    c.drawImage(ent, -bx.ax, -bx.ay, bx.w, bx.h);
  }
  // live sprite (hero, bosses): re-baked every frame at the target context's resolution
  var LIVE = {};
  function liveSprite(c, slot, bx, fn, ol, rim, tint) {
    var k = c === ctx ? ctxK(c) : Math.min(4, Math.max(1, Math.ceil(c.getTransform ? Math.hypot(c.getTransform().a, c.getTransform().b) - 0.05 : 2))), cn = LIVE[slot], W = Math.ceil(bx.w * k), H = Math.ceil(bx.h * k);
    if (!cn || cn.width !== W || cn.height !== H) cn = LIVE[slot] = mkCanvas(W, H);
    bake(cn, k, bx, fn, ol, rim, tint, true);
    c.drawImage(cn, -bx.ax, -bx.ay, bx.w, bx.h);
  }
  // additive glow (cached radial texture per colour)
  var GLOWS = {};
  function glowSpr(col) {
    var g = GLOWS[col]; if (g) return g;
    g = mkCanvas(64, 64); var x = g.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(0.3, hexA(col, 0.5)); gr.addColorStop(0.65, hexA(col, 0.14)); gr.addColorStop(1, hexA(col, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return (GLOWS[col] = g);
  }
  function glow(c, x, y, r, col, a) {
    if (r <= 0 || (a != null && a < 0.02)) return;
    var ga = c.globalAlpha, op = c.globalCompositeOperation, sw = op !== "lighter";
    if (sw) c.globalCompositeOperation = "lighter";
    c.globalAlpha = ga * (a == null ? 1 : Math.min(1, a));
    c.drawImage(glowSpr(col), x - r, y - r, r * 2, r * 2);
    c.globalAlpha = ga; if (sw) c.globalCompositeOperation = op;
  }

  // ============================================================ rendering: room
  function hash(x, y) { var h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }
  var PALS = {};
  function regionPal(R) {
    var p = PALS[R.name]; if (p) return p;
    p = { tones: [shade(R.floor[0], -0.08), R.floor[0], R.floor[1], shade(R.floor[1], 0.06)], fl: shade(R.floor[1], 0.14), fd: shade(R.floor[0], -0.32), grout: shade(R.floor[0], -0.58),
          wall: R.wall, wallL: shade(R.wall, 0.12), wallL2: shade(R.wall, 0.26), wallD: shade(R.wall, -0.22), wallD2: shade(R.wall, -0.1), cap: shade(R.wall, -0.55), capL: shade(R.wall, -0.4), capS: shade(R.wall, -0.36), capH: shade(R.wall, -0.18),
          top: R.top, topL: shade(R.top, 0.22), topD: shade(R.top, -0.3) };
    return (PALS[R.name] = p);
  }
  var roomDeco = [], roomLights = [];
  function roomK() { return Math.max(1, Math.min(3, Math.ceil(cv.width / VW - 0.05))); }
  function renderRoomBase() {
    var k = roomK(); if (roomCanvas.width !== VW * k) { roomCanvas.width = VW * k; roomCanvas.height = VH * k; }
    var c = roomCanvas.getContext("2d"), R = F.info.R, P = regionPal(R), x, y, t, px, py, h;
    c.setTransform(k, 0, 0, k, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.fillStyle = "#07060a"; c.fillRect(0, 0, VW, VH);
    c.translate(OX, OY);
    roomDeco = []; roomLights = [];
    // pass 1: floors (under everything that is not solid wall)
    for (y = 0; y < RH; y++) for (x = 0; x < RW; x++) {
      t = room.tiles[y * RW + x]; if (t === T_WALL) continue;
      floorTile(c, x * TILE, y * TILE, R, hash(x + room.gx * 31, y + room.gy * 17));
    }
    // pass 2: walls
    for (y = 0; y < RH; y++) for (x = 0; x < RW; x++) {
      if (room.tiles[y * RW + x] !== T_WALL) continue;
      wallTile(c, x, y, R, P, hash(x + room.gx * 31, y + room.gy * 17));
    }
    // pass 3: ambient occlusion where floor meets wall
    for (y = 0; y < RH; y++) for (x = 0; x < RW; x++) {
      if (room.tiles[y * RW + x] === T_WALL) continue;
      px = x * TILE; py = y * TILE;
      if (tileAt(x, y - 1) === T_WALL) { fr(c, px, py, TILE, 3, "rgba(0,0,0,.42)"); fr(c, px, py + 3, TILE, 4, "rgba(0,0,0,.2)"); fr(c, px, py + 7, TILE, 5, "rgba(0,0,0,.08)"); }
      if (tileAt(x - 1, y) === T_WALL) { fr(c, px, py, 3, TILE, "rgba(0,0,0,.3)"); fr(c, px + 3, py, 3, TILE, "rgba(0,0,0,.12)"); }
      if (tileAt(x + 1, y) === T_WALL) { fr(c, px + TILE - 3, py, 3, TILE, "rgba(0,0,0,.3)"); fr(c, px + TILE - 6, py, 3, TILE, "rgba(0,0,0,.12)"); }
      if (tileAt(x, y + 1) === T_WALL) fr(c, px, py + TILE - 2, TILE, 2, "rgba(0,0,0,.25)");
    }
    // pass 4: pillars & stairs (drawn in row order so taller tops overlap correctly)
    for (y = 0; y < RH; y++) for (x = 0; x < RW; x++) {
      t = room.tiles[y * RW + x]; px = x * TILE; py = y * TILE; h = hash(x + room.gx * 31, y + room.gy * 17);
      if (t === T_PILLAR) pillar(c, px, py, R, h);
      else if (t === T_STAIRS) {
        fr(c, px + 1, py + 1, TILE - 2, TILE - 2, "#030203");
        for (var s = 0; s < 5; s++) {
          var ins = s * 2, sy = py + 3 + s * 5.4;
          fr(c, px + 3 + ins, sy, TILE - 6 - ins * 2, 3.6, "rgba(214,200,170," + (0.34 - s * 0.065) + ")");
          fr(c, px + 3 + ins, sy, TILE - 6 - ins * 2, 1, "rgba(255,240,210," + (0.25 - s * 0.05) + ")");
        }
        c.strokeStyle = P.top; c.lineWidth = 2; c.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
        c.strokeStyle = P.topL; c.lineWidth = 0.8; c.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      }
    }
  }
  function floorTile(c, px, py, R, h) {
    var P = regionPal(R), h2 = frac(h * 7.13), h3 = frac(h * 13.7), cx = px + 16, cy = py + 16;
    fr(c, px, py, TILE, TILE, P.grout);
    var lay = h < 0.34 ? 0 : h < 0.68 ? 1 : 2;
    var slabs = lay === 0 ? [[0, 0, 32, 32]] : lay === 1 ? [[0, 0, 32, 16], [0, 16, 32, 16]] : [[0, 0, 16, 16], [16, 0, 16, 16], [0, 16, 16, 16], [16, 16, 16, 16]];
    for (var i = 0; i < slabs.length; i++) {
      var s = slabs[i], v = frac(h * (31 + i * 17)), x0 = px + s[0] + 0.5, y0 = py + s[1] + 0.5, w = s[2] - 1, hh = s[3] - 1;
      if (lay === 1 && i === 1) x0 += (h2 < 0.5 ? 0 : 0); // running bond feel
      fr(c, x0, y0, w, hh, P.tones[Math.floor(v * 4)]);
      fr(c, x0, y0, w, 1, P.fl); fr(c, x0, y0, 1, hh, "rgba(255,255,255,.05)");
      fr(c, x0, y0 + hh - 1, w, 1, P.fd); fr(c, x0 + w - 1, y0, 1, hh, "rgba(0,0,0,.18)");
      if (v > 0.8) fe(c, x0 + w * 0.6, y0 + hh * 0.55, w * 0.25, hh * 0.18, "rgba(0,0,0,.08)");
    }
    for (var j = 0; j < 5; j++) fr(c, px + 2 + frac(h * (53 + j * 11)) * 28, py + 2 + frac(h * (71 + j * 7)) * 28, 1, 1, j % 2 ? P.fd : P.fl);
    if (h2 > 0.86) {
      var ck = [], n = 3 + Math.floor(frac(h * 41) * 3), ang = frac(h * 67) * TAU, cx0 = px + 6 + frac(h * 23) * 20, cy0 = py + 6 + frac(h * 29) * 20;
      for (var q0 = 0; q0 < n; q0++) { ck.push(cx0, cy0); ang += (frac(h * (q0 + 5) * 13.1) - 0.5) * 1.6; var ln0 = 3 + frac(h * (q0 + 2) * 7.7) * 5; cx0 = clamp(cx0 + Math.cos(ang) * ln0, px + 2, px + 30); cy0 = clamp(cy0 + Math.sin(ang) * ln0, py + 2, py + 30); }
      ck.push(cx0, cy0); sl(c, P.grout, 0.8, ck);
    }
    if (h2 < 0.025) { sl(c, "#cfc6ae", 1.4, [px + 9, py + 20, px + 17, py + 17]); fc(c, px + 8.5, py + 20.3, 1.3, "#cfc6ae"); fc(c, px + 17.5, py + 16.7, 1.3, "#cfc6ae"); }
    var d = R.deco;
    if (d === "moss") {
      if (h3 < 0.16) {
        var mx0 = px + 5 + frac(h * 91) * 22, my0 = py + 5 + frac(h * 57) * 22, nb = 2 + Math.floor(frac(h * 17) * 4);
        for (var b = 0; b < nb; b++) { var bxo = (frac(h * (b + 3) * 9.7) - 0.5) * 12, byo = (frac(h * (b + 7) * 5.3) - 0.5) * 7; fe(c, mx0 + bxo, my0 + byo, 2.5 + frac(h * b * 3.1) * 4, 1.6 + frac(h * b * 2.3) * 2, b % 2 ? "rgba(77,124,15,.65)" : "rgba(54,83,20,.7)"); }
        fe(c, mx0 - 1.5, my0 - 1.2, 2.6, 1.2, "rgba(163,230,53,.35)");
        var nbl = Math.floor(frac(h * 83) * 5);
        for (b = 0; b < nbl; b++) { var gx0 = mx0 + (frac(h * (b + 11) * 3.7) - 0.5) * 12, gh = 2 + frac(h * (b + 13) * 4.1) * 3; sl(c, "rgba(132,204,22,.8)", 0.6, [gx0, my0 + 1.5, gx0 + (b % 2 ? 1 : -1) * 0.8, my0 + 1.5 - gh]); }
        if (h3 < 0.03) { fc(c, mx0 + 4, my0 - 1, 0.9, "#fde68a"); fc(c, mx0 - 3, my0 + 1, 0.8, "#f5f5f4"); }
      }
    } else if (d === "water") {
      if (h3 < 0.1) {
        var wx = px + 8 + frac(h * 91) * 16, wy = py + 10 + frac(h * 57) * 12, wr = 6 + frac(h * 33) * 5, wo = (frac(h * 19) - 0.5) * wr;
        c.fillStyle = "rgba(8,60,90,.5)"; c.beginPath(); c.ellipse(wx, wy, wr, wr * 0.5, 0, 0, TAU); c.ellipse(wx + wo, wy + wr * 0.25, wr * 0.7, wr * 0.38, 0, 0, TAU); c.fill();
        sl(c, "rgba(186,230,253,.3)", 0.6, [wx - wr * 0.6, wy - wr * 0.2, wx - wr * 0.1, wy - wr * 0.38]); fr(c, wx + wr * 0.3, wy - 0.5, 1.5, 0.6, "rgba(224,242,254,.35)");
        roomDeco.push({ type: "puddle", x: wx, y: wy, r: wr, p: h * 10 });
      } else if (h3 > 0.9) { fc(c, px + 10, py + 22, 1.6, P.fl); fc(c, px + 13, py + 23.5, 1.1, P.fd); fc(c, px + 22, py + 9, 1.3, P.fl); }
    } else if (d === "rune") {
      sl(c, "rgba(192,132,252,.08)", 0.6, [px + 2, py + 5 + h * 20, px + 14, py + 10, px + 30, py + 4 + h2 * 20]);
      if (h3 < 0.03) {
        c.strokeStyle = "rgba(192,132,252,.55)"; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, 10, 0, TAU); c.stroke();
        c.beginPath(); c.arc(cx, cy, 6.5, 0, TAU); c.stroke();
        sl(c, "rgba(233,213,255,.7)", 0.8, [cx, cy - 6, cx + 4, cy + 3, cx - 4, cy + 3, cx, cy - 6]);
        for (var q = 0; q < 6; q++) { var qa = q / 6 * TAU; fr(c, cx + Math.cos(qa) * 8.3 - 0.5, cy + Math.sin(qa) * 8.3 - 0.5, 1, 1, "#e9d5ff"); }
        roomDeco.push({ type: "rune", x: cx, y: cy, p: h * 10 }); roomLights.push({ x: cx, y: cy, r: 46, a: 0.55 });
      }
    } else if (d === "lava") {
      fr(c, px + 3 + h * 20, py + 4 + h2 * 20, 2, 1, "rgba(0,0,0,.35)");
      if (h3 < 0.085) {
        var pts = [], la0 = frac(h * 67) * TAU, lx = px + 8 + frac(h * 23) * 16, ly = py + 8 + frac(h * 29) * 16, nl = 3 + Math.floor(frac(h * 41) * 3);
        for (var q1 = 0; q1 <= nl; q1++) { pts.push(lx, ly); la0 += (frac(h * (q1 + 5) * 13.1) - 0.5) * 1.8; var ll = 4 + frac(h * (q1 + 2) * 7.7) * 5; lx = clamp(lx + Math.cos(la0) * ll, px + 1, px + 31); ly = clamp(ly + Math.sin(la0) * ll, py + 1, py + 31); }
        glow(c, px + 15, py + 15, 20, "#f97316", 0.35);
        sl(c, "#2a0d05", 3, pts); sl(c, "#c2410c", 1.8, pts); sl(c, "#fdba74", 0.6, pts);
        roomDeco.push({ type: "lava", pts: pts, p: h * 10 }); roomLights.push({ x: cx, y: cy, r: 38, a: 0.5, col: "#f97316" });
      }
    }
  }
  function wallTile(c, x, y, R, P, h) {
    var px = x * TILE, py = y * TILE, face = tileAt(x, y + 1) !== T_WALL && y < RH - 1;
    fr(c, px, py, TILE, TILE, P.cap);
    for (var j = 0; j < (face ? 2 : 4); j++) {
      var sx0 = px + (j % 2) * 16 + 0.8 + frac(h * (j + 3) * 5.1) * 2, sy0 = py + (face ? 0 : Math.floor(j / 2) * 16) + 0.8 + frac(h * (j + 7) * 3.3) * 2;
      var sw0 = 12 + frac(h * (j + 1) * 7.3) * 2.4, sh0 = face ? 5.6 : 12 + frac(h * (j + 9) * 2.9) * 2.4;
      c.fillStyle = P.capS; rrect(c, sx0, sy0, sw0, sh0, 2.4); c.fill();
      fr(c, sx0 + 1.5, sy0 + 0.4, sw0 - 3, 1, P.capH); fr(c, sx0 + 1.5, sy0 + sh0 - 1.2, sw0 - 3, 0.8, "rgba(0,0,0,.3)");
      if (!face && frac(h * (j + 21) * 3.7) > 0.8) fe(c, sx0 + sw0 * 0.5, sy0 + sh0 * 0.5, 2, 1.2, P.cap);
    }
    if (face) {
      var fy = py + 10, rh = 22 / 3;
      fr(c, px, fy, TILE, 22, P.wallD);
      for (var row = 0; row < 3; row++) {
        var by = fy + row * rh, off = ((row + x) % 2) * 8;
        for (var bx = -off; bx < TILE; bx += 16) {
          var x0 = Math.max(0, bx), x1 = Math.min(TILE, bx + 16), v = frac(h * (row * 7 + bx + 50) * 1.37);
          var col = v < 0.3 ? P.wallD2 : v < 0.75 ? P.wall : P.wallL;
          fr(c, px + x0 + 0.5, by + 0.5, x1 - x0 - 1, rh - 1, col);
          fr(c, px + x0 + 0.5, by + 0.5, x1 - x0 - 1, 1, v > 0.5 ? P.wallL2 : P.wallL);
          fr(c, px + x0 + 0.5, by + rh - 1.5, x1 - x0 - 1, 1, P.wallD);
          if (v > 0.9) sl(c, P.cap, 0.6, [px + x0 + 3, by + 2, px + x0 + 6, by + 4.5]);
        }
      }
      fr(c, px, fy + 16, TILE, 6, "rgba(0,0,0,.22)"); fr(c, px, fy + 19, TILE, 3, "rgba(0,0,0,.2)");
      fr(c, px, py + 7, TILE, 3.5, P.top); fr(c, px, py + 7, TILE, 1, P.topL); fr(c, px, py + 10.5, TILE, 1, P.topD);
      var d = R.deco;
      if (d === "moss" && h < 0.45) {
        var vx = px + 3 + frac(h * 77) * 26, len = 6 + frac(h * 19) * 12;
        sl(c, "#365314", 1.2, [vx, py + 10, vx + 1, py + 10 + len * 0.5, vx - 0.5, py + 10 + len]);
        for (var l = 0; l < 3; l++) fe(c, vx + (l % 2 ? 1.5 : -1.5), py + 12 + l * len / 3, 1.6, 1, l % 2 ? "#65a30d" : "#4d7c0f", l % 2 ? 0.5 : -0.5);
        fe(c, vx + 3, py + 9.5, 6, 2, "rgba(101,163,13,.8)");
      } else if (d === "water") {
        if (h < 0.5) fr(c, px + 4 + frac(h * 77) * 22, py + 11, 1.3, 8 + frac(h * 19) * 12, "rgba(125,211,252,.22)");
        fr(c, px, fy + 19, TILE, 3, "rgba(20,184,166,.18)");
      } else if (d === "rune" && h < 0.14) {
        var gx = px + 9 + frac(h * 77) * 14, gy = fy + 9;
        sl(c, "rgba(216,180,254,.85)", 0.9, [gx - 3, gy - 4, gx, gy + 4, gx + 3, gy - 4]); sl(c, "rgba(216,180,254,.85)", 0.9, [gx - 3, gy, gx + 3, gy]);
        roomLights.push({ x: gx, y: gy, r: 26, a: 0.45 }); roomDeco.push({ type: "glyph", x: gx, y: gy, p: h * 10 });
      } else if (d === "lava") {
        fr(c, px, fy, TILE, 5, "rgba(0,0,0,.25)");
        if (h < 0.22) { var ex = px + 4 + frac(h * 77) * 22, eh = 5 + frac(h * 31) * 8, ew = (frac(h * 53) - 0.5) * 5; sl(c, "#ea580c", 1, [ex, fy + 22, ex + ew, fy + 22 - eh * 0.5, ex - ew * 0.5, fy + 22 - eh]); roomLights.push({ x: ex, y: fy + 18, r: 22, a: 0.4, col: "#f97316" }); }
      }
    } else {
      if (tileAt(x, y - 1) !== T_WALL && y > 0) { fr(c, px, py, TILE, 2.5, P.top); fr(c, px, py, TILE, 0.8, P.topL); }
      if (tileAt(x - 1, y) !== T_WALL && x > 0) { fr(c, px, py, 2.5, TILE, P.top); fr(c, px, py, 0.8, TILE, P.topL); }
      if (tileAt(x + 1, y) !== T_WALL && x < RW - 1) { fr(c, px + TILE - 2.5, py, 2.5, TILE, P.topD); }
    }
  }
  function pillar(c, px, py, R, h) {
    var P = regionPal(R), d = R.deco;
    fe(c, px + 18, py + 28, 14, 5, "rgba(0,0,0,.45)");
    if (room.cave) {
      var pts = [px + 2, py + 30, px + 1, py + 15, px + 5 + h * 3, py + 5, px + 14, py - 1 + h * 3, px + 24, py + 2, px + 31, py + 12, px + 30, py + 30];
      fp(c, P.wallD, pts);
      c.save(); c.beginPath(); c.moveTo(pts[0], pts[1]); for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.clip();
      fe(c, px + 10, py + 6, 14, 10, P.wallL); fe(c, px + 8, py + 4, 6, 4, P.wallL2); fe(c, px + 27, py + 27, 13, 12, P.cap);
      sl(c, P.cap, 0.9, [px + 14, py + 4, px + 17, py + 14, px + 14, py + 22]);
      c.restore();
      c.strokeStyle = P.grout; c.lineWidth = 1; c.beginPath(); c.moveTo(pts[0], pts[1]); for (i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.stroke();
      if (d === "water" || h < 0.3) { fp(c, "#0e7490", [px + 20, py + 8, px + 23, py - 2, px + 25, py + 8]); fp(c, "#67e8f9", [px + 21, py + 8, px + 23, py - 2, px + 23, py + 8]); fp(c, "#0e7490", [px + 24, py + 9, px + 28, py + 2, px + 28, py + 10]); roomLights.push({ x: px + 23, y: py + 6, r: 24, a: 0.35 }); }
      if (d === "moss") fe(c, px + 12, py + 2, 8, 3, "rgba(101,163,13,.8)");
      return;
    }
    var broken = h < 0.22, top = broken ? py + 3 : py - 4;
    fr(c, px + 3, py + 22, 26, 8, P.wallD); fr(c, px + 3, py + 22, 26, 1.5, P.wallL2); fr(c, px + 23, py + 23, 6, 7, P.cap);
    var g = c.createLinearGradient(px + 7, 0, px + 25, 0); g.addColorStop(0, P.wallL2); g.addColorStop(0.3, P.wallL); g.addColorStop(0.7, P.wall); g.addColorStop(1, P.cap);
    c.fillStyle = g; c.fillRect(px + 7, top, 18, py + 22 - top);
    sl(c, "rgba(0,0,0,.2)", 0.9, [px + 12, top + 2, px + 12, py + 21]); sl(c, "rgba(0,0,0,.2)", 0.9, [px + 18, top + 2, px + 18, py + 21]);
    sl(c, "rgba(255,255,255,.1)", 0.7, [px + 9, top + 2, px + 9, py + 21]);
    if (!broken) {
      fr(c, px + 4, py - 9, 24, 5.5, P.top); fr(c, px + 4, py - 9, 24, 1.2, P.topL); fr(c, px + 23, py - 9, 5, 5.5, P.topD);
      fr(c, px + 5.5, py - 3.5, 21, 2, P.wallD);
    } else {
      fp(c, P.top, [px + 7, top + 2, px + 7, top, px + 10, top - 4, px + 14, top - 1, px + 18, top - 6, px + 22, top - 2, px + 25, top - 1, px + 25, top + 2]);
      fc(c, px + 3, py + 27, 2.2, P.wallL); fc(c, px + 29, py + 26, 1.6, P.wall);
    }
    if (h > 0.8) sl(c, P.cap, 0.8, [px + 16, top + 4, px + 14, top + 10, px + 17, top + 15]);
    if (d === "moss") {
      sl(c, "#3f6212", 1.3, [px + 8, py + 21, px + 13, py + 14, px + 20, py + 10, px + 24, py + 3]);
      fe(c, px + 12, py + 15, 2, 1.2, "#65a30d", 0.6); fe(c, px + 20, py + 9.5, 2, 1.2, "#65a30d", -0.5); fe(c, px + 11, top, 7, 2.5, "rgba(101,163,13,.85)");
    } else if (d === "water") {
      fr(c, px + 8, top + 3, 1.5, 14, "rgba(186,230,253,.18)"); fr(c, px + 7, py + 19, 18, 3, "rgba(20,184,166,.3)");
    } else if (d === "rune") {
      fr(c, px + 7, py + 8, 18, 2.4, "#6d28d9"); fr(c, px + 7, py + 8.4, 18, 1, "#d8b4fe");
      roomLights.push({ x: px + 16, y: py + 9, r: 30, a: 0.4 });
    } else if (d === "lava") {
      sl(c, "#c2410c", 1.1, [px + 14, py + 21, px + 16, py + 14, px + 13, py + 8]); sl(c, "#fdba74", 0.4, [px + 14, py + 21, px + 16, py + 14]);
      roomLights.push({ x: px + 15, y: py + 16, r: 24, a: 0.35, col: "#f97316" });
    }
  }

  function doorArt(c, d, locked, P) {
    var mx = (RW - 1) / 2, my = (RH - 1) / 2, cx, cy, rot;
    if (d === "n") { cx = mx * TILE + 16; cy = 16; rot = 0; }
    else if (d === "s") { cx = mx * TILE + 16; cy = (RH - 1) * TILE + 16; rot = Math.PI; }
    else if (d === "w") { cx = 16; cy = my * TILE + 16; rot = -Math.PI / 2; }
    else { cx = (RW - 1) * TILE + 16; cy = my * TILE + 16; rot = Math.PI / 2; }
    c.save(); c.translate(cx, cy); c.rotate(rot);
    var g = c.createLinearGradient(0, -16, 0, 16); g.addColorStop(0, "rgba(0,0,0,.95)"); g.addColorStop(0.55, "rgba(0,0,0,.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(-45, -16, 90, 32);
    fr(c, -49, -16, 6, 32, P.top); fr(c, -49, -16, 1.5, 32, P.topL); fr(c, 43, -16, 6, 32, P.topD); fr(c, 43, -16, 1.2, 32, P.top);
    if (locked) {
      for (var i = -40; i <= 40; i += 8) { fr(c, i - 1.3, -16, 2.6, 29, "#2e2e33"); fr(c, i - 1.3, -16, 0.9, 29, "#a1a1aa"); fp(c, "#a1a1aa", [i - 1.9, 13, i, 17.5, i + 1.9, 13]); }
      fr(c, -45, -9, 90, 2.6, "#3f3f46"); fr(c, -45, -9, 90, 0.8, "#a1a1aa"); fr(c, -45, 5, 90, 2.6, "#3f3f46"); fr(c, -45, 5, 90, 0.8, "#a1a1aa");
      for (i = -40; i <= 40; i += 16) { fc(c, i, -7.7, 1, "#e4e4e7"); fc(c, i, 6.3, 1, "#e4e4e7"); }
    }
    c.restore();
  }

  function drawRoomDynamic() {
    var R = F.info.R, P = regionPal(R), mx = (RW - 1) / 2, my = (RH - 1) / 2, T = reduceMotion ? 0 : G.t;
    ctx.save(); ctx.translate(OX, OY);
    ["n", "s", "w", "e"].forEach(function (d) { if (room.doors[d]) doorArt(ctx, d, room.locked, P); });
    // spike traps
    var up = spikeUp(), warn = (G.t % 2.2) > 1.0;
    for (var y = 1; y < RH - 1; y++) for (var x = 1; x < RW - 1; x++) {
      if (room.tiles[y * RW + x] !== T_SPIKE) continue;
      var px = x * TILE, py = y * TILE;
      fr(ctx, px + 3, py + 3, TILE - 6, TILE - 6, "#151210"); fr(ctx, px + 3, py + 3, TILE - 6, 1, "rgba(255,255,255,.1)"); fr(ctx, px + 3, py + TILE - 4, TILE - 6, 1, "rgba(0,0,0,.5)");
      ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1; ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
      for (var sy = 0; sy < 3; sy++) for (var sx = 0; sx < 3; sx++) {
        var cx = px + 8 + sx * 8, cy = py + 10 + sy * 8;
        fe(ctx, cx, cy + 1.2, 2.4, 1.3, "#050404");
        if (up) { fp(ctx, "#6b7280", [cx - 2.7, cy + 1.6, cx, cy - 7, cx + 2.7, cy + 1.6]); fp(ctx, "#e5e7eb", [cx - 2.7, cy + 1.6, cx, cy - 7, cx - 0.2, cy + 1.6]); fr(ctx, cx - 0.4, cy - 7, 0.8, 1.2, "#fff"); }
        else if (warn) { fp(ctx, "#f59e0b", [cx - 1.6, cy + 1.2, cx, cy - 1.8, cx + 1.6, cy + 1.2]); }
      }
      if (warn && !up) glow(ctx, px + 16, py + 16, 18, "#f59e0b", 0.25);
    }
    // torches on the top wall
    [3, RW - 4].forEach(function (tx) {
      var px = tx * TILE + 16, py = 19, f = reduceMotion ? 0 : Math.sin(G.t * 12 + tx) * 1.5, f2 = reduceMotion ? 0 : Math.sin(G.t * 17 + tx * 3) * 0.8;
      fr(ctx, px - 1.5, py, 3, 8, "#1c140e"); fp(ctx, "#3f2d1e", [px - 4, py - 1.5, px + 4, py - 1.5, px + 2.5, py + 2, px - 2.5, py + 2]); fr(ctx, px - 4, py - 1.5, 8, 0.8, "#6b5040");
      ctx.fillStyle = R.torch; ctx.beginPath(); ctx.moveTo(px - 3.8, py - 2); ctx.quadraticCurveTo(px - 4.2, py - 8, px + f2, py - 14 - f); ctx.quadraticCurveTo(px + 4.2, py - 8, px + 3.8, py - 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.moveTo(px - 2.2, py - 2); ctx.quadraticCurveTo(px - 2.4, py - 6, px + f2 * 0.6, py - 10 - f * 0.6); ctx.quadraticCurveTo(px + 2.4, py - 6, px + 2.2, py - 2); ctx.closePath(); ctx.fill();
      fe(ctx, px, py - 3, 1.3, 2.2, "#fffbeb");
    });
    ctx.restore();
  }
  // emissive ambience, drawn after the light pass so it glows through the dark
  function drawAmbient() {
    var R = F.info.R, T = reduceMotion ? 0 : G.t, i;
    ctx.save(); ctx.translate(OX, OY); ctx.globalCompositeOperation = "lighter";   // everything here is emissive
    roomDeco.forEach(function (d) {
      var p = 0.5 + 0.5 * Math.sin(T * 2 + d.p);
      if (d.type === "lava") { ctx.globalAlpha = 0.15 + 0.4 * p; sl(ctx, "#fb923c", 1.2, d.pts); ctx.globalAlpha = 1; }
      else if (d.type === "rune" || d.type === "glyph") glow(ctx, d.x, d.y, d.type === "rune" ? 18 : 10, "#a855f7", 0.25 + 0.35 * p);
      else if (d.type === "puddle") { ctx.strokeStyle = "rgba(186,230,253," + (0.06 + 0.12 * p) + ")"; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * (0.3 + 0.6 * frac(T * 0.4 + d.p)), d.r * 0.5 * (0.3 + 0.6 * frac(T * 0.4 + d.p)), 0, 0, TAU); ctx.stroke(); }
    });
    if (R.deco === "moss") for (i = 0; i < 7; i++) {
      var fx0 = (i * 97 + 40 + Math.sin(T * 0.5 + i * 2) * 30) % (RW * TILE), fy0 = 50 + (i * 53) % (RH * TILE - 90) + Math.sin(T * 0.8 + i) * 12, fa = 0.5 + 0.5 * Math.sin(T * 3 + i * 1.7);
      glow(ctx, fx0, fy0, 7, "#bef264", 0.5 * fa); fr(ctx, fx0 - 0.5, fy0 - 0.5, 1.2, 1.2, "rgba(236,252,203," + fa + ")");
    } else if (R.deco === "lava") for (i = 0; i < 12; i++) {
      var ey = RH * TILE - ((i * 71 + T * (14 + i % 4 * 6)) % (RH * TILE)), ex = (i * 131 + Math.sin(T + i) * 10) % (RW * TILE);
      fr(ctx, ex, ey, 1.4, 1.4, "rgba(253,186,116," + (0.35 + (i % 3) * 0.2) + ")");
    } else if (R.deco === "water") for (i = 0; i < 5; i++) {
      var dy = frac(T * 0.6 + i * 0.37), dx = 40 + (i * 149) % (RW * TILE - 80);
      if (dy < 0.6) fr(ctx, dx, 40 + dy * 260, 0.8, 3, "rgba(186,230,253," + (0.5 - dy * 0.5) + ")");
    } else if (R.deco === "rune") for (i = 0; i < 6; i++) {
      var ra = T * 0.3 + i, rx = (i * 113 + 60) % (RW * TILE), ry2 = RH * TILE - ((i * 67 + T * 10) % (RH * TILE));
      fr(ctx, rx + Math.sin(ra) * 6, ry2, 1.2, 1.2, "rgba(216,180,254,.55)");
    }
    ctx.restore();
  }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")"; }

  // ---- lighting: low-res light map (environment only; characters stay fully lit)
  var LC = mkCanvas(160, 90), LTEX = null, VIG = null;
  function lightTex() {
    if (LTEX) return LTEX;
    LTEX = mkCanvas(64, 64); var x = LTEX.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.45, "rgba(0,0,0,.65)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return LTEX;
  }
  var AMB = { moss: "rgba(8,12,6,.4)", water: "rgba(2,6,16,.5)", rune: "rgba(8,3,18,.5)", lava: "rgba(16,3,2,.36)" };
  function lightPass() {
    var l = LC.getContext("2d"), q = LC.width / VW, tex = lightTex(), R = F.info.R, T = reduceMotion ? 0 : G.t;
    l.setTransform(1, 0, 0, 1, 0, 0); l.globalAlpha = 1; l.globalCompositeOperation = "source-over"; l.clearRect(0, 0, LC.width, LC.height);
    l.fillStyle = AMB[R.deco] || "rgba(6,4,10,.45)"; l.fillRect(0, 0, LC.width, LC.height);
    l.globalCompositeOperation = "destination-out";
    function L(x, y, r, a) { l.globalAlpha = Math.max(0, Math.min(1, a)); l.drawImage(tex, (x + OX - r) * q, (y + OY - r) * q, r * 2 * q, r * 2 * q); }
    if (P) L(P.x, P.y - 6, 135, 0.95);
    [3, RW - 4].forEach(function (tx) { L(tx * TILE + 16, 14, 125 + Math.sin(T * 9 + tx) * 5, 0.9); });
    roomLights.forEach(function (o) { L(o.x, o.y, o.r, o.a); });
    var mx = (RW - 1) / 2, my = (RH - 1) / 2;
    if (room.tiles[my * RW + mx] === T_STAIRS) L(mx * TILE + 16, my * TILE + 16, 70, 0.8);
    projs.forEach(function (p) {
      if (p.kind === "firebolt" || p.kind === "fire" || p.kind === "fireball" || p.kind === "flame") L(p.x, p.y, 56, 0.75);
      else if (p.kind === "orb" || p.kind === "skull" || p.kind === "frost") L(p.x, p.y, 36, 0.5);
    });
    pickups.forEach(function (pk) { if (pk.type === "chest" || pk.type === "feather" || pk.type === "trophy") L(pk.x, pk.y, 60, 0.7); });
    enemies.forEach(function (e) { if (e.kind === "boss") L(e.x, e.y - 10, 110, 0.6); else if (e.kind === "imp" || e.kind === "cultist") L(e.x, e.y, 34, 0.45); });
    fx.forEach(function (f) { var k = f.t / f.dur; if (f.type === "nova" || f.type === "ring") L(f.x, f.y, f.r * (0.5 + k), 0.9 * (1 - k)); else if (f.type === "bolt") f.pts.forEach(function (pt) { L(pt.x, pt.y, 44, 0.7 * (1 - k)); }); });
    l.globalAlpha = 1; l.globalCompositeOperation = "source-over";
    l.drawImage(vigCanvas(), 0, 0, LC.width, LC.height);   // vignette folded into the light map: one upscale blit
    ctx.drawImage(LC, 0, 0, VW, VH);
    // warm additive bloom for torches & static emitters
    [3, RW - 4].forEach(function (tx) { glow(ctx, tx * TILE + 16 + OX, 8 + OY, 40 + Math.sin(T * 11 + tx) * 3, R.torch, 0.42); glow(ctx, tx * TILE + 16 + OX, 10 + OY, 12, "#fff7d6", 0.35); });
    if (room.tiles[my * RW + mx] === T_STAIRS) { var pu = 0.5 + 0.5 * Math.sin(G.t * 3); glow(ctx, mx * TILE + 16 + OX, my * TILE + 16 + OY, 30, "#fbbf24", 0.25 + pu * 0.25); ctx.strokeStyle = "rgba(251,191,36," + (0.4 + pu * 0.45) + ")"; ctx.lineWidth = 1.5; ctx.strokeRect(mx * TILE + 1 + OX, my * TILE + 1 + OY, TILE - 2, TILE - 2); }
  }
  function vigCanvas() {
    if (!VIG) {
      VIG = mkCanvas(320, 180); var x = VIG.getContext("2d"), g = x.createRadialGradient(160, 90, 55, 160, 90, 200);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.7, "rgba(0,0,0,.28)"); g.addColorStop(1, "rgba(0,0,0,.62)"); x.fillStyle = g; x.fillRect(0, 0, 320, 180);
    }
    return VIG;
  }
  function vignette() { ctx.drawImage(vigCanvas(), 0, 0, VW, VH); }

  // ============================================================ rendering: heroes
  var HERO_BOX = { w: 82, h: 74, ax: 41, ay: 43 };
  var HERO_AURA = { knight: "#fbbf24", ranger: "#7dd3fc", mage: "#fb923c" };
  function drawHero(c, id, x, y, o) {
    // o: { t, walk, moving, face, aim, atk (seconds left), cast, hurt, inv, block }
    var t = o.t, ph = o.walk || 0, mv = o.moving, sw = mv ? Math.sin(ph) * 3.5 : 0;
    var bob = mv ? Math.abs(Math.sin(ph)) * 1.4 : (reduceMotion ? 0 : Math.sin(t * 2) * 0.5);
    c.save(); c.translate(x, y);
    fe(c, 0, 12, 10, 3.5, "rgba(0,0,0,.42)");
    if (o.cast > 0) {
      var ck = Math.min(1, o.cast / 0.35), col = HERO_AURA[id];
      glow(c, 0, 4, 26, col, 0.55 * ck);
      c.strokeStyle = hexA(col, 0.8 * ck); c.lineWidth = 1; c.beginPath(); c.ellipse(0, 11, 14 - ck * 3, 4.5 - ck, 0, 0, TAU); c.stroke();
    }
    if (o.inv && Math.floor(t * 20) % 2 === 0) c.globalAlpha = 0.45;
    var hurt = o.hurt > 0 ? Math.min(1, o.hurt / 0.25) : 0;
    liveSprite(c, "hero", HERO_BOX, function (s) { heroFigure(s, id, o, sw, bob, ph); }, OUTL, RIM, hurt ? "rgba(255,90,70," + (0.6 * hurt) + ")" : null);
    // emissive bits on top of the baked sprite
    var dir = Math.cos(o.aim) < 0 ? -1 : 1, atk = o.atk || 0;
    if (id === "mage") {
      var raise = o.cast > 0 ? -0.9 : atk > 0 ? -0.3 : o.block ? -1.25 : 0.35, a = o.aim + raise * dir, gx = Math.cos(a) * 23, gy = -4 - bob + Math.sin(a) * 23;
      var gl = 0.55 + 0.25 * Math.sin(t * 6) + (atk > 0 ? 0.35 : 0) + (o.cast > 0 ? 0.4 : 0);
      glow(c, gx, gy, 12 + (atk > 0 ? 4 : 0), "#fb923c", gl); glow(c, gx, gy, 5, "#fef3c7", gl);
      if (!reduceMotion) for (var i = 0; i < 3; i++) { var eu = frac(t * 1.3 + i / 3); fr(c, gx + Math.sin(t * 5 + i * 2) * 3 - 0.6, gy - eu * 12, 1.2, 1.2, "rgba(253,186,116," + (1 - eu) + ")"); }
    } else if (id === "knight" && o.block) {
      glow(c, 7 * (o.face || 1), -6 - bob, 16, "#fde68a", 0.3);
    } else if (id === "ranger" && o.cast > 0) {
      glow(c, Math.cos(o.aim) * 16, -4 + Math.sin(o.aim) * 16, 12, "#bae6fd", 0.7);
    }
    c.restore();
  }
  function heroFigure(s, id, o, sw, bob, ph) {
    var atk = o.atk || 0, blk = !!o.block, face = o.face || 1;
    var behind = Math.sin(o.aim) < -0.3 || (blk && id === "knight");
    if (behind) drawWeapon(s, id, o, bob);
    s.save(); s.scale(face, 1);
    var lean = o.hurt > 0 ? -1.3 : atk > 0 ? 1.2 : blk ? 0.6 : 0;
    s.translate(lean, -bob + (blk ? 0.8 : 0));
    if (id === "knight") knightBody(s, o, sw, ph);
    else if (id === "ranger") rangerBody(s, o, sw, ph);
    else mageBody(s, o, sw, ph);
    s.restore();
    if (!behind) drawWeapon(s, id, o, bob);
  }
  // legs: back leg (dark) then front leg; sw = stride
  function legs(c, sw, a, b, hl, ad, bd) {
    ad = ad || a; bd = bd || b;
    var bx = -3.9 - sw * 0.5, fx = 0.3 + sw * 0.5, lb = sw < 0 ? -sw * 0.25 : 0, lf = sw > 0 ? sw * 0.25 : 0;
    fr(c, bx, 2.5, 3.4, 7.2 - lb, ad); fr(c, bx - 0.4 - sw * 0.15, 9.2 - lb, 4.6, 2.8, bd);
    fr(c, fx, 2.5, 3.4, 7.2 - lf, a); if (hl) fr(c, fx, 2.5, 1.1, 6.2 - lf, hl); fr(c, fx - 0.2 + sw * 0.15, 9.2 - lf, 4.9, 2.8, b);
  }
  function star(c, x, y, r) { c.beginPath(); for (var i = 0; i < 10; i++) { var a = i / 10 * TAU - Math.PI / 2, rr2 = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } c.closePath(); c.fill(); }
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function knightShield(s, x, y, sc, back) {
    s.save(); s.translate(x, y); s.scale(sc, sc);
    var path = function () { s.beginPath(); s.moveTo(-4.8, -6.2); s.lineTo(4.8, -6.2); s.lineTo(4.8, 0); s.quadraticCurveTo(4.2, 4.8, 0, 7.8); s.quadraticCurveTo(-4.2, 4.8, -4.8, 0); s.closePath(); };
    path(); s.fillStyle = "#c28a12"; s.fill();
    s.save(); s.translate(0, 0.3); s.scale(0.8, 0.82); path(); s.fillStyle = "#1e3a8a"; s.fill(); s.restore();
    fp(s, "#2d52b8", [-3.8, -4.8, 0, -4.8, 0, 5.6, -2.8, 3.4, -3.8, 0]);
    fe(s, 0, 0.2, 2.1, 2.9, "#f5b73b"); fe(s, 0, 0.2, 0.7, 2.3, "#1c1005"); fr(s, -3.6, -5.4, 3, 0.8, "rgba(255,255,255,.35)");
    if (back) { path(); s.fillStyle = "rgba(0,0,0,.3)"; s.fill(); }
    s.restore();
  }
  function knightBody(s, o, sw, ph) {
    var t = o.t, mv = o.moving, blk = o.block, cs = (reduceMotion ? 0 : Math.sin(t * 4 + ph) * 1.5) + (mv ? -3 : 0);
    // cape
    s.fillStyle = "#5c0b10"; s.beginPath(); s.moveTo(-3, -11); s.quadraticCurveTo(-12 + cs, 0, -11.5 + cs * 1.2, 11.5); s.lineTo(-7 + cs * 0.6, 10); s.lineTo(-3, 11.5); s.lineTo(2, -8); s.closePath(); s.fill();
    s.fillStyle = "#a3161a"; s.beginPath(); s.moveTo(-3, -11); s.quadraticCurveTo(-10.5 + cs, 0, -9.5 + cs, 10); s.lineTo(-4, 9); s.lineTo(0, -8); s.closePath(); s.fill();
    sl(s, "#dc3b2e", 0.9, [-4, -9, -7 + cs * 0.6, -1, -7.8 + cs, 7]);
    if (!blk) knightShield(s, -8.2, -3, 0.85, true);
    legs(s, sw, "#8390a0", "#2b3240", "#c7d0db", "#4b5563", "#1b2029");
    fe(s, -4.6, -8.6, 3.6, 3, "#4f5a69");
    s.fillStyle = "#8793a3"; rrect(s, -6.5, -10.5, 13, 13.5, 4); s.fill();
    fp(s, "#586475", [2.6, -10.3, 6.5, -8, 6.5, 1.2, 3.2, 3]);
    fe(s, -2.6, -6.6, 3, 3.4, "#c5cfda"); fe(s, -3.2, -7.6, 1.2, 1.3, "#f8fafc");
    fp(s, "#a3161a", [-0.5, -5, 4.2, -5, 4.6, 6.2, 2, 8.2, -1, 6.2]); fp(s, "#7f1016", [2.6, -5, 4.2, -5, 4.6, 6.2, 2.9, 7.4]);
    fp(s, "#fbbf24", [1.8, -3.6, 3.1, -1.5, 1.8, 0.6, 0.5, -1.5]);
    fr(s, -6.5, 1.5, 13, 2.2, "#3b2412"); fr(s, 0.6, 1.3, 2.6, 2.6, "#f5b73b"); fr(s, 1.2, 1.9, 1.3, 1.3, "#3b2412");
    fe(s, 3.6, -8.7, 4.3, 3.2, "#9aa6b5"); fe(s, 2.8, -9.6, 2.6, 1.3, "#e2e8f0"); sl(s, "#f5b73b", 0.8, [-0.4, -6.6, 3.6, -5.5, 7.6, -6.9]);
    // helm
    fc(s, 0.5, -15.5, 6.6, "#7d8998");
    fe(s, -1.2, -17.8, 4, 2.8, "#c5cfda"); fe(s, -2.2, -18.8, 1.4, 0.9, "#f8fafc");
    s.fillStyle = "#5f6b7a"; rrect(s, 1.3, -18.6, 6.3, 8.8, 2); s.fill();
    fr(s, 1.3, -18.6, 1, 8.8, "#9aa6b5");
    fr(s, 1.8, -16.1, 6, 1.9, "#070a12"); fr(s, 4.4, -15.7, 1.6, 0.9, "#fcd34d");
    fr(s, 3.4, -12.8, 0.9, 0.9, "#1f2937"); fr(s, 5.1, -12.8, 0.9, 0.9, "#1f2937"); fr(s, 3.4, -11.3, 0.9, 0.9, "#1f2937"); fr(s, 5.1, -11.3, 0.9, 0.9, "#1f2937");
    s.strokeStyle = "#e2b33c"; s.lineWidth = 1.3; s.beginPath(); s.arc(0.5, -15.5, 6.6, -2.75, -1.3); s.stroke();
    // plume
    var pw = (reduceMotion ? 0 : Math.sin(t * 5 + ph * 0.5) * 1.5) + (mv ? 2 : 0);
    s.fillStyle = "#991b1b"; s.beginPath(); s.moveTo(0.5, -22); s.bezierCurveTo(-4, -27.5 - pw * 0.3, -10, -26.5, -14.5 - pw, -18.5 + pw * 0.5); s.bezierCurveTo(-9, -21.5, -5, -20.5, -1, -19.5); s.closePath(); s.fill();
    s.fillStyle = "#ef4444"; s.beginPath(); s.moveTo(0.5, -22); s.bezierCurveTo(-4, -26.5 - pw * 0.3, -8.5, -25.5, -12 - pw, -20.5 + pw * 0.4); s.bezierCurveTo(-7, -22.5, -4, -21.8, -0.5, -21); s.closePath(); s.fill();
    sl(s, "#fca5a5", 0.6, [-1.5, -23.5, -6, -24.6, -9.5 - pw * 0.6, -22.5]);
    if (blk) knightShield(s, 6.5, -4, 1.2, false);
  }
  function rangerBody(s, o, sw, ph) {
    var t = o.t, mv = o.moving, cs = (reduceMotion ? 0 : Math.sin(t * 4 + ph) * 1.5) + (mv ? -2.5 : 0);
    s.fillStyle = "#0b3019"; s.beginPath(); s.moveTo(-2, -12); s.quadraticCurveTo(-11 + cs, -1, -10.5 + cs * 1.3, 11); s.lineTo(-6 + cs * 0.6, 9.2); s.lineTo(-2, 11); s.lineTo(3, -8); s.closePath(); s.fill();
    s.fillStyle = "#166534"; s.beginPath(); s.moveTo(-2, -12); s.quadraticCurveTo(-9.5 + cs, -1, -8.5 + cs, 9.5); s.lineTo(-3.5, 8.6); s.lineTo(1, -8); s.closePath(); s.fill();
    // quiver
    s.save(); s.translate(-5.2, -4.5); s.rotate(-0.38);
    fp(s, "#dc2626", [-1.6, -6, -0.9, -10.2, -0.1, -6]); fp(s, "#f5f5f4", [0, -6, 0.9, -10.8, 1.7, -6]); fp(s, "#dc2626", [1.2, -6, 2.4, -9.8, 2.6, -6]);
    fr(s, -1.9, -6.2, 3.9, 11.5, "#6b3a17"); fr(s, -1.9, -6.2, 1.1, 11.5, "#9a5f2c"); fr(s, -2.1, -6.6, 4.3, 1.5, "#3b1f0b"); fr(s, -2.1, 1, 4.3, 1, "#3b1f0b");
    s.restore();
    legs(s, sw, "#5a3f2a", "#2a1a10", "#7a5a3f", "#3b2a1c", "#170e08");
    s.fillStyle = "#8a5a2b"; rrect(s, -5.5, -9.5, 11, 12.5, 3.5); s.fill();
    fp(s, "#5e3a1a", [2.2, -9.2, 5.5, -7, 5.5, 1.6, 2.6, 3]); fe(s, -2.6, -6, 2, 2.4, "#b98548");
    sl(s, "#15803d", 2.2, [-5, -8, 4.6, 1]); sl(s, "#22c55e", 0.6, [-5, -8.8, 4.4, 0.1]);
    fr(s, -5.5, 1.2, 11, 1.9, "#3b2412"); fr(s, -4.8, 1.6, 3, 3.2, "#6b3a17"); fr(s, 1, 1.2, 1.9, 1.9, "#d4a017");
    fe(s, 0, -9.3, 6.9, 3.2, "#166534"); fe(s, -1.6, -10.1, 4, 1.5, "#23843f");
    // hood
    fc(s, 0.5, -15, 6.4, "#1a6b36");
    fp(s, "#1a6b36", [-4.6, -18.6, -11 + cs * 0.4, -23, -3, -12.4]); fp(s, "#11522a", [-5, -17, -9.5 + cs * 0.4, -21.8, -4, -13.5]);
    fe(s, -1.8, -18.2, 3.1, 1.9, "#2e9150");
    fe(s, 3.2, -14, 3.6, 4.3, "#06170c");
    fc(s, 3.6, -13.5, 3.2, "#f0c29a"); fe(s, 5, -12.2, 1.2, 1, "#d99a72");
    s.fillStyle = "#1a6b36"; s.beginPath(); s.ellipse(2.6, -16.9, 4.5, 2.1, -0.2, 0, TAU); s.fill();
    fr(s, 4.6, -14.3, 1.2, 1.5, "#0f172a"); fr(s, 5, -14.2, 0.5, 0.5, "#d1fae5");
    sl(s, "#b8561b", 1.7, [1.4, -11, 1.9, -8, 2.9, -5.4]); sl(s, "#e07a2e", 0.6, [1.2, -10.8, 1.7, -8.3]); fc(s, 2.9, -4.9, 0.9, "#d4a017");
  }
  function mageBody(s, o, sw, ph) {
    var t = o.t, mv = o.moving, hem = mv ? sw * 0.6 : (reduceMotion ? 0 : Math.sin(t * 1.8) * 0.4);
    fp(s, "#2e1065", [-5, -9, 5, -9, 9.6 + hem, 11, -10 + hem, 11]);
    fp(s, "#5b21b6", [-5, -9, 3, -9, 6.3 + hem, 11, -10 + hem, 11]);
    fp(s, "#7c3aed", [-4.5, -8, -1.6, -8, -4 + hem, 10.5, -8.6 + hem, 10.5]);
    fp(s, "#3b0a8c", [3, -9, 5, -9, 9.6 + hem, 11, 6.6 + hem, 11]);
    fp(s, "#d4a017", [-10 + hem, 9.3, 9.6 + hem, 9.3, 9.9 + hem, 11.2, -10.3 + hem, 11.2]);
    for (var i = 0; i < 5; i++) fr(s, -7.6 + hem + i * 3.6, 9.8, 1.2, 0.9, "#7c2d12");
    sl(s, "#d4a017", 0.9, [1.6, -3, 3.2 + hem * 0.5, 9.3]);
    fr(s, -4.8, -3.6, 9.6, 1.9, "#d4a017"); fr(s, -4.8, -3.6, 9.6, 0.6, "#fde68a"); fc(s, 1.6, -2.6, 1.3, "#f97316"); fc(s, 1.3, -2.9, 0.5, "#fed7aa");
    fp(s, "#6d28d9", [0.8, -8.6, 5.2, -6.2, 8.2, 0.2, 3.8, 1.2]); fp(s, "#4c1d95", [5.2, -6.2, 8.2, 0.2, 6.5, 0.9]); sl(s, "#d4a017", 0.9, [3.8, 1.2, 8.2, 0.2]);
    // head, beard
    fe(s, -2.3, -12.4, 2.2, 3.2, "#d6d3d1");
    fc(s, 1, -13, 4.2, "#f0c29a"); fe(s, -0.8, -13.8, 1.6, 1.8, "#e0ae86");
    fc(s, 4.9, -12.5, 1.3, "#e8a07a");
    fr(s, 2.7, -14.2, 1.4, 1.1, "#1c1917"); fr(s, 3.2, -14.1, 0.5, 0.5, "#fde68a"); fr(s, 2.1, -15.3, 2.8, 0.9, "#f5f5f4");
    var bw = reduceMotion ? 0 : Math.sin(t * 3) * 0.8;
    s.fillStyle = "#e7e5e4"; s.beginPath(); s.moveTo(-1.2, -12); s.quadraticCurveTo(-0.5, -4, 2 + bw, -0.5); s.quadraticCurveTo(3.8, -5, 6.2, -11.4); s.quadraticCurveTo(3, -10, -1.2, -12); s.fill();
    sl(s, "#a8a29e", 0.7, [2.2, -9, 2.6 + bw * 0.6, -3]); sl(s, "#fafaf9", 0.6, [0.3, -10.5, 1, -6]);
    fe(s, 4.1, -11, 2.3, 0.9, "#fafaf9");
    // hat
    var hw = reduceMotion ? 0 : Math.sin(t * 2) * 1.5;
    fe(s, 0.5, -16.5, 9.6, 2.7, "#2a0a63"); fe(s, 0.5, -17.1, 9, 1.9, "#5b21b6"); fe(s, -2.5, -17.4, 4.5, 0.8, "#7c3aed");
    s.fillStyle = "#4c1d95"; s.beginPath(); s.moveTo(-5.6, -17); s.quadraticCurveTo(-3, -24, -3.6, -27); s.quadraticCurveTo(-5, -31, -10 + hw, -31.8); s.quadraticCurveTo(-1, -29.5, 1.2, -25); s.quadraticCurveTo(3.6, -21, 6.1, -17); s.closePath(); s.fill();
    s.fillStyle = "#6d28d9"; s.beginPath(); s.moveTo(-5.6, -17); s.quadraticCurveTo(-3, -24, -3.6, -27); s.quadraticCurveTo(-5, -30.5, -9.4 + hw, -31.5); s.quadraticCurveTo(-3, -28.5, -1.2, -25); s.quadraticCurveTo(0, -21, 0.6, -17); s.closePath(); s.fill();
    fr(s, -1.7, -24, 2.6, 2.4, "#3b0a8c"); sl(s, "#a78bfa", 0.4, [-1.7, -24, 0.9, -24]);
    fp(s, "#d4a017", [-5.6, -17.2, 6.1, -17.2, 5.4, -19.3, -4.9, -19.3]); fr(s, -5, -19.3, 10.4, 0.6, "#fde68a");
    fc(s, 0.5, -18.3, 1.4, "#ea580c"); fc(s, 0.2, -18.6, 0.55, "#fed7aa");
  }
  function drawWeapon(c, id, o, bob) {
    c.save(); c.translate(0, -4 - bob);
    var atk = o.atk || 0, dir = Math.cos(o.aim) < 0 ? -1 : 1, t = o.t, ak = Math.min(1, atk / 0.22);
    if (id === "knight") {
      var swing = o.block ? 2.3 : atk > 0 ? lerp(-1.5, 1.4, 1 - ak) : 0.9;
      c.rotate(o.aim + swing * dir);
      fc(c, 2.6, 0, 1.7, "#e2b33c"); fc(c, 2.6, 0, 0.8, "#dc2626");
      fr(c, 3.4, -1.3, 5, 2.6, "#4a2a12"); fr(c, 4.6, -1.3, 0.6, 2.6, "#2a160a"); fr(c, 6.4, -1.3, 0.6, 2.6, "#2a160a");
      fc(c, 5.6, 0.2, 2.3, "#6b7684"); fc(c, 5, -0.6, 1.1, "#c5cfda");
      fp(c, "#c28a12", [8.1, -4.6, 10.2, -3.8, 10.2, 3.8, 8.1, 4.6]); fr(c, 8.1, -4.6, 0.8, 9.2, "#fde68a");
      fp(c, "#aeb9c6", [10.2, -2.2, 28, -1.7, 32, 0, 28, 1.7, 10.2, 2.2]);
      fp(c, "#f8fafc", [10.2, -2.2, 28, -1.7, 32, 0, 10.2, -0.3]);
      sl(c, "#7b8796", 0.6, [11.5, 0.4, 25, 0.3]);
    } else if (id === "ranger") {
      c.rotate(o.aim + (o.block ? -0.9 * dir : 0));
      var pull = atk > 0 ? ak * 5 : 0;
      c.strokeStyle = "#4a2a12"; c.lineWidth = 2.6; c.beginPath(); c.arc(6, 0, 11, -1.22, 1.22); c.stroke();
      c.strokeStyle = "#b07a3f"; c.lineWidth = 0.9; c.beginPath(); c.arc(6, 0, 11.4, -1.1, -0.2); c.stroke();
      var ex = 6 + Math.cos(1.22) * 11, ey = Math.sin(1.22) * 11;
      sl(c, "#4a2a12", 1.6, [ex, -ey, ex + 2.2, -ey - 1.3]); sl(c, "#4a2a12", 1.6, [ex, ey, ex + 2.2, ey + 1.3]);
      sl(c, "#ece7df", 0.7, [ex + 0.3, -ey, 6 - pull, 0, ex + 0.3, ey]);
      fr(c, 15.6, -2, 2.4, 4, "#241208"); fc(c, 16.8, 0, 1.9, "#6b4423");
      if (atk > 0.02 || o.cast > 0) {
        var ax0 = 6 - pull;
        fr(c, ax0, -0.55, 17, 1.1, o.cast > 0 ? "#bae6fd" : "#c8a27a");
        fp(c, o.cast > 0 ? "#f0f9ff" : "#e5e7eb", [ax0 + 17, -2.2, ax0 + 21.5, 0, ax0 + 17, 2.2]);
        fp(c, "#dc2626", [ax0 + 3, -0.5, ax0 - 0.5, -2.6, ax0 + 0.5, -0.5]); fp(c, "#dc2626", [ax0 + 3, 0.5, ax0 - 0.5, 2.6, ax0 + 0.5, 0.5]);
        fc(c, ax0 + 0.6, 0, 1.6, "#6b4423");
      }
    } else {
      var raise = o.cast > 0 ? -0.9 : atk > 0 ? -0.3 : o.block ? -1.25 : 0.35;
      c.rotate(o.aim + raise * dir);
      sl(c, "#4a2a12", 2.7, [-7, 0.7, 2, -0.4, 10, 0.6, 18, -0.3]);
      sl(c, "#8b5a2b", 0.9, [-6, -0.2, 2, -1.1, 10, -0.4, 17, -1.1]);
      fc(c, 10, 0.4, 1.6, "#4a2a12");
      sl(c, "#2a160a", 1.2, [17, -0.6, 19.8, -4, 24, -3.6]); sl(c, "#2a160a", 1.2, [17, 0.6, 19.8, 4, 24, 3.6]); sl(c, "#2a160a", 1, [18, 0, 26.5, 0.2]);
      fp(c, "#ea580c", [20.4, 0, 23, -3.1, 26.2, 0, 23, 3.1]); fp(c, "#fdba74", [21.4, 0, 23, -2.2, 23.6, 0]); fr(c, 22.5, -1.4, 0.8, 0.8, "#fffbeb");
      fr(c, 1.4, -2.4, 2.2, 4.8, "#6d28d9"); fr(c, 1.4, -2.4, 2.2, 0.8, "#d4a017"); fc(c, 4.4, 0, 2, "#f0c29a");
    }
    c.restore();
  }

  // ============================================================ rendering: enemies & bosses
  var EBOX = { w: 52, h: 50, ax: 26, ay: 32 }, BIGBOX = { w: 80, h: 72, ax: 40, ay: 48 }, BATBOX = { w: 46, h: 36, ax: 23, ay: 19 };
  var EANIM = { skeleton: [0.628, 8], bat: [0.2856, 6], slime: [1.047, 8], slimelet: [1.047, 8], archer: [0.628, 8], imp: [0.628, 8], cultist: [1.257, 8], brute: [0.628, 8], spiderling: [0.314, 6] };
  var EOUTL = { slime: "#142708", slimelet: "#142708" };
  function drawEnemy(e) {
    var x = e.x, y = e.y, t = e.t, k = e.kind, s = e.elite ? 1.25 : 1;
    ctx.save(); ctx.translate(x, y);
    if (e.spawn > 0) {
      var p = clamp(1 - e.spawn / 0.6, 0, 1), rot = reduceMotion ? 0 : G.t * 2;
      glow(ctx, 0, 6, 20, "#a855f7", 0.2 + p * 0.45);
      ctx.save(); ctx.translate(0, 8); ctx.scale(1, 0.38);
      ctx.strokeStyle = "rgba(192,132,252," + (0.3 + p * 0.6) + ")"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 15 * (1 - p * 0.25), 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.2; for (var r = 0; r < 6; r++) { var ra = rot + r / 6 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(ra) * 9, Math.sin(ra) * 9); ctx.lineTo(Math.cos(ra + 0.4) * 12, Math.sin(ra + 0.4) * 12); ctx.stroke(); }
      ctx.restore();
      fr(ctx, -0.8, 8 - p * 18, 1.6, p * 18, "rgba(216,180,254," + (0.5 * p) + ")");
      ctx.restore(); return;
    }
    fe(ctx, 0, e.r * 0.9, e.r * 0.95, e.r * 0.35, "rgba(0,0,0,.4)");
    if (e.elite) { ctx.strokeStyle = "rgba(251,191,36," + (0.5 + 0.3 * Math.sin(t * 5)) + ")"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, e.r * 0.9, e.r + 3, e.r * 0.45, 0, 0, TAU); ctx.stroke(); }
    ctx.scale(e.face * s, s);
    if (k === "boss") drawBoss(e);
    else {
      var an = EANIM[k] || [1, 8], f = Math.floor(frac(t / an[0]) * an[1]), ph = f / an[1], st = k === "brute" ? (e.state || "") : "";
      if (st === "wind" && !reduceMotion) ctx.translate(Math.sin(t * 40) * 1.5, 0);
      var fl = e.flash > 0, bx = k === "brute" ? BIGBOX : k === "bat" ? BATBOX : EBOX;
      sprite(ctx, k + st + f + (e.elite ? "E" : "") + (fl ? "F" : ""), bx, function (c) { enemyFigure(c, k, ph, st); },
        { ol: e.elite ? "#7c3f06" : (EOUTL[k] || OUTL), tint: fl ? "rgba(255,255,255,.82)" : null });
      if (k === "imp") glow(ctx, 8, -2, 11, "#fb923c", 0.85);
      else if (k === "cultist") { var gl = 0.5 + 0.5 * Math.sin(ph * TAU); glow(ctx, 9, -2 + Math.sin(ph * TAU), 13, "#a855f7", 0.45 + 0.35 * gl); glow(ctx, 3, -10, 5, "#c084fc", 0.5); }
      else if (k === "skeleton") glow(ctx, 3.5, -10.2, 4, "#bef264", 0.5);
      else if (k === "spiderling") glow(ctx, 3.5, -1.5, 5, "#22d3ee", 0.45);
      else if (k === "brute" && st === "wind") glow(ctx, 4, -15, 9, "#ef4444", 0.9);
    }
    ctx.restore();
    if (e.slow > 0) { ctx.strokeStyle = "rgba(125,211,252,.8)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y - 2, e.r + 3, 0, TAU); ctx.stroke(); fr(ctx, x - e.r - 2, y - 4, 2, 2, "#e0f2fe"); fr(ctx, x + e.r + 1, y - 6, 2, 2, "#e0f2fe"); }
    if (k !== "boss" && e.hp < e.maxHp) {
      var by = y - e.r - 14 * s;
      fr(ctx, x - 11, by - 1, 22, 5, "rgba(10,6,4,.85)");
      fr(ctx, x - 10, by, 20 * Math.max(0, e.hp / e.maxHp), 3, e.elite ? "#fbbf24" : "#ef4444");
      fr(ctx, x - 10, by, 20 * Math.max(0, e.hp / e.maxHp), 1, e.elite ? "#fef3c7" : "#fca5a5");
    }
    if (e.state === "wind") { ctx.font = "bold 13px Georgia"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#1c0a02"; ctx.strokeText("!", x, y - e.r - 18); ctx.fillStyle = "#fbbf24"; ctx.fillText("!", x, y - e.r - 18); }
  }
  function enemyFigure(c, k, p, st) {
    var S = Math.sin(p * TAU), w = S * 2.5, i;
    if (k === "skeleton") {
      var B = "#ebe6d2", Bs = "#b3aa92", Bd = "#5d5646";
      sl(c, Bs, 1.6, [-2.5, -5, -4 - w * 0.4, -1, -3.6 - w * 0.5, 2]);
      sl(c, Bs, 1.8, [-1.2, 3, -1.8 - w * 0.4, 6.5, -2 - w * 0.5, 10]); fr(c, -3.8 - w * 0.5, 9.4, 3.2, 1.7, Bs);
      fp(c, "#5b3a24", [-3.6, 1.5, 3.6, 1.5, 3.2, 6, 1.2, 4.6, -0.4, 6.6, -2, 4.6, -3.3, 6.2]); fp(c, "#3f2616", [1.4, 1.5, 3.6, 1.5, 3.2, 6, 1.2, 4.6]);
      sl(c, B, 1.9, [1, 3, 1.6 + w * 0.4, 6.5, 2 + w * 0.5, 10]); fr(c, 0.8 + w * 0.5, 9.4, 3.7, 1.7, B);
      fe(c, 0, 2, 3.6, 1.6, B);
      fr(c, -0.8, -6, 1.8, 8, Bs);
      fe(c, 0.3, -3.6, 4.8, 3.8, B); for (i = 0; i < 3; i++) fr(c, -4, -5.4 + i * 2, 8.6, 0.8, Bd); fr(c, 0, -6.6, 1.3, 6.2, B); fe(c, -2, -5, 1.4, 1, "#fbf8ee");
      fc(c, 0.8, -10, 5, B); fe(c, -0.8, -11.8, 2.6, 1.8, "#fbf8ee");
      fr(c, 0.2, -7.6, 5.2, 2.4, Bs); for (i = 0; i < 4; i++) fr(c, 0.7 + i * 1.25, -7.2, 0.5, 1.6, Bd);
      fc(c, 2.6, -10.2, 1.45, "#140d08"); fc(c, 5, -10.2, 1.15, "#140d08"); fc(c, 2.7, -10.2, 0.6, "#d9f99d"); fc(c, 5, -10.2, 0.5, "#d9f99d"); fr(c, 4, -8.8, 0.8, 1, "#140d08");
      c.fillStyle = "#6b5a48"; c.beginPath(); c.arc(0.8, -10.6, 5.5, Math.PI * 1.02, Math.PI * 1.92); c.closePath(); c.fill();
      fr(c, -4.6, -11.4, 8.4, 1, "#8a7560"); fc(c, -1.5, -14, 0.8, "#a8917a");
      var sa = 0.4 + S * 0.35;
      c.save(); c.translate(3, -4.5); c.rotate(sa);
      sl(c, B, 1.6, [0, 0, 4, 1.6]); fc(c, 4.4, 1.6, 1.3, B);
      sl(c, "#3f2a1c", 1.3, [3.3, 0.4, 5.6, 3]);
      fp(c, "#8b8278", [4.3, 1.1, 13.5, -5.2, 14.6, -4.4, 5.1, 2.2]); fp(c, "#c9c3bb", [4.3, 1.1, 13.5, -5.2, 14.6, -4.4]); fc(c, 9, -1.6, 0.7, "#7c2d12");
      c.restore();
    } else if (k === "bat") {
      var fl = S * 6, M = "#3a2c46", Ml = "#6b5588", Bd = "#211829";
      for (var side = -1; side <= 1; side += 2) {
        c.save(); c.scale(side, 1);
        fp(c, M, [1.5, -2, 7, -5 - fl, 13.5, -4 - fl * 1.1, 11.5, -0.2 - fl * 0.35, 9.2, -0.8 - fl * 0.2, 7.2, 2 - fl * 0.1, 4.2, 1, 2, 1.6]);
        fp(c, "#4b3a5c", [2, -2, 7, -5 - fl, 9.2, -0.8 - fl * 0.2, 4.2, 0.2]);
        sl(c, Ml, 0.7, [1.5, -2, 7, -5 - fl, 13.5, -4 - fl * 1.1]); sl(c, Ml, 0.55, [7, -5 - fl, 9.2, -0.8 - fl * 0.2]); sl(c, Ml, 0.55, [7, -5 - fl, 7.2, 2 - fl * 0.1]);
        c.restore();
      }
      fe(c, 0, 0.5, 4.4, 4.8, Bd); fe(c, 0.8, 1.6, 2.4, 2.9, "#4a3a58"); fe(c, -1.6, -1.8, 1.6, 1.2, "#3d3148");
      fp(c, Bd, [-2.7, -2.8, -3.3, -8.2, -0.4, -4]); fp(c, Bd, [0.9, -4, 2.8, -8.6, 3.3, -2.8]); fp(c, "#6b4a60", [-2.4, -3.5, -2.9, -6.8, -1, -4]);
      fc(c, 0.4, -1.3, 1, "#fb7185"); fc(c, 2.8, -1.3, 1, "#fb7185"); fr(c, 0.2, -1.7, 0.5, 0.5, "#fff1f2"); fr(c, 2.6, -1.7, 0.5, 0.5, "#fff1f2");
      fp(c, "#f5f5f4", [0.6, 1.1, 1.1, 2.7, 1.6, 1.1]); fp(c, "#f5f5f4", [2.2, 1.1, 2.7, 2.7, 3.1, 1.1]);
    } else if (k === "slime" || k === "slimelet") {
      var r = k === "slime" ? 11 : 7, sq = 1 + S * 0.12, rx = r * (2 - sq), ry = r * sq * 0.85, cy = 6 - ry * 0.3;
      var g = c.createRadialGradient(-rx * 0.35, cy - ry * 0.55, 0.5, 0, cy - ry * 0.2, rx * 1.15);
      g.addColorStop(0, "#ecfccb"); g.addColorStop(0.25, "#a3e635"); g.addColorStop(0.7, "#65a30d"); g.addColorStop(1, "#3f6212");
      c.globalAlpha = 0.92; c.fillStyle = g; c.beginPath(); c.moveTo(-rx, 6); c.ellipse(0, cy, rx, ry, 0, Math.PI, TAU); c.lineTo(rx, 6); c.quadraticCurveTo(0, 7.6, -rx, 6); c.fill(); c.globalAlpha = 1;
      fe(c, rx * 0.12, cy + ry * 0.05, rx * 0.36, ry * 0.3, "rgba(54,83,20,.55)");
      for (i = 0; i < 3; i++) { var bu = frac(p + i / 3); fc(c, (i - 1) * rx * 0.4, cy + ry * 0.2 - bu * ry * 0.7, r * 0.07 + 0.4, "rgba(236,252,203," + (0.7 - bu * 0.5) + ")"); }
      fe(c, -rx * 0.45, cy - ry * 0.45, rx * 0.17, ry * 0.26, "rgba(255,255,255,.8)", -0.5); fc(c, -rx * 0.2, cy - ry * 0.72, r * 0.06 + 0.3, "rgba(255,255,255,.8)");
      fe(c, rx * 0.18, cy - ry * 0.05, r * 0.12 + 0.5, r * 0.18 + 0.6, "#10200a"); fe(c, rx * 0.55, cy - ry * 0.05, r * 0.12 + 0.5, r * 0.18 + 0.6, "#10200a");
      fr(c, rx * 0.15, cy - ry * 0.2, 0.7, 0.7, "#fff"); fr(c, rx * 0.52, cy - ry * 0.2, 0.7, 0.7, "#fff");
      c.strokeStyle = "#10200a"; c.lineWidth = 0.7; c.beginPath(); c.arc(rx * 0.37, cy + ry * 0.2, r * 0.12, 0.2, Math.PI - 0.2); c.stroke();
    } else if (k === "archer") {
      var Sk = "#7a9a2e", Sd = "#56731c", Sl = "#a3c24f";
      c.save(); c.translate(-4, -4); c.rotate(-0.3); fp(c, "#e5e7eb", [-1.3, -5, -0.6, -8.4, 0.1, -5]); fp(c, "#7f1d1d", [0.2, -5, 1, -8, 1.6, -5]); fr(c, -1.6, -5, 3.3, 8.5, "#5e3a1a"); fr(c, -1.6, -5, 1, 8.5, "#7c5030"); c.restore();
      fr(c, -3.2 - w * 0.35, 3, 2.4, 5.5, "#3b2a1a"); fr(c, -3.9 - w * 0.4, 8, 3.5, 1.9, "#1c120a");
      fr(c, 0.8 + w * 0.35, 3, 2.4, 5.5, "#4a3423"); fr(c, 0.6 + w * 0.4, 8, 3.8, 1.9, "#2a1a10");
      c.fillStyle = "#6b4423"; rrect(c, -4.8, -5, 9.6, 9.5, 3); c.fill();
      fp(c, "#4a2d15", [1.6, -5, 4.8, -3, 4.8, 3, 1.6, 4.5]); fp(c, "#6b4423", [-4.8, 3, -3, 6, -1.5, 4, 0, 6.2, 1.5, 4, 3, 6, 4.8, 3.5]);
      fr(c, -4.8, 1.3, 9.6, 1.4, "#2a1a10"); fr(c, -0.5, 1.2, 1.6, 1.6, "#a8a29e");
      fp(c, Sk, [-3.4, -10.4, -11, -13.6, -4, -7.4]); fp(c, Sd, [-4, -9.6, -9, -12.4, -4.5, -8.3]);
      fc(c, 0.5, -9.5, 5.4, Sk); fe(c, -1.3, -11.6, 2.6, 1.7, Sl); fe(c, 1.6, -6.8, 3.4, 1.5, Sd);
      fp(c, Sk, [3.8, -11, 9.8, -14.6, 5.6, -7.8]); fp(c, Sl, [4.4, -11, 8.4, -13.4, 5.6, -10]);
      c.fillStyle = "#5e3a1a"; c.beginPath(); c.arc(0.5, -10.3, 5.7, Math.PI * 1.04, Math.PI * 1.96); c.closePath(); c.fill(); fr(c, -4.5, -11, 9.8, 0.8, "#7c5030");
      fe(c, 2.6, -9.3, 1.25, 1.05, "#fde047"); fe(c, 5, -9.3, 1.05, 1.05, "#fde047"); fr(c, 2.9, -9.7, 0.7, 0.9, "#1c1917"); fr(c, 5.2, -9.7, 0.6, 0.9, "#1c1917");
      fe(c, 6, -8.2, 1.6, 1, Sd); fr(c, 3.2, -6.6, 0.8, 1.3, "#f5f5f4");
      c.strokeStyle = "#4a2a12"; c.lineWidth = 1.6; c.beginPath(); c.arc(5.5, 0, 7.5, -1.2, 1.2); c.stroke();
      c.strokeStyle = "#a16207"; c.lineWidth = 0.6; c.beginPath(); c.arc(5.5, 0, 7.8, -1.1, -0.3); c.stroke();
      var bx0 = 5.5 + Math.cos(1.2) * 7.5, by0 = Math.sin(1.2) * 7.5; sl(c, "#d6d3d1", 0.5, [bx0, -by0, 5.5 - 1 - S, 0, bx0, by0]);
      fc(c, 12.2, 0, 1.4, Sk);
    } else if (k === "imp") {
      var R = "#c2281d", Rd = "#7f1d1d", Rl = "#f05545", fl2 = Math.sin(p * TAU * 2) * 2;
      fp(c, "#4a0d0d", [-2, -6, -10, -12.5 - fl2, -9, -6.5 - fl2 * 0.5, -12.5, -4.5 - fl2 * 0.3, -4, -1]);
      sl(c, "#9b2c2c", 0.7, [-2, -6, -10, -12.5 - fl2]); sl(c, "#9b2c2c", 0.6, [-6, -8.6 - fl2 * 0.6, -12.5, -4.5 - fl2 * 0.3]);
      var tw = S * 1.6; sl(c, Rd, 1.4, [-3, 3, -8, 5, -9.5, 0 + tw]); fp(c, Rd, [-9.5, -2.6 + tw, -11.4, 0.8 + tw, -7.8, 0.6 + tw]);
      fr(c, -3.2 - w * 0.35, 3, 2.4, 5.5, Rd); fr(c, -3.6 - w * 0.4, 8, 3, 1.8, "#1c0a0a");
      fr(c, 0.8 + w * 0.35, 3, 2.4, 5.5, R); fr(c, 0.6 + w * 0.4, 8, 3.2, 1.8, "#2a0f0f");
      c.fillStyle = R; rrect(c, -4.5, -5, 9, 9, 3.5); c.fill(); fp(c, Rd, [1.6, -5, 4.5, -3, 4.5, 3, 1.6, 4]); fe(c, 0.6, -0.6, 2.3, 2.8, Rl);
      fc(c, 0.5, -9.5, 5, R); fe(c, -1.3, -11.5, 2.4, 1.6, Rl); fe(c, 1.8, -6.6, 3, 1.3, Rd);
      fp(c, "#f5deb3", [-2.4, -13.2, -6, -19.2, -3.4, -18, -0.8, -14]); fp(c, "#f5deb3", [2.2, -13.8, 4.6, -19.8, 5.8, -14.2]); fp(c, "#c9a66b", [-3.6, -15.8, -6, -19.2, -3.4, -18]);
      fe(c, 2.6, -9.8, 1.3, 1, "#fde047"); fe(c, 5, -9.8, 1.1, 1, "#fde047"); fr(c, 2.6, -10.3, 0.5, 1, "#1c0a0a"); fr(c, 5, -10.3, 0.5, 1, "#1c0a0a");
      sl(c, "#2a0505", 0.8, [1.4, -7, 3, -6.2, 5.2, -7.3]); fp(c, "#fff", [3, -6.4, 3.4, -5.4, 3.8, -6.4]);
      fc(c, 6.3, -2, 1.5, R);
      var fo = 2.4 + Math.sin(p * TAU * 3) * 0.5; fc(c, 8, -2, fo, "#ea580c"); fc(c, 8, -2.4, fo * 0.6, "#fdba74"); fc(c, 8, -2.6, fo * 0.3, "#fffbeb");
    } else if (k === "cultist") {
      var sw2 = S * 1.2, bob = S;
      fp(c, "#1e1b4b", [-4, -8, 4, -8, 8.6 + sw2, 10, -8.6 + sw2, 10]);
      fp(c, "#312e81", [-4, -8, -1, -8, -4 + sw2, 10, -8.6 + sw2, 10]);
      fp(c, "#110e30", [2.4, -8, 4, -8, 8.6 + sw2, 10, 5 + sw2, 10]);
      fp(c, "#6d28d9", [-8.6 + sw2, 8.8, 8.6 + sw2, 8.8, 8.9 + sw2, 10.2, -8.9 + sw2, 10.2]);
      for (i = 0; i < 4; i++) fp(c, "#0b0920", [-7 + sw2 + i * 4.2, 10.2, -5.8 + sw2 + i * 4.2, 8.2, -4.6 + sw2 + i * 4.2, 10.2]);
      sl(c, "#7c3aed", 1.6, [-4, -4, 4.6, 1]); fc(c, 0.4, -1.5, 1.1, "#e9d5ff");
      fp(c, "#312e81", [0.8, -6.4, 7.2, -3.4, 7.4, -0.2, 2, -2]); fc(c, 7.4, -1.6, 1.25, "#d6cfc4");
      fc(c, 0, -10.5, 6, "#26225e"); fp(c, "#26225e", [-5.2, -12, -3.4, -18.4, 2, -15.6]); fe(c, -2.2, -13.2, 3, 1.9, "#3d3a92");
      fe(c, 2.1, -9.7, 3.7, 4.1, "#04020b");
      fr(c, 1.8, -10.6, 1.4, 1.1, "#f3e8ff"); fr(c, 4, -10.6, 1.2, 1.1, "#f3e8ff");
      fc(c, 9, -2 + bob, 3, "#7e22ce"); fc(c, 9, -2 + bob, 2, "#c084fc"); fc(c, 8.3, -2.8 + bob, 0.9, "#faf5ff");
    } else if (k === "brute") {
      var wnd = st === "wind", chg = st === "charge", ww = wnd ? 0 : w;
      if (chg) c.rotate(0.12);
      fr(c, -7 - ww * 0.3, 4, 5, 8, "#1f1f23"); fr(c, -7.8 - ww * 0.35, 10.4, 6.4, 2.8, "#111113");
      fr(c, 2 + ww * 0.3, 4, 5, 8, "#3f3f46"); fe(c, 4.5 + ww * 0.3, 6.5, 2.7, 2, "#8a8a93"); fr(c, 1.5 + ww * 0.35, 10.4, 6.6, 2.8, "#1c1c20");
      fc(c, -10, -3, 3, "#4b5a3f");
      c.fillStyle = "#3f3f46"; rrect(c, -11, -11, 22, 17, 5); c.fill();
      fp(c, "#27272a", [3, -11, 11, -9, 11, 5, 4, 6]);
      c.fillStyle = "#6b6b75"; rrect(c, -9, -10, 10.5, 8.5, 3); c.fill(); fe(c, -6, -8, 2.4, 1.3, "#a1a1aa");
      for (i = 0; i < 3; i++) fc(c, -8 + i * 4, -1.2, 0.7, "#a1a1aa");
      fr(c, -11, 2, 22, 3, "#3b2412"); fr(c, -1.6, 1.6, 4.2, 3.8, "#c9c1b4"); fr(c, -0.8, 2.6, 0.9, 0.9, "#1c1917"); fr(c, 1, 2.6, 0.9, 0.9, "#1c1917");
      fe(c, -8, -10, 5, 3.5, "#52525b"); fe(c, 8, -10, 5, 3.5, "#6b6b75"); fe(c, 7, -11.2, 2.6, 1.3, "#b4b4bd");
      fp(c, "#e7e5e4", [6, -12.6, 8.2, -17.2, 10.2, -12.6]); fp(c, "#a8a29e", [8.2, -17.2, 10.2, -12.6, 8.8, -12.6]);
      fc(c, 0.5, -15, 7, "#3f3f46"); fe(c, -2, -17.6, 3.6, 2.2, "#71717a"); fe(c, -3, -18.4, 1.4, 0.8, "#d4d4d8");
      fr(c, 1, -15.9, 6.2, 2.5, "#09090b"); fr(c, 2, -15.5, 4.6, 1.4, wnd ? "#ef4444" : "#f97316");
      fp(c, "#e7e5e4", [-5, -19, -10.5, -26.5, -9.6, -18]); fp(c, "#a8a29e", [-7.5, -22, -10.5, -26.5, -9.6, -18]);
      fp(c, "#e7e5e4", [5, -19.5, 9, -27.4, 10.2, -18.4]); fp(c, "#a8a29e", [8, -23, 9, -27.4, 10.2, -18.4]);
      fp(c, "#f5f5f4", [3, -11.3, 3.9, -9, 4.7, -11.3]);
      c.save(); c.translate(10.5, -9);
      c.rotate(wnd ? -2.4 + (reduceMotion ? 0 : Math.sin(p * TAU * 4) * 0.08) : chg ? 0.55 : 0.12 + S * 0.05);
      fr(c, -1.5, -3, 3, 22, "#4a2a12"); fr(c, -1.5, -3, 1, 22, "#7c4a22");
      c.fillStyle = "#8f8f99"; c.beginPath(); c.moveTo(1.5, 8); c.quadraticCurveTo(13, 11, 12, 20); c.lineTo(1.5, 18.5); c.closePath(); c.fill();
      c.fillStyle = "#e4e4e7"; c.beginPath(); c.moveTo(8, 9.6); c.quadraticCurveTo(13, 11, 12, 20); c.lineTo(10.4, 19.8); c.quadraticCurveTo(11, 12.5, 7, 10.2); c.closePath(); c.fill();
      fc(c, 5, 13, 1, "#3f3f46"); fp(c, "#3f3f46", [10.5, 14, 12.3, 15, 12.1, 16.4]);
      fc(c, 0, 4, 3.1, "#6b7a5a"); fc(c, -0.8, 3.2, 1.2, "#8a9a76");
      c.restore();
    } else if (k === "spiderling") {
      for (i = 0; i < 4; i++) {
        var la = Math.sin(p * TAU + i * 1.6) * 2;
        for (var sd = -1; sd <= 1; sd += 2) sl(c, "#0f172a", 1.3, [0, -1 + i * 0.8, sd * 5, -4.5 + i * 1.8 + la * 0.5 * sd, sd * 8.5, 2 + i * 1.6 + la * sd]);
      }
      fe(c, -3.5, 0.6, 4.6, 4, "#1e293b"); fe(c, -4.8, -1.3, 2, 1.2, "#475569"); fp(c, "#22d3ee", [-4.6, -1.2, -3.4, 0.6, -4.6, 2.4, -5.8, 0.6]);
      fc(c, 2, -0.5, 3.2, "#334155"); fe(c, 1.2, -2, 1.4, 0.8, "#64748b");
      fr(c, 2.8, -2, 1.3, 1.3, "#7dd3fc"); fr(c, 4.3, -1.6, 1.1, 1.1, "#7dd3fc"); fr(c, 3.6, -0.2, 0.8, 0.8, "#7dd3fc");
      fp(c, "#e2e8f0", [4.4, 0.6, 5.5, 2.6, 3.9, 1.3]);
    }
  }

  var BOSS_BOX = { w: 114, h: 94, ax: 57, ay: 60 };
  function drawBoss(b) {
    var id = b.boss.id, t = b.t, fl = b.fly || 0, T = reduceMotion ? 0 : t;
    if (fl) ctx.translate(0, -fl);
    var tint = b.flash > 0 ? "rgba(255,255,255,.85)" : null;
    var hov = id === "lich" ? (reduceMotion ? 0 : Math.sin(t * 2.5) * 3) - 6 : 0;
    if (id === "lich") glow(ctx, 0, hov - 2, 46, "#7e22ce", 0.5);
    if (id === "dragon" && b.phase === 2) glow(ctx, 0, 2, 40, "#f97316", 0.3);
    liveSprite(ctx, "boss", BOSS_BOX, function (c) { bossFigure(c, b, id, t, hov); }, OUTL, RIM, tint);
    if (id === "colossus") { var lean = b.state === "charge" ? 3 : 0; glow(ctx, 1, -8, 15, "#f59e0b", 0.55 + 0.2 * Math.sin(T * 4)); glow(ctx, 8 + lean, -36, 6, "#fbbf24", 0.9); glow(ctx, 15 + lean, -35, 5, "#fbbf24", 0.8); }
    else if (id === "matriarch") { glow(ctx, 12, -8, 12, "#22d3ee", 0.55); glow(ctx, -7, 8, 16, "#22d3ee", 0.3 + 0.15 * Math.sin(T * 3)); }
    else if (id === "lich") {
      glow(ctx, -2.2, -15.5 + hov, 5, "#e9d5ff", 0.9); glow(ctx, 3, -15.5 + hov, 5, "#e9d5ff", 0.9); glow(ctx, 15, -32 + hov, 15, "#a855f7", 0.85);
      for (var i = 0; i < 3; i++) { var a = T * 1.5 + i * TAU / 3, wx = Math.cos(a) * 24, wy = hov - 2 + Math.sin(a) * 9; glow(ctx, wx, wy, 7, "#c084fc", 0.8); fc(ctx, wx, wy, 1.2, "#faf5ff"); }
    } else if (id === "dragon") {
      glow(ctx, 30.4, -22.5, 6, b.phase === 2 ? "#fde047" : "#f97316", 0.9);
      if (b.state === "breath") { glow(ctx, 44, -14, 24, "#f97316", 0.9); glow(ctx, 42, -15, 10, "#fef9c3", 0.9); }
      else glow(ctx, 40, -20, 5, "#fb923c", 0.35 + 0.25 * Math.sin(T * 5));
    }
  }
  function bossFigure(c, b, id, t, hov) {
    var T = reduceMotion ? 0 : t, i;
    if (id === "colossus") {
      var st = Math.sin(t * 3) * 2, B = "#e2dcc6", Bs = "#aaa18a", Bd = "#6c6452", stone = "#5b5a52", moss = "#4d7c0f", mossL = "#84cc16";
      if (b.state === "charge") { c.translate(0, 20); c.rotate(0.16); c.translate(0, -20); }
      c.save(); c.translate(-18, -14); c.rotate(0.35 + Math.sin(T * 2) * 0.2);
      sl(c, Bs, 5, [0, 0, -2, 11]); sl(c, Bs, 4.4, [-2, 11, 0, 20]); fc(c, -2, 11, 3, Bd);
      c.translate(0, 20); fp(c, stone, [-8.5, 0, 8, -1.5, 9.5, 12, -9.5, 13]); fp(c, "#807e73", [-8.5, 0, 8, -1.5, 7.5, 2.5, -7.8, 3.5]); fp(c, "#3f3e38", [5, 0, 9.5, 12, 4, 12.5]);
      fe(c, -3, 0.5, 5.5, 2, moss); fe(c, -4, 0, 2.5, 1, mossL); sl(c, "#3f3e38", 0.8, [-3, 5, 0, 8, -2, 11]);
      c.restore();
      sl(c, Bs, 6, [-8, 10, -10 + st, 19]); sl(c, Bs, 5, [-10 + st, 19, -10 + st, 27]); fe(c, -10 + st, 28.5, 6.5, 2.6, Bd);
      fe(c, 0, 9, 11.5, 5, B); fe(c, -4, 9.4, 2.6, 2, Bd); fe(c, 4.2, 9.4, 2.6, 2, Bd); fe(c, -3, 6.8, 5, 1.4, "#f6f2e3");
      sl(c, B, 6.5, [7, 10, 9 - st, 19]); sl(c, B, 5.5, [9 - st, 19, 9 - st, 27]); fe(c, 10 - st, 28.5, 7, 2.8, Bs);
      for (i = 0; i < 3; i++) fc(c, 14 - st + i * 0.2, 27 + i * 1.1, 1.2, B);
      for (i = 0; i < 6; i++) fe(c, 0, 6 - i * 4, 2.6, 1.9, i % 2 ? B : Bs);
      fc(c, 1, -8, 4.4, "#92400e"); fc(c, 1, -8, 2.6, "#fbbf24"); fc(c, 0.4, -8.8, 1, "#fffbeb");
      for (i = 0; i < 5; i++) {
        var ry = -20 + i * 4.5, rw = 15 - i * 1.7;
        c.strokeStyle = i % 2 ? Bs : B; c.lineWidth = 2.6; c.lineCap = "round"; c.beginPath(); c.ellipse(0, ry, rw, 4.2, 0, 0.15, Math.PI - 0.15); c.stroke();
      }
      fe(c, -9, -16, 5.5, 2.4, moss); fe(c, -10.5, -17, 2.5, 1.1, mossL); sl(c, moss, 1.2, [-10, -15, -11, -8, -9.5, -3]); fe(c, -11, -8, 1.8, 1, mossL, 0.5); fc(c, -9.5, -2.6, 1.1, "#fde047"); fc(c, 8, -15, 0.9, "#f5f5f4");
      fe(c, -14, -21, 7.5, 4.8, Bs); fe(c, -15, -22.5, 4, 2, B);
      fe(c, 14, -21, 7.5, 4.8, B); fe(c, 12.5, -22.5, 4, 2, "#f6f2e3");
      c.save(); c.translate(17, -19); c.rotate(-0.35 - Math.sin(T * 2) * 0.2);
      sl(c, B, 5, [0, 0, 4, 10]); sl(c, B, 4.4, [4, 10, 10, 17]); fc(c, 4, 10, 2.8, Bs);
      for (i = 0; i < 3; i++) sl(c, Bs, 1.6, [9.5, 16.5, 12.5 + i * 1.6, 21.5 - i * 0.6]);
      c.restore();
      fe(c, 2, -27, 3.4, 2.6, Bs);
      sl(c, "#8f866d", 4.4, [-5, -40, -13, -44, -18, -38, -15, -32]); sl(c, "#b8ad8e", 1.2, [-6, -41.5, -13, -45.5, -18.5, -40]);
      fe(c, 4, -35, 12, 10, B); fp(c, B, [8, -41, 22.5, -35, 21.5, -28, 8, -26.5]);
      fe(c, 6, -29, 10.5, 3.6, Bs); fe(c, 0, -40.5, 6, 3.4, "#f8f5e8"); fe(c, -2, -41.5, 2, 1.1, "#fff");
      sl(c, "#d8cfae", 4, [1, -44, -4, -51, -11, -52, -14, -47]); sl(c, "#f3ecd4", 1.1, [0.5, -45.5, -4.5, -52, -10.5, -53]); fc(c, -14, -47, 1.8, "#8f866d");
      var jaw = b.state === "charge" ? 2.5 : 0;
      fe(c, 7.2, -36, 3.5, 3.1, "#160f09"); fe(c, 14.3, -35, 2.7, 2.5, "#160f09");
      fc(c, 7.6, -36, 1.4, "#fbbf24"); fc(c, 14.4, -35, 1.1, "#fbbf24");
      fe(c, 20.5, -33, 1, 1.5, "#160f09");
      fp(c, Bs, [4, -28 + jaw, 20, -29 + jaw, 19.5, -23.5 + jaw, 6, -22.5 + jaw]);
      for (i = 0; i < 4; i++) { fp(c, "#f8f5e8", [8 + i * 3, -28.7, 9.3 + i * 3, -25.8, 10.6 + i * 3, -28.7]); fp(c, "#f8f5e8", [8.5 + i * 3, -28 + jaw, 9.8 + i * 3, -30.5 + jaw, 11 + i * 3, -28 + jaw]); }
      sl(c, Bd, 0.8, [0, -44, 2.5, -38.5, -0.5, -34]);
      fe(c, -1, -44.2, 6.5, 2.5, moss); fe(c, -3, -45, 3, 1.4, mossL); fc(c, 2.5, -45.5, 0.9, "#f5f5f4"); sl(c, moss, 1, [-5, -43, -6, -37, -5, -33]);
    } else if (id === "matriarch") {
      var C1 = "#1b2536", C2 = "#334155", C3 = "#7c8ba3", M = "#22d3ee";
      for (var side = -1; side <= 1; side += 2) for (i = 0; i < 4; i++) {
        var la = Math.sin(t * 8 + i * 1.3 + (side > 0 ? 0 : Math.PI)) * 3;
        var hx = side * 5, hy = -3 + i * 3, kx = side * (16 + i * 2.5), ky = -16 + i * 6 - Math.abs(la) * 0.6, ftx = side * (27 + i * 1.5), fty = 5 + i * 6 + la;
        sl(c, C1, 3.4, [hx, hy, kx, ky, ftx, fty]); sl(c, C3, 0.9, [hx, hy - 0.8, kx, ky - 1.2]); sl(c, C2, 1, [kx, ky - 0.4, ftx - side * 0.5, fty - 1]);
        fc(c, kx, ky, 1.8, C2); fp(c, "#cbd5e1", [ftx - 1, fty - 1, ftx + side * 1.5, fty + 2.5, ftx + 1, fty - 1]);
      }
      fe(c, -6, 8, 18, 14, C1); fe(c, -9, 3, 11.5, 7, C2); fe(c, -13, -0.5, 4, 2.2, C3);
      for (i = 0; i < 4; i++) { c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 0.8; c.beginPath(); c.ellipse(-6, 8, 18 - i * 4, 14 - i * 3.3, 0, 0.3, Math.PI - 0.3); c.stroke(); }
      fp(c, M, [-10.5, 3.5, -3.5, 3.5, -5.6, 8, -3.5, 12.5, -10.5, 12.5, -8.4, 8]); fp(c, "#a5f3fc", [-9.2, 4.2, -4.8, 4.2, -6.6, 7.2]);
      fc(c, -15, 10, 1.3, M); fc(c, 2, 10, 1.3, M); fc(c, -6.8, 16.5, 1.1, M);
      fe(c, 8, -6, 11, 9, C1); fe(c, 6, -9.4, 6.4, 4, C2); fe(c, 4, -11, 2.6, 1.3, C3);
      fp(c, "#cbd5e1", [1.6, -12.5, 2.8, -21.5, 5.2, -13.5]); fp(c, "#e2e8f0", [5.6, -14, 8, -24, 10.4, -14.5]); fp(c, "#cbd5e1", [10, -13.8, 13.4, -20.5, 13.8, -12.2]);
      fp(c, "#94a3b8", [8, -24, 10.4, -14.5, 8.8, -14.4]);
      [[10, -10, 1.8], [14, -9, 1.6], [12, -6.3, 1.3], [16.2, -6, 1.1], [8.4, -7, 1.1], [15.2, -11.6, 1]].forEach(function (q) { fc(c, q[0], q[1], q[2], M); fr(c, q[0] - q[2] * 0.5, q[1] - q[2] * 0.6, 0.6, 0.6, "#ecfeff"); });
      fp(c, "#e2e8f0", [11.6, -1.4, 13.8, 7, 15.4, -1.2]); fp(c, "#cbd5e1", [16, -2.2, 19.2, 5, 19.6, -3.2]); fc(c, 13.9, 7.8, 0.9, "#67e8f9");
    } else if (id === "lich") {
      c.translate(0, hov);
      var R1 = "#1e1b4b", R2 = "#2e2a6e", R3 = "#110e30";
      c.fillStyle = R1; c.beginPath(); c.moveTo(-8, -8); c.lineTo(8, -8); c.lineTo(15, 17);
      for (i = 0; i <= 6; i++) { var xx = 15 - i * 5, yy = (i % 2 ? 15 : 22) + Math.sin(T * 4 + i) * 2.5; c.lineTo(xx, yy); }
      c.lineTo(-15, 17); c.closePath(); c.fill();
      fp(c, R2, [-8, -8, -3, -8, -8, 19, -14, 17]); fp(c, R3, [4, -8, 8, -8, 15, 17, 9, 19]);
      sl(c, "#7c3aed", 0.9, [-8, -8, -15, 17]); sl(c, "#7c3aed", 0.9, [8, -8, 15, 17]);
      fp(c, "#0b0820", [-3, -6, 4, -6, 3, 6, -2, 6]);
      for (i = 0; i < 3; i++) { c.strokeStyle = "#d6d3d1"; c.lineWidth = 0.8; c.beginPath(); c.ellipse(0.5, -4 + i * 2.6, 3, 1.2, 0, 0.2, Math.PI - 0.2); c.stroke(); }
      sl(c, "#d4a017", 1.4, [-7, 1, 7, 4.5]); fc(c, 0, 2.7, 1.2, "#dc2626");
      fp(c, "#312e81", [-13, -9, -10, -19, -6, -11, 0, -9, 6, -11, 10, -19, 13, -9, 0, -5]); sl(c, "#a78bfa", 0.7, [-13, -9, -10, -19, -6, -11]); sl(c, "#a78bfa", 0.7, [6, -11, 10, -19, 13, -9]);
      fp(c, "#312e81", [8, -8, 14, -4, 12.5, -1, 7, -4]); fc(c, 14.2, -3.2, 1.9, "#d6d3d1");
      fp(c, "#2e2a6e", [-8, -8, -13, -2, -11, 0, -7, -4]); fc(c, -12.2, -1.2, 1.6, "#d6d3d1");
      sl(c, "#3b2412", 2.3, [15, 20, 15, -25]); sl(c, "#6b4423", 0.7, [14.4, 18, 14.4, -23]);
      fc(c, 15, -27, 3.3, "#e7e5e4"); fr(c, 13.6, -27.8, 1, 1, "#1c1917"); fr(c, 15.6, -27.8, 1, 1, "#1c1917");
      sl(c, "#3b2412", 1, [12.5, -28.5, 12.5, -33, 14, -36]); sl(c, "#3b2412", 1, [17.5, -28.5, 17.5, -33, 16, -36]);
      var orb = 3.2 + Math.sin(T * 6) * 0.6; fc(c, 15, -32, orb, "#7e22ce"); fc(c, 15, -32, orb * 0.65, "#c084fc"); fc(c, 14.2, -32.8, 1.1, "#faf5ff");
      fc(c, 0, -15, 6.8, "#e7e5e4"); fe(c, -2.2, -17.6, 3, 2, "#fafaf9"); fe(c, 3, -11.8, 2, 1.2, "#a8a29e");
      fe(c, -2.2, -15.5, 1.9, 1.7, "#0b0512"); fe(c, 3, -15.5, 1.9, 1.7, "#0b0512"); fc(c, -2.2, -15.5, 0.9, "#e9d5ff"); fc(c, 3, -15.5, 0.9, "#e9d5ff");
      fp(c, "#0b0512", [0.4, -13.2, -0.4, -11.8, 1.2, -11.8]); for (i = 0; i < 5; i++) fr(c, -2.6 + i * 1.3, -10, 0.8, 1.6, "#d6d3d1");
      fr(c, -3, -10.4, 6.4, 0.5, "#57534e");
      fp(c, "#d4a017", [-7.6, -19, -8.6, -27, -5, -22.6, -2.6, -29.4, 0, -23, 2.6, -29.4, 5, -22.6, 8.6, -27, 7.6, -19]);
      fp(c, "#fde047", [-7.6, -19, -8.6, -27, -5, -22.6, -2.6, -29.4, -1.6, -22, -3, -19]);
      fr(c, -7.6, -21.2, 15.2, 2.3, "#a16207"); fr(c, -7.6, -21.2, 15.2, 0.6, "#fde68a");
      fc(c, 0, -20.1, 1.3, "#dc2626"); fc(c, -4.6, -20.1, 0.95, "#a855f7"); fc(c, 4.6, -20.1, 0.95, "#a855f7");
      fc(c, -8.6, -27, 1, "#fde047"); fc(c, -2.6, -29.4, 1, "#fde047"); fc(c, 2.6, -29.4, 1, "#fde047"); fc(c, 8.6, -27, 1, "#fde047");
    } else if (id === "dragon") {
      var fly = !!b.fly, wf = Math.sin(t * (fly ? 12 : 3)) * (fly ? 12 : 4), br = b.state === "breath";
      var R1 = "#6b1414", R2 = "#991b1b", R3 = "#b91c1c", R4 = "#e0463a", Bel = "#f59e0b", Bel2 = "#b45309";
      var wing = function (sx, dark) {
        c.save(); c.scale(sx, 1);
        var e1x = 22, e1y = -26 - wf * 0.6;
        fp(c, dark ? "#4a0c0e" : "#7a1518", [6, -10, e1x, e1y, 44, -33 - wf, 37, -23 - wf * 0.75, 39, -14 - wf * 0.5, 32, -9 - wf * 0.35, 29, -2 - wf * 0.25, 16, 2]);
        fp(c, dark ? "#5e1114" : "#a3242a", [8, -11, e1x, e1y, 44, -33 - wf, 31, -21 - wf * 0.6, 15, -6]);
        sl(c, dark ? "#2e0707" : "#5c0f10", 2.1, [6, -10, e1x, e1y, 44, -33 - wf]); sl(c, dark ? "#2e0707" : "#5c0f10", 1.2, [e1x, e1y, 39, -14 - wf * 0.5]); sl(c, dark ? "#2e0707" : "#5c0f10", 1.2, [e1x, e1y, 29, -2 - wf * 0.25]);
        fp(c, "#e7e5e4", [e1x - 1, e1y, e1x - 0.5, e1y - 4, e1x + 1.5, e1y - 0.5]);
        c.restore();
      };
      wing(-1, true); wing(1, false);
      var tw = Math.sin(T * 3) * 4;
      c.fillStyle = R2; c.beginPath(); c.moveTo(-10, 10); c.quadraticCurveTo(-30, 24, -44, 14 + tw); c.lineTo(-40, 19 + tw * 0.5); c.quadraticCurveTo(-28, 28, -6, 18); c.closePath(); c.fill();
      fp(c, R1, [-44, 14 + tw, -53, 9 + tw, -48, 18 + tw, -40, 19 + tw * 0.5]);
      for (i = 0; i < 4; i++) { var tx = -14 - i * 7, ty = 14 + i * 2.2 + tw * i * 0.18; fp(c, "#3f0a0a", [tx - 2, ty, tx, ty - 3.5, tx + 1.5, ty + 0.5]); }
      fe(c, -10, 14, 6, 7, R1); fp(c, "#f5f5f4", [-14, 20, -12.5, 23, -11, 20]); fp(c, "#f5f5f4", [-10, 20.5, -8.5, 23.5, -7, 20.5]);
      fe(c, 0, 4, 20, 15, R2); fe(c, -4, -3, 13, 7, R3); fe(c, -8, -6, 5, 2.4, R4);
      c.save(); c.beginPath(); c.ellipse(4, 9, 11, 8.5, 0, 0, TAU); c.clip();
      fr(c, -8, 0, 24, 20, Bel); fe(c, 1, 4, 6, 3, "#fcd34d"); for (i = 0; i < 5; i++) sl(c, Bel2, 0.9, [-8, 2.5 + i * 3.5, 16, 2.5 + i * 3.5]);
      c.restore();
      for (i = 0; i < 5; i++) fp(c, "#3f0a0a", [-15 + i * 5, -8 + i * 0.3 - (i > 2 ? (i - 2) * 1.5 : 0), -13 + i * 5, -13 - (i > 2 ? (i - 2) * 1.5 : 0), -11 + i * 5, -8.6 - (i > 2 ? (i - 2) * 1.5 : 0)]);
      fe(c, 10, 15, 5, 6.5, R3); fp(c, "#f5f5f4", [10, 20.5, 11.5, 23.5, 13, 20.5]); fp(c, "#f5f5f4", [13, 20, 15, 23, 16, 19.5]);
      c.fillStyle = R2; c.beginPath(); c.moveTo(8, -6); c.quadraticCurveTo(12, -20, 20, -24); c.lineTo(27, -17); c.quadraticCurveTo(18, -12, 16, 0); c.closePath(); c.fill();
      sl(c, Bel, 2.2, [14.5, -3, 17, -13, 22, -18.5]); sl(c, Bel2, 0.6, [15.5, -6, 16.8, -9]); sl(c, Bel2, 0.6, [17.5, -12.5, 19, -14.5]);
      fp(c, "#3f0a0a", [9.5, -12, 9, -17, 12, -14]); fp(c, "#3f0a0a", [13, -19, 13.5, -24, 16, -20.5]);
      fe(c, 27, -21, 10, 6.5, R3, 0.2); fe(c, 24, -24, 5, 2.2, R4);
      fp(c, R3, [30, -25, 41, -21.5, 41.5, -17.5, 30, -16]); fp(c, R4, [30, -25, 41, -21.5, 35, -22]);
      if (br) {
        fp(c, R2, [28, -16.5, 40, -9, 38, -7.5, 27, -13]); fp(c, "#2a0303", [30, -17, 41.5, -17.2, 40, -10.5]);
        fp(c, "#f5f5f4", [33, -17, 34, -15, 35, -17]); fp(c, "#f5f5f4", [37, -17, 38, -15, 39, -17]);
      } else {
        fp(c, R2, [28, -17, 40.5, -16.5, 39.5, -14, 28, -14]); fp(c, "#f5f5f4", [33, -16.8, 34, -15, 35, -16.8]); fp(c, "#f5f5f4", [37, -16.6, 38, -14.9, 39, -16.6]);
      }
      fp(c, "#d6d3d1", [21, -26, 11, -37, 24, -28]); fp(c, "#e7e5e4", [25, -27, 21, -40, 29.5, -27]); fp(c, "#a8a29e", [21, -40, 23, -33, 29.5, -27]);
      fp(c, "#3f0a0a", [20, -20, 13.5, -18, 20, -16.5]);
      fe(c, 30.4, -22.5, 2.3, 1.5, "#1a0505"); fc(c, 30.6, -22.5, 1.2, b.phase === 2 ? "#fde047" : "#f97316"); fr(c, 30.4, -23.4, 0.45, 1.8, "#1a0505");
      fc(c, 39.2, -21, 0.7, "#1a0505");
    }
  }

  // ============================================================ rendering: props & relics
  var PROPBOX = { w: 36, h: 34, ax: 18, ay: 22 };
  var ROCKS = [[-11, 7, -10, -3, -4, -9, 5, -8, 11, -1, 10, 7], [-12, 7, -11, 0, -6, -7, 2, -10, 8, -6, 12, 2, 10, 7], [-10, 7, -11, -1, -7, -6, -1, -7, 4, -10, 10, -4, 11, 7], [-11, 7, -11, -4, -3, -8, 9, -7, 11, 0, 10, 7]];
  var ROCKPAL = { moss: ["#77736a", "#a09c90", "#4a4740"], water: ["#566078", "#8390aa", "#343b4d"], rune: ["#2e2640", "#4d4270", "#17121f"], lava: ["#3b2a24", "#5c4236", "#1f1512"] };
  var LEAFPAL = { moss: ["#2f4d0c", "#4d7c0f", "#84cc16"], water: ["#0b4f4a", "#0f766e", "#2dd4bf"], rune: ["#3b1877", "#6d28d9", "#a78bfa"], lava: ["#3a3530", "#57534e", "#8a847c"] };
  function drawProp(c, pr) {
    var R = F.info.R, sh = pr.flash > 0 ? rr(-1.5, 1.5) : 0; if (pr.flash > 0) pr.flash -= 1 / 60;
    c.save(); c.translate(pr.x + sh, pr.y);
    fe(c, 0, 8, 11.5, 4, "rgba(0,0,0,.42)");
    var vi = Math.floor(pr.v * 4) % 4, fl = pr.flash > 0, rock = pr.kind === "rock";
    if (!rock && !reduceMotion) { var sway = Math.sin(G.t * 2 + pr.v * 9) * 0.07; c.transform(1, 0, sway, 1, -sway * 8, 0); }
    sprite(c, "pr" + (rock ? "r" + pr.hp : "s") + R.deco + vi + (pr.v < 0.25 ? "g" : "") + (pr.v > 0.6 ? "b" : "") + (fl ? "F" : ""), PROPBOX,
      function (s) { propFigure(s, rock, R.deco, vi, pr.hp, pr.v); }, { tint: fl ? "rgba(255,255,255,.7)" : null });
    c.restore();
  }
  function propFigure(s, rock, deco, vi, hp, v) {
    var i;
    if (rock) {
      var pal = ROCKPAL[deco] || ROCKPAL.moss, pts = ROCKS[vi];
      fp(s, pal[0], pts);
      s.save(); s.beginPath(); s.moveTo(pts[0], pts[1]); for (i = 2; i < pts.length; i += 2) s.lineTo(pts[i], pts[i + 1]); s.closePath(); s.clip();
      fe(s, -4, -8, 10, 6, pal[1]); fe(s, -6, -8, 3.5, 2, shade(pal[1], 0.2)); fe(s, 9, 7, 9, 7, pal[2]);
      sl(s, pal[2], 0.8, [-10, 1, -3, -1, 3, -4]);
      s.restore();
      var dmg = 3 - hp;
      if (dmg >= 1) { sl(s, "#0d0806", 1, [-2, -8, 1, -2, -1, 3]); sl(s, "rgba(255,255,255,.18)", 0.5, [-1.4, -8, 1.6, -2]); }
      if (dmg >= 2) { sl(s, "#0d0806", 1, [8, -1, 3, 1, 5, 6]); fr(s, 6, 2, 1.5, 1.5, pal[2]); }
      if (v < 0.25) { fr(s, 4, 2, 1.8, 1.8, "#fbbf24"); fr(s, -5, 3, 1.2, 1.2, "#fde68a"); }
      if (deco === "moss") { fe(s, -3, -8, 6, 2.2, "#4d7c0f"); fe(s, -4, -8.8, 3, 1, "#84cc16"); }
      else if (deco === "water" && vi % 2) { fp(s, "#0e7490", [2, -6, 4, -14, 6, -6]); fp(s, "#67e8f9", [3, -6, 4, -14, 4.2, -6]); fp(s, "#0e7490", [5.5, -5, 9, -11, 8.5, -4]); }
      else if (deco === "rune") { sl(s, "#c084fc", 0.9, [-4, -3, -1, 1, 2, -3]); fc(s, -1, -4, 0.8, "#f3e8ff"); }
      else if (deco === "lava") { sl(s, "#ea580c", 1, [-6, 4, -2, 0, 3, 2, 7, -2]); sl(s, "#fde68a", 0.4, [-2, 0, 3, 2]); }
    } else {
      var L = LEAFPAL[deco] || LEAFPAL.moss;
      if (deco === "rune") {
        var cr = [[-6, 6, -8, -6, 2.6], [-1, 6, 0, -12, 3.2], [5, 6, 7, -5, 2.6], [2, 6, 4, -8, 2], [-4, 6, -4, -3, 2]];
        for (i = 0; i < cr.length; i++) { var q = cr[i], dx = q[2] - q[0], dy = q[3] - q[1], L2 = Math.sqrt(dx * dx + dy * dy), nx = -dy / L2 * q[4], ny = dx / L2 * q[4];
          fp(s, L[0], [q[0] - nx, q[1] - ny, q[0] + nx, q[1] + ny, q[2], q[3]]); fp(s, L[1], [q[0] - nx, q[1] - ny, q[0], q[1], q[2], q[3]]); sl(s, L[2], 0.6, [q[0] - nx * 0.5, q[1] - ny * 0.5, q[2], q[3]]); }
        fe(s, 0, 6, 8, 2.2, "#1e1030"); fc(s, 0, -10.5, 0.8, "#f5f3ff");
      } else if (deco === "lava") {
        sl(s, "#2a1d16", 1.4, [0, 7, -1, -2, -6, -9]); sl(s, "#2a1d16", 1.2, [-1, -2, 5, -10]); sl(s, "#2a1d16", 1, [0, 3, 8, -3]); sl(s, "#2a1d16", 1, [-1, 1, -9, -2]);
        fc(s, -6, -9, 1.3, "#f97316"); fc(s, 5, -10, 1.1, "#fb923c"); fc(s, 8, -3, 1, "#f97316");
        fe(s, 0, 5, 8, 3.5, L[1]); fe(s, -2, 4, 4, 1.6, L[2]);
      } else {
        fc(s, -5, 1, 7, L[0]); fc(s, 5, 2, 7, L[0]); fc(s, 0, -5, 8, L[0]);
        fc(s, -5.5, -0.5, 5.5, L[1]); fc(s, 4.5, 0.5, 5.5, L[1]); fc(s, -0.5, -6, 6, L[1]);
        for (i = 0; i < 5; i++) fe(s, -6 + i * 3, -9 + (i % 2) * 3 + Math.abs(i - 2), 1.8, 1, L[2], -0.6 + i * 0.3);
        fc(s, -3, -7, 2.4, L[2]); fc(s, 3.5, -3.5, 2, L[2]);
        if (deco === "water") { fe(s, -6, 3, 3.4, 2, "#5eead4"); fr(s, -6.4, 3, 0.8, 4, "#99f6e4"); fe(s, 6, 4, 2.6, 1.6, "#5eead4"); fr(s, 5.7, 4, 0.7, 3, "#99f6e4"); }
        if (v > 0.6) { fc(s, -4, 2, 1.5, deco === "rune" ? "#f0abfc" : "#dc2626"); fc(s, 3, -1, 1.5, deco === "rune" ? "#f0abfc" : "#dc2626"); fc(s, 0.5, 3.5, 1.3, deco === "rune" ? "#f0abfc" : "#dc2626"); fr(s, -4.6, 1.3, 0.6, 0.6, "#fff"); fr(s, 2.4, -1.7, 0.6, 0.6, "#fff"); }
      }
    }
  }
  function drawFeather(c, x, y, t) {
    var T = reduceMotion ? 0 : t;
    c.save(); c.translate(x, y);
    glow(c, 0, 0, 22, "#fb923c", 0.6 + 0.2 * Math.sin(T * 3)); glow(c, 0, 0, 10, "#f472b6", 0.4);
    c.rotate(Math.sin(T * 2) * 0.25);
    var g = c.createLinearGradient(0, -12, 0, 12); g.addColorStop(0, "#fef08a"); g.addColorStop(0.45, "#f97316"); g.addColorStop(1, "#db2777");
    c.fillStyle = g; c.beginPath(); c.moveTo(0, -12); c.bezierCurveTo(8, -6, 6.5, 4, 1, 11); c.bezierCurveTo(-5, 4, -7.5, -6, 0, -12); c.fill();
    c.strokeStyle = "#4a1206"; c.lineWidth = 0.8; c.stroke();
    for (var i = 0; i < 5; i++) { sl(c, "rgba(124,45,18,.55)", 0.5, [0.3, -7 + i * 3.4, 4.5, -9 + i * 3.4]); sl(c, "rgba(124,45,18,.55)", 0.5, [0.1, -6 + i * 3.4, -4, -8 + i * 3.4]); }
    fe(c, -2, -5, 1.2, 3, "rgba(255,255,255,.55)", 0.3);
    sl(c, "#fff7ed", 0.9, [0, -11, 0.4, 5, 1.2, 14]);
    c.fillStyle = "#fef9c3"; for (i = 0; i < 3; i++) { var a = T * 1.5 + i * 2.1; star(c, Math.cos(a) * 11, Math.sin(a) * 8, 1.6 + Math.sin(T * 4 + i)); }
    c.restore();
  }

  // ---- pickups (drawn directly; tiny)
  var CHESTBOX = { w: 40, h: 36, ax: 20, ay: 18 };
  function drawPickup(pk) {
    var b = reduceMotion ? 0 : Math.sin(pk.t * 5) * 2, x = pk.x, y = pk.y;
    if (pk.type === "gold") {
      var sx = Math.abs(Math.cos(pk.t * 6)) * 3.6 + 0.7;
      fe(ctx, x, y + 5, 3, 1, "rgba(0,0,0,.35)");
      fe(ctx, x, y + b, sx + 0.6, 4.2, "#5c3a05"); fe(ctx, x, y + b, sx, 3.6, "#f5b73b"); fe(ctx, x - sx * 0.2, y + b - 0.6, sx * 0.55, 2.4, "#fde68a");
      if (sx > 2.5) fr(ctx, x - 0.4, y + b - 1.6, 0.8, 3.2, "#b7791f");
      if (frac(pk.t * 0.7 + x * 0.013) < 0.08) { ctx.fillStyle = "#fffbeb"; star(ctx, x + 2, y + b - 3, 2.2); }
    } else if (pk.type === "heart") {
      glow(ctx, x, y + b, 12, "#ef4444", 0.35);
      var hp = function (o) { ctx.beginPath(); ctx.moveTo(x, y + 5.5 + b + o); ctx.bezierCurveTo(x - 8.5 - o, y - 1 + b, x - 4.5, y - 7.5 + b - o, x, y - 3 + b); ctx.bezierCurveTo(x + 4.5, y - 7.5 + b - o, x + 8.5 + o, y - 1 + b, x, y + 5.5 + b + o); };
      hp(1); ctx.fillStyle = "#3b0707"; ctx.fill(); hp(0); ctx.fillStyle = "#dc2626"; ctx.fill();
      fe(ctx, x - 3, y - 2.5 + b, 1.8, 1.2, "#fca5a5", -0.6); fr(ctx, x - 3.6, y - 3.4 + b, 0.8, 0.8, "#fff");
    } else if (pk.type === "mana") {
      glow(ctx, x, y + b, 13, "#3b82f6", 0.5);
      fp(ctx, "#0b1a3d", [x, y - 7.2 + b, x + 5, y + b, x, y + 7.2 + b, x - 5, y + b]);
      fp(ctx, "#2563eb", [x, y - 6 + b, x + 4, y + b, x, y + 6 + b, x - 4, y + b]);
      fp(ctx, "#93c5fd", [x, y - 6 + b, x - 4, y + b, x, y + b]); fp(ctx, "#1e40af", [x, y + b, x + 4, y + b, x, y + 6 + b]);
      fr(ctx, x - 1.6, y - 3 + b, 0.9, 0.9, "#eff6ff");
    } else if (pk.type === "chest") {
      fe(ctx, x, y + 10, 14, 4, "rgba(0,0,0,.4)");
      ctx.save(); ctx.translate(x, y); sprite(ctx, "chest", CHESTBOX, chestFigure); ctx.restore();
      var g = 0.5 + 0.5 * Math.sin(pk.t * 3);
      glow(ctx, x, y - 5, 18, "#fbbf24", 0.25 + g * 0.3); fr(ctx, x - 11, y - 5.5, 22, 1, "rgba(254,243,199," + (0.4 + g * 0.5) + ")");
    } else if (pk.type === "trophy") drawTrophy(ctx, pk.trophy.id, x, y - 6 + b, 0.6, pk.t, pk.trophy.loop);
    else if (pk.type === "feather") drawFeather(ctx, x, y - 4 + b, pk.t);
  }
  function chestFigure(c) {
    fr(c, -12, -5, 24, 15, "#7a3b12"); fr(c, -12, -5, 24, 1, "#a45a24"); fr(c, 6, -5, 6, 15, "#5a2a0c");
    for (var i = 0; i < 3; i++) fr(c, -12, -1 + i * 4, 24, 0.6, "#4a2208");
    c.fillStyle = "#8f4a1a"; c.beginPath(); c.moveTo(-12, -5); c.lineTo(-12, -9); c.quadraticCurveTo(0, -14, 12, -9); c.lineTo(12, -5); c.closePath(); c.fill();
    c.fillStyle = "#b86a32"; c.beginPath(); c.moveTo(-12, -8.4); c.quadraticCurveTo(0, -13.4, 12, -8.4); c.lineTo(12, -9.4); c.quadraticCurveTo(0, -14.2, -12, -9.4); c.closePath(); c.fill();
    fr(c, -9.5, -12, 2.6, 22, "#52525b"); fr(c, 7, -12, 2.6, 22, "#3f3f46"); fr(c, -9.5, -12, 0.9, 22, "#a1a1aa");
    fr(c, -12, -5.6, 24, 2, "#d4a017"); fr(c, -12, -5.6, 24, 0.6, "#fde68a");
    fr(c, -2.4, -6.5, 4.8, 6, "#f5b73b"); fr(c, -2.4, -6.5, 1.3, 6, "#fde68a"); fr(c, -0.6, -4, 1.2, 2.2, "#1c1005");
  }

  // ============================================================ rendering: trophies
  function metal(c, x0, y0, x1, y1, stops) { var g = c.createLinearGradient(x0, y0, x1, y1); for (var i = 0; i < stops.length; i++) g.addColorStop(i / (stops.length - 1), stops[i]); return g; }
  function drawTrophy(c, id, x, y, s, t, loop) {
    var T = reduceMotion ? 0 : t;
    c.save(); c.translate(x, y); c.scale(s, s);
    var gcol = id === "dragon" ? "#f97316" : id === "lich" ? "#facc15" : id === "matriarch" ? "#cbd5e1" : "#d97706";
    glow(c, 0, -2, 42, gcol, 0.55);
    c.save(); c.globalAlpha *= 0.12; c.fillStyle = gcol;
    for (var r = 0; r < 8; r++) { var ra = T * 0.3 + r / 8 * TAU; c.beginPath(); c.moveTo(0, -2); c.lineTo(Math.cos(ra - 0.08) * 40, -2 + Math.sin(ra - 0.08) * 40); c.lineTo(Math.cos(ra + 0.08) * 40, -2 + Math.sin(ra + 0.08) * 40); c.closePath(); c.fill(); }
    c.restore();
    // plinth
    fp(c, "#1f1812", [-17, 27, 17, 27, 15, 20, -15, 20]); fr(c, -17, 26, 34, 2, "#120d09");
    fr(c, -13, 15.5, 26, 5, "#5a4330"); fr(c, -13, 15.5, 26, 1.2, "#8a6a4c"); fr(c, 8, 15.5, 5, 5, "#3e2e20");
    fr(c, -5.5, 21.6, 11, 3, "#c28a12"); fr(c, -5.5, 21.6, 11, 0.8, "#fde68a");
    c.save(); c.rotate(Math.sin(T * 1.5) * 0.04);
    c.lineJoin = "round";
    if (id === "colossus") {
      var br = ["#fde2b0", "#e0a15a", "#a8611f", "#5c3008"];
      c.strokeStyle = "#2a1404"; c.lineWidth = 1.2;
      c.fillStyle = metal(c, -14, -18, 12, 14, ["#e0a15a", "#a8611f", "#5c3008"]);
      c.beginPath(); c.moveTo(-6, -12); c.bezierCurveTo(-16, -18, -24, -10, -20, -2); c.bezierCurveTo(-18, 2, -14, 0, -13, -4); c.bezierCurveTo(-14, -8, -10, -10, -7, -7); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(6, -12); c.bezierCurveTo(16, -18, 24, -10, 20, -2); c.bezierCurveTo(18, 2, 14, 0, 13, -4); c.bezierCurveTo(14, -8, 10, -10, 7, -7); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = metal(c, -12, -16, 12, 14, br);
      c.beginPath(); c.arc(0, -3, 13.5, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(8, 9); c.lineTo(8, 14); c.lineTo(-8, 14); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
      fe(c, -5, -9, 5, 3, "rgba(255,245,220,.55)"); fe(c, -6.5, -10, 1.6, 0.9, "#fff");
      fe(c, -5.2, -1, 4, 3.6, "#1c0c02"); fe(c, 5.2, -1, 4, 3.6, "#1c0c02"); fc(c, -5, -1, 1.3, "#fbbf24"); fc(c, 5, -1, 1.3, "#fbbf24");
      fp(c, "#1c0c02", [0, 3, -1.8, 6.5, 1.8, 6.5]);
      for (var i = 0; i < 5; i++) { fr(c, -6.5 + i * 2.8, 9.5, 2, 4, i % 2 ? "#e0a15a" : "#fde2b0"); fr(c, -6.5 + i * 2.8, 13, 2, 0.8, "#5c3008"); }
      sl(c, "#5c3008", 0.8, [2, -16, 4, -11, 2, -7]);
    } else if (id === "matriarch") {
      c.strokeStyle = "#1e293b"; c.lineWidth = 1.1;
      c.fillStyle = metal(c, -8, -20, 8, 16, ["#ffffff", "#cbd5e1", "#64748b", "#334155"]);
      c.beginPath(); c.moveTo(-8, -18); c.quadraticCurveTo(11, -8, 3, 16); c.quadraticCurveTo(-3, 1, -9, -12); c.closePath(); c.fill(); c.stroke();
      fp(c, "rgba(255,255,255,.7)", [-7, -16, 3, -8, 0, -9, -6.5, -13]);
      for (i = 0; i < 3; i++) sl(c, "rgba(51,65,85,.6)", 0.6, [-6 + i * 2.5, -12 + i * 5, -2 + i * 2.2, -13 + i * 5.2]);
      c.fillStyle = "#4a2a12"; c.beginPath(); c.moveTo(-10, -19); c.lineTo(-5, -21); c.lineTo(-3, -16); c.lineTo(-8, -13); c.closePath(); c.fill(); c.stroke();
      fr(c, -9.6, -18.5, 6, 1.4, "#d4a017");
      glow(c, 3, 15, 7, "#22d3ee", 0.8); fc(c, 3, 14.5, 2.4, "#06b6d4"); fc(c, 2.3, 13.8, 0.9, "#ecfeff");
      var dp = frac(T * 0.6); fc(c, 3, 17 + dp * 5, 1 - dp * 0.5, "rgba(103,232,249," + (1 - dp) + ")");
    } else if (id === "lich") {
      c.strokeStyle = "#3a2303"; c.lineWidth = 1.1;
      fe(c, 0, 9, 18, 4, "#6b4506");
      c.fillStyle = metal(c, -18, -16, 14, 12, ["#fffbe0", "#fcd34d", "#d4a017", "#8a5a05", "#4a2e02"]);
      c.beginPath(); c.moveTo(-18, 10); c.lineTo(-19, -9); c.lineTo(-10, -1); c.lineTo(-5, -12); c.lineTo(0, -17); c.lineTo(5, -12); c.lineTo(10, -1); c.lineTo(19, -9); c.lineTo(18, 10); c.quadraticCurveTo(0, 14, -18, 10); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = metal(c, 0, 5, 0, 12, ["#fde68a", "#b45309"]); c.beginPath(); c.moveTo(-18, 5); c.quadraticCurveTo(0, 8.5, 18, 5); c.lineTo(18, 10); c.quadraticCurveTo(0, 14, -18, 10); c.closePath(); c.fill(); c.stroke();
      [[-19, -9], [0, -17], [19, -9], [-5, -12], [5, -12]].forEach(function (q, j) { fc(c, q[0], q[1] - 1.5, j < 3 ? 2 : 1.4, "#fde68a"); fc(c, q[0] - 0.5, q[1] - 2, 0.7, "#fff"); });
      glow(c, 0, 1, 8, "#a855f7", 0.7);
      fe(c, 0, 1, 3.6, 4.2, "#6b21a8"); fe(c, 0, 1, 2.6, 3.2, "#a855f7"); fr(c, -1.2, -1.2, 1, 1.4, "#f5d0fe");
      fc(c, -11, 7.8, 2.2, "#b91c1c"); fc(c, 11, 7.8, 2.2, "#b91c1c"); fc(c, -11.6, 7.2, 0.7, "#fecaca"); fc(c, 10.4, 7.2, 0.7, "#fecaca");
      fe(c, -10, -3, 2, 5, "rgba(255,255,255,.4)", 0.2);
    } else {
      var beat = 1 + (reduceMotion ? 0 : Math.max(0, Math.sin(T * 5)) * 0.07); c.scale(beat, beat);
      glow(c, 0, 0, 24, "#ef4444", 0.6);
      var hg = c.createRadialGradient(-4, -6, 1, 0, 0, 20); hg.addColorStop(0, "#fca5a5"); hg.addColorStop(0.3, "#dc2626"); hg.addColorStop(0.8, "#7f1d1d"); hg.addColorStop(1, "#450a0a");
      c.fillStyle = hg; c.strokeStyle = "#2a0505"; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(0, 16); c.bezierCurveTo(-25, 1, -15, -21, 0, -8); c.bezierCurveTo(15, -21, 25, 1, 0, 16); c.fill(); c.stroke();
      sl(c, "rgba(249,115,22,.9)", 1, [-8, -8, -5, -2, -8, 4, -4, 9]); sl(c, "rgba(249,115,22,.9)", 1, [7, -9, 5, -3, 9, 3]); sl(c, "rgba(253,224,71,.9)", 0.5, [-5, -2, -1, 0, 3, -2]);
      glow(c, 0, 1, 9, "#fde047", 0.9); fc(c, 0, 1, 2.6, "#fef9c3");
      fe(c, -8, -8, 2.5, 1.5, "rgba(255,255,255,.55)", -0.6);
      for (i = 0; i < 3; i++) { var fa = T * 2 + i * 2.1, fx0 = Math.cos(fa) * 16, fy0 = Math.sin(fa) * 10 - 2; glow(c, fx0, fy0, 4, "#fb923c", 0.9); fc(c, fx0, fy0, 0.8, "#fef3c7"); }
      c.fillStyle = "#f97316"; c.beginPath(); c.moveTo(-5, -10); c.quadraticCurveTo(-4, -17 - Math.sin(T * 7) * 2, 0, -21 - Math.sin(T * 9) * 2); c.quadraticCurveTo(3, -15, 5, -10); c.closePath(); c.fill();
      c.fillStyle = "#fde047"; c.beginPath(); c.moveTo(-2.5, -10); c.quadraticCurveTo(-1.5, -14, 0, -17 - Math.sin(T * 9) * 1.5); c.quadraticCurveTo(1.5, -13, 2.5, -10); c.closePath(); c.fill();
    }
    c.restore();
    for (i = 0; i < 3; i++) { var sp = frac(T * 0.4 + i * 0.33), sa = 1 - Math.abs(sp * 2 - 1); c.fillStyle = "rgba(255,251,235," + sa + ")"; star(c, -14 + i * 14 + Math.sin(i * 5) * 4, -16 + Math.cos(i * 3) * 8, 1 + sa * 1.6); }
    if (loop) { for (i = 0; i < Math.min(3, loop); i++) { glow(c, -8 + i * 8, -27, 6, "#e879f9", 0.6); c.fillStyle = "#f5d0fe"; star(c, -8 + i * 8, -27, 3.2); c.fillStyle = "#c026d3"; star(c, -8 + i * 8, -27, 1.6); } }
    c.restore();
  }

  // ============================================================ title backdrop layer
  var TBK = null;
  function titleLayer() {
    var k = roomK(); if (TBK && TBK.k === k) return TBK.c;
    var cn = mkCanvas(VW * k, VH * k), c = cn.getContext("2d"), i, x;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.fillStyle = metal(c, 0, 0, 0, VH, ["#07030a", "#140608", "#3a1409", "#7a2e0e"]); c.fillRect(0, 0, VW, VH);
    for (i = 0; i < 90; i++) { var sx = hash(i, 3) * VW, sy = hash(i, 7) * VH * 0.55; fr(c, sx, sy, hash(i, 9) > 0.85 ? 1.5 : 0.8, hash(i, 9) > 0.85 ? 1.5 : 0.8, "rgba(255,236,210," + (0.2 + hash(i, 11) * 0.6) + ")"); }
    var mg = c.createRadialGradient(462, 104, 10, 462, 104, 170); mg.addColorStop(0, "rgba(251,146,60,.45)"); mg.addColorStop(1, "rgba(251,146,60,0)"); c.fillStyle = mg; c.fillRect(0, 0, VW, VH);
    var mo = c.createRadialGradient(448, 90, 4, 462, 104, 40); mo.addColorStop(0, "#fde9cc"); mo.addColorStop(0.7, "#eab98a"); mo.addColorStop(1, "#c9774a");
    c.fillStyle = mo; c.beginPath(); c.arc(462, 104, 40, 0, TAU); c.fill();
    fc(c, 478, 116, 7, "rgba(160,80,40,.35)"); fc(c, 446, 120, 5, "rgba(160,80,40,.3)"); fc(c, 470, 86, 4, "rgba(160,80,40,.3)"); fc(c, 486, 96, 3, "rgba(160,80,40,.25)");
    function ridge(y0, amp, seed, col, step) { c.fillStyle = col; c.beginPath(); c.moveTo(0, VH); for (x = 0; x <= VW + step; x += step) { var n = hash(Math.floor(x / step) + seed, seed) * amp + Math.sin(x * 0.01 + seed) * amp * 0.5; c.lineTo(x, y0 - n); } c.lineTo(VW, VH); c.closePath(); c.fill(); }
    ridge(250, 70, 11, "#2a0f0b", 26);
    c.fillStyle = "rgba(122,46,14,.25)"; c.fillRect(0, 210, VW, 50);
    ridge(275, 50, 23, "#1a0908", 18);
    c.fillStyle = "#0e0506";
    [[70, 190, 26, 110], [120, 215, 18, 70], [520, 180, 30, 130], [575, 210, 20, 80]].forEach(function (tw, j) {
      c.fillRect(tw[0], tw[1], tw[2], tw[3]);
      for (var m = 0; m < tw[2]; m += 6) if ((m / 6 + j) % 2 === 0) c.fillRect(tw[0] + m, tw[1] - 5, 4, 5);
      fr(c, tw[0] + tw[2] / 2 - 2, tw[1] + 16, 4, 8, "rgba(251,146,60,.5)"); c.fillStyle = "#0e0506";
    });
    c.beginPath(); c.moveTo(250, 300); c.lineTo(250, 245); c.quadraticCurveTo(290, 205, 330, 245); c.lineTo(330, 300); c.lineTo(318, 300); c.lineTo(318, 250); c.quadraticCurveTo(290, 222, 262, 250); c.lineTo(262, 300); c.closePath(); c.fill();
    ridge(318, 30, 41, "#060304", 14);
    c.fillStyle = metal(c, 0, 280, 0, VH, ["rgba(120,40,20,0)", "rgba(120,40,20,.25)"]); c.fillRect(0, 280, VW, 80);
    TBK = { k: k, c: cn }; return cn;
  }
  function dragonSilhouette(c, x, y, s, flap) {
    c.save(); c.translate(x, y); c.scale(s, s); c.fillStyle = "#050203";
    c.beginPath(); c.moveTo(-30, 2); c.quadraticCurveTo(-10, -4, 10, 0); c.quadraticCurveTo(22, -6, 30, -4); c.lineTo(34, -2); c.lineTo(28, 1); c.quadraticCurveTo(14, 6, 0, 6); c.quadraticCurveTo(-18, 8, -40, 10); c.lineTo(-46, 6); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-4, 0); c.lineTo(-18, -26 * flap - 4); c.lineTo(-10, -18 * flap - 2); c.lineTo(-2, -30 * flap - 6); c.lineTo(2, -16 * flap); c.lineTo(10, -22 * flap - 2); c.lineTo(8, 0); c.closePath(); c.fill();
    c.restore();
  }

  // ============================================================ render frame
  function render() {
    artK();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#07060a"; ctx.fillRect(0, 0, VW, VH);
    if (!F || !room) { drawTitleBackdrop(); return; }
    if (roomCanvas.width !== VW * roomK()) renderRoomBase();
    ctx.save();
    if (G.shake > 0 && !reduceMotion) ctx.translate(rr(-1, 1) * G.shake * 6, rr(-1, 1) * G.shake * 6);
    ctx.drawImage(roomCanvas, 0, 0, VW, VH);
    drawRoomDynamic();
    lightPass();
    drawAmbient();
    ctx.save(); ctx.translate(OX, OY);
    // telegraphs (bright, above the darkness so they always read)
    teles.forEach(function (tl) {
      var k = tl.t / tl.dur, pulse = 0.5 + 0.5 * Math.sin(tl.t * 18);
      ctx.fillStyle = "rgba(239,68,68," + (0.1 + k * 0.22) + ")"; ctx.strokeStyle = "rgba(254,202,202," + (0.55 + 0.35 * pulse) + ")"; ctx.lineWidth = 1.5;
      if (tl.type === "circle") {
        ctx.beginPath(); ctx.arc(tl.x, tl.y, tl.r, 0, TAU); ctx.fillStyle = "rgba(239,68,68,.08)"; ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(239,68,68," + (0.18 + k * 0.3) + ")"; ctx.beginPath(); ctx.arc(tl.x, tl.y, tl.r * k, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(127,29,29,.8)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tl.x, tl.y, tl.r - 3, 0, TAU); ctx.stroke();
      } else {
        ctx.save(); ctx.translate(tl.x, tl.y); ctx.rotate(tl.a);
        ctx.fillStyle = "rgba(239,68,68,.08)"; ctx.fillRect(0, -tl.w / 2, tl.len, tl.w);
        ctx.fillStyle = "rgba(239,68,68," + (0.18 + k * 0.25) + ")"; ctx.fillRect(0, -tl.w / 2, tl.len * Math.min(1, k * 1.6), tl.w);
        ctx.beginPath(); ctx.moveTo(0, -tl.w / 2); ctx.lineTo(tl.len, -tl.w / 2); ctx.moveTo(0, tl.w / 2); ctx.lineTo(tl.len, tl.w / 2); ctx.stroke();
        ctx.fillStyle = "rgba(254,202,202," + (0.35 + 0.4 * pulse) + ")";
        for (var cv2 = 0; cv2 < 4; cv2++) { var cx2 = 24 + cv2 * 34 + frac(tl.t * 1.5) * 34, hw = Math.min(8, tl.w * 0.3); if (cx2 > tl.len - 10) continue; ctx.beginPath(); ctx.moveTo(cx2, -hw); ctx.lineTo(cx2 + 7, 0); ctx.lineTo(cx2, hw); ctx.lineTo(cx2 + 3, 0); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    });
    pickups.forEach(drawPickup);
    // sort entities by y
    var ents = enemies.slice(); ents.push(P);
    if (room.props) room.props.forEach(function (pr) { if (pr.hp > 0) ents.push(pr); });
    ents.sort(function (a, b) { return a.y - b.y; });
    ents.forEach(function (e) {
      if (e === P) {
        if (P.blocking) {
          var bc = P.id === "knight" ? "253,230,138" : P.id === "ranger" ? "187,247,208" : "216,180,254", ba = 0.35 + 0.5 * (P.breath / P.maxBreath);
          ctx.fillStyle = "rgba(" + bc + ",.1)"; ctx.beginPath(); ctx.moveTo(P.x, P.y - 3); ctx.arc(P.x, P.y - 3, 19, P.aim - P.blockArc, P.aim + P.blockArc); ctx.fill();
        }
        drawHero(ctx, P.id, P.x, P.y, { t: G.t, walk: P.walkT, moving: P.moving || !!P.dash, face: P.face, aim: P.aim, atk: P.atkT > 0 ? P.atkT : 0, cast: P.castT, inv: P.inv > 0 && !P.dash, hurt: P.hurtT, block: P.blocking });
        if (P.blocking) {
          ctx.strokeStyle = "rgba(" + bc + "," + ba + ")"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P.x, P.y - 3, 19, P.aim - P.blockArc, P.aim + P.blockArc); ctx.stroke();
          ctx.strokeStyle = "rgba(255,255,255," + ba * 0.6 + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(P.x, P.y - 3, 21, P.aim - P.blockArc * 0.8, P.aim + P.blockArc * 0.8); ctx.stroke();
        }
        if (P.winded > 0) { ctx.font = "bold 9px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#1c0707"; ctx.strokeText("winded", P.x, P.y - 32); ctx.fillStyle = "#fca5a5"; ctx.fillText("winded", P.x, P.y - 32); }
      }
      else if (e.kind === "rock" || e.kind === "shrub") drawProp(ctx, e);
      else drawEnemy(e);
    });
    // projectiles
    projs.forEach(function (p) {
      var a = Math.atan2(p.vy, p.vx), i;
      if (p.kind === "arrow" || p.kind === "arrowE" || p.kind === "frost") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
        var fro = p.kind === "frost", en = p.kind === "arrowE";
        if (fro) { glow(ctx, 0, 0, 11, "#7dd3fc", 0.7); fr(ctx, -18, -1.2, 9, 2.4, "rgba(186,230,253,.35)"); }
        else fr(ctx, -16, -0.5, 7, 1, en ? "rgba(239,68,68,.25)" : "rgba(255,255,255,.18)");
        fr(ctx, -9.5, -1.2, 13.5, 2.4, "#0d0806"); fr(ctx, -9, -0.6, 12.5, 1.2, fro ? "#bae6fd" : "#c8a27a");
        fp(ctx, "#0d0806", [2.5, -3.2, 8.3, 0, 2.5, 3.2]); fp(ctx, fro ? "#f0f9ff" : en ? "#ef4444" : "#e5e7eb", [3, -2.3, 7.2, 0, 3, 2.3]);
        var fc2 = fro ? "#e0f2fe" : en ? "#1c1917" : "#16a34a";
        fp(ctx, fc2, [-6, -0.6, -10, -3, -8.5, -0.6]); fp(ctx, fc2, [-6, 0.6, -10, 3, -8.5, 0.6]);
        ctx.restore();
      } else if (p.kind === "firebolt" || p.kind === "fire" || p.kind === "flame" || p.kind === "fireball") {
        var rr3 = p.kind === "flame" ? 4 + p.t * 8 : p.r + 1, al = p.kind === "flame" ? Math.max(0, 0.95 - p.t) : 1, enemy = p.kind !== "firebolt";
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = al * 0.9;
        ctx.drawImage(glowSpr(enemy ? "#dc2626" : "#f97316"), -rr3 * 4.2, -rr3 * 1.5, rr3 * 5, rr3 * 3);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        ctx.restore();
        glow(ctx, p.x, p.y, rr3 * 2.1, enemy ? "#f97316" : "#fb923c", al);
        glow(ctx, p.x, p.y, rr3 * 1.1, "#fde68a", al);
        if (p.kind !== "flame") { fc(ctx, p.x, p.y, rr3 * 0.62, enemy ? "#fdba74" : "#fff7ed"); fc(ctx, p.x - rr3 * 0.15, p.y - rr3 * 0.15, rr3 * 0.3, "#fffbeb"); }
      } else if (p.kind === "orb") {
        glow(ctx, p.x, p.y, p.r * 2.8, "#a855f7", 0.85);
        fc(ctx, p.x, p.y, p.r + 0.8, "#1e0638"); fc(ctx, p.x, p.y, p.r, "#7e22ce"); fc(ctx, p.x, p.y, p.r * 0.6, "#c084fc"); fc(ctx, p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.28, "#faf5ff");
        ctx.strokeStyle = "rgba(240,171,252,.7)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 2, p.t * 8, p.t * 8 + 2); ctx.stroke();
      } else if (p.kind === "skull") {
        glow(ctx, p.x, p.y, p.r * 3, "#a855f7", 0.8);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
        fp(ctx, "rgba(192,132,252,.45)", [-p.r * 0.5, -p.r * 0.8, -p.r * 3, 0, -p.r * 0.5, p.r * 0.8]);
        ctx.rotate(-a);
        fc(ctx, 0, 0, p.r + 0.8, "#1e0638"); fc(ctx, 0, -0.5, p.r, "#e7e5e4"); fr(ctx, -p.r * 0.5, p.r * 0.35, p.r, p.r * 0.5, "#d6d3d1");
        fc(ctx, -p.r * 0.38, -0.6, p.r * 0.28, "#3b0764"); fc(ctx, p.r * 0.38, -0.6, p.r * 0.28, "#3b0764"); fc(ctx, -p.r * 0.38, -0.6, p.r * 0.12, "#f0abfc"); fc(ctx, p.r * 0.38, -0.6, p.r * 0.12, "#f0abfc");
        ctx.restore();
      } else if (p.kind === "web") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t * 3);
        ctx.strokeStyle = "rgba(15,23,42,.6)"; ctx.lineWidth = 2; ctx.beginPath(); for (i = 0; i < 6; i++) { var wa = i / 6 * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(wa) * 6.5, Math.sin(wa) * 6.5); } ctx.stroke();
        ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 0.8; ctx.beginPath(); for (i = 0; i < 6; i++) { wa = i / 6 * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(wa) * 6.5, Math.sin(wa) * 6.5); } ctx.stroke();
        ctx.beginPath(); for (var ring2 = 2.5; ring2 < 6.5; ring2 += 2) { for (i = 0; i <= 6; i++) { wa = i / 6 * TAU; if (i === 0) ctx.moveTo(Math.cos(wa) * ring2, Math.sin(wa) * ring2); else ctx.lineTo(Math.cos(wa) * ring2, Math.sin(wa) * ring2); } } ctx.stroke();
        ctx.restore();
      } else if (p.kind === "bone") {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.t * 10);
        fr(ctx, -5.5, -1.8, 11, 3.6, "#0d0806"); fc(ctx, -5.5, -1.3, 2.2, "#0d0806"); fc(ctx, -5.5, 1.3, 2.2, "#0d0806"); fc(ctx, 5.5, -1.3, 2.2, "#0d0806"); fc(ctx, 5.5, 1.3, 2.2, "#0d0806");
        fr(ctx, -5, -1.1, 10, 2.2, "#e2dcc6"); fc(ctx, -5.5, -1.3, 1.5, "#e2dcc6"); fc(ctx, -5.5, 1.3, 1.5, "#cfc6ae"); fc(ctx, 5.5, -1.3, 1.5, "#e2dcc6"); fc(ctx, 5.5, 1.3, 1.5, "#cfc6ae");
        ctx.restore();
      }
    });
    // fx
    fx.forEach(function (f) {
      var k = f.t / f.dur, i;
      if (f.type === "slash") {
        var a0 = f.a - f.arc / 2, a1 = f.a + f.arc / 2, R0 = f.r * (0.7 + k * 0.3), th = 8 * (1 - k) + 2;
        ctx.save(); ctx.translate(f.x, f.y - 4); ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "rgba(255,226,170," + (0.55 * (1 - k)) + ")";
        ctx.beginPath(); ctx.arc(0, 0, R0, a0, a1); ctx.arc(-Math.cos(f.a) * th, -Math.sin(f.a) * th, R0, a1, a0, true); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255," + (0.95 * (1 - k)) + ")"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, R0, a0 + 0.1, a1 - 0.1); ctx.stroke();
        ctx.restore();
      } else if (f.type === "nova") {
        glow(ctx, f.x, f.y, f.r * k * 1.1, "#fde68a", 0.5 * (1 - k));
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "rgba(253,230,138," + (1 - k) + ")"; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k, 0, TAU); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255," + (0.8 * (1 - k)) + ")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k * 0.92, 0, TAU); ctx.stroke();
        ctx.strokeStyle = "rgba(254,243,199," + (0.5 * (1 - k)) + ")"; ctx.lineWidth = 1.5; ctx.beginPath();
        for (i = 0; i < 12; i++) { var ra = i / 12 * TAU + k; ctx.moveTo(f.x + Math.cos(ra) * f.r * k * 0.55, f.y + Math.sin(ra) * f.r * k * 0.55); ctx.lineTo(f.x + Math.cos(ra) * f.r * k * 0.85, f.y + Math.sin(ra) * f.r * k * 0.85); }
        ctx.stroke(); ctx.restore();
      } else if (f.type === "ring") {
        glow(ctx, f.x, f.y, f.r * (0.5 + k * 0.7), f.col, 0.8 * (1 - k));
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = hexA(f.col, 1 - k); ctx.lineWidth = 3.5 * (1 - k) + 1; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + k * 0.6), 0, TAU); ctx.stroke();
        ctx.restore();
      } else if (f.type === "bolt") {
        var pts = [];
        for (var s = 0; s < f.pts.length - 1; s++) {
          var b0 = f.pts[s], b1 = f.pts[s + 1]; pts.push(b0.x, b0.y);
          for (var j = 1; j < 5; j++) { var u = j / 5; pts.push(lerp(b0.x, b1.x, u) + rr(-6, 6), lerp(b0.y, b1.y, u) + rr(-6, 6)); }
        }
        var last = f.pts[f.pts.length - 1]; pts.push(last.x, last.y);
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        sl(ctx, "rgba(96,165,250," + (0.35 * (1 - k)) + ")", 7, pts);
        sl(ctx, "rgba(147,197,253," + (0.7 * (1 - k)) + ")", 3, pts);
        sl(ctx, "rgba(255,255,255," + (1 - k) + ")", 1.2, pts);
        ctx.restore();
        f.pts.forEach(function (pt) { glow(ctx, pt.x, pt.y, 12, "#93c5fd", 0.8 * (1 - k)); });
      }
    });
    parts.forEach(function (q) { var lf = Math.max(0, q.life / q.max), sz = q.sz * (0.45 + 0.55 * lf); ctx.globalAlpha = lf; ctx.fillStyle = q.col; ctx.fillRect(q.x - sz / 2, q.y - sz / 2, sz, sz); });
    ctx.globalAlpha = 1;
    ctx.font = "bold 10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.lineJoin = "round";
    texts.forEach(function (tx) { ctx.globalAlpha = Math.max(0, 1 - tx.t / 0.8); ctx.lineWidth = 2.5; ctx.strokeStyle = "#0d0806"; ctx.strokeText(tx.s, tx.x, tx.y); ctx.fillStyle = tx.col; ctx.fillText(tx.s, tx.x, tx.y); });
    ctx.globalAlpha = 1;
    ctx.restore();
    // damage flash (vignette is folded into the light map)
    if (G.flash > 0) { ctx.fillStyle = "rgba(220,38,38," + (G.flash * 0.8) + ")"; ctx.fillRect(0, 0, VW, VH); }
    ctx.restore();
    drawMinimap();
    if (G.banner) {
      var bk = G.banner.t / G.banner.dur, al = bk < 0.15 ? bk / 0.15 : bk > 0.8 ? (1 - bk) / 0.2 : 1, bh = G.banner.sub ? 62 : 44, by = VH / 2 - 34;
      ctx.globalAlpha = al; ctx.textAlign = "center";
      var bg = ctx.createLinearGradient(0, 0, VW, 0); bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(0.2, "rgba(8,5,3,.72)"); bg.addColorStop(0.8, "rgba(8,5,3,.72)"); bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg; ctx.fillRect(0, by, VW, bh);
      var ln = ctx.createLinearGradient(0, 0, VW, 0); ln.addColorStop(0, "rgba(245,183,59,0)"); ln.addColorStop(0.5, "rgba(245,183,59,.8)"); ln.addColorStop(1, "rgba(245,183,59,0)");
      ctx.fillStyle = ln; ctx.fillRect(0, by, VW, 1); ctx.fillRect(0, by + bh - 1, VW, 1);
      ctx.font = "bold 24px Georgia, serif"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(20,8,2,.9)"; ctx.strokeText(G.banner.s, VW / 2, VH / 2 - 4);
      ctx.fillStyle = "#fde68a"; ctx.fillText(G.banner.s, VW / 2, VH / 2 - 4);
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
    var t = reduceMotion ? 0 : performance.now() / 1000;
    ctx.drawImage(titleLayer(), 0, 0, VW, VH);
    var dx = ((t * 18) % (VW + 260)) - 130, dy = 70 + Math.sin(t * 0.6) * 16;
    dragonSilhouette(ctx, dx, dy, 1.1, 0.35 + 0.65 * Math.abs(Math.sin(t * 2.2)));
    for (var i = 0; i < 46; i++) {
      var x = (i * 97 + t * 12 * (1 + i % 3) + Math.sin(t + i) * 6) % VW, y = VH - ((i * 53 + t * 26 * (1 + i % 4)) % VH), a = 0.25 + (i % 5) * 0.13;
      if (i % 4 === 0) glow(ctx, x + 1, y + 1, 5, "#fb923c", a * 0.6);
      ctx.fillStyle = "rgba(253,186,116," + a + ")"; ctx.fillRect(x, y, i % 3 ? 1.5 : 2, i % 3 ? 1.5 : 2);
    }
    vignette();
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
      var c = p.c, cn = c.canvas, hover = p.el.matches(":hover") || document.activeElement === p.el;
      if (cn.width !== 640) { cn.width = 640; cn.height = 300; }
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over"; c.clearRect(0, 0, 640, 300);
      var col = HERO_AURA[p.id];
      glow(c, 320, 150, 190, col, hover ? 0.38 : 0.2);
      c.setTransform(6, 0, 0, 6, 320, 190);
      fe(c, 0, 14, 17, 5, "#120d09"); fe(c, 0, 12.6, 16, 4.2, "#2e2318"); fe(c, -3, 11.8, 9, 1.8, "#45352a");
      c.strokeStyle = hexA(col, hover ? 0.8 : 0.45); c.lineWidth = 0.5; c.beginPath(); c.ellipse(0, 12.6, 13, 3.2, 0, 0, TAU); c.stroke();
      var cyc = (t * 0.8 + i * 0.7) % 3, atk = hover && (t * 2 % 1) < 0.25 ? 0.22 - (t * 2 % 1) : 0;
      drawHero(c, p.id, 0, 0, { t: t, walk: t * 10, moving: hover, face: 1, aim: hover ? -0.2 : 0.3 + Math.sin(t) * 0.1, atk: atk, cast: cyc > 2.7 ? 0.2 : 0, block: !hover && cyc > 1.6 && cyc < 2.2 });
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
