"""Lo que tiene cargado el GPS del juego, leido de la partida guardada.

La telemetria del juego dice cuantos km faltan por el GPS, pero no a donde va.
La partida guardada (game.sii de cada carpeta de save/ del perfil) si lo tiene:
los waypoints que quedan por delante (economy.stored_gps_ahead_waypoints, cada
uno un gps_waypoint_storage con la posicion del nodo de navegacion) y el
trabajo elegido en el mercado y todavia no empezado (player.selected_job, un
job_info con la empresa de origen y la de destino). Asi la web puede rutear al
remolque de un trabajo recien elegido, a un pin puesto en el mapa del juego o a
una parada del Atlas del Road Trip.

Esto solo LEE: nunca escribe ni aprieta nada. Lee la partida mas nueva que el
juego escribio por su cuenta (los autoguardados) o con un F5 de quien juega.
Discord, 15-11: de las dos formas que se propusieron (solo leer, o apretar el
guardado rapido desde el plugin, como hace TruckSim GPS), la gente eligio solo
leer, preguntando la primera vez.

El game.sii viene casi siempre cifrado ("ScsC": AES-256-CBC con una clave que
es la misma para todos, y zlib) y en binario ("BSII"); con g_save_format 2, en
texto ("SiiNunit"). Se leen los tres. El cifrado va con la libreria del
sistema (bcrypt en Windows, libcrypto en Linux) y, si no hay, con el AES de
aca, mas lento.
"""

from __future__ import annotations

import ctypes
import ctypes.util
import glob
import logging
import os
import re
import struct
import sys
import zlib

CARPETAS_DEL_JUEGO = {"ets2": "Euro Truck Simulator 2", "ats": "American Truck Simulator"}

# La clave de las partidas cifradas: es publica (la usan SII_Decrypt, los
# editores de partidas y TruckSim GPS) y la misma en ETS2 y ATS.
CLAVE_SII = bytes([
    0x2a, 0x5f, 0xcb, 0x17, 0x91, 0xd2, 0x2f, 0xb6, 0x02, 0x45, 0xb3, 0xd8, 0x36, 0x9e, 0xd0, 0xb2,
    0xc2, 0x73, 0x71, 0x56, 0x3f, 0xbf, 0x1f, 0x3c, 0x9e, 0xdf, 0x6b, 0x11, 0x82, 0x5a, 0x5d, 0x0a,
])

# nav_node_position va en punto fijo: el entero sobre 256 es el metro del juego.
ESCALA_NODO = 256.0

# Una partida mas grande que esto no es una partida (el tamano descomprimido
# viene en la cabecera, y la clave es publica: no se le cree a ciegas).
TAMANO_MAXIMO = 256 * 1024 * 1024

# Las unidades y las claves que se guardan; del resto solo se avanza.
CLAVES = {
    "economy": {"stored_gps_ahead_waypoints"},
    "player": {"current_job", "selected_job"},
    "job_info": {"source_company", "target_company", "cargo", "is_cargo_market_job", "car", "planned_distance_km"},
    "gps_waypoint_storage": {"nav_node_position"},
}


class PartidaIlegible(Exception):
    """El archivo no se pudo leer como partida (a medio escribir, otro formato)."""


# ------------------------------------------------------------------ donde estan


def carpetas_de_perfiles(game: str, documentos: str) -> list:
    """Las carpetas de perfil de ese juego: las locales (profiles) y las de
    Steam Cloud (steam_profiles). Las copias que deja una actualizacion del
    juego ("steam_profiles(1.61.x).bak") no son perfiles en uso."""
    base = os.path.join(documentos, CARPETAS_DEL_JUEGO[game])
    carpetas = []
    for tipo in ("steam_profiles", "profiles"):
        carpetas.extend(glob.glob(os.path.join(base, tipo, "*")))
    return [c for c in carpetas if os.path.isdir(c) and ".bak" not in c.lower()]


