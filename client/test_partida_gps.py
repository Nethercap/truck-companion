"""El GPS del juego leido de la partida guardada (partida_gps.py): el cifrado
con los vectores del NIST, una partida cifrada de punta a punta, el formato
binario (BSII) y el de texto armados aca, y que se elija la partida mas nueva
de los perfiles. Sin partidas de verdad: lo de verdad lo dicen los logs del
cliente ("Partida leida")."""

import os
import struct
import zlib

import pytest

import partida_gps as pg

# ---------------------------------------------------------------- AES


def test_aes_256_cbc_con_el_vector_del_nist():
    # NIST SP 800-38A, F.2.6 (CBC-AES256.Decrypt)
    clave = bytes.fromhex("603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4")
    iv = bytes.fromhex("000102030405060708090a0b0c0d0e0f")
    cifrado = bytes.fromhex(
        "f58c4c04d6e5f1ba779eabfb5f7bfbd69cfc4e967edb808d679f777bc6702c7d"
        "39f23369a9d9bacfa530e26304231461b2eb05e2c39be9fcda6c19078c6a9d1b")
    claro = bytes.fromhex(
        "6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e51"
        "30c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710")
    assert pg.aes_cbc_descifrar(clave, iv, cifrado) == claro
    # FIPS-197, C.3: un bloque (con IV en cero, CBC es ECB)
    assert pg.aes_cbc_descifrar(bytes(range(32)), bytes(16), bytes.fromhex("8ea2b7ca516745bfeafc49904b496089")) \
        == bytes.fromhex("00112233445566778899aabbccddeeff")


def test_la_libreria_del_sistema_da_lo_mismo():
    """bcrypt en Windows, libcrypto en Linux: si estan, igual que el AES de aca."""
    clave, iv = os.urandom(32), os.urandom(16)
    datos = os.urandom(16 * 64)
    nativo = pg._descifradores()[0]
    try:
        resultado = nativo(clave, iv, datos)
    except OSError:
        pytest.skip("sin libreria de cifrado del sistema")
    assert resultado == pg.aes_cbc_descifrar(clave, iv, datos)


# AES de ida, solo para armar partidas cifradas en los tests (el modulo solo descifra).
def _cifrar_cbc(clave: bytes, iv: bytes, datos: bytes) -> bytes:
    sbox = pg._SBOX

    def xt(a):
        return ((a << 1) ^ (0x1B if a & 0x80 else 0)) & 0xFF

    w = [list(clave[i:i + 4]) for i in range(0, 32, 4)]
    rcon = 1
    for i in range(8, 60):
        t = list(w[i - 1])
        if i % 8 == 0:
            t = [sbox[b] for b in t[1:] + t[:1]]
            t[0] ^= rcon
            rcon = xt(rcon)
        elif i % 8 == 4:
            t = [sbox[b] for b in t]
        w.append([a ^ b for a, b in zip(w[i - 8], t)])
    llaves = [sum(w[4 * r:4 * r + 4], []) for r in range(15)]
    salida, anterior = bytearray(), list(iv)
    for off in range(0, len(datos), 16):
        s = [a ^ b ^ k for a, b, k in zip(datos[off:off + 16], anterior, llaves[0])]
        for r in range(1, 15):
            s = [sbox[b] for b in s]
            s = [s[(i + 4 * (i % 4)) % 16] for i in range(16)]  # ShiftRows (por columnas)
            if r < 14:
                m = []
                for c in range(4):
                    a = s[4 * c:4 * c + 4]
                    m += [xt(a[0]) ^ xt(a[1]) ^ a[1] ^ a[2] ^ a[3], a[0] ^ xt(a[1]) ^ xt(a[2]) ^ a[2] ^ a[3],
                          a[0] ^ a[1] ^ xt(a[2]) ^ xt(a[3]) ^ a[3], xt(a[0]) ^ a[0] ^ a[1] ^ a[2] ^ xt(a[3])]
                s = m
            s = [b ^ k for b, k in zip(s, llaves[r])]
        salida += bytes(s)
        anterior = s
    return bytes(salida)


