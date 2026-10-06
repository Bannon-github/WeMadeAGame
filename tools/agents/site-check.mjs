#!/usr/bin/env node
// site-check.mjs — headless page audit used by the XR Intel Agent Program.
// Loads each URL at desktop (1366x860) and phone (390x844) widths and reports:
// load ok, page/console errors, 4xx/5xx responses, horizontal overflow, load time.
//
// Usage:
//   node tools/agents/site-check.mjs --base http://localhost:8000 / /games/ /clone/
//   node tools/agents/site-check.mjs --base https://xrintel.ca --project games-hub
//   node tools/agents/site-check.mjs --base http://localhost:8000 --all --json out.json
// --project <id> / --all read the pages from agents/projects.json.
// Exit code 1 if any page fails, so it can gate a push.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of ["playwright", "/opt/node22/lib/node_modules/playwright"]) {
    try { return require(p); } catch (e) { /* try next */ }
  }
  console.error("Playwright not found. Use the preinstalled one (/opt/node22/lib/node_modules/playwright); do not run `playwright install`.");
  process.exit(2);
}

const args = process.argv.slice(2);
let base = "http://localhost:8000", jsonOut = null, project = null, all = false;
const paths = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base") base = args[++i].replace(/\/$/, "");
  else if (args[i] === "--json") jsonOut = args[++i];
  else if (args[i] === "--project") project = args[++i];
  else if (args[i] === "--all") all = true;
  else paths.push(args[i]);
}
if (project || all) {
  const reg = JSON.parse(readFileSync(new URL("../../agents/projects.json", import.meta.url)));
  for (const p of reg.projects) {
    if (!all && p.id !== project) continue;
    for (const pg of p.pages || []) if (pg.startsWith("/") && !pg.includes(" ")) paths.push(pg);
  }
}
if (!paths.length) paths.push("/");

const { chromium } = loadPlaywright();
const exe = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
let browser;
try { browser = await chromium.launch({ executablePath: exe }); }
catch (e) { browser = await chromium.launch(); }

const results = [];
for (const [w, h, label] of [[1366, 860, "desktop"], [390, 844, "phone"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  for (const path of [...new Set(paths)]) {
    const page = await ctx.newPage();
    const errors = [], bad = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("response", (r) => { if (r.status() >= 400) bad.push(r.status() + " " + r.url()); });
    const t0 = Date.now();
    let ok = true, status = 0;
    try {
      const resp = await page.goto(base + path, { waitUntil: "load", timeout: 30000 });
      status = resp ? resp.status() : 0;
      ok = status > 0 && status < 400;
      await page.waitForTimeout(500);
    } catch (e) { ok = false; errors.push("navigation: " + e.message); }
    const ms = Date.now() - t0;
    let overflow = false, title = "";
    try {
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      title = await page.title();
    } catch (e) { /* page never loaded */ }
    const pass = ok && !errors.length && !bad.length && !overflow;
    results.push({ path, viewport: label, pass, status, title, loadMs: ms, errors, badResponses: bad, overflow });
    await page.close();
  }
  await ctx.close();
}
await browser.close();

const failed = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.viewport.padEnd(7)} ${r.path.padEnd(32)} ${String(r.loadMs).padStart(5)}ms  ${r.title}` +
    (r.pass ? "" : `\n      errors=${JSON.stringify(r.errors)} bad=${JSON.stringify(r.badResponses)} overflow=${r.overflow} status=${r.status}`));
}
const summary = { base, checkedAt: new Date().toISOString(), pages: results.length, passed: results.length - failed.length, failed: failed.length, results };
console.log(`\n${summary.passed}/${summary.pages} checks passed`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
process.exit(failed.length ? 1 : 0);