def partida_mas_nueva(game: str, documentos: str):
    """(ruta, fecha) del game.sii escrito mas recientemente en cualquier perfil
    de ese juego, o None. El que se esta jugando es el que guarda: el mas nuevo
    es de ese perfil (autoguardado, guardado rapido o uno a mano)."""
    mejor = None
    for perfil in carpetas_de_perfiles(game, documentos):
        for ruta in glob.glob(os.path.join(perfil, "save", "*", "game.sii")):
            try:
                fecha = os.path.getmtime(ruta)
            except OSError:
                continue
            if mejor is None or fecha > mejor[1]:
                mejor = (ruta, fecha)
    return mejor


# ------------------------------------------------------------------ descifrar


def descifrar(datos: bytes) -> bytes:
    """El contenido de un game.sii: si es "ScsC", descifrado y descomprimido;
    si no, tal cual. Cabecera de ScsC: firma (4), HMAC (32, no se mira), IV
    (16), tamano descomprimido (4) y los datos, AES-256-CBC con relleno
    PKCS#7 sobre un zlib."""
    if datos[:4] != b"ScsC":
        return datos
    if len(datos) < 56 + 16 or (len(datos) - 56) % 16:
        raise PartidaIlegible("partida cifrada cortada")
    iv = datos[36:52]
    tamano = struct.unpack_from("<I", datos, 52)[0]
    if tamano > TAMANO_MAXIMO:
        raise PartidaIlegible(f"tamano imposible: {tamano}")
    cifrado = datos[56:]
    ultimo_error = None
    for descifrador in _descifradores():
        try:
            claro = _sin_relleno(descifrador(CLAVE_SII, iv, cifrado))
            salida = zlib.decompress(claro)
        except Exception as exc:  # otra libreria, o el archivo a medio escribir
            ultimo_error = exc
            continue
        return salida
    raise PartidaIlegible(f"no se pudo descifrar ({ultimo_error})")


def _sin_relleno(datos: bytes) -> bytes:
    n = datos[-1] if datos else 0
    if not 1 <= n <= 16 or datos[-n:] != bytes([n]) * n:
        raise PartidaIlegible("relleno PKCS#7 roto")
    return datos[:-n]


def _descifradores():
    """Primero la libreria del sistema; el AES de aca siempre al final."""
    nativo = _aes_bcrypt if sys.platform == "win32" else _aes_libcrypto
    return [nativo, aes_cbc_descifrar]


def _aes_bcrypt(clave: bytes, iv: bytes, datos: bytes) -> bytes:
    """AES-CBC con BCrypt (Windows Vista en adelante), sin relleno: se saca aparte."""
    bcrypt = ctypes.WinDLL("bcrypt")  # type: ignore[attr-defined]
    alg = ctypes.c_void_p()
    llave = ctypes.c_void_p()
    if bcrypt.BCryptOpenAlgorithmProvider(ctypes.byref(alg), ctypes.c_wchar_p("AES"), None, 0):
        raise OSError("BCryptOpenAlgorithmProvider")
    try:
        modo = ctypes.create_unicode_buffer("ChainingModeCBC")
        if bcrypt.BCryptSetProperty(alg, ctypes.c_wchar_p("ChainingMode"), modo, ctypes.sizeof(modo), 0):
            raise OSError("BCryptSetProperty")
        if bcrypt.BCryptGenerateSymmetricKey(alg, ctypes.byref(llave), None, 0, clave, len(clave), 0):
            raise OSError("BCryptGenerateSymmetricKey")
        try:
            vector = ctypes.create_string_buffer(iv, len(iv))
            salida = ctypes.create_string_buffer(len(datos))
            escritos = ctypes.c_ulong()
            if bcrypt.BCryptDecrypt(llave, datos, len(datos), None, vector, len(iv),
                                    salida, len(datos), ctypes.byref(escritos), 0):
                raise OSError("BCryptDecrypt")
            return salida.raw[:escritos.value]
        finally:
            bcrypt.BCryptDestroyKey(llave)
    finally:
        bcrypt.BCryptCloseAlgorithmProvider(alg, 0)