def _partida_cifrada(contenido: bytes) -> bytes:
    iv = os.urandom(16)
    comprimido = zlib.compress(contenido)
    n = 16 - len(comprimido) % 16
    cifrado = _cifrar_cbc(pg.CLAVE_SII, iv, comprimido + bytes([n]) * n)
    return b"ScsC" + bytes(32) + iv + struct.pack("<I", len(contenido)) + cifrado


def test_el_aes_de_ida_del_test_es_el_de_verdad():
    # NIST SP 800-38A, F.2.5 (CBC-AES256.Encrypt), primer bloque
    clave = bytes.fromhex("603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4")
    assert _cifrar_cbc(clave, bytes.fromhex("000102030405060708090a0b0c0d0e0f"),
                       bytes.fromhex("6bc1bee22e409f96e93d7e117393172a")) == bytes.fromhex("f58c4c04d6e5f1ba779eabfb5f7bfbd6")


def test_una_partida_cifrada_se_descifra_con_la_libreria_y_sin_ella(monkeypatch):
    contenido = TEXTO.encode()
    cifrada = _partida_cifrada(contenido)
    assert pg.descifrar(cifrada) == contenido
    # sin libreria del sistema, con el AES de aca
    monkeypatch.setattr(pg, "_descifradores", lambda: [pg.aes_cbc_descifrar])
    assert pg.descifrar(cifrada) == contenido
    # una que no esta cifrada pasa tal cual
    assert pg.descifrar(contenido) == contenido


def test_una_partida_cifrada_rota_no_se_usa():
    cifrada = _partida_cifrada(TEXTO.encode())
    with pytest.raises(pg.PartidaIlegible):
        pg.descifrar(cifrada[:-16])  # cortada: el zlib no cierra
    with pytest.raises(pg.PartidaIlegible):
        pg.descifrar(cifrada[:-3])  # ni en bloques de 16
    with pytest.raises(pg.PartidaIlegible):
        pg.descifrar(cifrada[:52] + struct.pack("<I", 1 << 30) + cifrada[56:])  # tamano imposible


# ---------------------------------------------------------------- BSII


def _tok(texto: str) -> int:
    return sum((pg._CARACTERES.index(c) + 1) * 38 ** i for i, c in enumerate(texto))


def _s(texto: str) -> bytes:
    b = texto.encode()
    return struct.pack("<I", len(b)) + b


def _id(texto: str) -> bytes:
    if texto == "null":
        return b"\x00"
    if texto.startswith("_nameless."):
        return b"\xff" + struct.pack("<Q", int(texto.split(".", 1)[1], 16))
    partes = texto.split(".")
    return bytes([len(partes)]) + b"".join(struct.pack("<Q", _tok(p)) for p in partes)


def _estructura(id_e: int, nombre: str, campos, ordinales=None) -> bytes:
    b = struct.pack("<IBI", 0, 1, id_e) + _s(nombre)
    for tipo, campo in campos:
        b += struct.pack("<I", tipo) + _s(campo)
        if tipo == 0x37:
            b += struct.pack("<I", len(ordinales)) + b"".join(struct.pack("<I", i) + _s(t) for i, t in ordinales)
    return b + struct.pack("<I", 0)


