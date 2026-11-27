"""El lector de .scs propio (juego/archivos.py) con archivos armados aca: HashFS
v1 y v2 (tambien con las trampas de los mods protegidos), ZIP (con CRC falsos,
el flag de cifrado y la firma "AEM!"), carpetas y mods en partes.

La comparacion contra archivos reales (mods del taller, el juego) esta en
validar_lector_scs.py del taller: en CI no hay juego.
"""

import io
import struct
import zipfile
import zlib

import pytest

from juego.archivos import (
    ArchivoCarpeta,
    ArchivoHashFS,
    ArchivoIlegible,
    ArchivoZip,
    CompresionNoSoportada,
    abrir,
    elegir_partes,
    listado_v1,
    listado_v2,
    partes_de_mod,
)
from juego.cityhash import city64

# ------------------------------------------------------------------ armar HashFS


def _carpetas(archivos):
    """{carpeta: (subcarpetas, archivos)} de un dict de rutas."""
    arbol = {"": (set(), set())}
    for ruta in archivos:
        partes = ruta.split("/")
        for i in range(len(partes) - 1):
            padre = "/".join(partes[:i])
            hijo = "/".join(partes[:i + 1])
            arbol.setdefault(padre, (set(), set()))[0].add(partes[i])
            arbol.setdefault(hijo, (set(), set()))
        arbol.setdefault("/".join(partes[:-1]), (set(), set()))[1].add(partes[-1])
    return arbol


def _listado_v2(subs, arch):
    nombres = [("/" + s).encode() for s in sorted(subs)] + [a.encode() for a in sorted(arch)]
    return struct.pack("<I", len(nombres)) + bytes(len(n) for n in nombres) + b"".join(nombres)


def _comprimir(datos, como):
    if como == "zlib":
        return zlib.compress(datos), 1
    if como == "deflate":
        c = zlib.compressobj(9, zlib.DEFLATED, -15)
        return c.compress(datos) + c.flush(), 2
    if como == "zstd":
        from compression import zstd
        return zstd.compress(datos), 4
    return datos, 0