def _aes_libcrypto(clave: bytes, iv: bytes, datos: bytes) -> bytes:
    """AES-256-CBC con el libcrypto de OpenSSL (Linux y Mac), sin relleno."""
    nombre = ctypes.util.find_library("crypto")
    if not nombre:
        raise OSError("sin libcrypto")
    lib = ctypes.CDLL(nombre)
    lib.EVP_CIPHER_CTX_new.restype = ctypes.c_void_p
    lib.EVP_aes_256_cbc.restype = ctypes.c_void_p
    lib.EVP_DecryptInit_ex.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p]
    lib.EVP_CIPHER_CTX_set_padding.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.EVP_DecryptUpdate.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_int), ctypes.c_char_p, ctypes.c_int]
    lib.EVP_DecryptFinal_ex.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.POINTER(ctypes.c_int)]
    lib.EVP_CIPHER_CTX_free.argtypes = [ctypes.c_void_p]
    ctx = lib.EVP_CIPHER_CTX_new()
    if not ctx:
        raise OSError("EVP_CIPHER_CTX_new")
    try:
        if lib.EVP_DecryptInit_ex(ctx, lib.EVP_aes_256_cbc(), None, clave, iv) != 1:
            raise OSError("EVP_DecryptInit_ex")
        lib.EVP_CIPHER_CTX_set_padding(ctx, 0)
        salida = ctypes.create_string_buffer(len(datos) + 32)
        n = ctypes.c_int()
        if lib.EVP_DecryptUpdate(ctx, salida, ctypes.byref(n), datos, len(datos)) != 1:
            raise OSError("EVP_DecryptUpdate")
        total = n.value
        fin = ctypes.create_string_buffer(32)
        if lib.EVP_DecryptFinal_ex(ctx, fin, ctypes.byref(n)) != 1:
            raise OSError("EVP_DecryptFinal_ex")
        return salida.raw[:total] + fin.raw[:n.value]
    finally:
        lib.EVP_CIPHER_CTX_free(ctx)


# AES de aca (FIPS-197, el descifrado con tablas): solo si no hay libreria del
# sistema. Las cajas se calculan, no se copian: un numero mal tipeado en una
# tabla de 256 no se ve, y aca lo prueban los vectores del NIST.
def _armar_tablas():
    sbox = [0] * 256
    p = q = 1
    while True:
        p = (p ^ (p << 1) ^ (0x1B if p & 0x80 else 0)) & 0xFF
        q ^= q << 1
        q ^= q << 2
        q ^= q << 4
        q &= 0xFF
        if q & 0x80:
            q ^= 0x09
        rot = lambda v, s: ((v << s) | (v >> (8 - s))) & 0xFF  # noqa: E731
        sbox[p] = q ^ rot(q, 1) ^ rot(q, 2) ^ rot(q, 3) ^ rot(q, 4) ^ 0x63
        if p == 1:
            break
    sbox[0] = 0x63
    inv = [0] * 256
    for i, v in enumerate(sbox):
        inv[v] = i

    def mul(a, b):
        r = 0
        while b:
            if b & 1:
                r ^= a
            a = ((a << 1) ^ (0x1B if a & 0x80 else 0)) & 0xFF
            b >>= 1
        return r

    td0 = [(mul(inv[x], 14) << 24) | (mul(inv[x], 9) << 16) | (mul(inv[x], 13) << 8) | mul(inv[x], 11) for x in range(256)]
    ror = lambda w, s: ((w >> s) | (w << (32 - s))) & 0xFFFFFFFF  # noqa: E731
    td1 = [ror(w, 8) for w in td0]
    td2 = [ror(w, 16) for w in td0]
    td3 = [ror(w, 24) for w in td0]
    return sbox, inv, td0, td1, td2, td3


_SBOX, _INV, _TD0, _TD1, _TD2, _TD3 = _armar_tablas()