def _bsii(version: int = 2) -> bytes:
    b = b"BSII" + struct.pack("<I", version)
    # una estructura que no interesa, con un poco de cada tipo para saltear
    b += _estructura(1, "bank", [(0x01, "nombre"), (0x02, "lista"), (0x05, "plata"), (0x19, "lugar"),
                                 (0x37, "estado"), (0x3A, "otros"), (0x34, "numeros"), (0x29, "chico")],
                     ordinales=[(0, "uno"), (1, "dos")])
    b += _estructura(2, "economy", [(0x27, "game_time"), (0x3A, "stored_gps_ahead_waypoints"), (0x05, "x")])
    b += _estructura(3, "player", [(0x39, "current_job"), (0x39, "selected_job"), (0x01, "garaje")])
    b += _estructura(4, "job_info", [(0x39, "cargo"), (0x39, "source_company"), (0x39, "target_company"),
                                     (0x35, "is_cargo_market_job"), (0x39, "car"), (0x27, "planned_distance_km")])
    b += _estructura(5, "gps_waypoint_storage", [(0x11, "nav_node_position"), (0x09, "otra_posicion")])
    lugar = 8 if version > 1 else 7
    b += struct.pack("<I", 1) + _id("bank.bank") + _s("Mi banco") + struct.pack("<I", 2) + _s("a") + _s("bc") \
        + struct.pack("<f", 1.5) + struct.pack(f"<{lugar}f", *range(lugar)) + struct.pack("<I", 1) \
        + struct.pack("<I", 1) + _id("_nameless.ab") + struct.pack("<I", 2) + struct.pack("<2Q", 1, 2) \
        + struct.pack("<h", -3)
    b += struct.pack("<I", 2) + _id("economy.econ") + struct.pack("<I", 1234) + struct.pack("<I", 2) \
        + _id("_nameless.2a3b") + _id("_nameless.2a3c") + struct.pack("<f", 0.0)
    b += struct.pack("<I", 3) + _id("player.me") + _id("null") + _id("_nameless.99") + _s("hq")
    b += struct.pack("<I", 4) + _id("_nameless.99") + _id("cargo.apples") + _id("company.volatile.tradeaux.berlin") \
        + _id("company.volatile.posped.praha") + b"\x00" + _id("null") + struct.pack("<I", 352)
    b += struct.pack("<I", 5) + _id("_nameless.2a3b") + struct.pack("<3i", 2560 * 256, 10 * 256, -1280 * 256) \
        + struct.pack("<3f", 0, 0, 0)
    b += struct.pack("<I", 5) + _id("_nameless.2a3c") + struct.pack("<3i", 44519 * 256 + 128, 0, -50561 * 256) \
        + struct.pack("<3f", 0, 0, 0)
    return b


ESPERADO = {
    "waypoints": [[2560.0, -1280.0], [44519.5, -50561.0]],
    "job": {"srcCompany": "tradeaux", "srcCity": "berlin", "dstCompany": "posped", "dstCity": "praha",
            "market": "freight_market"},
    "jobActive": False,
}


@pytest.mark.parametrize("version", [1, 2, 3])
def test_bsii_saca_los_waypoints_y_el_trabajo_elegido(version):
    unidades = pg.leer_bsii(_bsii(version))
    assert pg.gps_de_unidades(unidades) == ESPERADO
    # solo se guardan las unidades y las claves que interesan
    assert {t for t, _ in unidades.values()} == {"economy", "player", "job_info", "gps_waypoint_storage"}
    assert unidades["economy.econ"][1] == {"stored_gps_ahead_waypoints": ["_nameless.2a3b", "_nameless.2a3c"]}


def test_bsii_cortado_o_con_un_tipo_que_no_se_conoce():
    datos = _bsii()
    with pytest.raises(pg.PartidaIlegible):
        pg.leer_bsii(datos[:-7])
    raro = datos.replace(struct.pack("<I", 0x29) + _s("chico"), struct.pack("<I", 0x77) + _s("chico"))
    with pytest.raises(pg.PartidaIlegible):
        pg.leer_bsii(raro)
    with pytest.raises(pg.PartidaIlegible):
        pg.leer_bsii(b"BSII" + struct.pack("<I", 9))


def test_los_tokens_de_un_id():
    assert pg._token(_tok("tradeaux")) == "tradeaux"
    assert pg._leer_id(_id("company.volatile.tradeaux.berlin"), 0)[0] == "company.volatile.tradeaux.berlin"
    assert pg._leer_id(_id("_nameless.2a3b"), 0) == ("_nameless.2a3b", 9)
    assert pg._leer_id(b"\x00", 0) == ("null", 1)


# ---------------------------------------------------------------- texto

TEXTO = """SiiNunit
{
bank : bank.bank {
 money_account: 1000
}

economy : economy.econ {
 game_time: 1234
 stored_gps_ahead_waypoints: 2
 stored_gps_ahead_waypoints[0]: _nameless.2a3.b4c5
 stored_gps_ahead_waypoints[1]: _nameless.2a3.b4c6
}

player : player.me {
 current_job: null
 selected_job: _nameless.99.1
}

job_info : _nameless.99.1 {
 cargo: cargo.apples
 source_company: company.volatile.tradeaux.berlin
 target_company: company.volatile.posped.praha
 is_cargo_market_job: true
 car: null
 planned_distance_km: 352
}

gps_waypoint_storage : _nameless.2a3.b4c5 {
 nav_node_position: (655360, 2560, -327680)
}

gps_waypoint_storage : _nameless.2a3.b4c6 {
 nav_node_position: (&4b2df01c, 0, -12943616)
}

}
"""


