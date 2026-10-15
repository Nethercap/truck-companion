"""Dibuja los entornos que deja tools/simular_navegacion.js (carpeta
entornos/): calles (gris doble mano, celeste un sentido, con flecha), la
ruta en rojo con sus nodos de cruce, las cajas de ciudad en verde y los
avisos que mostro la app en amarillo.

uso: python tools/dibujar_simulacion.py <carpeta entornos> [patron]"""
import glob
import json
import math
import os
import sys
import textwrap

from PIL import Image, ImageDraw


def dibujar(f, out):
    d = json.load(open(f, encoding="utf8"))
    cx, cz, r = d["center"]
    W = 900
    H = 1000

    def P(x, z):
        return ((x - cx + r) / (2 * r) * W, (z - cz + r) / (2 * r) * W + 100)

    im = Image.new("RGB", (W, H), (28, 31, 38))
    dr = ImageDraw.Draw(im)
    for a in d.get("cajas", []):
        x0, y0 = P(a[0], a[1])
        x1, y1 = P(a[0] + a[2], a[1] + a[3])
        dr.rectangle([x0, y0, x1, y1], outline=(60, 160, 80), width=2)
    for e in d["edges"]:
        pts = [P(*p) for p in e["line"]]
        dr.line(pts, fill=(110, 170, 255) if e["oneway"] else (170, 170, 170), width=2)
        if e["oneway"] and len(pts) >= 2:
            i = len(pts) // 2
            (x0, y0), (x1, y1) = pts[i - 1], pts[i]
            if (x1 - x0) ** 2 + (y1 - y0) ** 2 > 4:
                a = math.atan2(y1 - y0, x1 - x0)
                mx, my = (x0 + x1) / 2, (y0 + y1) / 2
                for s in (0.5, -0.5):
                    dr.line([(mx, my), (mx - 9 * math.cos(a + s), my - 9 * math.sin(a + s))], fill=(255, 230, 0), width=2)
    r2 = [P(p[0], p[1]) for p in d.get("ruta2", [])]
    if len(r2) >= 2:
        dr.line(r2, fill=(60, 220, 120), width=3)
    rt = [P(p[0], p[1]) for p in d["route"]]
    if len(rt) >= 2:
        dr.line(rt, fill=(230, 50, 50), width=4)
    for p in d["route"]:
        if p[2] == 1:
            x, y = P(p[0], p[1])
            dr.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 255, 255))
    for x, z, k, dirn, ex in d["man"]:
        X, Y = P(x, z)
        dr.ellipse([X - 7, Y - 7, X + 7, Y + 7], fill=(255, 220, 0))
        dr.text((X + 9, Y - 6), f"{k} {dirn}" + (f" {ex}" if ex else ""), fill=(255, 230, 80))
    X, Y = P(cx, cz)
    dr.line([(X - 12, Y), (X + 12, Y)], fill=(255, 0, 255), width=2)
    dr.line([(X, Y - 12), (X, Y + 12)], fill=(255, 0, 255), width=2)
    y = 4
    for linea in textwrap.wrap(d["titulo"], 140)[:6]:
        dr.text((5, y), linea, fill=(255, 255, 255))
        y += 14
    dr.text((5, H - 16), f"lado {2 * r:.0f} m; gris doble mano, celeste un sentido, verde cajas de ciudad (y ruta nueva), amarillo avisos, cruz = hallazgo", fill=(200, 200, 200))
    im.save(out)


if __name__ == "__main__":
    carpeta = sys.argv[1]
    patron = sys.argv[2] if len(sys.argv) > 2 else "*"
    for f in sorted(glob.glob(os.path.join(carpeta, patron + ".json"))):
        dibujar(f, f[:-5] + ".png")
    print("listo")