def _llaves_de_descifrado(clave: bytes) -> list:
    """Las 60 palabras de AES-256 y, para el descifrado con tablas, en orden
    inverso y con InvMixColumns en las del medio."""
    nk, nr = 8, 14
    w = list(struct.unpack(">8I", clave))
    rcon = 1
    for i in range(nk, 4 * (nr + 1)):
        t = w[i - 1]
        if i % nk == 0:
            t = ((t << 8) | (t >> 24)) & 0xFFFFFFFF
            t = (_SBOX[t >> 24] << 24) | (_SBOX[(t >> 16) & 255] << 16) | (_SBOX[(t >> 8) & 255] << 8) | _SBOX[t & 255]
            t ^= rcon << 24
            rcon = ((rcon << 1) ^ (0x1B if rcon & 0x80 else 0)) & 0xFF
        elif i % nk == 4:
            t = (_SBOX[t >> 24] << 24) | (_SBOX[(t >> 16) & 255] << 16) | (_SBOX[(t >> 8) & 255] << 8) | _SBOX[t & 255]
        w.append(w[i - nk] ^ t)
    dk = []
    for r in range(nr + 1):
        ronda = w[4 * (nr - r):4 * (nr - r) + 4]
        if 0 < r < nr:
            ronda = [_TD0[_SBOX[v >> 24]] ^ _TD1[_SBOX[(v >> 16) & 255]] ^ _TD2[_SBOX[(v >> 8) & 255]] ^ _TD3[_SBOX[v & 255]]
                     for v in ronda]
        dk.extend(ronda)
    return dk


def aes_cbc_descifrar(clave: bytes, iv: bytes, datos: bytes) -> bytes:
    """AES-256-CBC sin relleno, en Python. Lento (una partida de unos MB tarda
    segundos): solo cuando no hay libreria del sistema."""
    if len(clave) != 32 or len(iv) != 16 or len(datos) % 16:
        raise ValueError("AES-256-CBC: clave de 32, IV de 16 y bloques de 16")
    dk = _llaves_de_descifrado(clave)
    td0, td1, td2, td3, inv = _TD0, _TD1, _TD2, _TD3, _INV
    salida = bytearray(len(datos))
    p0, p1, p2, p3 = struct.unpack(">4I", iv)
    for off in range(0, len(datos), 16):
        c0, c1, c2, c3 = struct.unpack_from(">4I", datos, off)
        s0, s1, s2, s3 = c0 ^ dk[0], c1 ^ dk[1], c2 ^ dk[2], c3 ^ dk[3]
        k = 4
        for _ in range(13):
            t0 = td0[s0 >> 24] ^ td1[(s3 >> 16) & 255] ^ td2[(s2 >> 8) & 255] ^ td3[s1 & 255] ^ dk[k]
            t1 = td0[s1 >> 24] ^ td1[(s0 >> 16) & 255] ^ td2[(s3 >> 8) & 255] ^ td3[s2 & 255] ^ dk[k + 1]
            t2 = td0[s2 >> 24] ^ td1[(s1 >> 16) & 255] ^ td2[(s0 >> 8) & 255] ^ td3[s3 & 255] ^ dk[k + 2]
            t3 = td0[s3 >> 24] ^ td1[(s2 >> 16) & 255] ^ td2[(s1 >> 8) & 255] ^ td3[s0 & 255] ^ dk[k + 3]
            s0, s1, s2, s3 = t0, t1, t2, t3
            k += 4
        o0 = ((inv[s0 >> 24] << 24) | (inv[(s3 >> 16) & 255] << 16) | (inv[(s2 >> 8) & 255] << 8) | inv[s1 & 255]) ^ dk[k]
        o1 = ((inv[s1 >> 24] << 24) | (inv[(s0 >> 16) & 255] << 16) | (inv[(s3 >> 8) & 255] << 8) | inv[s2 & 255]) ^ dk[k + 1]
        o2 = ((inv[s2 >> 24] << 24) | (inv[(s1 >> 16) & 255] << 16) | (inv[(s0 >> 8) & 255] << 8) | inv[s3 & 255]) ^ dk[k + 2]
        o3 = ((inv[s3 >> 24] << 24) | (inv[(s2 >> 16) & 255] << 16) | (inv[(s1 >> 8) & 255] << 8) | inv[s0 & 255]) ^ dk[k + 3]
        struct.pack_into(">4I", salida, off, o0 ^ p0, o1 ^ p1, o2 ^ p2, o3 ^ p3)
        p0, p1, p2, p3 = c0, c1, c2, c3
    return bytes(salida)


