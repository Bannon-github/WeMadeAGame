# Placeholder asset generators — Lucky Plumber Slots

These scripts (re)generate the **blank, labeled placeholder** art and audio for
the slots prototype. You normally won't run them — replace the files in
`docs/games/lucky-plumber-slots/assets/` with real art/audio instead (see that
game's `ASSETS.md`). Regenerate only when you add a new symbol or want fresh
blanks.

Run from the **repository root** (paths inside are repo-relative):

```bash
pip install Pillow          # gen_images.py needs Pillow; gen_audio.py is stdlib-only
python3 tools/lucky-plumber-slots/gen_images.py
python3 tools/lucky-plumber-slots/gen_audio.py
```

- `gen_images.py` → PNG placeholders (symbols, background, logo, spin button,
  sprite sheets) written to `docs/games/lucky-plumber-slots/assets/images/`.
- `gen_audio.py` → synthesized WAV placeholders written to
  `docs/games/lucky-plumber-slots/assets/audio/`.

Dimensions and frame counts are the source of truth in these scripts and must
stay in sync with `docs/games/lucky-plumber-slots/js/config.js` and `ASSETS.md`.
