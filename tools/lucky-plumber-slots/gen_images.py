#!/usr/bin/env python3
"""Generate BLANK, labeled placeholder art for Lucky Plumber Slots.

Every file is a plain, clearly-labeled placeholder at the EXACT dimensions the
game expects. Replace any file with your own artwork at the SAME dimensions and
filename and it will appear in the game with no code changes.
"""
from PIL import Image, ImageDraw, ImageFont

OUT = "docs/games/lucky-plumber-slots/assets/images"


def font(size):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size)
    except Exception:
        try:
            return ImageFont.load_default(size=size)
        except Exception:
            return ImageFont.load_default()


def center_text(d, box, lines, fill, sizes):
    """Draw stacked centered lines within box=(x0,y0,x1,y1)."""
    x0, y0, x1, y1 = box
    cx = (x0 + x1) / 2
    total = 0
    rendered = []
    for text, sz in zip(lines, sizes):
        f = font(sz)
        bb = d.textbbox((0, 0), text, font=f)
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        rendered.append((text, f, w, h))
        total += h + 6
    cy = (y0 + y1) / 2 - total / 2
    for text, f, w, h in rendered:
        d.text((cx - w / 2, cy), text, font=f, fill=fill)
        cy += h + 6


def checker(img, box, fill, step=20):
    """Faint checkerboard so transparent placeholders read as 'blank slot'."""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    y = y0
    row = 0
    while y < y1:
        x = x0 + (step if row % 2 else 0)
        while x < x1:
            d.rectangle([x, y, min(x + step, x1), min(y + step, y1)], fill=fill)
            x += step * 2
        y += step
        row += 1


def symbol(name, tag, size, bg, glyph):
    w = h = size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # rounded card so symbols are distinguishable during playtesting
    d.rounded_rectangle([6, 6, w - 6, h - 6], radius=22, fill=bg + (235,),
                        outline=(255, 255, 255, 230), width=4)
    center_text(d, (0, 8, w, h - 34),
                [glyph, name], (255, 255, 255, 255), [int(size * 0.34), int(size * 0.12)])
    if tag:
        d.text((w / 2 - font(int(size * 0.09)).getlength(tag) / 2, h - 34),
               tag, font=font(int(size * 0.09)), fill=(0, 0, 0, 255))
    d.text((10, h - 20), f"{w}x{h}", font=font(14), fill=(255, 255, 255, 180))
    img.save(f"{OUT}/{_slug(name)}.png")
    print(f"  {_slug(name)}.png  {w}x{h}")


def _slug(s):
    return "symbol_" + s.lower().split()[0]


def panel(fname, w, h, bg, title, transparent=False):
    mode_bg = (0, 0, 0, 0) if transparent else bg + (255,)
    img = Image.new("RGBA", (w, h), mode_bg)
    d = ImageDraw.Draw(img)
    if transparent:
        checker(img, (0, 0, w, h), (255, 255, 255, 22), step=max(14, w // 40))
    d.rectangle([2, 2, w - 3, h - 3], outline=(255, 255, 255, 220), width=4)
    center_text(d, (0, 0, w, h), [title, f"{w} x {h}", "PLACEHOLDER"],
                (255, 255, 255, 255), [max(20, h // 8), max(16, h // 12), max(12, h // 18)])
    img.save(f"{OUT}/{fname}")
    print(f"  {fname}  {w}x{h}")


def spritesheet(fname, frames, fw, fh, bg, title):
    w, h = fw * frames, fh
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i in range(frames):
        x0 = i * fw
        d.rectangle([x0 + 3, 3, x0 + fw - 3, fh - 3],
                   fill=bg + (150 + i * (90 // frames),), outline=(255, 255, 255, 230), width=3)
        center_text(d, (x0, 0, x0 + fw, fh),
                    [f"FRAME {i+1}/{frames}", f"{fw}x{fh}"],
                    (255, 255, 255, 255), [max(14, fw // 10), max(11, fw // 16)])
    d.text((6, 4), f"{title}  sheet {w}x{h}", font=font(16), fill=(255, 255, 0, 255))
    img.save(f"{OUT}/{fname}")
    print(f"  {fname}  sheet {w}x{h}  ({frames} x {fw}x{fh})")


print("Symbols (160x160, transparent bg):")
symbol("Hero", "WILD", 160, (229, 57, 53), "P")          # plumber hero - WILD
symbol("Mushroom", "", 160, (211, 47, 47), "M")
symbol("Star", "SCATTER", 160, (251, 192, 45), "*")      # star - SCATTER
symbol("Flower", "", 160, (251, 140, 0), "F")
symbol("Coin", "", 160, (253, 216, 53), "C")
symbol("Pipe", "", 160, (67, 160, 71), "U")
symbol("Shell", "", 160, (0, 137, 123), "S")
symbol("Block", "", 160, (249, 168, 37), "?")

print("Panels:")
panel("background.png", 1280, 800, (26, 32, 68), "BACKGROUND")
panel("logo.png", 640, 200, (0, 0, 0), "GAME LOGO", transparent=True)
panel("spin_button.png", 200, 200, (46, 125, 50), "SPIN BTN", transparent=True)

print("Animated sprite sheets (horizontal strips):")
spritesheet("coin_burst.png", 8, 200, 200, (253, 216, 53), "COIN BURST 16fps")
spritesheet("hero_celebrate.png", 6, 320, 320, (229, 57, 53), "HERO CELEBRATE 10fps")

print("Done.")