# ------------------------------------------------------------------ BSII

# Tipos de valor del formato binario: (tamano fijo) o el que hay que leer.
# Los numeros salen de SII_Decrypt (y de TruckSim GPS, que los copia); 0x19 son
# 8 floats desde la version 2 y 7 en la 1.
_FIJOS = {
    0x03: 8, 0x05: 4, 0x07: 8, 0x09: 12, 0x11: 12, 0x17: 16, 0x25: 4, 0x27: 4,
    0x29: 2, 0x2B: 2, 0x2F: 4, 0x31: 8, 0x33: 8, 0x35: 1, 0x37: 4,
}
_ARREGLOS_FIJOS = {
    0x04: 8, 0x06: 4, 0x08: 8, 0x0A: 12, 0x12: 12, 0x18: 16, 0x26: 4, 0x28: 4,
    0x2A: 2, 0x2C: 2, 0x32: 8, 0x34: 8, 0x36: 1,
}
_IDS = {0x39, 0x3B, 0x3D}
_ARREGLOS_DE_IDS = {0x3A, 0x3C, 0x3E}
_CARACTERES = "0123456789abcdefghijklmnopqrstuvwxyz_"


def _token(valor: int) -> str:
    """Un texto de hasta 12 caracteres guardado en un uint64 (base 38)."""
    salida = []
    while valor:
        valor, resto = divmod(valor, 38)
        if resto:
            salida.append(_CARACTERES[resto - 1])
    return "".join(salida)


def _leer_id(datos: bytes, off: int):
    """(texto, offset siguiente) de un id de unidad: "null", "_nameless.<hex>"
    o los tokens unidos por punto ("company.volatile.tradeaux.berlin")."""
    partes = datos[off]
    off += 1
    if partes == 0xFF:
        valor = struct.unpack_from("<Q", datos, off)[0]
        return f"_nameless.{valor:x}", off + 8
    if partes == 0:
        return "null", off
    tokens = struct.unpack_from(f"<{partes}Q", datos, off)
    return ".".join(_token(t) for t in tokens), off + 8 * partes


def _saltar_id(datos: bytes, off: int) -> int:
    partes = datos[off]
    return off + 9 if partes == 0xFF else off + 1 + 8 * partes


