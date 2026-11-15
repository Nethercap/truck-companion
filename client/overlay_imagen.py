"""El overlay como imagen de Pillow, para dibujarlo adentro del juego.

Con "Dibujar adentro del juego" (Setup) el overlay no es una ventana: el
cliente arma aca la imagen, con el mismo dibujo que la ventana
(dibujar_overlay de overlay.py), y el plugin la pega en cada cuadro del juego
(overlay_juego.py, plugin/scs-telemetry/src/truckersmp_overlay.cpp). Asi sale
en los clips y en lo que graba solo la imagen del juego: la grabacion de
Steam, la Xbox Game Bar, la Captura de juego de OBS (Discord, 15-11: el de
Trucky sale y el nuestro no).

Lo que Tk hace solo y aca va a mano:
- las fuentes: Segoe UI de la carpeta de Windows, y las flechas del giro
  (↰ ↱ ↻ ⬆) con Segoe UI Symbol, porque Segoe UI no las tiene y Tk cambia de
  fuente solo;
- el ancla y el alto del texto como en Tk: el alto de la linea (ascent mas
  descent) y no el de la tinta, asi las medidas de dibujar_overlay valen;
- el texto con ancho maximo, cortado por palabras;
- las lineas con punta redonda, y los bordes centrados en el contorno;
- el poligono suave (la caja de un carril), con la curva de Tk;
- las esquinas redondeadas y la opacidad, que a la ventana se las pone Windows.

La imagen sale con el alfa sin premultiplicar (RGBA de Pillow): el plugin la
mezcla con SRC_ALPHA / INV_SRC_ALPHA.
"""

import collections
import functools
import os
import sys

from PIL import Image, ImageDraw, ImageFont

import overlay

# Los caracteres que van con la fuente de simbolos: flechas (U+2190-21FF),
# flechas suplementarias (U+27F0-27FF, U+2900-297F) y simbolos y flechas
# varios (U+2B00-2BFF, donde esta el ⬆ de "seguir derecho").
RANGOS_SIMBOLOS = ((0x2190, 0x21FF), (0x27F0, 0x27FF), (0x2900, 0x297F), (0x2B00, 0x2BFF))

# Los archivos de cada fuente: el primero que haya. En Windows las de la
# ventana; en otro sistema (los tests) alguna parecida.
FUENTES = {
    False: ("segoeui.ttf", "DejaVuSans.ttf"),
    True: ("segoeuib.ttf", "DejaVuSans-Bold.ttf"),
    "simbolos": ("seguisym.ttf", "DejaVuSans.ttf"),
}

# Las esquinas de la ventana con DWMWCP_ROUND: 8 px en Windows 11
RADIO = 8
# Las formas se dibujan a 3 veces el tamano y se achican: bordes suaves
SUPER = 3
# Cuantas capas de formas se guardan: con el limite pasado el anillo titila
# (dos capas que se alternan cada medio segundo)
FORMAS_GUARDADAS = 4


def _es_simbolo(c: str) -> bool:
    n = ord(c)
    return any(a <= n <= b for a, b in RANGOS_SIMBOLOS)


def _carpeta_fuentes():
    if sys.platform == "win32":
        return os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    return None


@functools.lru_cache(maxsize=64)
def fuente(px: int, tipo) -> ImageFont.ImageFont:
    """La fuente de ese tamano en pixeles (el alto del em, como el tamano
    negativo de Tk). tipo: False normal, True negrita o "simbolos"."""
    carpeta = _carpeta_fuentes()
    for archivo in FUENTES[tipo]:
        try:
            return ImageFont.truetype(os.path.join(carpeta, archivo) if carpeta else archivo, px)
        except OSError:
            continue
    return ImageFont.load_default(px)


def _metricas(f) -> tuple[int, int]:
    try:
        return f.getmetrics()
    except AttributeError:  # la fuente de mapa de bits de Pillow, sin FreeType
        return f.size, 0


def _tramos(texto: str, fuente_spec):
    """El texto en tramos (texto, fuente): las flechas con la de simbolos."""
    px, negrita = fuente_spec
    tramos = []
    for c in texto:
        tipo = "simbolos" if _es_simbolo(c) else negrita
        if tramos and tramos[-1][1] == tipo:
            tramos[-1][0] += c
        else:
            tramos.append([c, tipo])
    return [(t, fuente(px, tipo)) for t, tipo in tramos]


