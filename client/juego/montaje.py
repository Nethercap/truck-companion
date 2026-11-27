"""Los archivos del juego, sus DLC y los mods juntos, como los ve el juego.

Cada archivo montado tapa a los de antes: si dos traen la misma ruta, gana el
ultimo que se monto. Las carpetas juntan lo de todos (sin repetir nombres).

`montar_juego` arma lo de una instalacion: los archivos base que lee el parser
de mapas (base, base_map, base_share, core, def, locale y version), los DLC en
orden alfabetico (`dlc_*.scs`) y despues los mods, en el orden en que los monta
el juego (el de su game.log.txt, `map_builder.mounted_mod_paths`), cada uno en
sus partes si viene asi (`archivos.partes_de_mod`).
"""

from __future__ import annotations

import os

from .archivos import Archivo, ArchivoIlegible, Listado, abrir, normalizar, partes_de_mod, unir

# Los .scs del juego que hacen falta para el mapa (lo mismo que pide el parser
# de truckermudgeon); el resto (efectos, vehiculos, sonidos) no.
ARCHIVOS_BASE = ("base.scs", "base_map.scs", "base_share.scs", "core.scs", "def.scs",
                 "locale.scs", "version.scs")


class SistemaDeArchivos:
    """Varios `Archivo` montados en orden: el ultimo gana."""

    def __init__(self, archivos=()):
        self.archivos: list = list(archivos)
        self.avisos: list = []

    def montar(self, archivo: Archivo):
        self.archivos.append(archivo)

    def de_donde(self, ruta: str) -> Archivo | None:
        """El archivo montado de donde sale `ruta` (el ultimo que la tiene)."""
        for archivo in reversed(self.archivos):
            if archivo.es_archivo(ruta):
                return archivo
        return None

    def leer(self, ruta: str) -> bytes | None:
        for archivo in reversed(self.archivos):
            datos = archivo.leer(ruta)
            if datos is not None:
                return datos
        return None

    def existe(self, ruta: str) -> bool:
        return any(a.existe(ruta) for a in self.archivos)

    def carpeta(self, ruta: str) -> Listado | None:
        """Lo de esa carpeta en todos los archivos, sin repetir nombres, en el
        orden en que aparecen por primera vez."""
        listados = [lst for lst in (a.carpeta(ruta) for a in self.archivos) if lst is not None]
        if not listados:
            return None
        junto = Listado()
        vistos_c, vistos_a = set(), set()
        for lst in listados:
            for nombre in lst.subcarpetas:
                if nombre not in vistos_c:
                    vistos_c.add(nombre)
                    junto.subcarpetas.append(nombre)
            for nombre in lst.archivos:
                if nombre not in vistos_a:
                    vistos_a.add(nombre)
                    junto.archivos.append(nombre)
        return junto

    def recorrer(self, desde: str = ""):
        pendientes = [normalizar(desde)]
        vistas = set()
        while pendientes:
            actual = pendientes.pop()
            if actual in vistas:
                continue
            vistas.add(actual)
            listado = self.carpeta(actual)
            if listado is None:
                continue
            for nombre in listado.archivos:
                yield unir(actual, nombre)
            for nombre in reversed(listado.subcarpetas):
                pendientes.append(unir(actual, nombre))

    def todos_los_avisos(self) -> list:
        return self.avisos + [a for archivo in self.archivos for a in archivo.avisos]

    def cerrar(self):
        for archivo in self.archivos:
            archivo.cerrar()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.cerrar()


def archivos_del_juego(carpeta_juego: str, con_dlc: bool = True) -> list:
    """Las rutas de los .scs del juego que se montan, en orden: los base (en el
    orden alfabetico de la carpeta) y los DLC entre ellos, como el parser."""
    nombres = sorted(n for n in os.listdir(carpeta_juego)
                     if n.lower().endswith(".scs") and os.path.isfile(os.path.join(carpeta_juego, n)))
    elegidos = [n for n in nombres if n.lower() in ARCHIVOS_BASE or (con_dlc and n.lower().startswith("dlc"))]
    return [os.path.join(carpeta_juego, n) for n in elegidos]


def dlcs_del_juego(carpeta_juego: str) -> set:
    """Los DLC instalados, con el nombre de su .scs sin la extension ("dlc_wa")."""
    return {n[:-4].lower() for n in os.listdir(carpeta_juego)
            if n.lower().startswith("dlc_") and n.lower().endswith(".scs")}


def montar_juego(carpeta_juego: str, mods=(), con_dlc: bool = True) -> SistemaDeArchivos:
    """El juego de `carpeta_juego` con sus DLC y los `mods` (rutas de .scs o de
    carpetas, en el orden en que los monta el juego). Un archivo que no se puede
    abrir se saltea con un aviso: el resto se monta igual."""
    fs = SistemaDeArchivos()
    for ruta in archivos_del_juego(carpeta_juego, con_dlc):
        try:
            fs.montar(abrir(ruta))
        except (ArchivoIlegible, OSError) as exc:
            fs.avisos.append(f"{os.path.basename(ruta)}: no se pudo abrir ({exc})")
    dlcs = dlcs_del_juego(carpeta_juego) if con_dlc else set()
    for ruta in mods:
        try:
            archivo = abrir(ruta)
        except (ArchivoIlegible, OSError) as exc:
            fs.avisos.append(f"{os.path.basename(ruta)}: se saltea ({exc})")
            continue
        partes = partes_de_mod(archivo, dlcs)
        if partes != [archivo]:
            # Las partes no llevan los avisos del archivo (que no queda montado).
            fs.avisos.extend(archivo.avisos)
        for parte in partes:
            fs.montar(parte)
    return fs
