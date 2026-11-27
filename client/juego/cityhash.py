"""CityHash64, la version de cityhash/city.cc (Google, 2011).

HashFS no guarda las rutas de los archivos sino su CityHash64: para encontrar
"def/city.sii" en un .scs hay que calcularlo. Esto es la funcion de 64 bits en
Python puro (enteros con mascara), sin modulos nativos: el cliente se empaqueta
para Windows y Linux sin compilar nada. Comprobado contra el modulo nativo de
cityhash en test_juego_cityhash.py.
"""

from __future__ import annotations

import struct

_M = (1 << 64) - 1
K0 = 0xC3A5C85C97CB3127
K1 = 0xB492B66FBE98F273
K2 = 0x9AE16A3B2F90404F
K3 = 0xC949D7C7509E6557
_KMUL = 0x9DDFEA08EB382D69

_u64 = struct.Struct("<Q").unpack_from
_u32 = struct.Struct("<I").unpack_from


def _rot(v: int, s: int) -> int:
    return v if s == 0 else ((v >> s) | (v << (64 - s))) & _M


def _shift_mix(v: int) -> int:
    return v ^ (v >> 47)


def _hash_len16(u: int, v: int) -> int:
    a = ((u ^ v) * _KMUL) & _M
    a ^= a >> 47
    b = ((v ^ a) * _KMUL) & _M
    b ^= b >> 47
    return (b * _KMUL) & _M


def _hasta_16(s: bytes, n: int) -> int:
    if n > 8:
        a = _u64(s, 0)[0]
        b = _u64(s, n - 8)[0]
        return _hash_len16(a, _rot((b + n) & _M, n % 64)) ^ b
    if n >= 4:
        a = _u32(s, 0)[0]
        return _hash_len16((n + (a << 3)) & _M, _u32(s, n - 4)[0])
    if n > 0:
        a, b, c = s[0], s[n >> 1], s[n - 1]
        y = (a + (b << 8)) & 0xFFFFFFFF
        z = (n + (c << 2)) & 0xFFFFFFFF
        return (_shift_mix(((y * K2) ^ (z * K3)) & _M) * K2) & _M
    return K2


def _hasta_32(s: bytes, n: int) -> int:
    a = (_u64(s, 0)[0] * K1) & _M
    b = _u64(s, 8)[0]
    c = (_u64(s, n - 8)[0] * K2) & _M
    d = (_u64(s, n - 16)[0] * K0) & _M
    return _hash_len16(
        (_rot((a - b) & _M, 43) + _rot(c, 30) + d) & _M,
        (a + _rot(b ^ K3, 20) - c + n) & _M,
    )


def _hasta_64(s: bytes, n: int) -> int:
    z = _u64(s, 24)[0]
    a = (_u64(s, 0)[0] + ((n + _u64(s, n - 16)[0]) * K0)) & _M
    b = _rot((a + z) & _M, 52)
    c = _rot(a, 37)
    a = (a + _u64(s, 8)[0]) & _M
    c = (c + _rot(a, 7)) & _M
    a = (a + _u64(s, 16)[0]) & _M
    vf = (a + z) & _M
    vs = (b + _rot(a, 31) + c) & _M
    a = (_u64(s, 16)[0] + _u64(s, n - 32)[0]) & _M
    z = _u64(s, n - 8)[0]
    b = _rot((a + z) & _M, 52)
    c = _rot(a, 37)
    a = (a + _u64(s, n - 24)[0]) & _M
    c = (c + _rot(a, 7)) & _M
    a = (a + _u64(s, n - 16)[0]) & _M
    wf = (a + z) & _M
    ws = (b + _rot(a, 31) + c) & _M
    r = _shift_mix((((vf + ws) * K2) + ((wf + vs) * K0)) & _M)
    return (_shift_mix((r * K0 + vs) & _M) * K2) & _M


def _debil(s: bytes, p: int, a: int, b: int):
    """WeakHashLen32WithSeeds sobre los 32 bytes desde p."""
    w, x, y, z = struct.unpack_from("<4Q", s, p)
    a = (a + w) & _M
    b = _rot((b + a + z) & _M, 21)
    c = a
    a = (a + x + y) & _M
    b = (b + _rot(a, 44)) & _M
    return (a + z) & _M, (b + c) & _M


def city64(texto: str | bytes) -> int:
    """El CityHash64 de un texto (en UTF-8) o de unos bytes."""
    s = texto.encode("utf-8") if isinstance(texto, str) else bytes(texto)
    n = len(s)
    if n <= 16:
        return _hasta_16(s, n)
    if n <= 32:
        return _hasta_32(s, n)
    if n <= 64:
        return _hasta_64(s, n)
    x = _u64(s, n - 40)[0]
    y = (_u64(s, n - 16)[0] + _u64(s, n - 56)[0]) & _M
    z = _hash_len16((_u64(s, n - 48)[0] + n) & _M, _u64(s, n - 24)[0])
    v = _debil(s, n - 64, n, z)
    w = _debil(s, n - 32, (y + K1) & _M, x)
    x = (x * K1 + _u64(s, 0)[0]) & _M
    resto = (n - 1) & ~63
    p = 0
    while True:
        x = (_rot((x + y + v[0] + _u64(s, p + 8)[0]) & _M, 37) * K1) & _M
        y = (_rot((y + v[1] + _u64(s, p + 48)[0]) & _M, 42) * K1) & _M
        x ^= w[1]
        y = (y + v[0] + _u64(s, p + 40)[0]) & _M
        z = (_rot((z + w[0]) & _M, 33) * K1) & _M
        v = _debil(s, p, (v[1] * K1) & _M, (x + w[0]) & _M)
        w = _debil(s, p + 32, (z + w[1]) & _M, (y + _u64(s, p + 16)[0]) & _M)
        z, x = x, z
        p += 64
        resto -= 64
        if resto == 0:
            break
    return _hash_len16(
        (_hash_len16(v[0], w[0]) + _shift_mix(y) * K1 + z) & _M,
        (_hash_len16(v[1], w[1]) + x) & _M,
    )