def leer_bsii(datos: bytes, claves: dict = CLAVES) -> dict:
    """{id: (tipo, {clave: valor})} de las unidades de los tipos de `claves`,
    solo con esas claves. El resto se recorre sin decodificar: una partida
    larga tiene cientos de miles de unidades."""
    if datos[:4] != b"BSII":
        raise PartidaIlegible("no es BSII")
    version = struct.unpack_from("<I", datos, 4)[0]
    if version not in (1, 2, 3):
        raise PartidaIlegible(f"BSII version {version}")
    fijos = dict(_FIJOS)
    fijos[0x19] = 28 if version == 1 else 32
    arreglos_fijos = dict(_ARREGLOS_FIJOS)
    arreglos_fijos[0x1A] = 28 if version == 1 else 32
    estructuras = {}  # id -> (nombre, [(tipo, nombre)], {indice: texto} de 0x37)
    unidades = {}
    off = 8
    n = len(datos)
    u32 = struct.Struct("<I").unpack_from
    try:
        while off < n:
            tipo_bloque = u32(datos, off)[0]
            off += 4
            if tipo_bloque == 0:
                valido = datos[off]
                off += 1
                if not valido:
                    continue
                id_estructura = u32(datos, off)[0]
                largo = u32(datos, off + 4)[0]
                nombre = datos[off + 8:off + 8 + largo].decode("utf-8", "replace")
                off += 8 + largo
                campos = []
                ordinales = {}
                while True:
                    tipo = u32(datos, off)[0]
                    off += 4
                    if tipo == 0:
                        break
                    largo = u32(datos, off)[0]
                    campo = datos[off + 4:off + 4 + largo].decode("utf-8", "replace")
                    off += 4 + largo
                    if tipo == 0x37:
                        cuantos = u32(datos, off)[0]
                        off += 4
                        for _ in range(cuantos):
                            indice, largo = struct.unpack_from("<II", datos, off)
                            ordinales[indice] = datos[off + 8:off + 8 + largo].decode("utf-8", "replace")
                            off += 8 + largo
                    campos.append((tipo, campo))
                estructuras.setdefault(id_estructura, (nombre, campos, ordinales))
                continue
            nombre, campos, ordinales = estructuras[tipo_bloque]
            interes = claves.get(nombre)
            if interes:
                id_unidad, off = _leer_id(datos, off)
                valores = {}
            else:
                off = _saltar_id(datos, off)
            for tipo, campo in campos:
                if interes and campo in interes:
                    valores[campo], off = _leer_valor(datos, off, tipo, ordinales, fijos)
                    continue
                tam = fijos.get(tipo)
                if tam is not None:
                    off += tam
                elif tipo in arreglos_fijos:
                    off += 4 + u32(datos, off)[0] * arreglos_fijos[tipo]
                elif tipo == 0x01:
                    off += 4 + u32(datos, off)[0]
                elif tipo == 0x02:
                    cuantos = u32(datos, off)[0]
                    off += 4
                    for _ in range(cuantos):
                        off += 4 + u32(datos, off)[0]
                elif tipo in _IDS:
                    off = _saltar_id(datos, off)
                elif tipo in _ARREGLOS_DE_IDS:
                    cuantos = u32(datos, off)[0]
                    off += 4
                    for _ in range(cuantos):
                        off = _saltar_id(datos, off)
                else:
                    raise PartidaIlegible(f"tipo BSII desconocido 0x{tipo:x} en {nombre}.{campo}")
            if interes:
                unidades[id_unidad] = (nombre, valores)
        # Lo de tamano fijo se saltea sin leerlo: cortada en uno de esos, el
        # recorrido termina pasado el final.
        if off != n:
            raise PartidaIlegible("BSII cortado")
    except (struct.error, IndexError, KeyError) as exc:
        # Cortada (a medio escribir) o un bloque de una estructura sin definir.
        raise PartidaIlegible(f"BSII cortado o roto ({exc!r})") from exc
    return unidades


def _leer_valor(datos: bytes, off: int, tipo: int, ordinales: dict, fijos: dict):
    """(valor, offset siguiente) de los tipos que se usan; el resto, None."""
    if tipo in _IDS:
        return _leer_id(datos, off)
    if tipo in _ARREGLOS_DE_IDS:
        cuantos = struct.unpack_from("<I", datos, off)[0]
        off += 4
        ids = []
        for _ in range(cuantos):
            texto, off = _leer_id(datos, off)
            ids.append(texto)
        return ids, off
    if tipo == 0x11:
        return list(struct.unpack_from("<3i", datos, off)), off + 12
    if tipo == 0x09:
        return list(struct.unpack_from("<3f", datos, off)), off + 12
    if tipo in (0x25,):
        return struct.unpack_from("<i", datos, off)[0], off + 4
    if tipo in (0x27, 0x2F):
        return struct.unpack_from("<I", datos, off)[0], off + 4
    if tipo == 0x35:
        return datos[off] != 0, off + 1
    if tipo == 0x03:
        return _token(struct.unpack_from("<Q", datos, off)[0]), off + 8
    if tipo == 0x01:
        largo = struct.unpack_from("<I", datos, off)[0]
        return datos[off + 4:off + 4 + largo].decode("utf-8", "replace"), off + 4 + largo
    if tipo == 0x37:
        return ordinales.get(struct.unpack_from("<I", datos, off)[0], ""), off + 4
    if tipo in fijos:
        return None, off + fijos[tipo]
    raise PartidaIlegible(f"tipo BSII 0x{tipo:x} en una clave que se lee")


# ------------------------------------------------------------------ texto

