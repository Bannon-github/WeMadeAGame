/** Polyrhythm Studio loader — payloads from Bannon-github/polyrhythm-studio (raw) */
(async () => {
  const BASE = "https://raw.githubusercontent.com/Bannon-github/polyrhythm-studio/main/";
  try {
    const parts = await Promise.all([0,1,2,3].map(i => fetch(BASE + "app.payload." + i + ".b64").then(r => {
      if (!r.ok) throw new Error("payload." + i + " " + r.status);
      return r.text();
    })));
    const b64 = parts.join("").replace(/\s+/g, "");
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ds = new DecompressionStream("deflate");
    const ab = await new Response(new Blob([bin]).stream().pipeThrough(ds)).arrayBuffer();
    const src = new TextDecoder().decode(ab);
    const s = document.createElement("script");
    s.textContent = src;
    document.documentElement.appendChild(s);
  } catch (e) {
    document.body.innerHTML = "<pre style=\"color:#f88;padding:2rem\">Load failed: " + e +
      "\nCheck network access to GitHub raw.</pre>";
  }
})();
