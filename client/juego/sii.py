"""Los .sii de ETS2 y ATS: en texto ("SiiNunit"), en binario ("BSII") y cifrados
("ScsC"), y el locale.

Los .sii de los archivos del juego y de los mods vienen casi siempre en texto;
las partidas guardadas, cifradas y en binario. Esto se movio aca desde
partida_gps.py (que lo sigue usando) para que lo use tambien el parser propio.

- `descifrar`: ScsC (AES-256-CBC con una clave publica, y zlib) a lo que haya
  adentro; lo que no esta cifrado pasa tal cual.
- `leer_bsii`: las unidades de un BSII; con `claves` solo las de esos tipos y
  esas claves (una partida larga tiene cientos de miles de unidades).
- `leer_texto`: lo mismo para una partida en texto, linea por linea.
- `leer_unidades`: un .sii en texto cualquiera (defs, locale, manifest), con
  comentarios, `@include`, arreglos, tuplas y floats en hexa.
- `leer_locale`: las claves y textos de un archivo de locale.
"""

from __future__ import annotations

import ctypes
import ctypes.util
import re
import struct
import sys
import zlib
from dataclasses import dataclass, field


class SiiIlegible(Exception):
    """El contenido no se pudo leer como .sii (a medio escribir, otro formato)."""


class _Todo:
    """Para `claves=None`: todas las claves de todas las unidades."""

    def __contains__(self, _):
        return True

    def __bool__(self):
        return True


_TODO = _Todo()


# La clave de las partidas cifradas: es publica (la usan SII_Decrypt, los
# editores de partidas y TruckSim GPS) y la misma en ETS2 y ATS.
CLAVE_SII = bytes([
    0x2a, 0x5f, 0xcb, 0x17, 0x91, 0xd2, 0x2f, 0xb6, 0x02, 0x45, 0xb3, 0xd8, 0x36, 0x9e, 0xd0, 0xb2,
    0xc2, 0x73, 0x71, 0x56, 0x3f, 0xbf, 0x1f, 0x3c, 0x9e, 0xdf, 0x6b, 0x11, 0x82, 0x5a, 0x5d, 0x0a,
])

# Una partida mas grande que esto no es una partida (el tamano descomprimido
# viene en la cabecera, y la clave es publica: no se le cree a ciegas).
TAMANO_MAXIMO = 256 * 1024 * 1024

# ------------------------------------------------------------------ descifrar


def descifrar(datos: bytes, descifradores=None) -> bytes:
    """El contenido de un game.sii: si es "ScsC", descifrado y descomprimido;
    si no, tal cual. Cabecera de ScsC: firma (4), HMAC (32, no se mira), IV
    (16), tamano descomprimido (4) y los datos, AES-256-CBC con relleno
    PKCS#7 sobre un zlib."""
    if datos[:4] != b"ScsC":
        return datos
    if len(datos) < 56 + 16 or (len(datos) - 56) % 16:
        raise SiiIlegible("partida cifrada cortada")
    iv = datos[36:52]
    tamano = struct.unpack_from("<I", datos, 52)[0]
    if tamano > TAMANO_MAXIMO:
        raise SiiIlegible(f"tamano imposible: {tamano}")
    cifrado = datos[56:]
    ultimo_error = None
    for descifrador in (descifradores if descifradores is not None else _descifradores()):
        try:
            claro = _sin_relleno(descifrador(CLAVE_SII, iv, cifrado))
            salida = zlib.decompress(claro)
        except Exception as exc:  # otra libreria, o el archivo a medio escribir
            ultimo_error = exc
            continue
        return salida
    raise SiiIlegible(f"no se pudo descifrar ({ultimo_error})")


def _sin_relleno(datos: bytes) -> bytes:
    n = datos[-1] if datos else 0
    if not 1 <= n <= 16 or datos[-n:] != bytes([n]) * n:
        raise SiiIlegible("relleno PKCS#7 roto")
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