def armar_v2(archivos, sal=0, compresion=None, tablas_sin_comprimir=False, extras=(), sin_raiz=False,
             cortar=None):
    """Un HashFS v2 con `archivos` ({ruta: bytes}) y sus listados.
    `compresion`: {ruta: "zlib" | "deflate" | "zstd" | "ninguna"} (zlib por
    defecto). `cortar`: {ruta: bytes a sacar del final de sus datos}. `extras`:
    entradas armadas a mano, (hash, [(tipo, plano)], flags[, "despues"]) con
    plano = bytes guardados tal cual, (bytes, compresion, tamano) o
    (comprimido, compresion, tamano, posicion)."""
    compresion = compresion or {}
    cortar = cortar or {}
    pre = str(sal) if sal else ""
    cuerpo = bytearray(b"\0" * 64)  # lugar de la cabecera (53 bytes, alineado)

    def poner(datos):
        while len(cuerpo) % 16:
            cuerpo.append(0)
        pos = len(cuerpo)
        cuerpo.extend(datos)
        return pos

    entradas = []
    for carpeta, (subs, arch) in _carpetas(archivos).items():
        if sin_raiz and carpeta == "":
            continue
        datos = _listado_v2(subs, arch)
        comp, c = _comprimir(datos, "zlib")
        entradas.append((city64(pre + carpeta), [(0x81, (len(comp), c, len(datos), poner(comp)))], 1))
    for ruta, datos in archivos.items():
        comp, c = _comprimir(datos, compresion.get(ruta, "zlib"))
        if ruta in cortar:
            comp = comp[:-cortar[ruta]]
        entradas.append((city64(pre + ruta), [(0x80, (len(comp), c, len(datos), poner(comp)))], 0))
    for h, metas, flags, *resto in extras:
        armados = []
        for tipo, plano in metas:
            if isinstance(plano, bytes):
                plano = (len(plano), 0, len(plano), poner(plano))
            elif isinstance(plano, tuple) and isinstance(plano[0], bytes):
                datos, c, tam = plano
                plano = (len(datos), c, tam, poner(datos))
            armados.append((tipo, plano))
        entradas.append((h, armados, flags, *resto))
    tabla_meta = bytearray()
    tabla_ent = bytearray()
    for h, metas, flags, *resto in entradas:
        despues = bool(resto and resto[0] == "despues")
        indice = len(tabla_meta) // 4
        datos_meta = bytearray()
        cabezas = []
        for tipo, plano in metas:
            desde = indice + len(metas) + len(datos_meta) // 4
            if plano is None:
                cabezas.append((tipo << 24) | 0x0FFFFF)
                continue
            comp, c, tam, pos = plano
            # "despues": el indice apunta a otro lado y los datos estan justo
            # despues de los encabezados (truco de mods protegidos)
            cabezas.append((tipo << 24) | ((desde + 1000) if despues else desde))
            datos_meta += struct.pack("<IIII", comp | (c << 28), tam, 0, pos // 16)
        tabla_meta += b"".join(struct.pack("<I", x) for x in cabezas) + datos_meta
        tabla_ent += struct.pack("<QIHBB", h, indice, len(metas), flags, 0)
    ent = bytes(tabla_ent) if tablas_sin_comprimir else zlib.compress(bytes(tabla_ent))
    meta = bytes(tabla_meta) if tablas_sin_comprimir else zlib.compress(bytes(tabla_meta))
    pos_ent = len(cuerpo)
    pos_meta = pos_ent + len(ent)
    cuerpo += ent + meta
    cab = struct.pack("<4shh4sIIIIQQQB", b"SCS#", 2, sal, b"CITY", len(entradas), len(ent),
                      len(tabla_meta) // 4, len(meta), pos_ent, pos_meta, 0, 0)
    cuerpo[:len(cab)] = cab
    return bytes(cuerpo)


def armar_v1(archivos, sal=0, cifradas=(), sin_comprimir=(), sin_marca=()):
    """Un HashFS v1: listados de texto con "*" para las subcarpetas."""
    pre = str(sal) if sal else ""
    cuerpo = bytearray(b"\0" * 20)
    entradas = []
    for carpeta, (subs, arch) in _carpetas(archivos).items():
        datos = "\n".join(["*" + s for s in sorted(subs)] + sorted(arch)).encode()
        comp = zlib.compress(datos)
        flags = (0 if carpeta in sin_marca else 1) | 2
        entradas.append((city64(pre + carpeta), len(cuerpo), flags, len(datos), len(comp)))
        cuerpo += comp
    for ruta, datos in archivos.items():
        comprimir = ruta not in sin_comprimir
        comp = zlib.compress(datos) if comprimir else datos
        flags = (2 if comprimir else 0) | (8 if ruta in cifradas else 0)
        entradas.append((city64(pre + ruta), len(cuerpo), flags, len(datos), len(comp)))
        cuerpo += comp
    inicio = len(cuerpo)
    for h, pos, flags, tam, comp in entradas:
        cuerpo += struct.pack("<QQIIII", h, pos, flags, 0, tam, comp)
    cuerpo[:20] = struct.pack("<4sHH4sII", b"SCS#", 1, sal, b"CITY", len(entradas), inicio)
    return bytes(cuerpo)


ARCHIVOS = {
    "manifest.sii": b"SiiNunit { mod_package : .package_name { } }",
    "def/city.sii": b"SiiNunit { city_data : city.berlin { city_name: Berlin } }",
    "def/country/de.sii": b"x" * 5000,
    "map/europe/sec+0000+0000.base": bytes(range(256)) * 40,
}


def _escribir(tmp_path, datos, nombre="prueba.scs"):
    ruta = tmp_path / nombre
    ruta.write_bytes(datos)
    return str(ruta)


# ------------------------------------------------------------------ HashFS v2


def test_v2_lee_listados_y_archivos_con_cada_compresion(tmp_path):
    compresion = {"def/city.sii": "ninguna", "def/country/de.sii": "deflate"}
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, compresion=compresion))) as a:
        assert a.version == 2
        raiz = a.carpeta("")
        assert sorted(raiz.subcarpetas) == ["def", "map"] and raiz.archivos == ["manifest.sii"]
        for ruta, datos in ARCHIVOS.items():
            assert a.leer(ruta) == datos
            assert a.leer("/" + ruta.replace("/", "\\")) == datos  # rutas como las escriba quien sea
            assert a.es_archivo(ruta) and not a.es_carpeta(ruta)
        assert sorted(a.recorrer()) == sorted(ARCHIVOS)
        assert a.leer("def/no_existe.sii") is None and not a.existe("def/no_existe.sii")
        assert a.leer("def") is None and a.es_carpeta("def")
        assert not a.avisos