def test_la_partida_en_texto_da_lo_mismo():
    gps = pg.gps_de_unidades(pg.leer_texto(TEXTO))
    assert gps["waypoints"][0] == [2560.0, -1280.0]
    # los floats en hexa ("&4b2df01c" = 11399196.0) tambien
    assert gps["waypoints"][1] == [round(11399196.0 / 256, 1), -50561.0]
    assert gps["job"] == dict(ESPERADO["job"], market="cargo_market")
    assert gps["jobActive"] is False


def test_una_partida_en_texto_a_medio_escribir_no_se_usa():
    with pytest.raises(pg.PartidaIlegible):
        pg.leer_texto(TEXTO.rsplit("}", 1)[0])
    with pytest.raises(pg.PartidaIlegible):
        pg.leer_texto("hola")


def test_sin_gps_ni_trabajo():
    texto = TEXTO.replace(" stored_gps_ahead_waypoints: 2\n", " stored_gps_ahead_waypoints: 0\n") \
        .replace("selected_job: _nameless.99.1", "selected_job: null").replace("current_job: null", "current_job: _nameless.5")
    texto = "\n".join(l for l in texto.splitlines() if "stored_gps_ahead_waypoints[" not in l) + "\n"
    assert pg.gps_de_unidades(pg.leer_texto(texto)) == {"waypoints": [], "job": None, "jobActive": True}


# ---------------------------------------------------------------- la partida mas nueva


def _guardar(base, perfil, slot, contenido, fecha):
    carpeta = base / "Euro Truck Simulator 2" / perfil / "save" / slot
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / "game.sii"
    ruta.write_bytes(contenido)
    os.utime(ruta, (fecha, fecha))
    return str(ruta)


def test_la_partida_mas_nueva_de_cualquier_perfil(tmp_path):
    _guardar(tmp_path, "profiles/41424344", "autosave", b"x", 1000)
    nueva = _guardar(tmp_path, "steam_profiles/45464748", "quicksave", b"x", 2000)
    _guardar(tmp_path, "steam_profiles(1.61.x).bak/45464748", "autosave", b"x", 3000)  # copia de un update
    assert pg.partida_mas_nueva("ets2", str(tmp_path)) == (nueva, 2000)
    assert pg.partida_mas_nueva("ats", str(tmp_path)) is None


def _guardar_en_steam(raiz, cuenta, app, perfil, slot, contenido, fecha, carpeta="profiles"):
    destino = raiz / "userdata" / cuenta / app / "remote" / carpeta / perfil / "save" / slot
    destino.mkdir(parents=True, exist_ok=True)
    ruta = destino / "game.sii"
    ruta.write_bytes(contenido)
    os.utime(ruta, (fecha, fecha))
    return str(ruta)


def test_la_partida_de_un_perfil_de_steam_cloud(tmp_path):
    """Con Steam Cloud, Documentos/steam_profiles tiene solo los controles y la
    configuracion: las partidas estan en la carpeta de Steam. Como en una PC de
    verdad (24-11), con la copia de un update en Documentos y la otra cuenta."""
    docs, steam = tmp_path / "Documentos", tmp_path / "Steam [x86]"
    local = docs / "Euro Truck Simulator 2" / "steam_profiles" / "41424344"
    local.mkdir(parents=True)
    (local / "controls.sii").write_bytes(b"x")
    _guardar(docs, "steam_profiles(1.62.3.3s).bak/41424344", "autosave", b"x", 9000)
    _guardar_en_steam(steam, "111", "227300", "41424344", "autosave", b"x", 1000)
    nueva = _guardar_en_steam(steam, "111", "227300", "41424344", "quicksave", b"x", 2000)
    _guardar_en_steam(steam, "222", "227300", "45464748", "autosave", b"x", 1500)
    _guardar_en_steam(steam, "111", "227300", "41424344", "autosave", b"x", 9500, carpeta="profiles(1.61).bak")
    ats = _guardar_en_steam(steam, "111", "270880", "41424344", "autosave", b"x", 3000)
    assert pg.partida_mas_nueva("ets2", str(docs), [str(steam)]) == (nueva, 2000)
    assert pg.partida_mas_nueva("ats", str(docs), [str(steam)]) == (ats, 3000)
    # sin saber donde esta Steam, ninguna: es lo que pasaba
    assert pg.partida_mas_nueva("ets2", str(docs)) is None
    # un perfil local mas nuevo le gana al de Steam Cloud, y al reves
    local_nueva = _guardar(docs, "profiles/4C4F43", "autosave", b"x", 2500)
    assert pg.partida_mas_nueva("ets2", str(docs), [str(steam)]) == (local_nueva, 2500)