def leer_bsii(datos: bytes, claves: dict | None = None) -> dict:
    """{id: (tipo, {clave: valor})} de las unidades de los tipos de `claves`,
    solo con esas claves (con `claves` None, todas). El resto se recorre sin decodificar: una partida
    larga tiene cientos de miles de unidades."""
    if datos[:4] != b"BSII":
        raise SiiIlegible("no es BSII")
    version = struct.unpack_from("<I", datos, 4)[0]
    if version not in (1, 2, 3):
        raise SiiIlegible(f"BSII version {version}")
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
            interes = _TODO if claves is None else claves.get(nombre)
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
                    raise SiiIlegible(f"tipo BSII desconocido 0x{tipo:x} en {nombre}.{campo}")
            if interes:
                unidades[id_unidad] = (nombre, valores)
        # Lo de tamano fijo se saltea sin leerlo: cortada en uno de esos, el
        # recorrido termina pasado el final.
        if off != n:
            raise SiiIlegible("BSII cortado")
    except (struct.error, IndexError, KeyError) as exc:
        # Cortada (a medio escribir) o un bloque de una estructura sin definir.
        raise SiiIlegible(f"BSII cortado o roto ({exc!r})") from exc
    return unidades


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


def leer_texto(texto: str, claves: dict) -> dict:
    """Lo mismo que leer_bsii para una partida en texto (g_save_format 2). Una
    sin la llave final esta a medio escribir y no se usa."""
    if not texto.lstrip("﻿").startswith("SiiNunit"):
        raise SiiIlegible("no es SiiNunit")
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
        raise SiiIlegible("la partida termina antes de su llave final")
    return unidades


def _leer_valor(datos: bytes, off: int, tipo: int, ordinales: dict, fijos: dict):
    """(valor, offset siguiente) de un valor de BSII, cualquiera sea su tipo."""
    u32 = struct.unpack_from("<I", datos, off)[0] if off + 4 <= len(datos) else 0
    if tipo in _IDS:
        return _leer_id(datos, off)
    if tipo in _ARREGLOS_DE_IDS:
        off += 4
        ids = []
        for _ in range(u32):
            texto, off = _leer_id(datos, off)
            ids.append(texto)
        return ids, off
    if tipo == 0x01:
        return datos[off + 4:off + 4 + u32].decode("utf-8", "replace"), off + 4 + u32
    if tipo == 0x02:
        off += 4
        textos = []
        for _ in range(u32):
            largo = struct.unpack_from("<I", datos, off)[0]
            textos.append(datos[off + 4:off + 4 + largo].decode("utf-8", "replace"))
            off += 4 + largo
        return textos, off
    if tipo == 0x03:
        return _token(struct.unpack_from("<Q", datos, off)[0]), off + 8
    if tipo == 0x04:
        return [_token(t) for t in struct.unpack_from(f"<{u32}Q", datos, off + 4)], off + 4 + 8 * u32
    if tipo == 0x37:
        return ordinales.get(u32, ""), off + 4
    if tipo == 0x35:
        return datos[off] != 0, off + 1
    if tipo == 0x36:
        return [b != 0 for b in datos[off + 4:off + 4 + u32]], off + 4 + u32
    if tipo in _FORMATOS:
        fmt = _FORMATOS[tipo]
        tam = struct.calcsize("<" + fmt)
        valor = struct.unpack_from("<" + fmt, datos, off)
        return (valor[0] if len(fmt) == 1 else list(valor)), off + tam
    if tipo in _FORMATOS_ARREGLO:
        fmt = _FORMATOS_ARREGLO[tipo]
        tam = struct.calcsize("<" + fmt)
        off += 4
        salida = []
        for _ in range(u32):
            valor = struct.unpack_from("<" + fmt, datos, off)
            salida.append(valor[0] if len(fmt) == 1 else list(valor))
            off += tam
        return salida, off
    if tipo in (0x19, 0x1A):
        # Ubicacion: posicion y rotacion; 7 floats en la version 1 y 8 despues
        # (fijos[0x19] lo dice). Se devuelven los floats tal cual.
        n = fijos[0x19] // 4
        if tipo == 0x19:
            return list(struct.unpack_from(f"<{n}f", datos, off)), off + 4 * n
        off += 4
        salida = []
        for _ in range(u32):
            salida.append(list(struct.unpack_from(f"<{n}f", datos, off)))
            off += 4 * n
        return salida, off
    if tipo in fijos:
        return None, off + fijos[tipo]
    raise SiiIlegible(f"tipo BSII 0x{tipo:x} en una clave que se lee")


