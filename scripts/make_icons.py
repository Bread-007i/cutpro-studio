#!/usr/bin/env python3
"""Generate CutPro Studio app icons (PWA + favicon + logo.svg).

Design: rounded square, diagonal violet->fuchsia gradient,
white play triangle with a diagonal "cut" slice + sparkle accent.
"""
import math
import os

from PIL import Image, ImageDraw

OUT = "/home/z/my-project/public/icons"
os.makedirs(OUT, exist_ok=True)

# Palette
C1 = (124, 58, 237)    # violet-600
C2 = (192, 38, 211)    # fuchsia-600
C3 = (236, 72, 153)    # pink-500
BG = (11, 11, 16)      # near black

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def make_gradient(size, c1, c2, c3):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            # diagonal gradient 0..1
            t = (x + y) / (2 * size - 2)
            if t < 0.55:
                col = lerp(c1, c2, t / 0.55)
            else:
                col = lerp(c2, c3, (t - 0.55) / 0.45)
            px[x, y] = (*col, 255)
    return img

def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m

def draw_logo(icon, S):
    """Draw the play-cut glyph. Icon is RGBA; glyph drawn on its own layer,
    cut stripe clipped to the triangle only."""
    cx, cy = S * 0.5, S * 0.52
    tri = S * 0.30

    glyph = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glyph)
    p1 = (cx - tri * 0.62, cy - tri)
    p2 = (cx - tri * 0.62, cy + tri)
    p3 = (cx + tri * 0.95, cy)
    d.polygon([p1, p2, p3], fill=(255, 255, 255, 255))

    # diagonal cut stripe, clipped to the triangle bbox
    cut = Image.new("RGBA", icon.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(cut)
    cut_w = S * 0.017
    ang = math.radians(62)
    dx, dy = math.cos(ang), math.sin(ang)
    ox, oy = cx - dx * S * 0.9, cy - dy * S * 0.9
    for i in range(120):
        bx = ox + dx * S * 1.8 * (i / 119)
        by = oy + dy * S * 1.8 * (i / 119)
        cd.ellipse([bx - cut_w, by - cut_w * 4, bx + cut_w, by + cut_w * 4],
                   fill=(0, 0, 0, 255))
    # build clip mask from triangle
    clip = Image.new("L", icon.size, 0)
    ImageDraw.Draw(clip).polygon([p1, p2, p3], fill=255)
    glyph.paste((0, 0, 0, 0), (0, 0), Image.composite(cut.split()[3], Image.new("L", icon.size, 0), clip))

    d2 = ImageDraw.Draw(glyph)
    # sparkle accent (top-right)
    sx, sy, sr = S * 0.76, S * 0.24, S * 0.055
    d2.polygon([(sx, sy - sr * 1.7), (sx + sr * 0.5, sy - sr * 0.5),
                (sx + sr * 1.7, sy), (sx + sr * 0.5, sy + sr * 0.5),
                (sx, sy + sr * 1.7), (sx - sr * 0.5, sy + sr * 0.5),
                (sx - sr * 1.7, sy), (sx - sr * 0.5, sy - sr * 0.5)],
               fill=(255, 255, 255, 225))
    icon.alpha_composite(glyph)
    return icon

def make_icon(size, maskable=False):
    # maskable keeps glyph in 80% safe zone with full-bleed bg
    S = int(size * (0.74 if maskable else 0.84))
    off = (size - S) // 2
    grad = make_gradient(size, C1, C2, C3)
    if not maskable:
        radius = int(size * 0.225)
        mask = rounded_mask(size, radius)
        # transparent outside, rounded corners
        base = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        base.paste(grad, (0, 0), mask)
        icon = base
        draw_logo(icon, S)
        # subtle top highlight
        hl = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        hd = ImageDraw.Draw(hl)
        hd.rounded_rectangle([0, 0, size - 1, int(size * 0.5)], radius=radius,
                             fill=(255, 255, 255, 22))
        icon = Image.alpha_composite(icon, hl)
    else:
        icon = grad
        glyph = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw_logo(glyph, S)
        icon = Image.alpha_composite(icon, glyph)
    return icon

# PNG icons
for name, size, maskable in [
    ("icon-192.png", 192, False),
    ("icon-256.png", 256, False),
    ("icon-512.png", 512, False),
    ("maskable-512.png", 512, True),
    ("apple-touch-icon.png", 180, False),
    ("favicon-32.png", 32, False),
    ("favicon-16.png", 16, False),
]:
    make_icon(size, maskable).save(f"{OUT}/{name}")
    print("wrote", name)

# Also a big icon for marketing/instructions
make_icon(1024, False).save(f"{OUT}/icon-1024.png")

# SVG logo (same design, vector) for in-app branding
svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset="0.55" stop-color="#c026d3"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
    <clipPath id="tri"><polygon points="20,15 20,49 47,32"/></clipPath>
  </defs>
  <rect x="1" y="1" width="62" height="62" rx="14" fill="url(#g)"/>
  <polygon points="20,15 20,49 47,32" fill="#fff"/>
  <rect x="30" y="-4" width="5" height="72" fill="#0b0b10" transform="rotate(28 32 32)" clip-path="url(#tri)"/>
  <g stroke="#fff" stroke-width="3" stroke-linecap="round">
    <line x1="17" y1="21" x2="21" y2="26"/>
    <line x1="47" y1="43" x2="43" y2="38"/>
  </g>
  <path d="M49 12 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6 z" fill="#fff" opacity="0.9"/>
</svg>
"""
with open("/home/z/my-project/public/logo.svg", "w") as f:
    f.write(svg)
print("wrote logo.svg")
