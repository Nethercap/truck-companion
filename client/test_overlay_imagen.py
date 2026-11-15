"""El overlay como imagen de Pillow ("Dibujar adentro del juego"): el mismo
dibujo que la ventana, con el fondo, las esquinas y la opacidad que a la
ventana le pone Windows. Las fuentes son las que haya (en Windows Segoe UI):
aca se mira la forma, no la letra."""

import overlay
import overlay_imagen
from overlay_imagen import LienzoPil


def _datos(items=overlay.ITEMS, **kw):
    d = overlay.ejemplo(items, ("Remaining", "Arrival (real)", "Arrival (game)", "Time"))
    d.update(kw)
    return d


def _es_fondo(px) -> bool:
    bg = tuple(int(overlay.BG[i:i + 2], 16) for i in (1, 3, 5))
    return all(abs(a - b) <= 2 for a, b in zip(px[:3], bg))


def test_la_imagen_tiene_el_tamano_del_dibujo():
    lz = LienzoPil()
    ancho, alto = overlay.dibujar_overlay(lz, _datos(), 1.0)
    img = lz.imagen()
    assert img.mode == "RGBA" and img.size == (ancho, alto) == lz.size
    # Mas grande a mas escala, y nunca menos que el minimo de la ventana
    grande = overlay_imagen.imagen_overlay(_datos(), 1.5, 100)
    assert grande.width > img.width and grande.height > img.height
    assert img.width >= 420


def test_esquinas_transparentes_y_la_opacidad_en_el_alfa():
    img = overlay_imagen.imagen_overlay(_datos(("speed",)), 1.0, 100)
    assert img.getpixel((0, 0))[3] == 0  # la esquina redondeada
    assert img.getpixel((img.width - 1, img.height - 1))[3] == 0
    medio = img.getpixel((img.width // 2, img.height - 3))
    assert medio[3] == 255 and _es_fondo(medio)
    # Al 60 % todo queda al 60 %, el texto tambien (como la ventana)
    img = overlay_imagen.imagen_overlay(_datos(("speed",)), 1.0, 60)
    assert img.getpixel((img.width // 2, img.height - 3))[3] == round(255 * 153 / 255)
    assert img.getchannel("A").getextrema()[1] == 153
    # Fuera del rango del deslizador, el mas cercano
    img = overlay_imagen.imagen_overlay(_datos(("speed",)), 1.0, 5)
    assert img.getchannel("A").getextrema()[1] == round(overlay.OPACITY_MIN * 255 / 100)


def test_dibuja_el_texto_y_el_limite():
    d = _datos(("speed",), speed="92", limit="80", over=True)
    lz = LienzoPil()
    overlay.dibujar_overlay(lz, d, 1.0)
    img = lz.imagen()
    textos = [op for op in lz.ops if op[0] == "texto"]
    assert [op[3] for op in textos] == [["80"], ["92"], ["km/h"]]
    # La velocidad pasada del limite va en rojo
    assert textos[1][4] == overlay.RED
    # Algo rojo y algo blanco (el circulo del limite) en la imagen
    colores = {c for _, c in img.getcolors(img.width * img.height)}
    assert any(r > 200 and g < 80 and b < 80 for r, g, b, a in colores)
    assert any(r > 240 and g > 240 and b > 240 for r, g, b, a in colores)


def test_las_flechas_van_con_la_fuente_de_simbolos():
    tramos = overlay_imagen._tramos("↱ Turn right", (24, True))
    assert [t for t, _ in tramos] == ["↱", " Turn right"]
    assert tramos[0][1] is overlay_imagen.fuente(24, "simbolos")
    assert tramos[1][1] is overlay_imagen.fuente(24, True)
    # ⬆ (seguir derecho) tambien; las letras de los ocho idiomas no
    assert len(overlay_imagen._tramos("⬆ Continue", (24, True))) == 2
    assert len(overlay_imagen._tramos("Łódź Içmeler Прямо", (24, False))) == 1


def test_anclas_y_alto_de_linea_como_tk():
    lz = LienzoPil()
    f = (20, True)
    alto = sum(overlay_imagen._metricas(overlay_imagen.fuente(20, True)))
    x0, y0, x1, y1 = lz.texto(100, 50, "21:05", "#fff", f, "se")
    assert (x1, y1) == (100, 50) and y1 - y0 == alto
    x0, y0, x1, y1 = lz.texto(10, 50, "21:05", "#fff", f, "w")
    assert x0 == 10 and abs((y0 + y1) / 2 - 50) <= 1
    x0, y0, x1, y1 = lz.texto(10, 5, "21:05", "#fff", f, "nw")
    assert (x0, y0) == (10, 5) and x1 - x0 == lz.mide("21:05", f)
    x0, y0, x1, y1 = lz.texto(200, 100, "80", "#000", f)
    assert abs((x0 + x1) / 2 - 200) <= 1 and abs((y0 + y1) / 2 - 100) <= 1


def test_el_texto_largo_se_corta_por_palabras():
    lz = LienzoPil()
    f = (24, True)
    texto = "Turn right onto Interstate 80 toward Cheyenne in 400 m"
    ancho = lz.mide(texto, f) // 2
    x0, y0, x1, y1 = lz.texto(0, 0, texto, "#fff", f, "nw", ancho)
    lineas = lz.ops[-1][3]
    assert len(lineas) >= 2 and " ".join(lineas) == texto
    assert all(lz.mide(linea, f) <= ancho for linea in lineas)
    assert x1 - x0 <= ancho and y1 - y0 == len(lineas) * lz.ops[-1][6]
    # Una palabra sola mas larga que el ancho se corta donde llega
    lz.texto(0, 0, "Mecklenburg-Vorpommern", "#fff", f, "nw", 60)
    partes = lz.ops[-1][3]
    assert len(partes) > 1 and "".join(partes) == "Mecklenburg-Vorpommern"


def test_todo_lo_del_overlay_se_dibuja_sin_errores():
    # Con carriles, paradas, barra, rumbo, crucero, marcha y las cuatro columnas
    d = _datos()
    assert d["lanes"] and d["stops"] and d["near_stops"]
    for k in (0.6, 1.0, 2.3):
        img = overlay_imagen.imagen_overlay(d, k, 90, parpadeo=True)
        assert img.width > 0 and img.height > 0
    # El marco del modo Mover (rayas) tambien, aunque adentro del juego no va
    lz = LienzoPil()
    overlay.dibujar_overlay(lz, d, 1.0, clics=True)
    assert any(op[0] == "rectangulo" and op[8] for op in lz.ops)
    lz.imagen()


def test_curva_suave_de_tk():
    # La caja del carril de dibujar_overlay: queda adentro de su rectangulo
    x, y, w, h, r = 10, 20, 30, 36, 4
    puntos = [x + r, y, x + w - r, y, x + w, y, x + w, y + r, x + w, y + h - r, x + w, y + h,
              x + w - r, y + h, x + r, y + h, x, y + h, x, y + h - r, x, y + r, x, y]
    curva = overlay_imagen._bezier_suave(puntos)
    assert all(x <= px <= x + w and y <= py <= y + h for px, py in curva)
    # Las esquinas no llegan al vertice
    assert (x, y) not in curva and (x + w, y + h) not in curva