def _bezier_suave(puntos):
    """Los puntos de un poligono suave como lo dibuja Tk (smooth=True): una
    curva cuadratica entre los medios de cada lado, con el vertice de control."""
    pares = list(zip(puntos[0::2], puntos[1::2]))
    n = len(pares)
    if n < 3:
        return pares
    salida = []
    for i in range(n):
        p0, p1, p2 = pares[i - 1], pares[i], pares[(i + 1) % n]
        a = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        b = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
        for paso in range(8):
            t = paso / 8
            salida.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * p1[0] + t * t * b[0],
                           (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * p1[1] + t * t * b[1]))
    return salida


# clave -> imagen de las ultimas formas dibujadas (LienzoPil._formas), la
# mas nueva al final. Solo las usa el hilo del overlay.
_formas_guardadas = collections.OrderedDict()


class LienzoPil:
    """Un lienzo para dibujar_overlay que anota lo que hay que dibujar y lo
    hace en imagen(): el alto se sabe recien al final (tamano())."""

    def __init__(self):
        self.ops = []
        self.size = (1, 1)

    def limpiar(self) -> None:
        self.ops = []

    def tamano(self, ancho: int, alto: int) -> None:
        self.size = (max(1, int(ancho)), max(1, int(alto)))

    def mide(self, texto: str, fuente_spec) -> int:
        return round(sum(f.getlength(t) for t, f in _tramos(texto, fuente_spec)))

    def _lineas(self, texto: str, fuente_spec, ancho):
        """El texto en lineas que entran en ancho, cortado por palabras como
        Tk; una palabra que sola no entra se corta donde llegue."""
        lineas = []
        for parrafo in str(texto).split("\n"):
            if not ancho:
                lineas.append(parrafo)
                continue
            actual = ""
            for palabra in parrafo.split(" "):
                prueba = palabra if not actual else actual + " " + palabra
                if self.mide(prueba, fuente_spec) <= ancho:
                    actual = prueba
                    continue
                if actual:
                    lineas.append(actual)
                actual = ""
                while palabra and self.mide(palabra, fuente_spec) > ancho:
                    corte = len(palabra) - 1
                    while corte > 1 and self.mide(palabra[:corte], fuente_spec) > ancho:
                        corte -= 1
                    lineas.append(palabra[:corte])
                    palabra = palabra[corte:]
                actual = palabra
            lineas.append(actual)
        return lineas

    def texto(self, x, y, texto, color, fuente_spec, ancla="center", ancho=None):
        lineas = self._lineas(texto, fuente_spec, ancho)
        sube, baja = _metricas(fuente(fuente_spec[0], fuente_spec[1]))
        alto_linea = sube + baja
        w = max((self.mide(linea, fuente_spec) for linea in lineas), default=0)
        h = alto_linea * len(lineas)
        x0 = x if ancla in ("w", "nw", "sw") else x - w if ancla in ("e", "ne", "se") else x - w / 2
        y0 = y if ancla in ("n", "nw", "ne") else y - h if ancla in ("s", "sw", "se") else y - h / 2
        self.ops.append(("texto", x0, y0, lineas, color, fuente_spec, alto_linea, sube))
        return (round(x0), round(y0), round(x0 + w), round(y0 + h))

    def ovalo(self, x0, y0, x1, y1, relleno="", borde="", grueso=1) -> None:
        self.ops.append(("ovalo", x0, y0, x1, y1, relleno, borde, grueso))

    def linea(self, puntos, color, grueso, redondo=True) -> None:
        self.ops.append(("linea", tuple(puntos), color, grueso, redondo))

    def rectangulo(self, x0, y0, x1, y1, relleno="", borde="", grueso=1, rayas=None) -> None:
        self.ops.append(("rectangulo", x0, y0, x1, y1, relleno, borde, grueso, rayas))

    def poligono(self, puntos, relleno, suave=False) -> None:
        self.ops.append(("poligono", tuple(puntos), relleno, suave))

    # --- en la imagen

    def imagen(self, radio: int = RADIO, alfa: int = 255) -> Image.Image:
        """La imagen RGBA: el fondo con las esquinas redondeadas, lo anotado
        encima y todo con la opacidad alfa (0-255), como la ventana.

        Las formas se dibujan a SUPER veces el tamano y se achican (bordes
        suaves: Pillow no suaviza circulos ni lineas); el texto va despues, a
        tamano real, con el suavizado de FreeType. Va todo arriba de las
        formas, y en el overlay ningun texto queda debajo de una forma."""
        img = self._formas(radio).copy()
        d = ImageDraw.Draw(img)
        for op in self.ops:
            if op[0] == "texto":
                self._texto(d, *op[1:])
        if alfa < 255:
            img.putalpha(img.getchannel("A").point(lambda a: a * max(0, alfa) // 255))
        return img

    def _formas(self, radio: int) -> Image.Image:
        """El fondo y las formas, ya achicadas. Se guardan las ultimas: casi
        siempre cambia solo un texto (la velocidad) y las formas quedan en
        el mismo lugar, y a SUPER veces el tamano son lo que mas tarda (unos
        30 ms a 1440p, contra 4 ms del texto)."""
        clave = (self.size, radio, tuple(op for op in self.ops if op[0] != "texto"))
        if clave in _formas_guardadas:
            _formas_guardadas.move_to_end(clave)
            return _formas_guardadas[clave]
        ancho, alto = self.size
        s = SUPER
        grande = Image.new("RGBA", (ancho * s, alto * s), (0, 0, 0, 0))
        d = ImageDraw.Draw(grande)
        d.rounded_rectangle((0, 0, ancho * s - 1, alto * s - 1), radius=max(0, radio) * s, fill=overlay.BG)
        for op in clave[2]:
            getattr(self, "_" + op[0])(d, s, *op[1:])
        formas = grande.resize((ancho, alto), Image.Resampling.BOX)
        _formas_guardadas[clave] = formas
        while len(_formas_guardadas) > FORMAS_GUARDADAS:
            _formas_guardadas.popitem(last=False)
        return formas

    @staticmethod
    def _texto(d, x0, y0, lineas, color, fuente_spec, alto_linea, sube):
        for i, linea in enumerate(lineas):
            x = x0
            base = y0 + i * alto_linea + sube
            for t, f in _tramos(linea, fuente_spec):
                d.text((x, base), t, fill=color, font=f, anchor="ls")
                x += f.getlength(t)

    @staticmethod
    def _ovalo(d, s, x0, y0, x1, y1, relleno, borde, grueso):
        caja = (x0 * s, y0 * s, x1 * s - 1, y1 * s - 1)
        if relleno:
            d.ellipse(caja, fill=relleno)
        if borde:
            # Tk centra el borde en el contorno; Pillow lo pone adentro
            m = grueso * s / 2
            d.ellipse((caja[0] - m, caja[1] - m, caja[2] + m, caja[3] + m), outline=borde,
                      width=max(1, round(grueso * s)))

    @staticmethod
    def _linea(d, s, puntos, color, grueso, redondo):
        pares = [(x * s, y * s) for x, y in zip(puntos[0::2], puntos[1::2])]
        ancho = max(1, round(grueso * s))
        d.line(pares, fill=color, width=ancho, joint="curve")
        if redondo:
            r = ancho / 2
            for x, y in (pares[0], pares[-1]):
                d.ellipse((x - r, y - r, x + r, y + r), fill=color)

    @staticmethod
    def _rectangulo(d, s, x0, y0, x1, y1, relleno, borde, grueso, rayas):
        x0, y0, x1, y1 = x0 * s, y0 * s, x1 * s, y1 * s
        if relleno:
            # Tk llena hasta x1 sin incluirlo; Pillow lo incluye
            d.rectangle((x0, y0, max(x0, x1 - 1), max(y0, y1 - 1)), fill=relleno)
        if not borde:
            return
        ancho = max(1, round(grueso * s))
        if rayas:
            lleno, vacio = rayas[0] * s, rayas[1] * s
            for (ax, ay), (bx, by) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)),
                                       ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
                largo = max(abs(bx - ax), abs(by - ay), 1)
                pos = 0
                while pos < largo:
                    fin = min(largo, pos + lleno)
                    fa, fb = pos / largo, fin / largo
                    d.line(((ax + (bx - ax) * fa, ay + (by - ay) * fa), (ax + (bx - ax) * fb, ay + (by - ay) * fb)),
                           fill=borde, width=ancho)
                    pos = fin + vacio
            return
        m = ancho / 2
        d.rectangle((x0 - m, y0 - m, x1 + m, y1 + m), outline=borde, width=ancho)

    @staticmethod
    def _poligono(d, s, puntos, relleno, suave):
        pares = _bezier_suave(puntos) if suave else list(zip(puntos[0::2], puntos[1::2]))
        d.polygon([(x * s, y * s) for x, y in pares], fill=relleno)


def imagen_overlay(d: dict, k: float, opacidad: int, parpadeo: bool = False, cabe=None):
    """El overlay con el contenido d a escala k y la opacidad en por ciento
    (la del deslizador de Setup), listo para el plugin. cabe(ancho, alto):
    si dice que no, None sin dibujar nada (una imagen enorme tarda y ocupa)."""
    lz = LienzoPil()
    ancho, alto = overlay.dibujar_overlay(lz, d, k, parpadeo=parpadeo)
    if cabe is not None and not cabe(ancho, alto):
        return None
    alfa = round(overlay.opacidad_valida(opacidad) * 255 / 100)
    return lz.imagen(radio=max(4, round(RADIO * k)), alfa=alfa)