# El formato de struct de los valores de tamano fijo, y de sus arreglos.
_FORMATOS = {
    0x05: "f", 0x07: "2f", 0x09: "3f", 0x11: "3i", 0x17: "4f",
    0x25: "i", 0x27: "I", 0x29: "h", 0x2B: "H", 0x2F: "I", 0x31: "q", 0x33: "Q",
}
_FORMATOS_ARREGLO = {
    0x06: "f", 0x08: "2f", 0x0A: "3f", 0x12: "3i", 0x18: "4f",
    0x26: "i", 0x28: "I", 0x2A: "h", 0x2C: "H", 0x32: "q", 0x34: "Q",
}


# ------------------------------------------------------------------ .sii en texto


@dataclass
class Unidad:
    """Una unidad de un .sii: `tipo : nombre { ... }`. Los atributos con `[]` o
    `[N]` son listas; el resto, el valor."""

    tipo: str
    nombre: str
    atributos: dict = field(default_factory=dict)

    def get(self, clave, defecto=None):
        return self.atributos.get(clave, defecto)


_TOKEN = re.compile(r"""
    (?P<espacio>\s+)
  | (?P<coment>(?://|\#)[^\n]*|/\*.*?\*/)
  | (?P<texto>"(?:[^"\\]|\\.)*")
  | (?P<incluir>@include\b)
  | (?P<hexfloat>&[0-9a-fA-F]{8})
  | (?P<hexa>0x[0-9a-fA-F]+)
  | (?P<simbolo>[{}\[\]():,;])
  | (?P<palabra>[^\s{}\[\]():,;"]+)
""", re.VERBOSE | re.DOTALL)

_NUMERO = re.compile(r"^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$")
_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\"}


def _tokens(texto: str):
    """(tipo, valor) de cada token, sin espacios ni comentarios."""
    pos = 0
    n = len(texto)
    while pos < n:
        m = _TOKEN.match(texto, pos)
        if not m:
            raise SiiIlegible(f"caracter inesperado {texto[pos]!r} en la posicion {pos}")
        pos = m.end()
        tipo = m.lastgroup
        if tipo in ("espacio", "coment"):
            continue
        yield tipo, m.group()


def _texto(literal: str) -> str:
    cuerpo = literal[1:-1]
    if "\\" not in cuerpo:
        return cuerpo
    salida = []
    i = 0
    while i < len(cuerpo):
        c = cuerpo[i]
        if c == "\\" and i + 1 < len(cuerpo):
            sig = cuerpo[i + 1]
            if sig == "x" and i + 3 < len(cuerpo):
                # bytes de UTF-8 escritos como \xNN: se juntan y se decodifican
                crudos = bytearray()
                while cuerpo[i:i + 2] == "\\x" and i + 3 < len(cuerpo):
                    crudos.append(int(cuerpo[i + 2:i + 4], 16))
                    i += 4
                salida.append(crudos.decode("utf-8", "replace"))
                continue
            salida.append(_ESCAPES.get(sig, sig))
            i += 2
            continue
        salida.append(c)
        i += 1
    return "".join(salida)


def _escalar(tipo: str, valor: str):
    if tipo == "texto":
        return _texto(valor)
    if tipo == "hexfloat":
        return struct.unpack(">f", bytes.fromhex(valor[1:]))[0]
    if tipo == "hexa":
        return int(valor, 16)
    if _NUMERO.match(valor):
        return float(valor) if any(c in valor for c in ".eE") else int(valor)
    if valor == "true":
        return True
    if valor == "false":
        return False
    if valor == "nil":
        return None
    return valor  # un token, un id ("company.permanent.x") o un texto sin comillas


def leer_unidades(texto: str, incluir=None, ruta: str = "") -> list:
    """Las unidades de un .sii en texto. `incluir(ruta)` da el texto de un
    `@include` (la ruta ya resuelta contra la carpeta de `ruta`), o None si no
    existe; sin `incluir`, los `@include` se saltean. Lo que no es una unidad
    entera (un archivo cortado, sin su llave final) da SiiIlegible."""
    texto = texto.lstrip("﻿")
    unidades: list = []
    _leer_cuerpo(texto, incluir, ruta, unidades, None, 0)
    return unidades


def _resolver(ruta: str, incluida: str) -> str:
    if incluida.startswith("/"):
        return incluida.lstrip("/")
    carpeta = ruta.rsplit("/", 1)[0] if "/" in ruta else ""
    partes = []
    for p in f"{carpeta}/{incluida}".split("/"):
        if p in ("", "."):
            continue
        if p == "..":
            if partes:
                partes.pop()
            continue
        partes.append(p)
    return "/".join(partes)


