/** Polyrhythm Studio loader — fetches split payload then inflates */
(async () => {
  try {
    const parts = await Promise.all([0,1,2,3].map(i => fetch("app.payload." + i + ".b64").then(r => {
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
      "\nUse a local server: python3 -m http.server 8765</pre>";
  }
})();
