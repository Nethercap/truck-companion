"""Iconos de la app de Android a partir del logo (docs/assets/press/logo-1024.png).

  python android/make_icons.py

Deja en android/app/src/main/res:
- mipmap-anydpi-v26/ic_launcher.xml: icono adaptable (fondo de color, frente
  con el logo en la zona segura, y monocromo para los iconos tematicos de
  Android 13);
- mipmap-<densidad>/ic_launcher.png: para launchers viejos (el logo sobre un
  cuadrado redondeado del fondo de la app);
- mipmap-<densidad>/ic_launcher_foreground.png y _monochrome.png;
- drawable/splash.png: el logo de la pantalla de inicio.
"""

import os

from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(AQUI, "..", "docs", "assets", "press", "logo-1024.png")
RES = os.path.join(AQUI, "app", "src", "main", "res")
FONDO = (13, 15, 18, 255)  # #0d0f12, el de la app web
DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def logo(px):
    return Image.open(LOGO).convert("RGBA").resize((px, px), Image.LANCZOS)


def frente(lado, fraccion):
    """El logo centrado en un cuadrado transparente, ocupando `fraccion`."""
    im = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    lg = logo(round(lado * fraccion))
    im.alpha_composite(lg, ((lado - lg.width) // 2, (lado - lg.height) // 2))
    return im


def guardar(im, carpeta, nombre):
    d = os.path.join(RES, carpeta)
    os.makedirs(d, exist_ok=True)
    im.save(os.path.join(d, nombre), optimize=True)


def main():
    for dens, k in DENSIDADES.items():
        # Adaptable: 108 dp, y lo que se ve seguro es el circulo de 66 dp del medio
        lado = round(108 * k)
        fr = frente(lado, 0.52)
        guardar(fr, f"mipmap-{dens}", "ic_launcher_foreground.png")
        mono = Image.new("RGBA", fr.size, (255, 255, 255, 0))
        mono.putalpha(fr.getchannel("A"))
        guardar(mono, f"mipmap-{dens}", "ic_launcher_monochrome.png")
        # Viejo: 48 dp, cuadrado redondeado con el logo
        lado = round(48 * k)
        viejo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
        ImageDraw.Draw(viejo).rounded_rectangle((0, 0, lado - 1, lado - 1), radius=round(lado * 0.22), fill=FONDO)
        lg = logo(round(lado * 0.7))
        viejo.alpha_composite(lg, ((lado - lg.width) // 2, (lado - lg.height) // 2))
        guardar(viejo, f"mipmap-{dens}", "ic_launcher.png")
    d = os.path.join(RES, "mipmap-anydpi-v26")
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "ic_launcher.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n'
                '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
                '    <background android:drawable="@color/ic_launcher_background" />\n'
                '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
                '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n'
                '</adaptive-icon>\n')
    guardar(logo(384), "drawable", "splash.png")
    print("iconos listos en", RES)


if __name__ == "__main__":
    main()
