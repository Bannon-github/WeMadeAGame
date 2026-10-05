/* XR Intel — site behaviour: nav, scroll reveal, hero field, harness demo.
   Dependency-free; every block no-ops if its elements aren't on the page. */
(function () {
  "use strict";
  document.documentElement.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // ---------- Header & mobile nav ----------
  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("nav");
  if (header) {
    var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
    });
  }

  // ---------- Reveal on scroll ----------
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // ---------- Hero: rotating spatial point field ----------
  var canvas = document.getElementById("field");
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = 1, pts = [], t = 0, visible = true, pointer = { x: 0, y: 0 };
    var N = 0;
    var build = function () {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      N = W < 640 ? 170 : 320;
      pts = [];
      // Fibonacci sphere: evenly distributed nodes
      for (var i = 0; i < N; i++) {
        var y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
        pts.push({ x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, hot: Math.random() < 0.06 });
      }
    };
    var draw = function () {
      ctx.clearRect(0, 0, W, H);
      var cx = W < 860 ? W * 0.62 : W * 0.7, cy = H * 0.5;
      var R = Math.min(W, H) * (W < 860 ? 0.46 : 0.38);
      var ay = t * 0.12 + pointer.x * 0.25, ax = 0.35 + pointer.y * 0.15;
      var sy = Math.sin(ay), cyr = Math.cos(ay), sx = Math.sin(ax), cxr = Math.cos(ax);
      var proj = new Array(N);
      for (var i = 0; i < N; i++) {
        var p = pts[i];
        var x = p.x * cyr - p.z * sy, z = p.x * sy + p.z * cyr;
        var y = p.y * cxr - z * sx; z = p.y * sx + z * cxr;
        var s = 1.9 / (2.6 + z);
        proj[i] = { x: cx + x * R * s, y: cy + y * R * s, z: z, hot: p.hot };
      }
      // Links between near neighbours (front hemisphere brighter)
      ctx.lineWidth = 1;
      var maxD = R * 0.2;
      for (var a = 0; a < N; a++) {
        var pa = proj[a];
        for (var b = a + 1; b < Math.min(N, a + 24); b++) {
          var pb = proj[b], dx = pa.x - pb.x, dy = pa.y - pb.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < maxD) {
            var depth = (2 - pa.z - pb.z) / 4;
            ctx.strokeStyle = "rgba(94,234,212," + (0.16 * depth * (1 - d / maxD)).toFixed(3) + ")";
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
          }
        }
      }
      for (var k = 0; k < N; k++) {
        var q = proj[k], dd = (1 - q.z) / 2;
        var pulse = q.hot ? 0.6 + 0.4 * Math.sin(t * 2 + k) : 1;
        ctx.fillStyle = q.hot ? "rgba(129,140,248," + (0.95 * dd * pulse).toFixed(3) + ")"
                              : "rgba(233,238,247," + (0.15 + 0.6 * dd).toFixed(3) + ")";
        var size = q.hot ? 2.6 : 1.1 + dd * 0.9;
        ctx.beginPath(); ctx.arc(q.x, q.y, size, 0, 6.283); ctx.fill();
      }
      // Orbit ring — the "headset horizon"
      ctx.strokeStyle = "rgba(129,140,248,0.18)";
      ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.95, R * 0.95 * Math.abs(Math.sin(ax)) + 6, 0, 0, 6.283); ctx.stroke();
    };
    var loop = function () {
      if (visible) { t += 1 / 60; draw(); }
      requestAnimationFrame(loop);
    };
    build(); draw();
    window.addEventListener("resize", function () { build(); draw(); });
    if (!reduceMotion) {
      window.addEventListener("pointermove", function (e) {
        pointer.x = (e.clientX / window.innerWidth - 0.5); pointer.y = (e.clientY / window.innerHeight - 0.5);
      }, { passive: true });
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(canvas);
      }
      requestAnimationFrame(loop);
    }
  }

  // ---------- Harness demo ----------
  var STAGES = [
    { name: "Scout", reads: "The open web — live search across four research beats.", writes: "A prose digest in reports/. Never code.",
      cannot: "Touch the codebase, workflows or secrets.", when: "Weekly, on schedule.",
      log: [["k", "$ scout --beats spatial,privacy,webxr,market"], ["d", "  searching 4 beats …"],
            ["", "  + WebXR hand-tracking now default in headset browser"], ["", "  + New anchor-persistence API in origin trial"],
            ["w", "  ! 1 source flagged low-trust — quoted, not trusted"], ["o", "  ✓ wrote reports/scout-digest.md (prose only)"]] },
    { name: "Council", reads: "The scout's digest only — no web, no code.", writes: "Seat reviews plus the chair's ranked actions.",
      cannot: "Browse, or act on anything the digest didn't say.", when: "Immediately after each scout run.",
      log: [["k", "$ council --digest reports/scout-digest.md"], ["p", "  [Architect]  anchors API fits ADR-004; propose amendment"],
            ["p", "  [Privacy Red-Team]  VETO telemetry SDK — metadata leak"], ["p", "  [Integrator]  anchors spike ≈ 3 files, 1 day"],
            ["p", "  [Product]  persistence = the core promise; ship it"], ["o", "  ✓ chair: #1 anchor-persistence spike, #2 hand-tracking pass"]] },
    { name: "Task agent", reads: "Your instruction and the repo — no web access.", writes: "Code on a branch, then a draft pull request with its test verdict.",
      cannot: "Write to workflows, rules, skills or its own machinery.", when: "On demand — only when you launch it.",
      log: [["k", "$ task \"spike anchor persistence behind a flag\""], ["d", "  path firewall: .github/** locked"],
            ["", "  edit core/anchors.ts, core/anchors.test.ts, platform/web/scene.ts"], ["", "  running test suite …"],
            ["o", "  ✓ 48 passed · 0 failed"], ["o", "  ✓ opened draft PR: \"[TASK-031] Anchor persistence spike\""]] },
    { name: "Reviewer", reads: "The pull request diff.", writes: "One sticky advisory comment.",
      cannot: "Block, approve or merge anything.", when: "On every pull request.",
      log: [["k", "$ review --pr TASK-031"], ["", "  correctness: storage key not namespaced per user"],
            ["w", "  suggestion: add eviction test for stale anchors"], ["o", "  ✓ advisory comment posted (non-blocking)"]] },
    { name: "Human green light", reads: "Everything above — digest, council, diff, tests, review.", writes: "The merge decision.",
      cannot: "Be skipped. No agent can push to main.", when: "When you're satisfied.",
      log: [["k", "$ await human"], ["d", "  draft PR ready · tests green · 1 advisory note"], ["o", "  ✓ owner approved — merged to main"],
            ["d", "  reflect: all loops alive · next scout Wednesday 06:00 UTC"]] }
  ];
  var stageBtns = document.querySelectorAll(".stage");
  var detail = document.getElementById("stage-detail");
  var logEl = document.getElementById("log");
  var runBtn = document.getElementById("run");
  if (stageBtns.length && detail) {
    var esc = function (s) { return s.replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); };
    var select = function (i) {
      stageBtns.forEach(function (b, j) { b.setAttribute("aria-pressed", String(i === j)); });
      var s = STAGES[i];
      detail.innerHTML = "<dl><dt>Stage</dt><dd><strong>" + esc(s.name) + "</strong></dd><dt>Reads</dt><dd>" + esc(s.reads) +
        "</dd><dt>Writes</dt><dd>" + esc(s.writes) + "</dd><dt>Cannot</dt><dd>" + esc(s.cannot) + "</dd><dt>Runs</dt><dd>" + esc(s.when) + "</dd></dl>";
    };
    stageBtns.forEach(function (b, i) { b.addEventListener("click", function () { select(i); }); });
    select(0);

    var running = false;
    var addLine = function (cls, text) {
      var span = document.createElement("span");
      span.className = "ln " + cls; span.textContent = text;
      logEl.appendChild(span); logEl.scrollTop = logEl.scrollHeight;
    };
    if (runBtn && logEl) {
      runBtn.addEventListener("click", function () {
        if (running) return;
        running = true; runBtn.disabled = true; runBtn.textContent = "Running…";
        logEl.innerHTML = "";
        stageBtns.forEach(function (b) { b.classList.remove("done", "running"); });
        var queue = [];
        STAGES.forEach(function (s, i) {
          queue.push(function () { stageBtns[i].classList.add("running"); select(i); });
          s.log.forEach(function (l) { queue.push(function () { addLine(l[0], l[1]); }); });
          queue.push(function () { stageBtns[i].classList.remove("running"); stageBtns[i].classList.add("done"); addLine("", ""); });
        });
        queue.push(function () {
          addLine("o", "# cycle complete — 0 unreviewed changes reached main");
          running = false; runBtn.disabled = false; runBtn.textContent = "↻ Replay";
        });
        var step = reduceMotion ? 0 : 260;
        (function next() { var f = queue.shift(); if (!f) return; f(); setTimeout(next, step); })();
      });
    }
  }
})();