_CABECERA = re.compile(r"^(\w+) : ([\w.]+) \{$")
_LINEA = re.compile(r"^ ([a-z_0-9]+)(?:\[(\d*)\])?: (.*)$")
_TRIO = re.compile(r"^\((-?[\d.]+|&[0-9a-f]+), (-?[\d.]+|&[0-9a-f]+), (-?[\d.]+|&[0-9a-f]+)\)$")


def _numero(texto: str) -> float:
    if texto.startswith("&"):  # los bits del float en hexa
        return struct.unpack(">f", bytes.fromhex(texto[1:].rjust(8, "0")))[0]
    return float(texto)


def _valor_texto(texto: str):
    texto = texto.strip()
    if texto.startswith('"') and texto.endswith('"'):
        return texto[1:-1]
    m = _TRIO.match(texto)
    if m:
        return [_numero(g) for g in m.groups()]
    if texto in ("true", "false"):
        return texto == "true"
    if re.fullmatch(r"-?\d+", texto):
        return int(texto)
    return texto


def leer_texto(texto: str, claves: dict = CLAVES) -> dict:
    """Lo mismo que leer_bsii para una partida en texto (g_save_format 2). Una
    sin la llave final esta a medio escribir y no se usa."""
    if not texto.lstrip("﻿").startswith("SiiNunit"):
        raise PartidaIlegible("no es SiiNunit")
    unidades = {}
    actual = None
    adentro = False
    cerrada = False
    for linea in texto.splitlines():
        if linea == "}":
            if not adentro:
                cerrada = True
            adentro = False
            actual = None
            continue
        if not adentro:
            m = _CABECERA.match(linea)
            if m:
                adentro = True
                interes = claves.get(m.group(1))
                if interes:
                    actual = (m.group(1), {}, interes)
                    unidades[m.group(2)] = (m.group(1), actual[1])
            continue
        if actual is None:
            continue
        m = _LINEA.match(linea)
        if not m or m.group(1) not in actual[2]:
            continue
        clave, indice, valor = m.group(1), m.group(2), _valor_texto(m.group(3))
        if indice is None:
            # Un arreglo de texto empieza con su largo ("clave: 2") y sigue con
            # "clave[0]: ...": el largo no se guarda.
            if not isinstance(valor, int) or clave not in ("stored_gps_ahead_waypoints",):
                actual[1][clave] = valor
            else:
                actual[1].setdefault(clave, [])
        else:
            actual[1].setdefault(clave, []).append(valor)
    if not cerrada:
        raise PartidaIlegible("la partida termina antes de su llave final")
    return unidades


# ------------------------------------------------------------------ lo que sirve


def _empresa(id_empresa) -> dict | None:
    """"company.volatile.tradeaux.berlin" -> {company, city}."""
    partes = id_empresa.split(".") if isinstance(id_empresa, str) else []
    if len(partes) < 4 or partes[0] != "company":
        return None
    return {"company": partes[-2], "city": partes[-1]}


def gps_de_unidades(unidades: dict) -> dict:
    """Lo que se manda a la web: los waypoints que quedan por delante [[x, z],
    ...] en orden, el trabajo elegido y no empezado (o None) y si la partida
    tenia un trabajo en curso."""
    economia = next((v for t, v in unidades.values() if t == "economy"), {})
    jugador = next((v for t, v in unidades.values() if t == "player"), {})
    waypoints = []
    for id_wp in economia.get("stored_gps_ahead_waypoints") or []:
        tipo, valores = unidades.get(id_wp, (None, {}))
        pos = valores.get("nav_node_position") if tipo == "gps_waypoint_storage" else None
        if isinstance(pos, list) and len(pos) == 3 and all(isinstance(v, (int, float)) for v in pos):
            waypoints.append([round(pos[0] / ESCALA_NODO, 1), round(pos[2] / ESCALA_NODO, 1)])
    trabajo = None
    elegido = jugador.get("selected_job")
    tipo, job = unidades.get(elegido, (None, {})) if isinstance(elegido, str) else (None, {})
    if tipo == "job_info":
        origen, destino = _empresa(job.get("source_company")), _empresa(job.get("target_company"))
        if origen:
            trabajo = {
                "srcCompany": origen["company"], "srcCity": origen["city"],
                "dstCompany": destino["company"] if destino else None,
                "dstCity": destino["city"] if destino else None,
                "market": ("dispatch_job" if job.get("car") not in (None, "null")
                           else "cargo_market" if job.get("is_cargo_market_job") else "freight_market"),
            }
    en_curso = jugador.get("current_job")
    return {
        "waypoints": waypoints,
        "job": trabajo,
        "jobActive": isinstance(en_curso, str) and en_curso != "null",
    }