def _leer_cuerpo(texto, incluir, ruta, unidades, unidad, profundidad):
    """Recorre `texto`: afuera de una unidad (unidad None) arma unidades; adentro,
    atributos. Un `@include` se lee en el mismo lugar con el mismo estado."""
    if profundidad > 16:
        raise SiiIlegible("@include demasiado anidado")
    toks = list(_tokens(texto))
    i = 0
    n = len(toks)

    def ver(k=0):
        return toks[i + k] if i + k < n else (None, None)

    while i < n:
        tipo, valor = toks[i]
        if tipo == "incluir":
            t2, archivo = ver(1)
            if t2 != "texto":
                raise SiiIlegible("@include sin ruta")
            i += 2
            if incluir is not None:
                destino = _resolver(ruta, _texto(archivo))
                contenido = incluir(destino)
                if contenido is not None:
                    unidad = _leer_cuerpo(contenido, incluir, destino, unidades, unidad, profundidad + 1)
            continue
        if unidad is None:
            if valor == "SiiNunit":
                i += 1
                continue
            if valor in ("{", "}"):
                i += 1
                continue
            # tipo : nombre {
            t_dos, dos = ver(1)
            t_nom, nombre = ver(2)
            t_llave, llave = ver(3)
            if dos != ":" or llave != "{" or t_nom not in ("palabra", "texto"):
                raise SiiIlegible(f"se esperaba una unidad en {valor!r}")
            unidad = Unidad(valor, nombre if t_nom == "palabra" else _texto(nombre))
            unidades.append(unidad)
            i += 4
            continue
        if valor == "}":
            unidad = None
            i += 1
            continue
        # clave[...]: valor
        clave = valor
        i += 1
        indice = None
        es_lista = False
        if ver()[1] == "[":
            es_lista = True
            i += 1
            if ver()[1] != "]":
                indice = ver()[1]
                i += 1
            if ver()[1] != "]":
                raise SiiIlegible(f"falta ] en {clave}")
            i += 1
        if ver()[1] != ":":
            raise SiiIlegible(f"falta : despues de {clave}")
        i += 1
        t_val, v = ver()
        if t_val is None:
            raise SiiIlegible(f"{clave} sin valor")
        if v == "(":
            numeros = []
            i += 1
            while i < n and toks[i][1] != ")":
                if toks[i][1] not in (",", ";"):
                    numeros.append(_escalar(*toks[i]))
                i += 1
            i += 1
            dato = numeros
        else:
            dato = _escalar(t_val, v)
            i += 1
        if es_lista:
            lista = unidad.atributos.setdefault(clave, [])
            if not isinstance(lista, list):
                lista = unidad.atributos[clave] = []
            if indice is None:
                lista.append(dato)
            else:
                k = int(indice)
                lista.extend([None] * (k + 1 - len(lista)))
                lista[k] = dato
        else:
            # "clave: 3" antes de "clave[0]: ..." es el largo del arreglo: se
            # deja hasta que lleguen los elementos.
            unidad.atributos[clave] = dato
    if profundidad == 0 and unidad is not None:
        raise SiiIlegible(f"la unidad {unidad.nombre} no se cierra")
    return unidad


def leer_locale(texto: str, incluir=None, ruta: str = "") -> dict:
    """{clave: texto} de un archivo de locale (`localization_db`, con `key[]`
    y `val[]` en el mismo orden)."""
    salida = {}
    for u in leer_unidades(texto, incluir, ruta):
        claves = u.atributos.get("key") or []
        valores = u.atributos.get("val") or []
        if not isinstance(claves, list) or not isinstance(valores, list):
            continue
        for k, v in zip(claves, valores):
            if isinstance(k, str):
                salida[k] = v if isinstance(v, str) else ("" if v is None else str(v))
    return salida


def texto_de(datos: bytes) -> str:
    """El texto de un .sii guardado en un archivo: descifrado si es ScsC. Un
    BSII no es texto: SiiIlegible (para eso, `leer_bsii`)."""
    datos = descifrar(datos)
    if datos[:4] == b"BSII":
        raise SiiIlegible("es BSII, no texto")
    return datos.decode("utf-8", "replace").lstrip("﻿")