def test_v2_zstd(tmp_path):
    pytest.importorskip("compression.zstd")
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, compresion={"def/city.sii": "zstd"}))) as a:
        assert a.leer("def/city.sii") == ARCHIVOS["def/city.sii"]


def test_v2_con_sal_hashea_la_ruta_con_la_sal_adelante(tmp_path):
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, sal=1234))) as a:
        assert a.leer("def/city.sii") == ARCHIVOS["def/city.sii"]
        assert sorted(a.recorrer()) == sorted(ARCHIVOS)


def test_v2_tablas_guardadas_sin_comprimir(tmp_path):
    """El campo de la cabecera cuenta valores de 4 bytes: tomado como bytes, la
    tabla guardada tal cual se trataba de inflar y el mod entero quedaba afuera."""
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, tablas_sin_comprimir=True))) as a:
        assert sorted(a.recorrer()) == sorted(ARCHIVOS)


def test_v2_zlib_cortado_se_lee_si_da_el_tamano(tmp_path):
    """Hay mods con el zlib sin el adler32 del final: el juego los lee."""
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, cortar={"def/country/de.sii": 4}))) as a:
        assert a.leer("def/country/de.sii") == ARCHIVOS["def/country/de.sii"]


def test_v2_entradas_basura_se_saltean_con_su_motivo(tmp_path):
    fuera = (100, 1, 100, 10_000_000)  # datos fuera del archivo
    extras = [
        (city64("basura/a"), [(0x55, b"xxxx")], 0),          # tipo de metadato que no existe
        (city64("basura/b"), [(0x80, fuera)], 0),
        (city64("basura/c"), [(0x80, (10, 9, 10, 64))], 0),   # compresion 9
    ]
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, extras=extras))) as a:
        assert sorted(a.recorrer()) == sorted(ARCHIVOS)
        assert sum(a.salteadas.values()) == 3
        assert a.salteadas["datos fuera del archivo"] == 1 and a.salteadas["compresion 9"] == 1
        assert any("salteadas" in x for x in a.avisos)


def test_v2_carpeta_sin_la_marca_y_metadatos_despues_de_los_encabezados(tmp_path):
    """Dos trucos de mods protegidos: una carpeta con metadato DIRECTORY pero sin
    la marca en la entrada, y un archivo cuyo indice apunta a otro lado con los
    datos justo despues de sus encabezados (Beyond, build.log del 25-11)."""
    listado = _listado_v2([], ["oculto.sii"])
    datos_oculto = b"SiiNunit { }"
    extras = [
        (city64("extra"), [(0x81, (zlib.compress(listado), 1, len(listado)))], 0),
        (city64("extra/oculto.sii"), [(0x80, (zlib.compress(datos_oculto), 1, len(datos_oculto)))], 0, "despues"),
    ]
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, extras=extras))) as a:
        assert a.carpeta("extra").archivos == ["oculto.sii"]
        assert a.leer("extra/oculto.sii") == datos_oculto
        assert a.leidas_como_truco["marca de carpeta"] == 1
        assert a.leidas_como_truco["metadatos despues de sus encabezados"] == 1


