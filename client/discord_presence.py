"""Muestra el viaje en curso en el perfil de Discord (Rich Presence).

Es puro cliente: Discord escucha en un named pipe local
(\\\\.\\pipe\\discord-ipc-0 .. -9) y acepta tramas de 8 bytes de cabecera
(opcode y largo, little endian) mas un JSON. No hay backend, ni login, ni
secreto: alcanza con el Application ID, que es publico.

Apagado por defecto: lo que se publica (origen, destino, carga) lo ve
cualquiera que mire el perfil.

Si Discord no esta abierto no pasa nada: no hay pipe, se reintenta cada tanto
y el cliente sigue igual.
"""

import json
import logging
import os
import struct
import threading
import time
import uuid

# Lo completa Tomas con el ID de la aplicacion de Discord (Developer Portal ->
# New Application). Vacio = la funcion queda desactivada y ni se intenta.
APPLICATION_ID = ""

OP_HANDSHAKE = 0
OP_FRAME = 1
OP_CLOSE = 2

# Discord ignora (y a veces castiga) actualizaciones mas seguidas que esto.
MIN_UPDATE_SECONDS = 15
RECONNECT_SECONDS = 30
SITE_URL = "https://trucksim-dash.com"
GAME_NAMES = {"ets2": "Euro Truck Simulator 2", "ats": "American Truck Simulator"}


def _t(key, **kwargs):
    """Los textos salen del idioma que eligio el usuario: lo que ve su gente en
    Discord esta en el idioma del conductor. Con i18n no disponible (tests
    sueltos) cae al ingles."""
    try:
        from i18n import T
        return T(key, **kwargs)
    except Exception:
        fallback = {"rpc_on_road": "On the road", "rpc_paused": "Paused",
                    "rpc_left": "{km} km left"}
        return fallback.get(key, key).format(**kwargs)


def encode_frame(op: int, payload: dict) -> bytes:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return struct.pack("<II", op, len(data)) + data


def activity_from_telemetry(data: dict, started_at: float | None = None) -> dict | None:
    """Arma la actividad que ve el resto. Devuelve None si no hay nada que
    contar todavia (sin juego, o en el menu)."""
    game = (data or {}).get("game")
    if not game:
        return None

    src, dst = data.get("citySrc"), data.get("cityDst")
    cargo = data.get("cargo")
    if dst and src:
        details = f"{src} → {dst}"
    elif dst:
        details = f"→ {dst}"
    else:
        details = _t("rpc_on_road")

    parts = []
    km = data.get("routeDistanceKm")
    if isinstance(km, (int, float)) and km > 0:
        parts.append(_t("rpc_left", km=round(km)))
    if cargo:
        parts.append(cargo)
    if data.get("paused"):
        parts = [_t("rpc_paused")]
    state = " · ".join(parts) if parts else GAME_NAMES.get(game, game)

    activity = {
        # Discord corta en 128 caracteres; mejor cortar nosotros que que quede
        # a medias con puntos suspensivos raros.
        "details": details[:128],
        "state": state[:128],
        "assets": {
            "large_image": "truckdash",
            "large_text": "Truck Dash",
            "small_image": game,
            "small_text": GAME_NAMES.get(game, game),
        },
        "buttons": [{"label": "Truck Dash", "url": SITE_URL}],
    }
    if started_at:
        activity["timestamps"] = {"start": int(started_at)}
    return activity


class DiscordPresence:
    """Mantiene la conexion con Discord en un hilo aparte. update() solo deja
    el ultimo estado; el hilo se encarga de conectar, reconectar y respetar el
    minimo entre envios, asi el loop de telemetria nunca se bloquea."""

    def __init__(self, application_id: str = APPLICATION_ID):
        self.application_id = application_id
        self._pipe = None
        self._latest = None
        self._last_sent = 0.0
        self._last_activity = None
        self._started_at = None
        self._enabled = False
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._thread = None

    # ------------------------------------------------------------------ api
    def set_enabled(self, enabled: bool) -> None:
        if enabled == self._enabled:
            return
        self._enabled = enabled
        if enabled:
            if not self.application_id:
                logging.info("Discord: sin Application ID configurado, no se activa")
                return
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, daemon=True, name="discord-presence")
            self._thread.start()
        else:
            self._stop.set()
            self._close()

    def update(self, data: dict) -> None:
        with self._lock:
            self._latest = data

    def close(self) -> None:
        self._enabled = False
        self._stop.set()
        self._close()

    # --------------------------------------------------------------- interno
    def _connect(self) -> bool:
        for i in range(10):
            path = rf"\\.\pipe\discord-ipc-{i}"
            try:
                pipe = open(path, "r+b", buffering=0)
            except OSError:
                continue
            try:
                pipe.write(encode_frame(OP_HANDSHAKE, {"v": 1, "client_id": self.application_id}))
                header = pipe.read(8)
                if len(header) < 8:
                    raise OSError("handshake sin respuesta")
                _op, length = struct.unpack("<II", header)
                pipe.read(length)  # READY (o un error si el client_id no existe)
                self._pipe = pipe
                logging.info("Discord: conectado por %s", path)
                return True
            except OSError as exc:
                logging.debug("Discord: %s no sirvio (%s)", path, exc)
                try:
                    pipe.close()
                except OSError:
                    pass
        return False

    def _close(self) -> None:
        pipe, self._pipe = self._pipe, None
        if not pipe:
            return
        try:
            pipe.write(encode_frame(OP_CLOSE, {}))
        except OSError:
            pass
        try:
            pipe.close()
        except OSError:
            pass

    def _send(self, activity) -> None:
        payload = {
            "cmd": "SET_ACTIVITY",
            "args": {"pid": os.getpid(), "activity": activity},
            "nonce": str(uuid.uuid4()),
        }
        self._pipe.write(encode_frame(OP_FRAME, payload))

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                if self._pipe is None and not self._connect():
                    self._stop.wait(RECONNECT_SECONDS)
                    continue
                with self._lock:
                    data = self._latest
                activity = activity_from_telemetry(data) if data else None
                if activity is not None:
                    # El cronometro arranca con el viaje, no con cada envio.
                    if self._started_at is None or (self._last_activity or {}).get("details") != activity["details"]:
                        self._started_at = time.time()
                    activity = activity_from_telemetry(data, self._started_at)
                changed = activity != self._last_activity
                if changed and time.time() - self._last_sent >= MIN_UPDATE_SECONDS:
                    self._send(activity if activity is not None else {})
                    self._last_activity = activity
                    self._last_sent = time.time()
            except OSError as exc:
                logging.info("Discord: se corto la conexion (%s), se reintenta", exc)
                self._close()
                self._stop.wait(RECONNECT_SECONDS)
                continue
            except Exception:
                logging.exception("Discord: error inesperado, se desactiva hasta el proximo arranque")
                self._close()
                return
            self._stop.wait(2)
