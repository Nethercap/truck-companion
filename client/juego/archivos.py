"""Los archivos de ETS2 y ATS como los lee el juego: .scs (HashFS v1 y v2 o
ZIP), carpetas sueltas y mods en partes.

Todos se usan igual (`Archivo`): `carpeta(ruta)` da el listado de una carpeta
(subcarpetas y archivos), `leer(ruta)` los bytes de un archivo ya
descomprimido, `recorrer()` todas las rutas que se alcanzan desde la raiz. Las
rutas van sin barra adelante ("def/city.sii"); la raiz es "".

HashFS no guarda rutas sino el CityHash64 de cada una: un archivo se encuentra
si se sabe su ruta, y las carpetas traen un listado con los nombres de adentro.
Un archivo que ningun listado nombra no aparece en `recorrer()` pero se lee
igual por su ruta, como en el juego.

Los mods "protegidos" traen trampas para las herramientas (entradas basura,
listados sin la marca de carpeta, zlib cortado, ZIP con las firmas cambiadas,
el flag de cifrado prendido): aca se leen como los lee el juego, y lo que no se
puede leer se saltea con su motivo en `avisos`, sin cortar el resto. Los casos
salen de lo aprendido en el armador de mapas (builder/README.md, "What the
patch changes").
"""

from __future__ import annotations

import functools
import os
import struct
import threading
import zlib
from collections import Counter
from dataclasses import dataclass, field

from .cityhash import city64

# ------------------------------------------------------------------ comunes


class ArchivoIlegible(Exception):
    """El archivo entero no se puede abrir (no es un .scs que conozcamos)."""


class CompresionNoSoportada(Exception):
    """Un archivo con una compresion que aca no se lee (gdeflate, o zstd sin la
    libreria): el resto del .scs se lee igual."""


@dataclass
class Listado:
    """Lo que hay en una carpeta: nombres, sin la ruta."""

    subcarpetas: list = field(default_factory=list)
    archivos: list = field(default_factory=list)


def normalizar(ruta: str) -> str:
    """'/def\\city.sii' -> 'def/city.sii'."""
    return ruta.replace("\\", "/").strip("/")


def unir(carpeta: str, nombre: str) -> str:
    return f"{carpeta}/{nombre}" if carpeta else nombre