def test_v2_listado_guardado_como_archivo(tmp_path):
    """Otro truco: el listado de una carpeta como un archivo mas (metadato
    PLAIN, sin la marca). Vale como listado solo si tiene la forma exacta de uno."""
    listado = _listado_v2(["sub"], ["a.sii"])
    extras = [
        (city64("falsa"), [(0x80, (zlib.compress(listado), 1, len(listado)))], 0),
        (city64("falsa/a.sii"), [(0x80, (zlib.compress(b"hola"), 1, 4))], 0),
    ]
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, extras=extras))) as a:
        assert a.carpeta("falsa").archivos == ["a.sii"]
        assert list(a.recorrer("falsa")) == ["falsa/a.sii"]
        assert a.leer("falsa/a.sii") == b"hola"
        assert a.carpeta("def/city.sii") is None  # un .sii no es un listado
    assert listado_v2(listado).archivos == ["a.sii"] and listado_v2(listado).subcarpetas == ["sub"]
    assert listado_v2(b"\x02\x00\x00\x00\x03\x03abcde") is None  # los largos no cierran
    assert listado_v2(b"SiiNunit { }") is None


def test_v2_sin_listado_en_la_raiz_se_lee_por_ruta(tmp_path):
    """locale.scs del juego no trae listado de la raiz: sus carpetas se
    encuentran igual por el hash de su ruta."""
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, sin_raiz=True))) as a:
        assert a.carpeta("") is None
        assert a.carpeta("def").archivos == ["city.sii"]
        assert sorted(a.recorrer("def")) == ["def/city.sii", "def/country/de.sii"]


def test_v2_gdeflate_no_se_lee_pero_no_corta_lo_demas(tmp_path):
    extras = [(city64("material/x.tobj"), [(0x80, (b"datos", 3, 100))], 0)]
    with ArchivoHashFS(_escribir(tmp_path, armar_v2(ARCHIVOS, extras=extras))) as a:
        with pytest.raises(CompresionNoSoportada):
            a.leer("material/x.tobj")
        assert a.leer("def/city.sii") == ARCHIVOS["def/city.sii"]


# ------------------------------------------------------------------ HashFS v1


def test_v1_listados_de_texto_cifradas_y_sin_comprimir(tmp_path):
    archivos = {**ARCHIVOS, "def/secreto.sii": b"no se lee"}
    datos = armar_v1(archivos, cifradas={"def/secreto.sii"}, sin_comprimir={"manifest.sii"})
    with abrir(_escribir(tmp_path, datos)) as a:
        assert isinstance(a, ArchivoHashFS) and a.version == 1
        for ruta, contenido in ARCHIVOS.items():
            assert a.leer(ruta) == contenido
        assert a.leer("def/secreto.sii") is None  # cifrada: se saltea
        assert a.salteadas["cifrada"] == 1
        assert set(a.recorrer()) == set(archivos)  # el listado la nombra igual


def test_v1_con_sal_y_listado_sin_la_marca(tmp_path):
    datos = armar_v1(ARCHIVOS, sal=77, sin_marca={"def"})
    with abrir(_escribir(tmp_path, datos)) as a:
        assert a.carpeta("def").archivos == ["city.sii"]
        assert sorted(a.recorrer()) == sorted(ARCHIVOS)
    assert listado_v1(b"*sub\r\narchivo.sii\n").subcarpetas == ["sub"]
    assert listado_v1(b"\x00\x01binario") is None


# ------------------------------------------------------------------ ZIP


def _zip(archivos, nombres_raros=False):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for ruta, datos in archivos.items():
            z.writestr(("\\" + ruta.replace("/", "\\")) if nombres_raros else ruta, datos)
        z.writestr(zipfile.ZipInfo("vacia/"), b"")
    return bytearray(buf.getvalue())


def _romper_zip(datos):
    """Como los mods protegidos: flag de cifrado y CRC falso en el indice y en
    cada cabecera local, y la firma de la primera cabecera cambiada a AEM!."""
    datos = bytearray(datos)
    p = 0
    while True:
        p = datos.find(b"PK\x01\x02", p)
        if p < 0:
            break
        datos[p + 8] |= 1                       # flag de cifrado
        datos[p + 16:p + 20] = b"\xde\xad\xbe\xef"  # CRC
        p += 4
    p = 0
    while True:
        p = datos.find(b"PK\x03\x04", p)
        if p < 0:
            break
        datos[p + 6] |= 1
        datos[p + 14:p + 18] = b"\xde\xad\xbe\xef"
        p += 4
    datos[0:4] = b"AEM!"
    return bytes(datos)