def test_el_vigia_lee_la_de_steam_cloud(tmp_path):
    _guardar_en_steam(tmp_path / "Steam", "111", "227300", "41424344", "autosave", _partida_cifrada(TEXTO.encode()), 1000)
    vigia = pg.Vigia(str(tmp_path / "Documentos"), [str(tmp_path / "Steam")])
    gps = vigia.mirar("ets2", 1002)
    assert gps["waypoints"][0] == [2560.0, -1280.0] and gps["savedAt"] == 1000 and gps["game"] == "ets2"


def test_sin_partidas_queda_en_el_log_una_vez_por_juego(tmp_path, caplog):
    vigia = pg.Vigia(str(tmp_path), [])
    with caplog.at_level("INFO"):
        for _ in range(3):
            assert vigia.mirar("ets2", 1000) is None
        assert vigia.mirar("ats", 1000) is None
    lineas = [r.getMessage() for r in caplog.records if "Ninguna partida" in r.getMessage()]
    assert len(lineas) == 2 and "ets2" in lineas[0] and "ats" in lineas[1]


def test_el_vigia_espera_que_termine_de_escribir_y_relee_al_cambiar(tmp_path):
    ruta = _guardar(tmp_path, "profiles/41424344", "autosave", _partida_cifrada(TEXTO.encode()), 1000)
    vigia = pg.Vigia(str(tmp_path))
    assert vigia.mirar("ets2", 1000.5) is None  # recien escrita
    gps = vigia.mirar("ets2", 1002)
    assert gps["waypoints"][0] == [2560.0, -1280.0] and gps["savedAt"] == 1000 and gps["game"] == "ets2"
    # otra partida a medio escribir: se sigue con lo de antes
    with open(ruta, "wb") as f:
        f.write(b"ScsC" + bytes(60))
    os.utime(ruta, (1100, 1100))
    assert vigia.mirar("ets2", 1105)["savedAt"] == 1000
    # y cuando queda bien, la nueva
    with open(ruta, "wb") as f:
        f.write(_bsii())
    os.utime(ruta, (1200, 1200))
    assert vigia.mirar("ets2", 1205)["savedAt"] == 1200
    # lo de un juego no se manda para el otro
    assert vigia.mirar("ats", 1205) is None


# ---------------------------------------------------------------- en el cliente


def test_al_payload_va_solo_lo_del_juego_que_se_juega():
    gps = {"game": "ets2", "savedAt": 1000, "waypoints": [[1.0, 2.0]], "job": None, "jobActive": False}
    assert pg.para_el_payload(gps, "ets2") == {"savedAt": 1000, "waypoints": [[1.0, 2.0]], "job": None, "jobActive": False}
    assert pg.para_el_payload(gps, "ats") is None
    assert pg.para_el_payload(None, "ets2") is None
    assert pg.para_el_payload(gps, None) is None


def test_cuando_se_pregunta_la_primera_vez():
    # sin contestar, sin otra ventana: se pregunta
    assert pg.hay_que_preguntar({}, False, False, False) is True
    # contestado (si o no), nunca mas
    assert pg.hay_que_preguntar({"read_saves": True}, False, False, True) is False
    assert pg.hay_que_preguntar({"read_saves": False}, False, False, True) is False
    # con Setup abierto (el primer arranque), despues
    assert pg.hay_que_preguntar({}, True, False, True) is False
    # arrancado con Windows: recien con el juego abierto
    assert pg.hay_que_preguntar({}, False, True, False) is False
    assert pg.hay_que_preguntar({}, False, True, True) is True