class Archivo:
    """Lo comun a todos los origenes. `origen` es el nombre que va en los
    avisos y en `de_donde` del montaje (el del .scs o el de la carpeta)."""

    ruta: str = ""
    origen: str = ""

    def __init__(self):
        self.avisos: list = []

    def carpeta(self, ruta: str) -> Listado | None:
        raise NotImplementedError

    def leer(self, ruta: str) -> bytes | None:
        raise NotImplementedError

    def existe(self, ruta: str) -> bool:
        raise NotImplementedError

    def es_carpeta(self, ruta: str) -> bool:
        return self.carpeta(ruta) is not None

    def es_archivo(self, ruta: str) -> bool:
        raise NotImplementedError

    def recorrer(self, desde: str = ""):
        """Las rutas de los archivos que se alcanzan desde `desde` por los
        listados, en profundidad. Una carpeta nombrada que no se encuentra se
        saltea (pasa en mods: un listado viejo)."""
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

    def cerrar(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.cerrar()


def inflar_zlib(datos: bytes, tamano: int | None = None) -> bytes:
    """zlib como lo lee el juego: hay mods con el flujo cortado antes del final
    (sin el ultimo bloque o sin el adler32). Se acepta lo inflado si da justo
    el tamano que dice la entrada (issue #135 del armador)."""
    try:
        return zlib.decompress(datos)
    except zlib.error:
        d = zlib.decompressobj()
        salida = d.decompress(datos)
        if tamano is not None and len(salida) == tamano:
            return salida
        raise


def inflar_crudo(datos: bytes, tamano: int) -> bytes:
    """Compresion 2 de HashFS v2: deflate sin cabecera ni adler32. Con el mismo
    tamano antes y despues puede ser un archivo guardado tal cual: se toma el
    inflado solo si da justo (Beyond, build.log del 25-11)."""
    if len(datos) == tamano:
        try:
            salida = zlib.decompress(datos, -15)
            return salida if len(salida) == tamano else datos
        except zlib.error:
            return datos
    d = zlib.decompressobj(-15)
    salida = d.decompress(datos)
    if len(salida) == tamano or d.eof:
        return salida
    raise zlib.error("deflate cortado")


def descomprimir_zstd(datos: bytes) -> bytes:
    """Compresion 4. Python la trae desde la 3.14 (`compression.zstd`); antes,
    con la libreria zstandard si esta instalada."""
    try:
        from compression import zstd  # type: ignore[import-not-found]

        return zstd.decompress(datos)
    except ImportError:
        pass
    try:
        import zstandard  # type: ignore[import-not-found]

        return zstandard.ZstdDecompressor().decompressobj().decompress(datos)
    except ImportError:
        raise CompresionNoSoportada("zstd necesita Python 3.14 o la libreria zstandard") from None


class _Archivero:
    """Un archivo del disco abierto una vez, con lecturas por posicion que se
    pueden hacer desde varios hilos."""

    def __init__(self, ruta: str):
        self._f = open(ruta, "rb")
        self._lock = threading.Lock()
        self.tamano = os.fstat(self._f.fileno()).st_size

    def leer(self, posicion: int, cuanto: int) -> bytes:
        with self._lock:
            self._f.seek(posicion)
            return self._f.read(cuanto)

    def cerrar(self):
        self._f.close()


# ------------------------------------------------------------------ HashFS


# Montados el juego, sus DLC y un mod grande son mas de cien .scs, y cada ruta se
# busca en todos: sin esto el hash de la misma ruta se calculaba una vez por
# archivo (ETS2 con ProMods: 18 minutos para leer lo del mapa). Casi todos van
# sin sal, asi que comparten el texto y el hash sale del cache.
_hash_ruta = functools.lru_cache(maxsize=1 << 18)(city64)

_CABECERA_V2 = struct.Struct("<4shh4sIIIIQQQB")  # 53 bytes
_CABECERA_V1 = struct.Struct("<4sHH4sII")  # 20 bytes
_ENTRADA_V2 = struct.Struct("<QIHBB")  # 16 bytes
_ENTRADA_V1 = struct.Struct("<QQIIII")  # 32 bytes
_PLANO = struct.Struct("<IIII")  # 16 bytes

# Tipos de metadato de HashFS v2.
META_IMG = 1
META_SAMPLE = 2
META_MIP_PROXY = 3
META_INLINE_DIRECTORY = 4
META_PMA_INFO = 5
META_PMG_INFO = 6
META_PLAIN = 0x80
META_DIRECTORY = 0x81
META_MIP_0 = 0x82
META_MIP_1 = 0x83
META_MIP_TAIL = 0x84
_META_CONOCIDOS = {
    META_IMG, META_SAMPLE, META_MIP_PROXY, META_INLINE_DIRECTORY, META_PMA_INFO,
    META_PMG_INFO, META_PLAIN, META_DIRECTORY, META_MIP_0, META_MIP_1, META_MIP_TAIL,
}

COMP_NINGUNA = 0
COMP_ZLIB = 1
COMP_DEFLATE = 2
COMP_GDEFLATE = 3
COMP_ZSTD = 4


@dataclass
class Entrada:
    """Una entrada de HashFS: donde estan sus datos y como vienen."""

    hash: int
    posicion: int
    comprimido: int
    tamano: int
    compresion: int
    carpeta: bool
    textura: bool = False


def listado_v2(datos: bytes) -> Listado | None:
    """El listado de una carpeta en v2: cuantos nombres (uint32), el largo de
    cada uno (un byte) y los nombres, las subcarpetas con "/" adelante. None si
    los largos no cierran justo con el tamano o hay un nombre vacio: un archivo
    cualquiera no pasa por un listado."""
    if len(datos) < 4:
        return None
    n = struct.unpack_from("<I", datos, 0)[0]
    if 4 + n > len(datos):
        return None
    largos = datos[4:4 + n]
    if 0 in largos or 4 + n + sum(largos) != len(datos):
        return None
    listado = Listado()
    p = 4 + n
    for largo in largos:
        nombre = datos[p:p + largo].decode("utf-8", "replace")
        p += largo
        if nombre.startswith("/"):
            listado.subcarpetas.append(nombre[1:])
        else:
            listado.archivos.append(nombre)
    return listado


def listado_v1(datos: bytes) -> Listado | None:
    """El listado de v1: texto, un nombre por linea, las subcarpetas con "*"
    adelante. None si no es UTF-8 o trae bytes de control."""
    try:
        texto = datos.decode("utf-8")
    except UnicodeDecodeError:
        return None
    if any(c in texto for c in "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c\x0e\x0f"
           "\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f"):
        return None
    listado = Listado()
    for linea in texto.split("\n"):
        nombre = linea.rstrip("\r")
        if not nombre:
            continue
        if nombre.startswith("*"):
            listado.subcarpetas.append(nombre[1:])
        else:
            listado.archivos.append(nombre)
    return listado


class ArchivoHashFS(Archivo):
    """Un .scs de HashFS, version 1 (antes de 1.50; muchos mods siguen asi) o 2."""

    def __init__(self, ruta: str, origen: str | None = None):
        super().__init__()
        self.ruta = ruta
        self.origen = origen or os.path.basename(ruta)
        self._f = _Archivero(ruta)
        cabeza = self._f.leer(0, _CABECERA_V2.size)
        if len(cabeza) < _CABECERA_V1.size or cabeza[:4] != b"SCS#" or cabeza[8:12] != b"CITY":
            self._f.cerrar()
            raise ArchivoIlegible(f"{ruta}: no es HashFS")
        self.version = struct.unpack_from("<H", cabeza, 4)[0]
        sal = struct.unpack_from("<H", cabeza, 6)[0]
        # Con sal, se hashea la ruta con la sal en decimal adelante.
        self._prefijo = str(sal) if sal else ""
        self._entradas: dict = {}
        self._listados: dict = {}
        self.leidas_como_truco = Counter()
        self.salteadas = Counter()
        if self.version == 1:
            self._leer_v1()
        elif self.version == 2:
            if len(cabeza) < _CABECERA_V2.size:
                self._f.cerrar()
                raise ArchivoIlegible(f"{ruta}: cabecera de HashFS v2 cortada")
            self._leer_v2(_CABECERA_V2.unpack(cabeza))
        else:
            self._f.cerrar()
            raise ArchivoIlegible(f"{ruta}: HashFS version {self.version}")
        if self.salteadas:
            self.avisos.append(
                f"{self.origen}: {sum(self.salteadas.values())} entradas no se pudieron leer "
                f"(basura de un mod protegido?), salteadas: {_resumen(self.salteadas)}")
        if self.leidas_como_truco:
            self.avisos.append(
                f"{self.origen}: {sum(self.leidas_como_truco.values())} entradas leidas por otro camino "
                f"({_resumen(self.leidas_como_truco)})")

    # ---- tablas

    def _hash(self, ruta: str) -> int:
        return _hash_ruta(self._prefijo + normalizar(ruta))

    def _leer_tabla(self, posicion: int, comprimido: int, tamano: int) -> bytes:
        datos = self._f.leer(posicion, comprimido)
        return zlib.decompress(datos) if comprimido != tamano else datos

    def _leer_v1(self):
        _, _, _, _, cuantas, inicio = _CABECERA_V1.unpack(self._f.leer(0, _CABECERA_V1.size))
        tabla = self._f.leer(inicio, cuantas * _ENTRADA_V1.size)
        if len(tabla) < cuantas * _ENTRADA_V1.size:
            raise ArchivoIlegible(f"{self.ruta}: tabla de entradas cortada")
        for i in range(cuantas):
            h, pos, banderas, _crc, tam, comp = _ENTRADA_V1.unpack_from(tabla, i * _ENTRADA_V1.size)
            if banderas & 8:
                self.salteadas["cifrada"] += 1
                continue
            self._entradas[h] = Entrada(h, pos, comp, tam, COMP_ZLIB if banderas & 2 else COMP_NINGUNA,
                                        bool(banderas & 1))

    def _leer_v2(self, cabeza):
        (_, _, _, _, cuantas, comp_entradas, metas, comp_metas,
         pos_entradas, pos_metas, _seguridad, _plataforma) = cabeza
        tabla = self._leer_tabla(pos_entradas, comp_entradas, cuantas * _ENTRADA_V2.size)
        # El campo es la cantidad de valores de 4 bytes, no bytes: una tabla
        # guardada sin comprimir se trataba de inflar ("incorrect header check").
        metadatos = self._leer_tabla(pos_metas, comp_metas, 4 * metas)
        tamano = self._f.tamano
        segundas = []
        for i in range(cuantas):
            h, indice, n_metas, banderas, _ = _ENTRADA_V2.unpack_from(tabla, i * _ENTRADA_V2.size)
            entrada = self._entrada_v2(h, indice, n_metas, bool(banderas & 1), metadatos, tamano)
            if entrada is None:
                lectura = self._entrada_flexible(h, indice, n_metas, bool(banderas & 1), metadatos, tamano)
                if isinstance(lectura, str):
                    self.salteadas[lectura] += 1
                else:
                    segundas.append(lectura)
                continue
            self._entradas[h] = entrada
        for entrada, como in segundas:
            if entrada.hash in self._entradas:
                self.salteadas["mismo hash que otra entrada"] += 1
                continue
            self._entradas[entrada.hash] = entrada
            self.leidas_como_truco[como] += 1

    @staticmethod
    def _metas(indice: int, n: int, tabla: bytes):
        """[(tipo, desde)] de los metadatos de una entrada, o None si caen
        afuera de la tabla."""
        base = 4 * indice
        if base + 4 * n > len(tabla):
            return None
        salida = []
        for k in range(n):
            v = struct.unpack_from("<I", tabla, base + 4 * k)[0]
            salida.append((v >> 24, 4 * (v & 0xFFFFFF)))
        return salida

    @staticmethod
    def _plano(tabla: bytes, desde: int):
        """(comprimido, compresion, tamano, posicion) del metadato de datos, o
        None si cae afuera de la tabla."""
        if desde + _PLANO.size > len(tabla):
            return None
        empaquetado, tamano, _, posicion = _PLANO.unpack_from(tabla, desde)
        return empaquetado & 0x0FFFFFFF, empaquetado >> 28, tamano & 0x0FFFFFFF, posicion * 16

    def _entrada_v2(self, h, indice, n, es_carpeta, tabla, tamano_archivo):
        """La entrada como la arma el juego, o None si no cierra (entonces
        se prueba con `_entrada_flexible`)."""
        metas = self._metas(indice, n, tabla)
        if not metas or any(t not in _META_CONOCIDOS for t, _ in metas):
            return None
        tipos = [t for t, _ in metas]
        textura = False
        if n == 3:
            # Textura: imagen, muestreo y los datos en el MIP_TAIL.
            if es_carpeta or META_IMG not in tipos or META_SAMPLE not in tipos or META_MIP_TAIL not in tipos:
                return None
            desde = metas[tipos.index(META_MIP_TAIL)][1]
            textura = True
        elif n == 2:
            if tipos[0] != META_PLAIN or tipos[1] not in (META_PMA_INFO, META_PMG_INFO):
                return None
            desde = metas[0][1]
        elif n == 1:
            if tipos[0] not in (META_PLAIN, META_DIRECTORY):
                return None
            if es_carpeta != (tipos[0] == META_DIRECTORY):
                return None
            desde = metas[0][1]
        else:
            return None
        plano = self._plano(tabla, desde)
        if plano is None:
            return None
        comprimido, compresion, tam, posicion = plano
        if compresion > COMP_ZSTD or posicion + comprimido > tamano_archivo:
            return None
        return Entrada(h, posicion, comprimido, tam, compresion, es_carpeta, textura)

    def _entrada_flexible(self, h, indice, n, marca_carpeta, tabla, tamano_archivo):
        """Una entrada que no cierra, leida de otra forma: el tipo del metadato
        dice si es carpeta o archivo (no la marca de la entrada), los metadatos
        de mas no importan, y los datos pueden estar donde dice su encabezado o
        justo despues de los encabezados. Se toma solo si es creible: una
        compresion que existe y los datos dentro del archivo. Devuelve
        (Entrada, como) o el motivo por el que queda afuera."""
        if n < 1:
            return "sin metadatos"
        metas = self._metas(indice, n, tabla)
        if metas is None:
            return "metadatos fuera de la tabla"
        planos = [k for k, (t, _) in enumerate(metas) if t in (META_PLAIN, META_DIRECTORY)]
        if not planos:
            if any(t == META_IMG for t, _ in metas):
                return "textura"
            return f"metadato de tipo 0x{metas[0][0]:x}"
        k = planos[0]
        es_carpeta = metas[k][0] == META_DIRECTORY
        indicado = metas[k][1]
        lugares = [indicado]
        if k == 0 and 4 * indice + 4 * n != indicado:
            lugares.append(4 * indice + 4 * n)
        motivo = ""
        for lugar in lugares:
            plano = self._plano(tabla, lugar)
            if plano is None:
                motivo = "metadatos fuera de la tabla"
                continue
            comprimido, compresion, tam, posicion = plano
            if compresion > COMP_ZSTD:
                motivo = f"compresion {compresion}"
                continue
            if posicion + comprimido > tamano_archivo:
                motivo = "datos fuera del archivo"
                continue
            if compresion == COMP_NINGUNA and comprimido != tam:
                motivo = "guardado tal cual con dos tamanos"
                continue
            entrada = Entrada(h, posicion, comprimido, tam, compresion, es_carpeta)
            if es_carpeta:
                try:
                    if listado_v2(self._datos(entrada)) is None:
                        raise ValueError
                except Exception:
                    motivo = "listado de carpeta ilegible"
                    continue
            como = ("metadatos despues de sus encabezados" if lugar != indicado
                    else "marca de carpeta" if marca_carpeta != es_carpeta else "metadatos de mas")
            return entrada, como
        return motivo

    # ---- lectura

    def _datos(self, e: Entrada) -> bytes:
        crudo = self._f.leer(e.posicion, e.comprimido)
        if len(crudo) != e.comprimido:
            raise OSError("datos cortados")
        if e.compresion == COMP_NINGUNA:
            return crudo
        if e.compresion == COMP_ZLIB:
            return inflar_zlib(crudo, e.tamano)
        if e.compresion == COMP_DEFLATE:
            return inflar_crudo(crudo, e.tamano)
        if e.compresion == COMP_ZSTD:
            return descomprimir_zstd(crudo)
        raise CompresionNoSoportada(f"compresion {e.compresion} (gdeflate)")

    def entrada(self, ruta: str) -> Entrada | None:
        return self._entradas.get(self._hash(ruta))

    def existe(self, ruta: str) -> bool:
        return self._hash(ruta) in self._entradas

    def es_archivo(self, ruta: str) -> bool:
        e = self.entrada(ruta)
        return e is not None and not e.carpeta

    def leer(self, ruta: str) -> bytes | None:
        e = self.entrada(ruta)
        if e is None or e.carpeta:
            return None
        return self._datos(e)

    def carpeta(self, ruta: str) -> Listado | None:
        h = self._hash(ruta)
        if h in self._listados:
            return self._listados[h]
        e = self._entradas.get(h)
        listado = None
        if e is not None:
            parsear = listado_v1 if self.version == 1 else listado_v2
            try:
                listado = parsear(self._datos(e))
            except Exception:
                listado = None
            if listado is None and e.carpeta:
                self.salteadas["listado de carpeta ilegible"] += 1
            # Un listado guardado como archivo, sin la marca de carpeta (truco
            # de mods protegidos): vale solo si tiene la forma exacta de uno.
        self._listados[h] = listado
        return listado

    def cerrar(self):
        self._f.cerrar()


# ------------------------------------------------------------------ ZIP


@dataclass
class _EnZip:
    posicion: int
    comprimido: int
    metodo: int


class ArchivoZip(Archivo):
    """Un .scs que es un ZIP (Coast to Coast, Grand Utopia, las expansiones de
    Canada...). Solo lee el indice central al abrir y descomprime cada archivo
    cuando se lo piden. Ignora el flag de cifrado, los CRC y la firma de cada
    cabecera local: hay mods que los rompen a proposito (Roextended, y los de
    firma "AEM!") y el juego tampoco los mira."""

    def __init__(self, ruta: str, origen: str | None = None):
        super().__init__()
        self.ruta = ruta
        self.origen = origen or os.path.basename(ruta)
        self._f = _Archivero(ruta)
        self._archivos: dict = {}
        self._carpetas: dict = {"": Listado()}
        try:
            self._leer_indice()
        except ArchivoIlegible:
            self._f.cerrar()
            raise

    def _leer_indice(self):
        tam = self._f.tamano
        cola = min(tam, 65557)
        buf = self._f.leer(tam - cola, cola)
        fin = buf.rfind(b"PK\x05\x06")
        if fin < 0 or fin + 22 > len(buf):
            raise ArchivoIlegible(f"{self.ruta}: no se encuentra el indice central del ZIP")
        cuantos, tam_indice, pos_indice = struct.unpack_from("<HII", buf, fin + 10)
        # ZIP64: el indice de verdad lo dice el localizador de 20 bytes de antes.
        if 0xFFFFFFFF in (tam_indice, pos_indice) or cuantos == 0xFFFF:
            loc = fin - 20
            if loc >= 0 and buf[loc:loc + 4] == b"PK\x06\x07":
                pos64 = struct.unpack_from("<Q", buf, loc + 8)[0]
                fin64 = self._f.leer(pos64, 56)
                if fin64[:4] == b"PK\x06\x06":
                    cuantos, tam_indice, pos_indice = struct.unpack_from("<QQQ", fin64, 32)
        indice = self._f.leer(pos_indice, tam_indice)
        p = 0
        n = 0
        while n < cuantos and p + 46 <= len(indice):
            if indice[p:p + 4] != b"PK\x01\x02":
                raise ArchivoIlegible(f"{self.ruta}: indice central roto")
            metodo = struct.unpack_from("<H", indice, p + 10)[0]
            comprimido, _tam = struct.unpack_from("<II", indice, p + 20)
            n_nombre, n_extra, n_coment = struct.unpack_from("<HHH", indice, p + 28)
            posicion = struct.unpack_from("<I", indice, p + 42)[0]
            nombre = indice[p + 46:p + 46 + n_nombre].decode("utf-8", "replace")
            extra = indice[p + 46 + n_nombre:p + 46 + n_nombre + n_extra]
            p += 46 + n_nombre + n_extra + n_coment
            n += 1
            if 0xFFFFFFFF in (comprimido, posicion):
                comprimido, posicion = self._zip64(extra, comprimido, _tam, posicion)
            ruta = normalizar(nombre)
            if not ruta:
                continue
            if nombre.replace("\\", "/").endswith("/"):
                self._asegurar(ruta)
                continue
            self._archivos[ruta] = _EnZip(posicion, comprimido, metodo)
            padre, _, base = ruta.rpartition("/")
            self._asegurar(padre).archivos.append(base)

    @staticmethod
    def _zip64(extra: bytes, comprimido: int, tam: int, posicion: int):
        p = 0
        while p + 4 <= len(extra):
            ident, largo = struct.unpack_from("<HH", extra, p)
            if ident == 0x0001:
                campos = extra[p + 4:p + 4 + largo]
                q = 0
                if tam == 0xFFFFFFFF and q + 8 <= len(campos):
                    q += 8
                if comprimido == 0xFFFFFFFF and q + 8 <= len(campos):
                    comprimido = struct.unpack_from("<Q", campos, q)[0]
                    q += 8
                if posicion == 0xFFFFFFFF and q + 8 <= len(campos):
                    posicion = struct.unpack_from("<Q", campos, q)[0]
                break
            p += 4 + largo
        return comprimido, posicion

    def _asegurar(self, carpeta: str) -> Listado:
        """Los ZIP no siempre traen las carpetas como entradas: se arman de las rutas."""
        listado = self._carpetas.get(carpeta)
        if listado is None:
            listado = Listado()
            self._carpetas[carpeta] = listado
            if carpeta:
                padre, _, base = carpeta.rpartition("/")
                self._asegurar(padre).subcarpetas.append(base)
        return listado

    def existe(self, ruta: str) -> bool:
        ruta = normalizar(ruta)
        return ruta in self._archivos or ruta in self._carpetas

    def es_archivo(self, ruta: str) -> bool:
        return normalizar(ruta) in self._archivos

    def carpeta(self, ruta: str) -> Listado | None:
        return self._carpetas.get(normalizar(ruta))

    def leer(self, ruta: str) -> bytes | None:
        f = self._archivos.get(normalizar(ruta))
        if f is None:
            return None
        cabeza = self._f.leer(f.posicion, 30)
        if len(cabeza) < 30:
            raise OSError(f"{self.ruta}: cabecera local cortada")
        n_nombre, n_extra = struct.unpack_from("<HH", cabeza, 26)
        datos = self._f.leer(f.posicion + 30 + n_nombre + n_extra, f.comprimido)
        if f.metodo == 0:
            return datos
        if f.metodo == 8:
            d = zlib.decompressobj(-15)
            return d.decompress(datos) + d.flush()
        if f.metodo == 93:
            return descomprimir_zstd(datos)
        raise CompresionNoSoportada(f"{self.ruta}: metodo de compresion {f.metodo} del ZIP")

    def cerrar(self):
        self._f.cerrar()


# ------------------------------------------------------------------ carpeta


class ArchivoCarpeta(Archivo):
    """Un mod ya extraido en una carpeta (el taller), o un mod que el juego lee
    como carpeta."""

    def __init__(self, ruta: str, origen: str | None = None):
        super().__init__()
        if not os.path.isdir(ruta):
            raise ArchivoIlegible(f"{ruta}: no es una carpeta")
        self.ruta = ruta
        self.origen = origen or os.path.basename(os.path.normpath(ruta))

    def _disco(self, ruta: str) -> str:
        ruta = normalizar(ruta)
        return os.path.join(self.ruta, *ruta.split("/")) if ruta else self.ruta

    def existe(self, ruta: str) -> bool:
        return os.path.exists(self._disco(ruta))

    def es_archivo(self, ruta: str) -> bool:
        return os.path.isfile(self._disco(ruta))

    def carpeta(self, ruta: str) -> Listado | None:
        disco = self._disco(ruta)
        if not os.path.isdir(disco):
            return None
        listado = Listado()
        with os.scandir(disco) as it:
            for e in sorted(it, key=lambda e: e.name):
                (listado.subcarpetas if e.is_dir() else listado.archivos).append(e.name)
        return listado

    def leer(self, ruta: str) -> bytes | None:
        disco = self._disco(ruta)
        if not os.path.isfile(disco):
            return None
        with open(disco, "rb") as f:
            return f.read()


# ------------------------------------------------------------------ partes


class Parte(Archivo):
    """Una parte de un mod ("base" o "dlc_<nombre>"): el mismo archivo visto
    desde esa subcarpeta, como la monta el juego."""

    def __init__(self, archivo: Archivo, prefijo: str, cierra: bool):
        super().__init__()
        self._archivo = archivo
        self._prefijo = normalizar(prefijo)
        self._cierra = cierra
        self.ruta = f"{archivo.ruta}/{self._prefijo}"
        self.origen = f"{archivo.origen}/{self._prefijo}"

    def _r(self, ruta: str) -> str:
        return unir(self._prefijo, normalizar(ruta))

    def existe(self, ruta: str) -> bool:
        return self._archivo.existe(self._r(ruta))

    def es_archivo(self, ruta: str) -> bool:
        return self._archivo.es_archivo(self._r(ruta))

    def carpeta(self, ruta: str) -> Listado | None:
        return self._archivo.carpeta(self._r(ruta))

    def leer(self, ruta: str) -> bytes | None:
        return self._archivo.leer(self._r(ruta))

    def cerrar(self):
        # El archivo es uno solo: lo cierra una de sus partes.
        if self._cierra:
            self._archivo.cerrar()


def elegir_partes(nombres, dlcs) -> tuple[list, list] | None:
    """(las que se montan, en orden; las de un DLC que no esta) de los nombres
    de la raiz de un mod, o None si no viene en partes. `dlcs`: los DLC de la
    carpeta del juego, con el nombre de su .scs sin la extension ("dlc_wa").
    "base" va siempre y primero; un "dlc_" solo si ese DLC esta."""
    def parte(n):
        return n[:-4] if n.endswith(".zip") else n

    todas = sorted({n for n in nombres if parte(n) == "base" or parte(n).startswith("dlc_")})
    if not todas:
        return None
    base = [n for n in todas if parte(n) == "base"]
    de_dlc = [n for n in todas if parte(n) != "base"]
    return base + [n for n in de_dlc if parte(n) in dlcs], [n for n in de_dlc if parte(n) not in dlcs]


def partes_de_mod(archivo: Archivo, dlcs=frozenset()) -> list:
    """Las partes de un mod (wiki de SCS, "Mod manager", desde la 1.48), o el mod
    tal cual si no viene en partes. El juego monta cada parte como un mod
    aparte y la raiz no la lee: ATS Expansion viene asi, y leyendo la raiz no
    aparecia nada de el (Discord, 23-11)."""
    raiz = archivo.carpeta("")
    # Por nombre y no solo por el listado de la raiz: a un mod protegido le
    # puede faltar, y sus carpetas se encuentran igual por el hash.
    candidatos = ["base", *dlcs, *(raiz.subcarpetas if raiz else [])]
    elegidas = elegir_partes([n for n in candidatos if archivo.es_carpeta(n)], dlcs)
    zips = elegir_partes([f for f in (raiz.archivos if raiz else []) if f.endswith(".zip")], dlcs)
    if zips:
        archivo.avisos.append(f"{archivo.origen}: no se puede leer un zip adentro del mod: "
                              f"{', '.join(zips[0] + zips[1])}")
    if not elegidas:
        return [archivo]
    montadas, sin_dlc = elegidas
    archivo.avisos.append(f"{archivo.origen}: en partes, se leen: {', '.join(montadas) or 'ninguna'}"
                          + (f" (sin el DLC: {', '.join(sin_dlc)})" if sin_dlc else ""))
    if not montadas:
        archivo.cerrar()
        return []
    return [Parte(archivo, nombre, i == 0) for i, nombre in enumerate(montadas)]


# ------------------------------------------------------------------ abrir


def abrir(ruta: str, origen: str | None = None) -> Archivo:
    """Un .scs (HashFS o ZIP, sea cual sea su extension) o una carpeta."""
    if os.path.isdir(ruta):
        return ArchivoCarpeta(ruta, origen)
    with open(ruta, "rb") as f:
        firma = f.read(4)
    if firma == b"SCS#":
        return ArchivoHashFS(ruta, origen)
    # "AEM!": un ZIP con las firmas cambiadas, CRC falsos y el flag de cifrado,
    # con los datos sin cifrar. Solo se usa el indice central.
    if firma[:2] == b"PK" or firma == b"AEM!":
        return ArchivoZip(ruta, origen)
    raise ArchivoIlegible(f"{ruta}: no es un .scs que conozcamos (ni HashFS ni ZIP)")


def _resumen(cuentas: Counter) -> str:
    return ", ".join(f"{motivo}: {n}" for motivo, n in cuentas.most_common(6))