def test_zip_normal(tmp_path):
    with abrir(_escribir(tmp_path, bytes(_zip(ARCHIVOS)))) as a:
        assert isinstance(a, ArchivoZip)
        assert sorted(a.recorrer()) == sorted(ARCHIVOS)
        for ruta, datos in ARCHIVOS.items():
            assert a.leer(ruta) == datos
        assert a.es_carpeta("vacia") and a.carpeta("vacia").archivos == []
        assert sorted(a.carpeta("").subcarpetas) == ["def", "map", "vacia"]


def test_zip_protegido_con_aem_cifrado_y_crc_falsos(tmp_path):
    with abrir(_escribir(tmp_path, _romper_zip(_zip(ARCHIVOS)))) as a:
        assert isinstance(a, ArchivoZip)
        for ruta, datos in ARCHIVOS.items():
            assert a.leer(ruta) == datos


def test_zip_con_barras_invertidas_y_sin_entradas_de_carpeta(tmp_path):
    with abrir(_escribir(tmp_path, bytes(_zip(ARCHIVOS, nombres_raros=True)))) as a:
        assert sorted(a.recorrer()) == sorted(ARCHIVOS)
        assert a.carpeta("def/country").archivos == ["de.sii"]


# ------------------------------------------------------------------ carpeta, partes, abrir


def test_carpeta_en_disco(tmp_path):
    for ruta, datos in ARCHIVOS.items():
        p = tmp_path / "mod" / ruta
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(datos)
    with abrir(str(tmp_path / "mod")) as a:
        assert isinstance(a, ArchivoCarpeta)
        assert sorted(a.recorrer()) == sorted(ARCHIVOS)
        assert a.leer("def/city.sii") == ARCHIVOS["def/city.sii"]
        assert a.leer("def") is None and a.carpeta("nada") is None


def test_mod_en_partes_monta_base_y_los_dlc_que_estan(tmp_path):
    """ATS Expansion: "base" y "dlc_<nombre>" en la raiz; el juego monta base
    siempre y cada dlc_ solo si esta ese DLC, y la raiz no la lee."""
    archivos = {
        "base/def/city.sii": b"base",
        "dlc_wa/def/city.sii": b"wa",
        "dlc_id/def/city.sii": b"id",
        "manifest.sii": b"raiz",
    }
    a = abrir(_escribir(tmp_path, bytes(_zip(archivos))))
    partes = partes_de_mod(a, {"dlc_wa"})
    assert [p.origen.split("/")[-1] for p in partes] == ["base", "dlc_wa"]
    assert partes[0].leer("def/city.sii") == b"base" and partes[1].leer("def/city.sii") == b"wa"
    assert partes[0].leer("manifest.sii") is None
    assert any("sin el DLC: dlc_id" in x for x in a.avisos)
    for p in partes:
        p.cerrar()
    assert elegir_partes(["base", "dlc_a", "def"], {"dlc_a"}) == (["base", "dlc_a"], [])
    assert elegir_partes(["def", "map"], set()) is None


def test_un_mod_que_no_viene_en_partes_queda_igual(tmp_path):
    a = abrir(_escribir(tmp_path, bytes(_zip(ARCHIVOS))))
    assert partes_de_mod(a, {"dlc_wa"}) == [a]
    a.cerrar()


def test_abrir_algo_que_no_es_un_scs(tmp_path):
    with pytest.raises(ArchivoIlegible):
        abrir(_escribir(tmp_path, b"esto no es un mod", "raro.scs"))
    with pytest.raises(ArchivoIlegible):
        abrir(_escribir(tmp_path, b"SCS#\x03\x00\x00\x00CITY" + b"\0" * 60, "v3.scs"))