def leer_gps(ruta: str) -> dict:
    """Lo que tiene el GPS segun ese game.sii (ver gps_de_unidades), con la
    fecha del archivo en `savedAt` (segundos). PartidaIlegible si no se pudo."""
    try:
        fecha = os.path.getmtime(ruta)
        with open(ruta, "rb") as f:
            datos = f.read()
    except OSError as exc:
        raise PartidaIlegible(str(exc)) from exc
    contenido = descifrar(datos)
    if contenido[:4] == b"BSII":
        unidades = leer_bsii(contenido)
    elif contenido.lstrip(b"\xef\xbb\xbf")[:8] == b"SiiNunit":
        unidades = leer_texto(contenido.decode("utf-8", "replace"))
    else:
        raise PartidaIlegible(f"formato desconocido {contenido[:4]!r}")
    resultado = gps_de_unidades(unidades)
    resultado["savedAt"] = int(fecha)
    return resultado


CLAVE_AJUSTE = "read_saves"


def para_el_payload(gps: dict | None, game: str | None) -> dict | None:
    """Lo que va en `gameGps` del dato a la web, o None: solo lo de la partida
    del juego que se esta jugando. Campos nuevos son opcionales (una web vieja
    no lo mira, y un cliente viejo no lo manda)."""
    if not gps or not game or gps.get("game") != game:
        return None
    return {"savedAt": gps["savedAt"], "waypoints": gps["waypoints"], "job": gps["job"], "jobActive": gps["jobActive"]}


def hay_que_preguntar(ajustes: dict, setup_abierto: bool, inicio_automatico: bool, vio_el_juego: bool) -> bool:
    """Si es momento del aviso de la primera vez: nadie contesto todavia (la
    clave no esta), no hay otra ventana de Truck Dash abierta (el primer
    arranque abre Setup, y dos ventanas de tk en dos hilos se pisan) y, si
    arranco con Windows, recien con el juego abierto (al iniciar sesion
    nadie lo espera)."""
    if CLAVE_AJUSTE in ajustes:
        return False
    if setup_abierto:
        return False
    return vio_el_juego or not inicio_automatico


class Vigia:
    """Mira la partida mas nueva de un juego y la relee cuando cambia. Una
    recien escrita espera QUIETA_S a que el juego termine de escribirla; una
    que no se pudo leer se prueba otra vez cuando vuelve a cambiar."""

    QUIETA_S = 1.5

    def __init__(self, documentos: str):
        self.documentos = documentos
        self.ultimo = None      # lo ultimo leido (dict de leer_gps) o None
        self._visto = None      # (game, ruta, fecha) ya procesado

    def mirar(self, game: str, ahora: float) -> dict | None:
        """Lo leido para ese juego (puede ser de antes), o None."""
        if game not in CARPETAS_DEL_JUEGO:
            return None
        nueva = partida_mas_nueva(game, self.documentos)
        if nueva is None:
            return None
        ruta, fecha = nueva
        clave = (game, ruta, fecha)
        if clave != self._visto and ahora - fecha >= self.QUIETA_S:
            self._visto = clave
            try:
                self.ultimo = dict(leer_gps(ruta), game=game)
                logging.info("Partida leida (%s): %d waypoints en el GPS%s", os.path.basename(os.path.dirname(ruta)),
                             len(self.ultimo["waypoints"]), ", con un trabajo elegido" if self.ultimo["job"] else "")
            except PartidaIlegible as exc:
                logging.info("No se pudo leer la partida %s: %s", ruta, exc)
        if self.ultimo and self.ultimo.get("game") == game:
            return self.ultimo
        return None
