"""
Genera los assets derivados de la landing a partir de las capturas PNG
originales en docs/assets/:

  - screenshot-*.webp   (mismas capturas, ~5x mas livianas, para la landing)
  - og-image.png         (1200x630 para Open Graph / Twitter cards)
  - favicon-32.png       (fallback PNG del favicon SVG)

Se corre a mano cada vez que cambia una captura o el copy del OG:
  python tools/build_assets.py
"""

import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "docs", "assets")
FONTS = os.path.join(ROOT, "tools", "fonts")

SCREENSHOTS = [
    "screenshot-dashboard",
    "screenshot-gps-1",
    "screenshot-gps-2",
    "screenshot-gps-3",
    "screenshot-buttonbox",
    "screenshot-waypoints",
    "screenshot-find-nearby",
]

BG = (11, 13, 16)
BLUE = (59, 158, 255)
ORANGE = (255, 138, 61)
TEXT = (242, 243, 245)
MUTED = (154, 164, 178)


def build_webp():
    for name in SCREENSHOTS:
        src = os.path.join(ASSETS, f"{name}.png")
        dst = os.path.join(ASSETS, f"{name}.webp")
        if not os.path.exists(src):
            print(f"  (skip) {name}.png no existe")
            continue
        im = Image.open(src).convert("RGB")
        # Las capturas verticales del celular vienen a 1264x2780 - en la landing
        # nunca se muestran a mas de ~520px de alto, no hace falta el tamano
        # original.
        max_h = 1400
        if im.height > max_h:
            ratio = max_h / im.height
            im = im.resize((round(im.width * ratio), max_h), Image.LANCZOS)
        im.save(dst, "WEBP", quality=82, method=6)
        print(f"  {name}.webp {os.path.getsize(dst) // 1024}KB (png: {os.path.getsize(src) // 1024}KB)")


def rounded_screenshot(path, height, radius=18):
    im = Image.open(path).convert("RGBA")
    ratio = height / im.height
    im = im.resize((round(im.width * ratio), height), Image.LANCZOS)
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=radius, fill=255)
    im.putalpha(mask)
    return im


def build_og_image():
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(im)

    # Franja diagonal sutil tipo "ruta" de fondo
    for i in range(-H, W, 90):
        draw.line([(i, H), (i + H, 0)], fill=(18, 21, 26), width=28)

    title_font = ImageFont.truetype(os.path.join(FONTS, "BarlowCondensed-Bold.ttf"), 108)
    sub_font = ImageFont.truetype(os.path.join(FONTS, "Inter-Regular.ttf"), 30)
    badge_font = ImageFont.truetype(os.path.join(FONTS, "Inter-Bold.ttf"), 24)

    # Logo
    logo_png = os.path.join(ROOT, "docs", "app", "assets", "icon-512.png")
    logo = Image.open(logo_png).convert("RGBA").resize((120, 120), Image.LANCZOS)
    im.paste(logo, (70, 70), logo)

    draw.text((215, 66), "Truck", font=title_font, fill=TEXT)
    w = draw.textlength("Truck ", font=title_font)
    draw.text((215 + w, 66), "Dash", font=title_font, fill=BLUE)

    lines = [
        "Free GPS & live dashboard for",
        "Euro Truck Simulator 2 and American Truck Simulator",
    ]
    y = 215
    for line in lines:
        draw.text((70, y), line, font=sub_font, fill=MUTED)
        y += 42

    badges = ["100% free", "No account", "Open source", "Phone / 2nd screen"]
    x = 70
    y = 330
    for b in badges:
        tw = draw.textlength(b, font=badge_font)
        draw.rounded_rectangle((x, y, x + tw + 32, y + 44), radius=22, outline=ORANGE, width=2)
        draw.text((x + 16, y + 9), b, font=badge_font, fill=TEXT)
        x += tw + 48

    # Capturas: una vertical (GPS en el celular) a la derecha, sobresaliendo,
    # y la del dashboard de escritorio detras.
    desk = rounded_screenshot(os.path.join(ASSETS, "screenshot-dashboard.png"), 330)
    im.paste(desk, (600, 400), desk)
    phone = rounded_screenshot(os.path.join(ASSETS, "screenshot-gps-2.png"), 560, radius=28)
    im.paste(phone, (930, 100), phone)

    draw.text((70, 560), "trucksim-dash.com", font=badge_font, fill=BLUE)

    out = os.path.join(ASSETS, "og-image.png")
    im.save(out, "PNG", optimize=True)
    print(f"  og-image.png {os.path.getsize(out) // 1024}KB")


def build_favicon():
    src = os.path.join(ROOT, "docs", "app", "assets", "icon-192.png")
    for size in (32, 180):
        im = Image.open(src).convert("RGBA").resize((size, size), Image.LANCZOS)
        out = os.path.join(ASSETS, f"favicon-{size}.png")
        im.save(out, "PNG", optimize=True)
        print(f"  favicon-{size}.png")


if __name__ == "__main__":
    print("WebP:")
    build_webp()
    print("OG image:")
    build_og_image()
    print("Favicons:")
    build_favicon()
