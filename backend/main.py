"""
Backend minimo del companion de ETS2/ATS. (rebuild cache-bust)

Actua como relay en tiempo real entre:
  - el cliente local (lee la telemetria del juego y la manda por WebSocket)
  - la web (se conecta con el mismo codigo de pairing y recibe los datos)

No hay cuentas de usuario en esta primera etapa: el pairing es por codigo
corto generado en el momento (igual que vincular un Chromecast), valido
mientras dure la sesion del proceso. No se persiste nada en DB todavia.
"""

import asyncio
import json
import logging
import math
import os
import random
import re
import secrets
import string
import threading
import time
import urllib.request
from collections import defaultdict, deque
from typing import Optional

import boto3
from fastapi import FastAPI, Header, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Monitoreo de errores: se activa solo si esta seteada la env var SENTRY_DSN
# en Railway. Si no esta, no hace nada y no rompe el arranque (mismo patron
# que en el backend de Playloggr).
_sentry_dsn = os.environ.get("SENTRY_DSN", "")
if _sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.1,
        environment=os.environ.get("RAILWAY_ENVIRONMENT_NAME", "production"),
        send_default_pii=True,
    )

app = FastAPI(title="Truck Companion Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 8 caracteres alfanumericos (36^8 ~= 2.8 billones de combinaciones) en vez de
# 6 (36^6 ~= 2.200 millones) para que adivinar un codigo ajeno sea muchisimo
# mas caro, sumado al limite de intentos de abajo.
PAIRING_CODE_LENGTH = 8
PAIRING_CODE_TTL_SECONDS = 10 * 60

# Limite basico de intentos por IP para las conexiones que requieren un codigo
# valido (/ws/live y /ws/client), asi no se puede probar codigos al voleo en
# rafaga. No es un rate limiter robusto (no sobrevive un restart, no distingue
# proxies), pero alcanza para esta escala y sube mucho el costo de adivinar.
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_ATTEMPTS = 20
_attempt_log: dict[str, deque] = defaultdict(deque)


def check_rate_limit(client_ip: str) -> bool:
    now = time.time()
    log = _attempt_log[client_ip]
    while log and now - log[0] > RATE_LIMIT_WINDOW_SECONDS:
        log.popleft()
    if len(log) >= RATE_LIMIT_MAX_ATTEMPTS:
        return False
    log.append(now)
    return True


# Contador historico de "choferes que trackearon un viaje" (una sesion se
# cuenta la primera vez que un cliente local se conecta con un codigo, no por
# cada reconexion) + sesiones por dia. Se persiste en R2 (mismo bucket que los
# tiles del mapa, bajo otro prefijo) porque el filesystem de Railway es
# efimero - se pierde en cada redeploy, y esto es justamente el dato que
# queremos que sobreviva a los redeploys.
ADMIN_KEY = os.environ.get("ADMIN_KEY")
# Webhook global de Discord (uno solo, compartido por todos los usuarios) que
# postea cada trabajo entregado - se activa solo si esta seteada la env var en
# Railway, igual patron que SENTRY_DSN. Se crea en el canal de Discord via
# Integraciones -> Webhooks -> Copiar URL.
DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL")
# Webhook aparte para los resumenes de convoy (opt-in del creador). Sin la env var no se postea nada.
DISCORD_CONVOY_WEBHOOK_URL = os.environ.get("DISCORD_CONVOY_WEBHOOK_URL")
R2_ENDPOINT = os.environ.get("R2_ENDPOINT")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_STATS_BUCKET = os.environ.get("R2_STATS_BUCKET", "trucksim-dash-maps")
STATS_KEY = "stats/session-stats.json"

_stats_lock = threading.Lock()
_stats_cache: Optional[dict] = None


def _r2_client():
    if not (R2_ENDPOINT and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY):
        return None
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    )


def _load_stats() -> dict:
    global _stats_cache
    if _stats_cache is not None:
        return _stats_cache
    client = _r2_client()
    if client is not None:
        try:
            obj = client.get_object(Bucket=R2_STATS_BUCKET, Key=STATS_KEY)
            _stats_cache = json.loads(obj["Body"].read())
            return _stats_cache
        except Exception:
            logging.info("No previous stats file in R2 yet (or R2 unreachable), starting from zero")
    _stats_cache = {"total_sessions": 0, "daily": {}}
    return _stats_cache


def _save_stats():
    client = _r2_client()
    if client is None or _stats_cache is None:
        return
    try:
        client.put_object(
            Bucket=R2_STATS_BUCKET,
            Key=STATS_KEY,
            Body=json.dumps(_stats_cache).encode("utf-8"),
            ContentType="application/json",
        )
    except Exception:
        logging.exception("Failed to persist session stats to R2")


# Mapas que no conocemos: la web reporta cuando el camion queda fuera de la
# caja del mapa de su variante (un mod de mapa sin variante, como los de
# Sudamerica para ETS2), con los nombres de los mods activos. Se acumula por
# variante: cuantos reportes, la zona (caja de las posiciones) y cuantas
# veces aparece cada mod. El mod de mapa sale arriba solo. Sin codigo de
# emparejamiento ni nada que identifique a la persona.
OFFMAP_MODS_PER_REPORT = 150
OFFMAP_MOD_NAME_LEN = 80
OFFMAP_MODS_KEPT = 300


def clean_map_dlcs(valor) -> Optional[dict]:
    """Los DLC de mapa que el cliente encontro en la carpeta del juego
    ({'ats': ['co', ...], 'ets2': [...]}). Se guardan con el estado de la
    sesion para que una pestana que abre despues tambien los reciba (si no,
    hasta el proximo cambio del cliente no se enteraba). Solo ids cortos y
    pocos: el relay no confia en lo que llega."""
    if not isinstance(valor, dict):
        return None
    limpio = {}
    for game in ("ats", "ets2"):
        lista = valor.get(game)
        if isinstance(lista, list):
            limpio[game] = sorted({x for x in lista if isinstance(x, str) and re.fullmatch(r"[a-z]{2,12}", x)})[:40]
    return limpio or None


MAP_MOD_FLAG_RE = re.compile(r"^[a-z0-9_]{1,32}$")
MAP_MOD_FLAGS_MAX = 32


def clean_map_mods(valor) -> Optional[dict]:
    """Los mods de mapa que el cliente detecto, por juego ({'ats': {'c2c':
    True, ...} o None, 'ets2': ...}). Se guardan con el estado de la sesion
    como los DLC: el cliente solo reenvia client_status cuando algo cambia,
    asi que una pestana que abria o recargaba despues cargaba el mapa base
    y el que jugaba con Coast to Coast veia "ciudad no encontrada"
    (auditoria del 10-10). Solo banderas cortas y booleanas, nunca nombres
    de mods."""
    if not isinstance(valor, dict):
        return None
    limpio = {}
    for game in ("ats", "ets2"):
        flags = valor.get(game)
        if isinstance(flags, dict):
            limpio[game] = {k: bool(v) for k, v in list(flags.items())[:MAP_MOD_FLAGS_MAX]
                            if isinstance(k, str) and MAP_MOD_FLAG_RE.fullmatch(k)}
        else:
            limpio[game] = None
    return limpio


def clean_local_maps(valor) -> Optional[dict]:
    """Mapas armados en la PC del cliente ("Build my map"): por juego, la
    variante, la huella, cuando y cuantas ciudades. La web los lee del
    servidor local del cliente; aca solo se guardan para la pestana que abre
    despues. Igual que con los DLC, no se confia en lo que llega."""
    if not isinstance(valor, dict):
        return None
    limpio = {}
    for game in ("ats", "ets2"):
        m = valor.get(game)
        if not isinstance(m, dict) or m.get("variant") != f"local_{game}":
            continue
        huella = m.get("fingerprint")
        if not isinstance(huella, str) or not re.fullmatch(r"[0-9a-f]{6,16}", huella):
            continue
        mods = m.get("mods") if isinstance(m.get("mods"), list) else []
        limpio[game] = {
            "variant": f"local_{game}",
            "fingerprint": huella,
            "built": str(m.get("built") or "")[:20],
            "cities": m.get("cities") if isinstance(m.get("cities"), int) else None,
            "mods": [x[:80] for x in mods if isinstance(x, str)][:40],
        }
    return limpio or None


def clean_port(valor) -> Optional[int]:
    return valor if isinstance(valor, int) and 1024 <= valor <= 65535 else None


def clean_offmap_report(payload: dict) -> Optional[dict]:
    variant = payload.get("variant")
    if not isinstance(variant, str) or not LIVE_MAP_VARIANT_RE.match(variant):
        return None
    try:
        x, z = float(payload.get("x")), float(payload.get("z"))
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(x) and math.isfinite(z)):
        return None
    mods = payload.get("mods")
    nombres = None
    if isinstance(mods, list):
        nombres = []
        for m in mods[:OFFMAP_MODS_PER_REPORT]:
            if isinstance(m, str):
                n = " ".join(m.split())[:OFFMAP_MOD_NAME_LEN]
                if n and n not in nombres:
                    nombres.append(n)
    return {"variant": variant, "x": round(x), "z": round(z), "mods": nombres}


def record_offmap_report(report: dict):
    with _stats_lock:
        stats = _load_stats()
        todo = stats.setdefault("offmap", {})
        v = todo.setdefault(report["variant"], {"reports": 0, "noMods": 0, "box": None, "mods": {}})
        v["reports"] += 1
        v["last"] = time.strftime("%Y-%m-%d", time.gmtime())
        x, z = report["x"], report["z"]
        b = v.get("box")
        v["box"] = [x, x, z, z] if not b else [min(b[0], x), max(b[1], x), min(b[2], z), max(b[3], z)]
        if report["mods"] is None:
            v["noMods"] += 1
        else:
            for n in report["mods"]:
                v["mods"][n] = v["mods"].get(n, 0) + 1
            if len(v["mods"]) > OFFMAP_MODS_KEPT:
                # los que aparecen una vez y nada mas son ruido (camiones, sonidos)
                v["mods"] = dict(sorted(v["mods"].items(), key=lambda kv: -kv[1])[:OFFMAP_MODS_KEPT])
        _save_stats()


def record_session_started():
    with _stats_lock:
        stats = _load_stats()
        today = time.strftime("%Y-%m-%d", time.gmtime())
        stats["total_sessions"] = stats.get("total_sessions", 0) + 1
        stats.setdefault("daily", {})
        stats["daily"][today] = stats["daily"].get(today, 0) + 1
        _save_stats()


# ---------------------------------------------------------------------------
# Tipos de cambio. El SDK paga en la moneda interna del juego (EUR en ETS2,
# USD en ATS, sin importar la moneda que el usuario eligio ver en las
# opciones del juego). La web manda la moneda "de la vida real" del usuario
# (deducida del idioma del navegador, o elegida a mano) y con estas tasas se
# muestra el pago tambien en esa moneda - en el /app y en el post de Discord.
# Fuente: open.er-api.com (gratis, sin key, 160+ monedas incl. ARS, se
# actualiza una vez por dia) con frankfurter.app (BCE, ~30 monedas) de
# respaldo. Se refresca cada 24 h y la ultima tabla buena se guarda en R2,
# asi un redeploy con la API caida sigue teniendo tasas (viejas, pero sirven).
GAME_CURRENCY = {"ats": "USD", "ets2": "EUR"}
RATES_KEY = "rates.json"
RATES_TTL_SECONDS = 24 * 60 * 60
RATES_SOURCES = (
    ("https://open.er-api.com/v6/latest/EUR", lambda d: d.get("rates") if d.get("result") == "success" else None),
    ("https://api.frankfurter.app/latest?from=EUR", lambda d: d.get("rates")),
)
_rates_lock = threading.Lock()
_rates_cache: Optional[dict] = None  # {"base": "EUR", "rates": {...}, "fetched_at": ts}
_rates_refreshing = False


def _fetch_rates() -> Optional[dict]:
    for url, pick in RATES_SOURCES:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "TruckDash/1.0 (+https://trucksim-dash.com)"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                rates = pick(json.loads(resp.read()))
            if rates and isinstance(rates, dict) and rates.get("USD"):
                rates = {k.upper(): float(v) for k, v in rates.items() if isinstance(v, (int, float)) and v > 0}
                rates["EUR"] = 1.0
                return {"base": "EUR", "rates": rates, "fetched_at": time.time(), "source": url.split("/")[2]}
        except Exception as exc:
            logging.warning(f"rates: {url} failed: {exc}")
    return None


def _refresh_rates_blocking():
    global _rates_cache, _rates_refreshing
    fresh = _fetch_rates()
    with _rates_lock:
        _rates_refreshing = False
        if fresh is None:
            return
        _rates_cache = fresh
    client = _r2_client()
    if client is not None:
        try:
            client.put_object(Bucket=R2_STATS_BUCKET, Key=RATES_KEY, Body=json.dumps(fresh).encode("utf-8"), ContentType="application/json")
        except Exception:
            logging.exception("Failed to persist rates to R2")


def get_rates() -> Optional[dict]:
    """Tabla de tasas (base EUR). Si esta vencida se devuelve igual y se
    refresca en un thread aparte, para no colgar un request en la API
    externa; solo el primer pedido despues de un arranque en frio y sin
    copia en R2 espera al fetch."""
    global _rates_cache, _rates_refreshing
    with _rates_lock:
        if _rates_cache is None:
            client = _r2_client()
            if client is not None:
                try:
                    obj = client.get_object(Bucket=R2_STATS_BUCKET, Key=RATES_KEY)
                    _rates_cache = json.loads(obj["Body"].read())
                except Exception:
                    logging.info("No rates file in R2 yet")
        cached = _rates_cache
        stale = cached is None or time.time() - (cached.get("fetched_at") or 0) > RATES_TTL_SECONDS
        if stale and not _rates_refreshing:
            _rates_refreshing = True
            if cached is None:
                pass  # se hace abajo, sincrono
            else:
                threading.Thread(target=_refresh_rates_blocking, daemon=True).start()
    if cached is None:
        _refresh_rates_blocking()
        with _rates_lock:
            cached = _rates_cache
    return cached


def convert_money(amount: float, from_currency: str, to_currency: str) -> Optional[float]:
    rates = get_rates()
    if not rates:
        return None
    table = rates.get("rates") or {}
    src, dst = table.get(from_currency), table.get(to_currency)
    if not src or not dst:
        return None
    return amount / src * dst


# Simbolos para el embed de Discord (ahi no hay Intl como en el navegador).
# Prefijo salvo las de la lista de sufijo; el resto sale "1,234 XXX".
CURRENCY_SYMBOLS = {
    "USD": "$", "EUR": "€", "GBP": "£", "PLN": "zł", "BRL": "R$", "TRY": "₺", "JPY": "¥", "CNY": "¥",
    "INR": "₹", "RUB": "₽", "UAH": "₴", "KRW": "₩", "CZK": "Kč", "HUF": "Ft", "SEK": "kr", "NOK": "kr",
    "DKK": "kr", "ISK": "kr", "CHF": "CHF", "CAD": "CA$", "AUD": "A$", "NZD": "NZ$", "MXN": "MX$",
    "ARS": "AR$", "CLP": "CLP$", "COP": "COL$", "PEN": "S/", "UYU": "$U", "ZAR": "R", "ILS": "₪",
    "RON": "lei", "BGN": "лв", "PHP": "₱", "THB": "฿", "IDR": "Rp", "MYR": "RM", "SGD": "S$",
    "HKD": "HK$", "TWD": "NT$", "VND": "₫", "EGP": "E£", "SAR": "SAR", "AED": "AED", "KZT": "₸",
    "GEL": "₾", "RSD": "din", "BAM": "KM", "MKD": "den", "ALL": "L", "MDL": "lei", "BYN": "Br",
}
CURRENCY_SUFFIX = {"PLN", "CZK", "HUF", "SEK", "NOK", "DKK", "ISK", "CHF", "RON", "BGN", "RSD", "BAM", "MKD", "ALL", "MDL", "BYN", "SAR", "AED", "KZT", "GEL"}


def format_money(amount: float, currency: Optional[str]) -> str:
    number = f"{round(amount):,}"
    if not currency:
        return number
    symbol = CURRENCY_SYMBOLS.get(currency)
    if symbol is None:
        return f"{number} {currency}"
    return f"{number} {symbol}" if currency in CURRENCY_SUFFIX else f"{symbol}{number}"


def is_valid_currency(value) -> bool:
    return isinstance(value, str) and len(value) == 3 and value.isalpha()


LATEST_JOBS_MAX = 5
JOB_DELIVERED_COOLDOWN_SECONDS = 20
# El anti-duplicado de arriba vive dentro de una Session (un pairing code) y
# no alcanza si dos procesos del cliente (dos codigos distintos) reportan la
# MISMA entrega real - ej. el usuario abrio el .exe dos veces sin querer, o
# lo dejo en el inicio automatico y tambien lo abrio a mano. Esta segunda
# capa compara contra el ultimo trabajo ya guardado en las stats globales
# (sobrevive un redeploy, a diferencia del estado en memoria de Session) y
# lo descarta si es identico y llego dentro de esta ventana.
# Seis horas: el flag jobDelivered del SDK queda en true durante minutos (hasta
# el proximo trabajo), asi que un cliente o backend reiniciado en ese rato
# vuelve a ver el mismo evento. Dos entregas reales identicas (misma ruta,
# carga, pago exacto y distancia) en seis horas no existen en la practica.
JOB_DEDUPE_WINDOW_SECONDS = 6 * 60 * 60


GAME_LABELS = {"ats": "ATS", "ets2": "ETS2"}
# Colores de marca de cada juego (decimal, formato que espera el campo "color"
# de un embed de Discord) para diferenciar el post de un vistazo.
GAME_EMBED_COLORS = {"ats": 0xB33A3A, "ets2": 0x3B6EA5}


def notify_discord_job_delivered(job_info: dict):
    """Postea la entrega en el webhook global de Discord. No hace nada si no
    esta configurado el webhook, y nunca debe poder romper el guardado de
    stats - cualquier error de red/formato se descarta en silencio (se
    retorna igual el error, solo para uso del endpoint de diagnostico)."""
    if not DISCORD_WEBHOOK_URL:
        return "not_configured"
    try:
        game = job_info.get("game")
        truck = " ".join(filter(None, [job_info.get("truckBrand"), job_info.get("truckName")])) or "?"
        # Moneda del juego (EUR/USD) y, si la web del conductor nos dijo la
        # suya y es distinta, el equivalente en esa - pedido de la comunidad.
        pay_text = format_money(job_info.get("revenue") or 0, job_info.get("currency") or GAME_CURRENCY.get(game))
        if job_info.get("localRevenue") is not None and job_info.get("localCurrency"):
            pay_text += f" · ≈ {format_money(job_info['localRevenue'], job_info['localCurrency'])}"
        if job_info.get("modded"):
            pay_text += " ⚠ modded economy"
        embed = {
            "title": f"{job_info.get('citySrc') or '?'} -> {job_info.get('cityDst') or '?'}",
            "color": GAME_EMBED_COLORS.get(game, 0x808080),
            "fields": [
                {"name": "Truck", "value": truck, "inline": True},
                {"name": "Cargo", "value": job_info.get("cargo") or "-", "inline": True},
                {"name": "Game", "value": GAME_LABELS.get(game, game or "?"), "inline": True},
                {"name": "Distance", "value": f"{round(job_info.get('distanceKm') or 0)} km", "inline": True},
                {"name": "Pay", "value": pay_text, "inline": True},
            ],
        }
        body = json.dumps({"embeds": [embed]}).encode("utf-8")
        req = urllib.request.Request(
            DISCORD_WEBHOOK_URL, data=body, method="POST",
            # Discord/Cloudflare devuelve 403 con el User-Agent por defecto de
            # urllib ("Python-urllib/x.y") - un UA de navegador comun lo evita.
            headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
        )
        urllib.request.urlopen(req, timeout=10).close()
        return None
    except Exception as exc:
        logging.warning(f"No se pudo postear la entrega en Discord: {exc}")
        return str(exc)


# Mods de economia/dinero (muy comunes) hacen que una entrega "pague"
# millones. El valor viene tal cual del SDK, asi que se publica igual pero
# marcado, y NO suma al total publico de ingresos (una sola entrega asi
# duplicaba el contador de la landing).
MAX_PLAUSIBLE_REVENUE = 500_000
MAX_PLAUSIBLE_REVENUE_PER_KM = 1_000


def is_modded_economy(job_info: dict) -> bool:
    revenue = job_info.get("revenue") or 0
    distance = job_info.get("distanceKm") or 0
    if revenue > MAX_PLAUSIBLE_REVENUE:
        return True
    return distance > 0 and revenue / distance > MAX_PLAUSIBLE_REVENUE_PER_KM


def record_job_delivered(job_info: dict):
    job_info["modded"] = is_modded_economy(job_info)
    local = job_info.get("localCurrency")
    if local and job_info.get("currency") and local != job_info["currency"]:
        converted = convert_money(job_info.get("revenue") or 0, job_info["currency"], local)
        job_info["localRevenue"] = round(converted) if converted is not None else None
    else:
        job_info["localCurrency"] = None
    with _stats_lock:
        stats = _load_stats()
        fingerprint = (
            job_info.get("citySrc"),
            job_info.get("cityDst"),
            job_info.get("cargo"),
            job_info.get("revenue"),
            job_info.get("distanceKm"),
        )
        now = time.time()
        last_fp = stats.get("_last_job_fingerprint")
        last_t = stats.get("_last_job_time") or 0
        if last_fp == list(fingerprint) and now - last_t < JOB_DEDUPE_WINDOW_SECONDS:
            logging.info("ignoring duplicate job_delivered (matches last recorded job)")
            return
        stats["_last_job_fingerprint"] = list(fingerprint)
        stats["_last_job_time"] = now

        stats["jobs_delivered"] = stats.get("jobs_delivered", 0) + 1
        if not job_info["modded"]:
            stats["total_revenue"] = stats.get("total_revenue", 0) + (job_info.get("revenue") or 0)
        today = time.strftime("%Y-%m-%d", time.gmtime())
        stats.setdefault("daily_jobs", {})
        stats["daily_jobs"][today] = stats["daily_jobs"].get(today, 0) + 1
        latest = stats.setdefault("latest_jobs", [])
        latest.insert(0, job_info)
        del latest[LATEST_JOBS_MAX:]
        _save_stats()

    notify_discord_job_delivered(job_info)


class ViewerOutbox:
    """Cola de salida de UN viewer (una pestana de la web), con su propia
    task que hace los send. La telemetria NO se encola: se guarda solo el
    ultimo tick y se pisa si llega otro antes de que el send anterior
    termine - un viewer lento (celular con wifi flojo) recibe menos ticks,
    no ticks viejos. Antes el relay hacia `await viewer.send_text()` dentro
    del loop que lee al cliente: un solo viewer lento frenaba la lectura,
    el buffer del servidor crecia y TODOS los viewers de esa sesion veian
    datos cada vez mas atrasados (minutos, reporte de Discord). Los
    mensajes de control (keybinds, command_result, client_status) si van
    en orden y sin perderse."""

    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.latest: Optional[str] = None
        self.control: deque = deque()
        self.wake = asyncio.Event()
        self.dropped = 0
        self.task = asyncio.create_task(self._run())

    def push_telemetry(self, text: str):
        if self.latest is not None:
            self.dropped += 1
        self.latest = text
        self.wake.set()

    def push_control(self, text: str):
        self.control.append(text)
        self.wake.set()

    async def _run(self):
        try:
            while True:
                await self.wake.wait()
                self.wake.clear()
                while self.control:
                    await self.ws.send_text(self.control.popleft())
                if self.latest is not None:
                    text, self.latest = self.latest, None
                    await self.ws.send_text(text)
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            # Normalmente el viewer se desconecto (ws_viewer lo saca de la
            # sesion); se loguea en debug por si es otra cosa.
            logging.debug("viewer outbox ended: %r", exc)

    def close(self):
        self.task.cancel()


class Session:
    def __init__(self, code: str):
        self.code = code
        self.created_at = time.time()
        self.client_ws: Optional[WebSocket] = None
        self.viewer_ws_list: list[WebSocket] = []
        self.viewer_outboxes: dict[WebSocket, ViewerOutbox] = {}
        self.counted = False  # ya se sumo al contador historico (una vez por sesion, no por reconexion)
        # Flanco para no contar el mismo evento en cada tick que el flag siga
        # en true. None = todavia no vimos ningun tick de este cliente: el
        # primer payload solo fija el estado, NO cuenta - si el flag ya viene
        # en true es una entrega anterior a esta sesion (backend o cliente
        # reiniciado, codigo nuevo), no una nueva.
        self.last_job_delivered: Optional[bool] = None
        self.last_job_delivered_at = 0.0  # cooldown extra: el SDK a veces re-pulsa el mismo evento (ver JOB_DELIVERED_COOLDOWN_SECONDS)
        # Mismo snapshot que ya cachea client.py (citySrc/cityDst/cargo se
        # limpian en el mismo tick que jobDelivered pulsa), pero duplicado
        # server-side: si el cliente local se reinicia (update, crash) justo
        # antes de entregar, pierde su snapshot en memoria pero la sesion del
        # backend sigue viva mientras dure el pairing, asi que ya tiene ticks
        # validos acumulados de antes del reinicio.
        self.last_job_snapshot = {"citySrc": None, "cityDst": None, "truckBrand": None, "truckName": None, "cargo": None}
        # Posiciones en vivo de "otros jugadores" (opt-in): map_variant es el
        # mapa+mod que el usuario tiene elegido en la web (ats, ats_promods,
        # etc.) - no viene del SDK, el juego no sabe de mods, lo manda la web.
        # share_position en False (default) significa que esta sesion no
        # aparece para nadie ni ve a nadie - reciprocidad simple, sin
        # cuentas ni consentimiento granular por usuario.
        self.map_variant: Optional[str] = None
        self.share_position = False
        # El usuario apago "compartir" a mano (set_live_share con explicit).
        # share_position es uno por sesion y cada pestana lo reenvia al
        # (re)conectar con su default local (prendido): sin esto un segundo
        # dispositivo o una reconexion volvia a publicar la posicion sin que
        # nadie lo pidiera (auditoria del 10-10).
        self.share_off_by_user = False
        self.last_position: Optional[dict] = None  # {"x":, "z":, "game":, "ts":}
        # Apodo opcional (el de convoy) que se muestra en el mapa en vivo
        # publico; sin apodo el marcador sale anonimo.
        self.live_nick: Optional[str] = None
        # Ruta que calculo SU web (opt-in aparte, "compartir tambien mi ruta"),
        # para dibujarla en el mapa en vivo publico. Viaja aparte de las
        # posiciones, solo cuando cambia (rev), como la del convoy.
        self.live_route: Optional[list] = None
        self.live_route_rev = 0
        # Variantes para las que esta sesion ya reporto "fuera del mapa":
        # un reporte por variante y por sesion.
        self.offmap_reported: set = set()
        # Ultimo estado de diagnostico reportado por el cliente local (mensaje
        # "client_status": waiting_game / plugin_missing / live / ...). Se
        # guarda para poder darselo a un viewer que se conecta despues, en vez
        # de que tenga que esperar al proximo cambio de estado.
        self.last_client_status: Optional[dict] = None
        # Moneda "real" del usuario, la manda la web (set_currency) para que
        # el post de entrega en Discord muestre el pago tambien en esa. None
        # = no la mando / la apago en Ajustes.
        self.viewer_currency: Optional[str] = None
        # Id publico (para "otros jugadores" y convoy): NUNCA se manda el
        # codigo de pairing a otros viewers - con el codigo se puede conectar
        # a la sesion y mandarle comandos al camion.
        self.public_id = secrets.token_hex(4)
        # Ultimo resumen de telemetria (subconjunto chico) para el convoy.
        self.last_summary: Optional[dict] = None
        self.convoy_code: Optional[str] = None
        self.last_seen = time.time()


sessions: dict[str, Session] = {}

# Cuanto puede tener una posicion compartida antes de dejar de mostrarse a
# los demas (cliente desconectado/cerrado sin que la sesion expire todavia).
LIVE_POSITION_STALE_SECONDS = 15
LIVE_POSITIONS_BROADCAST_INTERVAL_SECONDS = 2


async def broadcast_live_positions_loop():
    ticks = 0
    while True:
        await asyncio.sleep(LIVE_POSITIONS_BROADCAST_INTERVAL_SECONDS)
        ticks += 1
        # Cada uno con su try: si el broadcast fallaba en todos los ticks (una
        # sesion con datos raros) la limpieza de sesiones no corria nunca
        # (auditoria del 10-10).
        try:
            broadcast_live_positions()
        except Exception:
            logging.exception("Error en broadcast_live_positions_loop")
        if ticks % 30 == 0:  # cada ~1 min
            try:
                cleanup_expired_sessions()
            except Exception:
                logging.exception("Error limpiando sesiones vencidas")


def coerce_map_variant(variant: Optional[str], game) -> Optional[str]:
    """La variante de mapa la elige la web, pero el juego real lo dice la
    telemetria: si no coinciden (la web mando "ats" antes del primer tick, o
    el jugador cambio de juego) se cae a la variante base del juego para no
    mezclar conductores de ETS2 en el mapa de ATS."""
    if variant and game in ("ats", "ets2") and not variant.startswith(game):
        return game
    return variant


def sharing_sessions(now: float) -> list["Session"]:
    """Sesiones que aparecen en el mapa (opt-in + posicion fresca)."""
    return [
        s for s in sessions.values()
        if s.share_position and s.map_variant and s.last_position
        and now - s.last_position["ts"] <= LIVE_POSITION_STALE_SECONDS
    ]


def _decimetro(valor):
    return round(valor, 1) if isinstance(valor, float) else valor


def broadcast_live_positions():
    now = time.time()
    sharing = sharing_sessions(now)
    live_map_broadcast(sharing, now)
    if not sharing:
        return
    by_variant: dict[str, list[Session]] = defaultdict(list)
    for s in sharing:
        by_variant[s.map_variant].append(s)

    # Cada jugador se serializa UNA vez por tick y por variante, se arma la
    # lista entera una vez, y el mensaje de cada sesion es esa lista con su
    # propio pedazo recortado (por posicion: es copiar memoria, no recorrer
    # la lista en Python). Antes se armaban N listas de N dicts y N
    # json.dumps por tick: con 1000 conductores en el mismo mapa el tick
    # tardaba ~2 s, cada 2 s, con el event loop tomado (el relay entero
    # dejaba de reenviar telemetria). La forma del mensaje es la misma: la
    # web no se entera.
    por_variante: dict[str, tuple[str, dict[str, tuple[int, int]]]] = {}
    for variant, group in by_variant.items():
        lista, lugares, largo = [], {}, 0
        for s in group:
            # Al decimetro: la telemetria trae doubles con 15 cifras y cada
            # mensaje lleva a TODOS los demas, asi que cada digito de mas se
            # paga N veces por tick. En el mapa no se ve la diferencia.
            pedazo = json.dumps({"id": s.public_id, "x": _decimetro(s.last_position["x"]),
                                 "z": _decimetro(s.last_position["z"])})
            if lista:
                largo += 2  # el ", " que lo separa del anterior
            lugares[s.code] = (largo, largo + len(pedazo))
            largo += len(pedazo)
            lista.append(pedazo)
        por_variante[variant] = (", ".join(lista), lugares)

    for session in sharing:
        if not session.viewer_ws_list:
            continue
        todos, lugares = por_variante[session.map_variant]
        desde, hasta = lugares[session.code]
        if desde == 0:
            peers = todos[hasta + 2:]          # el primero: se va con el ", " que lo sigue
        else:
            peers = todos[:desde - 2] + todos[hasta:]  # los demas: con el ", " que los precede
        message = '{"type": "live_players", "players": [' + peers + ']}'
        for viewer in list(session.viewer_ws_list):
            asyncio.create_task(_safe_send(viewer, message))


async def _safe_send(ws: WebSocket, message: str):
    try:
        await ws.send_text(message)
    except Exception:
        pass


async def notify_client_viewers(session: "Session"):
    """Cuantos tableros tiene la sesion, al cliente: con eso no abre otra
    pestana en cada arranque si ya hay una (o el celular) conectada. Antes
    abria una por arranque y quedaban varias mandando a la vez (auditoria
    del 10-10). Un cliente viejo ignora el mensaje."""
    if session.client_ws is not None:
        await _safe_send(session.client_ws, json.dumps({"type": "viewers", "count": len(session.viewer_ws_list)}))


async def _safe_close(ws: WebSocket, code: int, reason: str):
    try:
        await ws.close(code=code, reason=reason)
    except Exception:
        pass


# ---------------------------------------------------------------- mapa en vivo publico (/live/)
# Espectadores sin juego ni codigo que miran una variante de mapa entera:
# reciben, cada LIVE_POSITIONS_BROADCAST_INTERVAL_SECONDS, todos los
# conductores que comparten posicion en esa variante. Mismo opt-in que "otros
# jugadores" (un solo toggle en Ajustes, default apagado) y los mismos datos
# que ya ven los companeros de convoy, sin nada que identifique a la persona
# salvo el apodo si lo puso.
LIVE_MAP_MAX_SPECTATORS_PER_VARIANT = 60
LIVE_MAP_VARIANT_RE = re.compile(r"^[a-z0-9_]{2,40}$")
LIVE_NICK_MAX_LEN = 24

live_map_spectators: dict[str, dict[WebSocket, ViewerOutbox]] = defaultdict(dict)


def clean_live_nick(value) -> Optional[str]:
    if not isinstance(value, str):
        return None
    nick = " ".join(value.split())[:LIVE_NICK_MAX_LEN]
    return nick or None


def live_map_player(s: "Session") -> dict:
    sm = s.last_summary or {}
    return {
        "id": s.public_id, "x": s.last_position["x"], "z": s.last_position["z"],
        "heading": sm.get("heading"), "speedKmh": sm.get("speedKmh"), "paused": sm.get("paused", False),
        "truck": sm.get("truck"), "cargo": sm.get("cargo"),
        "citySrc": sm.get("citySrc"), "cityDst": sm.get("cityDst"),
        "distanceKm": sm.get("distanceKm"), "etaSeconds": sm.get("etaSeconds"),
        "nick": s.live_nick,
        # 0 = sin ruta compartida; el espectador borra la que tenga.
        "routeRev": s.live_route_rev if s.live_route else 0,
    }


LIVE_ROUTE_MAX_POINTS = 400
# El mensaje del overlay en el juego (web -> cliente): cuatro textos cortos.
NAV_HUD_MAX_BYTES = 2048


def clean_live_route(points) -> Optional[list]:
    """[[x, z], ...] redondeado a metros, hasta LIVE_ROUTE_MAX_POINTS; None
    si no es una lista de pares numericos con al menos dos puntos."""
    if not isinstance(points, list):
        return None
    out = []
    for q in points[:LIVE_ROUTE_MAX_POINTS]:
        if not (isinstance(q, (list, tuple)) and len(q) >= 2):
            return None
        try:
            x, z = float(q[0]), float(q[1])
        except (TypeError, ValueError):
            return None
        if not (math.isfinite(x) and math.isfinite(z)):
            return None
        out.append([round(x), round(z)])
    return out if len(out) >= 2 else None


def live_route_message(s: "Session") -> str:
    return json.dumps({"type": "live_route", "id": s.public_id, "rev": s.live_route_rev,
                       "points": s.live_route or []})


def live_route_push(s: "Session"):
    """La ruta nueva a los espectadores de su mapa, sin esperar al tick."""
    if not s.map_variant:
        return
    message = live_route_message(s)
    for outbox in list(live_map_spectators.get(s.map_variant, {}).values()):
        outbox.push_control(message)


def live_map_message(variant: str, sharing: list["Session"]) -> str:
    players = [live_map_player(s) for s in sharing if s.map_variant == variant]
    return json.dumps({"type": "live_players", "variant": variant, "players": players})


def live_map_broadcast(sharing: list["Session"], now: float):
    for variant, outboxes in list(live_map_spectators.items()):
        if not outboxes:
            live_map_spectators.pop(variant, None)
            continue
        message = live_map_message(variant, sharing)
        for outbox in list(outboxes.values()):
            outbox.push_telemetry(message)


@app.get("/live/summary")
def live_summary():
    """Conductores en vivo por variante de mapa (para las tarjetas de /live/)."""
    now = time.time()
    counts: dict[str, int] = defaultdict(int)
    for s in sharing_sessions(now):
        counts[s.map_variant] += 1
    return {"variants": dict(counts), "total": sum(counts.values()), "ts": now}


@app.websocket("/ws/livemap/{variant}")
async def ws_live_map(websocket: WebSocket, variant: str):
    """Espectador del mapa en vivo de una variante. Solo recibe."""
    client_ip = websocket.client.host if websocket.client else "unknown"
    if not check_rate_limit(client_ip):
        await websocket.close(code=4429, reason="demasiados intentos, esperá un minuto")
        return
    # Se acepta antes de cerrar, como en ws_viewer: cerrando antes del accept
    # el navegador ve 1006 sin el codigo y reintenta para siempre en vez de
    # avisar que el mapa esta lleno (auditoria del 10-10).
    if not LIVE_MAP_VARIANT_RE.match(variant):
        await websocket.accept()
        await websocket.close(code=4404, reason="variante invalida")
        return
    if len(live_map_spectators[variant]) >= LIVE_MAP_MAX_SPECTATORS_PER_VARIANT:
        await websocket.accept()
        await websocket.close(code=4403, reason="mapa lleno de espectadores")
        return
    await websocket.accept()
    outbox = ViewerOutbox(websocket)
    live_map_spectators[variant][websocket] = outbox
    sharing = sharing_sessions(time.time())
    outbox.push_control(live_map_message(variant, sharing))
    # Las rutas vigentes de ese mapa: despues solo llegan cuando cambian.
    for s in sharing:
        if s.map_variant == variant and s.live_route:
            outbox.push_control(live_route_message(s))
    try:
        while True:
            await websocket.receive_text()  # no se espera nada del espectador
    except WebSocketDisconnect:
        pass
    finally:
        live_map_spectators[variant].pop(websocket, None)
        outbox.close()


# --------------------------------------------------------------- eventos TMP

# Convoyes y eventos de TruckersMP. Se piden desde ACA y no desde el
# navegador por dos razones, y la segunda importa aunque la primera se
# arregle: su API no manda cabeceras CORS, y asi hacemos una consulta cada
# diez minutos para todos en vez de una por cada persona que abre la web.
#
# Ellos publican "Cache-Control: max-age=60", o sea que cachear esta bien
# visto; diez minutos es holgado para algo que cambia por hora. La respuesta
# cruda son 70 KB con veintidos eventos: se recorta a lo que se muestra.
#
# **Las horas vienen sin zona y son UTC.** No lo dice la documentacion; lo
# dice la pagina de cada evento, que rotula "UTC" al lado de la hora
# (verificado el 27-09-2026). Se marcan explicitamente con Z al reenviarlas
# para que el navegador no las interprete como hora local, que correria un
# convoy una o dos horas segun donde este cada uno.
TMP_EVENTS_URL = "https://api.truckersmp.com/v2/events"
TMP_EVENTS_TTL_SECONDS = 600
TMP_EVENTS_TIMEOUT = 10
# Lo que se muestra de cada evento. Todo lo demas (descripcion, reglas,
# banners, mapas) se descarta: son la mayor parte de los 70 KB.
_tmp_events_cache: Optional[dict] = None
_tmp_events_lock = threading.Lock()
_tmp_events_refreshing = False


def _tmp_hora(valor) -> Optional[str]:
    """'2026-10-03 17:00:00' -> '2026-10-03T17:00:00Z'."""
    if not isinstance(valor, str) or len(valor) < 19:
        return None
    return valor[:10] + "T" + valor[11:19] + "Z"


def _tmp_evento(crudo: dict) -> Optional[dict]:
    if not isinstance(crudo, dict) or not crudo.get("id"):
        return None
    salida = crudo.get("departure") or {}
    llegada = crudo.get("arrive") or {}
    servidor = crudo.get("server") or {}
    asistencia = crudo.get("attendances") or {}
    return {
        "id": crudo.get("id"),
        "name": crudo.get("name"),
        # Viene "ETS2", "ATS" o "ETS2 - ProMods". Se guarda el juego base
        # para filtrar y la etiqueta completa para mostrar: filtrar por
        # igualdad exacta descartaba en silencio los eventos de ProMods.
        "game": "ats" if (crudo.get("game") or "").upper().startswith("ATS") else "ets2",
        "game_label": crudo.get("game"),
        "type": ((crudo.get("event_type") or {}).get("name")),
        "start_at": _tmp_hora(crudo.get("start_at")),
        "meetup_at": _tmp_hora(crudo.get("meetup_at")),
        # La ciudad viene siempre (22 de 22 al probarlo). "location" NO es
        # un tipo sino el punto de encuentro adentro de la ciudad, en texto
        # libre: "Slots", "Container Port", "BOZEMAN descanso". Sirve para
        # mostrarlo, no para decidir nada. Si se puede rutear o no lo decide
        # la web, que es la que sabe que ciudades tiene en su mapa.
        "from_city": salida.get("city"),
        "from_spot": salida.get("location"),
        "to_city": llegada.get("city"),
        "to_spot": llegada.get("location"),
        "server": servidor.get("name"),
        "language": crudo.get("language"),
        "dlcs": list((crudo.get("dlcs") or {}).values()) if isinstance(crudo.get("dlcs"), dict) else (crudo.get("dlcs") or []),
        "confirmed": asistencia.get("confirmed"),
        "url": "https://truckersmp.com" + (crudo.get("url") or ""),
    }


def _fetch_tmp_events() -> Optional[dict]:
    try:
        req = urllib.request.Request(
            TMP_EVENTS_URL,
            headers={"User-Agent": "TruckDash/1.0 (+https://trucksim-dash.com)"})
        with urllib.request.urlopen(req, timeout=TMP_EVENTS_TIMEOUT) as resp:
            datos = json.loads(resp.read())
    except Exception as exc:
        logging.warning(f"tmp events: {exc}")
        return None
    if datos.get("error"):
        logging.warning(f"tmp events: la API respondio error: {datos.get('descriptor')}")
        return None
    respuesta = datos.get("response") or {}
    secciones = {}
    for clave in ("now", "today", "upcoming", "featured"):
        lista = respuesta.get(clave)
        if not isinstance(lista, list):
            continue
        secciones[clave] = [e for e in (_tmp_evento(x) for x in lista) if e]
    if not secciones:
        return None
    return {"events": secciones, "fetched_at": time.time()}


def _refresh_tmp_events_blocking():
    global _tmp_events_cache, _tmp_events_refreshing
    fresh = _fetch_tmp_events()
    with _tmp_events_lock:
        _tmp_events_refreshing = False
        # Si fallo, se conserva lo ultimo bueno: que su API se caiga no tiene
        # por que vaciarnos la lista.
        if fresh is not None:
            _tmp_events_cache = fresh


def get_tmp_events() -> Optional[dict]:
    """Lo cacheado. Si esta vencido se devuelve igual y se refresca aparte,
    para no colgar el request en una API de terceros."""
    global _tmp_events_refreshing
    with _tmp_events_lock:
        cached = _tmp_events_cache
        vencido = cached is None or time.time() - cached["fetched_at"] > TMP_EVENTS_TTL_SECONDS
        if vencido and not _tmp_events_refreshing:
            _tmp_events_refreshing = True
            if cached is not None:
                threading.Thread(target=_refresh_tmp_events_blocking, daemon=True).start()
    if cached is None:
        _refresh_tmp_events_blocking()
        with _tmp_events_lock:
            cached = _tmp_events_cache
    return cached


@app.get("/tmp/events")
def tmp_events(response: Response, game: Optional[str] = None):
    """Eventos de TruckersMP, recortados y cacheados.

    Fuente: https://truckersmp.com — datos publicos de su API, sin
    autenticacion. Las horas salen en UTC con Z explicita.
    """
    # La mitad del TTL: el navegador no vuelve a preguntar todo el tiempo y
    # aun asi ve un refresco nuevo con poco retraso.
    response.headers["Cache-Control"] = "public, max-age=300"
    datos = get_tmp_events()
    if datos is None:
        raise HTTPException(status_code=503, detail="tmp events unavailable")
    secciones = datos["events"]
    if game:
        g = game.lower()
        secciones = {k: [e for e in v if e["game"] == g] for k, v in secciones.items()}
    return {"events": secciones, "fetched_at": datos["fetched_at"],
            "source": "https://truckersmp.com"}


@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(broadcast_live_positions_loop())
    asyncio.create_task(convoy_tick_loop())
    # Se precarga para que el primero que abra el mapa en vivo no espere el
    # ida y vuelta a la API de TruckersMP.
    asyncio.create_task(asyncio.to_thread(_refresh_tmp_events_blocking))


CODE_ALPHABET = string.ascii_uppercase + string.digits


def generate_code() -> str:
    while True:
        code = "".join(random.choices(CODE_ALPHABET, k=PAIRING_CODE_LENGTH))
        if code not in sessions:
            return code


def is_well_formed_code(code: str) -> bool:
    return len(code) == PAIRING_CODE_LENGTH and all(c in CODE_ALPHABET for c in code)


# Una sesion sin cliente local ni viewers durante este tiempo se da por
# abandonada (el usuario cerro el .exe y la pestana) y se libera - antes solo
# se limpiaban los codigos que nunca llegaron a conectar, y las sesiones ya
# usadas quedaban en memoria para siempre (inflando active_sessions).
IDLE_SESSION_TTL_SECONDS = 30 * 60


def cleanup_expired_sessions():
    now = time.time()
    expired = [
        code
        for code, session in sessions.items()
        if session.client_ws is None
        and (
            (not session.counted and now - session.created_at > PAIRING_CODE_TTL_SECONDS)
            or (not session.viewer_ws_list and now - session.last_seen > IDLE_SESSION_TTL_SECONDS)
        )
    ]
    for code in expired:
        del sessions[code]


def session_state_message(session: "Session") -> str:
    return json.dumps({
        "type": "session_state",
        "client_connected": session.client_ws is not None,
        "client_status": session.last_client_status,
    })


def live_share_state_message(session: "Session") -> str:
    """El estado real de "compartir posicion", para que todas las pestanas
    de la sesion muestren el mismo tilde (es uno solo por sesion)."""
    return json.dumps({"type": "live_share_state", "enabled": session.share_position})


async def broadcast_session_state(session: "Session"):
    message = session_state_message(session)
    for viewer in list(session.viewer_ws_list):
        await _safe_send(viewer, message)


# ===========================================================================
# Modo convoy (beta): varios jugadores (cada uno con su cliente y su juego)
# comparten un codigo y se ven entre si en el mapa + carrusel; cualquiera con
# el link mira de espectador sin juego. Salas en memoria como las sesiones:
# nada se persiste, la sala muere a los CONVOY_EMPTY_TTL_SECONDS vacia.
# Identidad: el miembro es la SESION de pairing (asi sobrevive a que la
# pestana se reconecte); hacia afuera solo viaja un id publico.
# ===========================================================================
CONVOY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # sin I ni O (se confunden con 1 y 0)
CONVOY_CODE_LEN = 6
CONVOY_MAX_DRIVERS = 16
CONVOY_MAX_SPECTATORS = 20
CONVOY_EMPTY_TTL_SECONDS = 10 * 60
CONVOY_TICK_SECONDS = 1.0
CONVOY_MEMBER_STALE_SECONDS = 20
CONVOY_ROUTE_MAX_POINTS = 600
CONVOY_MSG_MIN_INTERVAL = 5.0
CONVOY_QUICK_MESSAGES = ("ok", "stop_next", "fuel", "behind", "wait", "go")
CONVOY_COLORS = 12
NICKNAME_RE = re.compile(r"^[\w \-]{2,16}$", re.UNICODE)
GAME_DISTANCE_SCALE = {"ats": 20.0, "ets2": 19.0}


def summarize_for_convoy(payload: dict, prev: Optional[dict], now: float) -> dict:
    """Subconjunto chico de la telemetria que ven los companeros (1 Hz, no
    los 4 Hz completos). El rumbo se calcula aca por diferencia de posicion
    (>= 4 m) porque el cliente no lo manda."""
    pos = payload.get("position") or {}
    x, z = pos.get("x"), pos.get("z")
    heading = prev.get("heading") if prev else None
    if prev and x is not None and prev.get("x") is not None:
        dx, dz = x - prev["x"], z - prev["z"]
        if dx * dx + dz * dz >= 16:
            heading = (math.degrees(math.atan2(dx, -dz)) + 360) % 360
    fuel_pct = None
    if payload.get("fuel") is not None and payload.get("fuelCapacity"):
        fuel_pct = max(0, min(100, round(100 * payload["fuel"] / payload["fuelCapacity"])))
    return {
        "x": x, "z": z, "heading": heading, "ts": now,
        "game": payload.get("game"), "paused": bool(payload.get("paused")),
        "speedKmh": payload.get("speedKmh"),
        "cargo": payload.get("cargo"), "cargoMassKg": payload.get("cargoMassKg"),
        "citySrc": payload.get("citySrc"), "cityDst": payload.get("cityDst"),
        "etaSeconds": payload.get("routeTimeSeconds"), "distanceKm": payload.get("routeDistanceKm"),
        "fuelPct": fuel_pct,
        "restMin": payload.get("restStopMinutes") if payload.get("restStopMinutes") is not None else payload.get("restStopSeconds"),
        "truck": " ".join(filter(None, [payload.get("truckBrand"), payload.get("truckName")])) or None,
        "jobIncome": payload.get("jobIncome"),
    }


class ConvoyMember:
    def __init__(self, session: "Session", nickname: str, color: int):
        self.session = session
        self.id = secrets.token_hex(3)
        self.nickname = nickname
        self.color = color
        self.joined_at = time.time()
        self.variant: Optional[str] = None      # ats, ats_promods, ets2... (lo manda la web)
        self.route: Optional[list] = None       # [[x, z], ...] ruta calculada por SU web
        self.route_rev = 0
        self.msg: Optional[dict] = None         # {"key", "ts"}
        self.last_msg_at = 0.0
        self.share_income = False
        self.km = 0.0                           # km "mostrados" recorridos dentro del convoy
        self._last_pos: Optional[tuple] = None


class Convoy:
    def __init__(self, code: str, creator: "Session", post_summary: bool):
        self.code = code
        self.created_at = time.time()
        self.creator_session = creator.code
        self.post_summary = post_summary
        self.members: dict[str, ConvoyMember] = {}   # session code -> miembro
        self.spectators: dict[WebSocket, ViewerOutbox] = {}
        self.banned: set = set()                     # session codes expulsados
        self.empty_since: Optional[float] = None
        self.deliveries = 0
        self.nicknames_seen: list = []
        # km de los que ya se fueron (convoy_leave los suma al sacarlos): el
        # resumen de Discord se arma despues de que convoy_close saco a todos,
        # y sin esto salia con 0 km (auditoria del 10-10).
        self.km_left = 0.0

    def member_of(self, session: "Session") -> Optional[ConvoyMember]:
        return self.members.get(session.code)

    def is_creator(self, session: "Session") -> bool:
        return session.code == self.creator_session

    def public_members(self, now: float) -> list:
        out = []
        for m in self.members.values():
            s = m.session.last_summary or {}
            online = m.session.client_ws is not None and s.get("ts") is not None and now - s["ts"] <= CONVOY_MEMBER_STALE_SECONDS
            item = {
                "id": m.id, "nickname": m.nickname, "color": m.color,
                "creator": m.session.code == self.creator_session,
                "online": online, "variant": m.variant, "routeRev": m.route_rev,
                "msg": m.msg if m.msg and now - m.msg["ts"] < 60 else None,
            }
            if online:
                item.update({k: s.get(k) for k in ("x", "z", "heading", "game", "paused", "speedKmh", "cargo", "cargoMassKg",
                                                   "citySrc", "cityDst", "etaSeconds", "distanceKm", "fuelPct", "restMin", "truck")})
                if m.share_income:
                    item["jobIncome"] = s.get("jobIncome")
            out.append(item)
        return out

    def state_message(self, for_member: Optional[ConvoyMember], kicked: bool = False) -> dict:
        now = time.time()
        return {
            "type": "convoy_state", "code": self.code,
            "you": for_member.id if for_member else None, "kicked": kicked,
            "creatorId": next((m.id for m in self.members.values() if m.session.code == self.creator_session), None),
            "members": self.public_members(now), "spectators": len(self.spectators),
            "postSummary": self.post_summary,
        }


convoys: dict[str, Convoy] = {}


def new_convoy_code() -> str:
    for _ in range(50):
        code = "".join(secrets.choice(CONVOY_CODE_ALPHABET) for _ in range(CONVOY_CODE_LEN))
        if code not in convoys:
            return code
    raise RuntimeError("no free convoy code")


def valid_convoy_code(code) -> Optional[str]:
    if not isinstance(code, str):
        return None
    code = code.strip().upper()
    return code if len(code) == CONVOY_CODE_LEN and all(c in CONVOY_CODE_ALPHABET for c in code) else None


def clean_nickname(value) -> Optional[str]:
    if not isinstance(value, str):
        return None
    value = " ".join(value.strip().split())
    return value if NICKNAME_RE.match(value) else None


def convoy_broadcast(convoy: Convoy, message: Optional[dict] = None):
    """Manda el estado (o un mensaje puntual) a todos los viewers de todos
    los miembros y a los espectadores. Va por la cola de control de cada
    ViewerOutbox: en orden, sin pisarse."""
    for m in convoy.members.values():
        text = json.dumps(message if message is not None else convoy.state_message(m))
        for outbox in list(m.session.viewer_outboxes.values()):
            outbox.push_control(text)
    if convoy.spectators:
        text = json.dumps(message if message is not None else convoy.state_message(None))
        for outbox in list(convoy.spectators.values()):
            outbox.push_control(text)


def convoy_route_message(m: ConvoyMember) -> dict:
    return {"type": "convoy_route", "id": m.id, "rev": m.route_rev, "points": m.route or []}


def convoy_leave(session: "Session", kicked: bool = False):
    code = session.convoy_code
    if not code:
        return
    convoy = convoys.get(code)
    session.convoy_code = None
    if not convoy:
        return
    member = convoy.members.pop(session.code, None)
    if member is not None:
        convoy.km_left += member.km
        # avisar al que se va (con kicked si corresponde) y al resto
        text = json.dumps({**convoy.state_message(None, kicked=kicked), "left": True})
        for outbox in list(session.viewer_outboxes.values()):
            outbox.push_control(text)
        convoy_broadcast(convoy, {"type": "convoy_event", "event": "left", "nickname": member.nickname, "id": member.id})
    if not convoy.members:
        convoy.empty_since = time.time()
    convoy_broadcast(convoy)


def handle_convoy_message(session: "Session", websocket: WebSocket, msg_type: str, payload: dict) -> Optional[dict]:
    now = time.time()
    if msg_type in ("convoy_create", "convoy_join"):
        nickname = clean_nickname(payload.get("nickname"))
        if not nickname:
            return {"type": "convoy_error", "reason": "bad_nickname"}
        if msg_type == "convoy_create":
            wanted = valid_convoy_code(payload.get("code"))
            existing = convoys.get(wanted) if wanted else None
            if existing is not None and (existing.member_of(session) or existing.is_creator(session)):
                # La pestana se reconecto y pide "crear" con su codigo de
                # siempre: la sesion sigue siendo miembro/creadora, es un
                # re-ingreso, no un convoy nuevo (antes se iba del suyo y se
                # creaba otro con codigo distinto).
                code, convoy = wanted, existing
            else:
                if session.convoy_code and session.convoy_code in convoys:
                    convoy_leave(session)
                # El creador puede pedir el mismo codigo de antes (tras un redeploy) si esta libre.
                code = wanted if wanted and wanted not in convoys else new_convoy_code()
                convoy = Convoy(code, session, bool(payload.get("postSummary")))
                convoys[code] = convoy
        else:
            code = valid_convoy_code(payload.get("code"))
            convoy = convoys.get(code) if code else None
            if convoy is None:
                return {"type": "convoy_error", "reason": "not_found"}
            if session.code in convoy.banned:
                return {"type": "convoy_error", "reason": "banned"}
            if session.convoy_code and session.convoy_code != code:
                convoy_leave(session)
        member = convoy.member_of(session)
        if member is None:
            if len(convoy.members) >= CONVOY_MAX_DRIVERS:
                return {"type": "convoy_error", "reason": "full"}
            if any(m.nickname.lower() == nickname.lower() for m in convoy.members.values()):
                return {"type": "convoy_error", "reason": "nickname_taken"}
            used = {m.color for m in convoy.members.values()}
            color = next((c for c in range(CONVOY_COLORS) if c not in used), len(convoy.members) % CONVOY_COLORS)
            member = ConvoyMember(session, nickname, color)
            convoy.members[session.code] = member
            convoy.nicknames_seen.append(nickname)
            convoy.empty_since = None
            session.convoy_code = code
            convoy_broadcast(convoy, {"type": "convoy_event", "event": "joined", "nickname": nickname, "id": member.id})
        else:
            member.nickname = nickname  # reconexion de la misma sesion
        member.variant = payload.get("mapVariant") or member.variant
        member.share_income = bool(payload.get("shareIncome"))
        convoy_broadcast(convoy)
        # rutas de los demas para el que entra
        for m in convoy.members.values():
            if m.route:
                for outbox in list(session.viewer_outboxes.values()):
                    outbox.push_control(json.dumps(convoy_route_message(m)))
        return None
    convoy = convoys.get(session.convoy_code) if session.convoy_code else None
    if convoy is None:
        return {"type": "convoy_error", "reason": "not_in_convoy"} if msg_type != "convoy_leave" else None
    member = convoy.member_of(session)
    if msg_type == "convoy_leave":
        convoy_leave(session)
    elif msg_type == "convoy_close":
        if convoy.is_creator(session):
            for m in list(convoy.members.values()):
                convoy_leave(m.session)
            finish_convoy(convoy)
    elif msg_type == "convoy_kick":
        if convoy.is_creator(session):
            target = next((m for m in convoy.members.values() if m.id == payload.get("id")), None)
            if target and target.session.code != session.code:
                convoy.banned.add(target.session.code)
                convoy_leave(target.session, kicked=True)
    elif msg_type == "convoy_variant":
        if member:
            member.variant = payload.get("mapVariant") or member.variant
            member.share_income = bool(payload.get("shareIncome", member.share_income))
    elif msg_type == "convoy_route":
        if member:
            pts = payload.get("points")
            if isinstance(pts, list) and all(isinstance(q, list) and len(q) == 2 for q in pts[:CONVOY_ROUTE_MAX_POINTS]):
                member.route = [[round(float(q[0]), 1), round(float(q[1]), 1)] for q in pts[:CONVOY_ROUTE_MAX_POINTS]] or None
            else:
                member.route = None
            member.route_rev += 1
            convoy_broadcast(convoy, convoy_route_message(member))
    elif msg_type == "convoy_msg":
        key = payload.get("key")
        if member and key in CONVOY_QUICK_MESSAGES and now - member.last_msg_at >= CONVOY_MSG_MIN_INTERVAL:
            member.last_msg_at = now
            member.msg = {"key": key, "ts": now}
            convoy_broadcast(convoy, {"type": "convoy_msg", "id": member.id, "nickname": member.nickname, "key": key})
    return None


def finish_convoy(convoy: Convoy):
    convoys.pop(convoy.code, None)
    for outbox in list(convoy.spectators.values()):
        outbox.push_control(json.dumps({"type": "convoy_state", "code": convoy.code, "you": None, "members": [], "spectators": 0, "ended": True}))
    if convoy.post_summary:
        asyncio.create_task(asyncio.to_thread(post_convoy_summary, convoy))


def post_convoy_summary(convoy: Convoy):
    if not DISCORD_CONVOY_WEBHOOK_URL:
        return
    try:
        duration = max(0, time.time() - convoy.created_at)
        km = sum(m.km for m in convoy.members.values()) + convoy.km_left
        names = ", ".join(dict.fromkeys(convoy.nicknames_seen)) or "-"
        embed = {
            "title": f"Convoy {convoy.code}",
            "color": 0x3B9EFF,
            "fields": [
                {"name": "Drivers", "value": names, "inline": False},
                {"name": "Duration", "value": f"{int(duration // 3600)}h {int(duration % 3600 // 60)}m", "inline": True},
                {"name": "Distance", "value": f"{round(km):,} km", "inline": True},
                {"name": "Deliveries", "value": str(convoy.deliveries), "inline": True},
            ],
        }
        req = urllib.request.Request(DISCORD_CONVOY_WEBHOOK_URL, data=json.dumps({"embeds": [embed]}).encode("utf-8"), method="POST",
                                     headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
        urllib.request.urlopen(req, timeout=10).close()
    except Exception as exc:
        logging.warning(f"convoy summary post failed: {exc}")


def convoy_tick():
    now = time.time()
    for convoy in list(convoys.values()):
        # km recorridos (sumados por miembro, escala de distancia del juego)
        for m in convoy.members.values():
            s = m.session.last_summary
            if s and s.get("x") is not None:
                if m._last_pos is not None:
                    d = math.hypot(s["x"] - m._last_pos[0], s["z"] - m._last_pos[1])
                    if d < 2000:  # teletransporte / carga de partida: no cuenta
                        m.km += d * GAME_DISTANCE_SCALE.get(s.get("game"), 20.0) / 1000
                m._last_pos = (s["x"], s["z"])
        # miembros cuya sesion murio (cliente cerrado hace mucho) se van solos
        # (sus km los suma convoy_leave, una sola vez)
        for code, m in list(convoy.members.items()):
            if code not in sessions:
                convoy_leave(m.session)
        if not convoy.members:
            if convoy.empty_since is None:
                convoy.empty_since = now
            if now - convoy.empty_since > CONVOY_EMPTY_TTL_SECONDS or not convoy.spectators and now - convoy.empty_since > 60:
                finish_convoy(convoy)
            continue
        convoy_broadcast(convoy)


async def convoy_tick_loop():
    while True:
        await asyncio.sleep(CONVOY_TICK_SECONDS)
        try:
            convoy_tick()
        except Exception:
            logging.exception("Error en convoy_tick_loop")


@app.websocket("/ws/convoy/{code}")
async def ws_convoy_spectator(websocket: WebSocket, code: str):
    """Espectador: mira el convoy sin juego ni codigo de pairing. Solo recibe."""
    client_ip = websocket.client.host if websocket.client else "unknown"
    if not check_rate_limit(client_ip):
        await websocket.close(code=4429, reason="demasiados intentos, esperá un minuto")
        return
    code = valid_convoy_code(code)
    convoy = convoys.get(code) if code else None
    # Accept y despues close, como en ws_viewer: sin el accept el navegador
    # ve 1006 sin el codigo y reintenta para siempre un convoy que ya
    # termino (auditoria del 10-10).
    if convoy is None:
        await websocket.accept()
        await websocket.close(code=4404, reason="convoy inexistente o terminado")
        return
    if len(convoy.spectators) >= CONVOY_MAX_SPECTATORS:
        await websocket.accept()
        await websocket.close(code=4403, reason="convoy lleno de espectadores")
        return
    await websocket.accept()
    outbox = ViewerOutbox(websocket)
    convoy.spectators[websocket] = outbox
    outbox.push_control(json.dumps(convoy.state_message(None)))
    for m in convoy.members.values():
        if m.route:
            outbox.push_control(json.dumps(convoy_route_message(m)))
    try:
        while True:
            await websocket.receive_text()  # no se espera nada del espectador
    except WebSocketDisconnect:
        pass
    finally:
        convoy.spectators.pop(websocket, None)
        outbox.close()


@app.post("/pair/new")
def create_pairing_code(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="demasiados intentos, esperá un minuto")
    cleanup_expired_sessions()
    code = generate_code()
    sessions[code] = Session(code)
    return {"code": code, "ttl_seconds": PAIRING_CODE_TTL_SECONDS}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "active_sessions": len(sessions),
        # A diferencia de active_sessions (cuenta codigos de pairing emitidos,
        # incluso sin cliente conectado todavia), esto es gente con el cliente
        # local realmente corriendo y mandando telemetria en este momento -
        # lo que la web muestra como "X jugadores activos ahora".
        "connected_clients": sum(1 for s in sessions.values() if s.client_ws is not None),
        # Railway setea esta env var sola con el commit deployado - sirve para
        # confirmar desde afuera que un push realmente se reflejo en produccion.
        "commit": os.environ.get("RAILWAY_GIT_COMMIT_SHA", "")[:7],
    }


# Version mas nueva del cliente disponible - se actualiza a mano (via
# /admin/stats/seed) cada vez que se sube un .exe nuevo al Release de GitHub.
# El link de descarga es siempre el mismo (.../releases/latest/download/...),
# no hace falta guardar uno por version.
DEFAULT_CLIENT_VERSION = "1.0.0"
CLIENT_DOWNLOAD_URL = "https://github.com/Nethercap/truck-companion/releases/latest/download/TruckDash-windows.zip"


@app.get("/version")
def version():
    """Ultima version del cliente disponible - consultado por el .exe y por /app (no requiere auth)."""
    stats = _load_stats()
    return {
        "latest_client_version": stats.get("latest_client_version", DEFAULT_CLIENT_VERSION),
        "download_url": CLIENT_DOWNLOAD_URL,
        # SHA-256 del zip del release (publicado junto al release). El cliente
        # lo verifica antes de auto-actualizarse; si no esta, actualiza igual.
        "sha256": stats.get("latest_client_sha256"),
        # Interruptor de las cuentas en los clientes (1.5.27+). Prendido salvo
        # que se apague con /admin/stats/seed {"accounts_enabled": false}:
        # asi un problema con las cuentas se corta en todas las PCs sin sacar
        # otra version. El cliente lo consulta al arrancar y cada 30 minutos.
        "accounts": stats.get("accounts_enabled", True) is not False,
    }


@app.get("/rates")
def rates(response: Response):
    """Tasas de cambio (base EUR) para que el /app muestre el pago en la
    moneda del usuario. Sin auth; cacheable una hora."""
    response.headers["Cache-Control"] = "public, max-age=3600"
    data = get_rates()
    if not data:
        raise HTTPException(status_code=503, detail="rates unavailable")
    return {"base": data["base"], "rates": data["rates"], "fetched_at": data["fetched_at"]}


@app.get("/stats/public")
def stats_public():
    """Contadores historicos totales, para mostrar en la landing (no requiere auth)."""
    stats = _load_stats()
    return {
        "total_sessions": stats.get("total_sessions", 0),
        "jobs_delivered": stats.get("jobs_delivered", 0),
        "total_revenue": stats.get("total_revenue", 0),
        "latest_jobs": stats.get("latest_jobs", []),
    }


@app.get("/admin/stats")
def stats_admin(x_admin_key: Optional[str] = Header(default=None)):
    if not ADMIN_KEY or x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403)
    # active_sessions es en vivo (cuenta sessions en memoria de este proceso,
    # como /health) - no se persiste en R2 como el resto de las stats.
    return {**_load_stats(), "active_sessions": len(sessions)}


# Permite sembrar una base real conocida manualmente (ej. gente que probo el
# cliente o trabajos completados antes de tener este tracking automatico), o
# limpiar latest_jobs si quedo con datos malos (ej. duplicados de un bug ya
# arreglado).
_SEEDABLE_NUMERIC_KEYS = {"total_sessions", "jobs_delivered", "total_revenue"}


@app.post("/admin/stats/seed")
def stats_seed(payload: dict, x_admin_key: Optional[str] = Header(default=None)):
    if not ADMIN_KEY or x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403)
    with _stats_lock:
        stats = _load_stats()
        for key, value in payload.items():
            if key in _SEEDABLE_NUMERIC_KEYS and isinstance(value, (int, float)):
                stats[key] = value
            elif key == "latest_jobs" and isinstance(value, list):
                stats[key] = value[:LATEST_JOBS_MAX]
            elif key in ("latest_client_version", "latest_client_sha256") and isinstance(value, str):
                stats[key] = value
            elif key == "accounts_enabled" and isinstance(value, bool):
                stats[key] = value
        _save_stats()
        return stats


@app.websocket("/ws/client/{code}")
async def ws_client(websocket: WebSocket, code: str):
    """Conexion del cliente local (envia telemetria)."""
    client_ip = websocket.client.host if websocket.client else "unknown"
    if not check_rate_limit(client_ip):
        await websocket.close(code=4429, reason="demasiados intentos, esperá un minuto")
        return

    session = sessions.get(code)
    if session is None:
        # Las sesiones viven en memoria: tras un redeploy (o si la sesion se
        # limpio por inactividad, ej. PC suspendida) el cliente reconecta con
        # el codigo que YA tenia y antes recibia "invalido" para siempre. El
        # codigo es suyo (lo genero este backend y solo el lo conoce), asi
        # que se le recrea la sesion en vez de rechazarlo. Los viewers que
        # tengan la pestana abierta reintentan solos y la encuentran. No se
        # cuenta como sesion nueva en las stats (es la misma persona).
        if not is_well_formed_code(code):
            await websocket.close(code=4404, reason="codigo de pairing invalido")
            return
        session = Session(code)
        session.counted = True
        sessions[code] = session
        logging.info("Sesion %s recreada por reconexion del cliente", code)

    await websocket.accept()
    # Si quedo una conexion anterior del cliente (corte que el servidor
    # todavia no detecto, o el .exe abierto dos veces) se cierra: antes se
    # pisaba sin cerrar y, cuando esa vieja moria, su finally dejaba la
    # sesion sin cliente aunque el nuevo siguiera conectado (auditoria del
    # 10-10). En una task aparte: un close a una conexion medio muerta
    # puede esperar el handshake de cierre varios segundos.
    anterior = session.client_ws
    session.client_ws = websocket
    if anterior is not None and anterior is not websocket:
        asyncio.create_task(_safe_close(anterior, 4409, "replaced"))
    session.last_seen = time.time()
    if not session.counted:
        session.counted = True
        # PUT a R2 es I/O bloqueante - correrlo en un thread para no trabar el
        # event loop (que en paralelo esta reenviando telemetria a viewers).
        asyncio.create_task(asyncio.to_thread(record_session_started))
    await broadcast_session_state(session)
    await notify_client_viewers(session)
    try:
        while True:
            data = await websocket.receive_text()
            session.last_seen = time.time()
            # jobDelivered llega como pulso (True por un solo frame) - se
            # detecta el flanco de subida aca (server-side, una vez por
            # entrega real) en vez de contar en el cliente web, que podria
            # tener varios viewers mirando la misma sesion.
            try:
                payload = json.loads(data)
                if payload.get("type") == "client_status":
                    # Todo lo que la web lee del client_status tiene que estar
                    # aca: una pestana que abre despues solo ve esto (el
                    # cliente no lo reenvia si nada cambia). "detail" faltaba
                    # y el tablero abierto despues no decia en que carpeta
                    # faltaba el plugin. test_contrato_client_status lo cuida.
                    detail = payload.get("detail")
                    session.last_client_status = {"status": payload.get("status"), "game": payload.get("game"), "clientVersion": payload.get("clientVersion"),
                                                  "detail": detail[:400] if isinstance(detail, str) and detail else None,
                                                  "mapDlcs": clean_map_dlcs(payload.get("mapDlcs")),
                                                  "mapMods": clean_map_mods(payload.get("mapMods")),
                                                  "localMaps": clean_local_maps(payload.get("localMaps")),
                                                  "localMapPort": clean_port(payload.get("localMapPort")),
                                                  "overlay": payload.get("overlay") is True}
                # Mensajes de control (client_status, etc.) no son telemetria:
                # no deben tocar el flanco de jobDelivered. Antes el primer
                # client_status de cada conexion dejaba el estado en False y el
                # primer tick real (con el flag todavia en true desde antes)
                # parecia una entrega nueva - una por cada redeploy/reconexion.
                if payload.get("type") or "event" not in payload:
                    for outbox in list(session.viewer_outboxes.values()):
                        outbox.push_control(data)
                    continue
                event = payload.get("event") or {}
                job_delivered = bool(event.get("jobDelivered"))
                now = time.time()
                # Se guarda siempre (barato, solo en memoria) - el filtro de
                # privacidad pasa por share_position/map_variant a la hora de
                # armar el broadcast, no aca.
                pos = payload.get("position") or {}
                if pos.get("x") is not None and pos.get("z") is not None:
                    session.last_position = {"x": pos["x"], "z": pos["z"], "ts": now}
                session.last_summary = summarize_for_convoy(payload, session.last_summary, now)
                # La variante de mapa la elige la web (set_live_share), pero la
                # telemetria es la que sabe de verdad en que juego esta el
                # camion: si no coinciden (la web mando "ats" antes de recibir
                # el primer tick, o el juego cambio), se corrige a la variante
                # base del juego real para no mezclar conductores de ETS2 en
                # el mapa de ATS.
                session.map_variant = coerce_map_variant(session.map_variant, payload.get("game"))
                if session.convoy_code and job_delivered and session.last_job_delivered is False:
                    convoy = convoys.get(session.convoy_code)
                    if convoy:
                        convoy.deliveries += 1
                # Ver comentario en Session.last_job_snapshot - se actualiza en
                # cada tick que venga con datos validos, sin importar si el
                # cliente se reinicio en el medio.
                if payload.get("citySrc") and payload.get("cityDst"):
                    session.last_job_snapshot = {
                        "citySrc": payload.get("citySrc"),
                        "cityDst": payload.get("cityDst"),
                        "truckBrand": payload.get("truckBrand"),
                        "truckName": payload.get("truckName"),
                        "cargo": payload.get("cargo"),
                    }
                # El SDK a veces re-pulsa jobDelivered para el mismo evento
                # real (bug conocido del plugin en ciertas condiciones, ver
                # changelog de scs-sdk-plugin) - un cooldown ademas del flanco
                # de subida evita contarlo dos veces.
                if (
                    job_delivered
                    and session.last_job_delivered is False
                    and now - session.last_job_delivered_at > JOB_DELIVERED_COOLDOWN_SECONDS
                ):
                    session.last_job_delivered_at = now
                    # citySrc/cityDst/cargo ya vienen vacios en el mismo tick
                    # del pulso (el juego los limpia antes o al mismo tiempo,
                    # no despues) - el cliente cachea el ultimo snapshot valido
                    # y lo manda aparte en jobSrc/jobDst/etc, con fallback a
                    # los campos top-level por si el cliente no los mando.
                    snap = session.last_job_snapshot
                    job_info = {
                        "game": payload.get("game"),
                        "citySrc": event.get("jobSrc") or payload.get("citySrc") or snap["citySrc"],
                        "cityDst": event.get("jobDst") or payload.get("cityDst") or snap["cityDst"],
                        "truckBrand": event.get("jobTruckBrand") or payload.get("truckBrand") or snap["truckBrand"],
                        "truckName": event.get("jobTruckName") or payload.get("truckName") or snap["truckName"],
                        "cargo": event.get("jobCargo") or payload.get("cargo") or snap["cargo"],
                        "revenue": event.get("jobDeliveredRevenue") or 0,
                        "currency": GAME_CURRENCY.get(payload.get("game")),
                        "localCurrency": session.viewer_currency,
                        "distanceKm": event.get("jobDeliveredDistanceKm") or 0,
                        "deliveredAt": now,  # para poder distinguir a simple vista una entrega real repetida de un duplicado real
                    }
                    asyncio.create_task(asyncio.to_thread(record_job_delivered, job_info))
                session.last_job_delivered = job_delivered
            except Exception:
                pass
            for outbox in list(session.viewer_outboxes.values()):
                outbox.push_telemetry(data)
    except WebSocketDisconnect:
        pass
    finally:
        session.last_seen = time.time()
        # Solo si sigue siendo la conexion vigente: una vieja reemplazada no
        # tiene que borrar ni anunciar como desconectado al cliente nuevo.
        if session.client_ws is websocket:
            session.client_ws = None
            await broadcast_session_state(session)


@app.websocket("/ws/live/{code}")
async def ws_viewer(websocket: WebSocket, code: str):
    """Conexion de la web (recibe telemetria en vivo)."""
    client_ip = websocket.client.host if websocket.client else "unknown"
    if not check_rate_limit(client_ip):
        await websocket.close(code=4429, reason="demasiados intentos, esperá un minuto")
        return

    session = sessions.get(code)
    if session is None:
        # Se acepta y recien despues se cierra: si se cierra antes del accept,
        # el handshake se rechaza y el WebSocket del navegador reporta 1006
        # sin el codigo, asi que la web no podia distinguir "codigo invalido"
        # de "se corto la conexion" (y el link guardado del celular no sabia
        # que solo faltaba abrir el cliente en la PC).
        await websocket.accept()
        await websocket.close(code=4404, reason="codigo de pairing invalido o expirado")
        return

    await websocket.accept()
    session.viewer_ws_list.append(websocket)
    session.viewer_outboxes[websocket] = ViewerOutbox(websocket)
    session.last_seen = time.time()
    await _safe_send(websocket, session_state_message(session))
    # El estado real de "compartir": un dispositivo recien abierto arranca
    # con su default local y si no se lo decimos muestra otra cosa.
    await _safe_send(websocket, live_share_state_message(session))
    await notify_client_viewers(session)
    try:
        while True:
            # Normalmente no esperamos nada del viewer (solo mantiene viva la
            # conexion), salvo los mensajes de la botonera del /app: comandos
            # (on/off balizas, motor, etc.) y get/set de keybinds para el
            # modal de remapeo - se reenvian tal cual al cliente local, que es
            # el que realmente simula la tecla / guarda keybinds.json. Si el
            # cliente no esta conectado en este momento, se descarta. La
            # respuesta del cliente (tipo "keybinds") no necesita relay
            # aparte: ya le llega a todos los viewers por el loop de
            # ws_client de mas abajo, que reenvia cualquier mensaje del
            # cliente tal cual.
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                msg_type = payload.get("type")
                # "offmap": la web vio el camion fuera del mapa que conoce; el
                # cliente ofrece armar el mapa en la PC (map_builder.py).
                # "nav_hud": el giro y lo que falta para el overlay en el
                # juego; texto corto, se descarta si viene grande.
                if msg_type == "nav_hud" and len(data) > NAV_HUD_MAX_BYTES:
                    continue
                if msg_type in ("command", "get_keybinds", "set_keybinds", "offmap", "nav_hud"):
                    if session.client_ws is not None:
                        await session.client_ws.send_text(data)
                elif msg_type == "set_live_share":
                    # Opt-in de "ver/mostrar otros jugadores" - reciprocidad
                    # simple: si no compartis tu posicion, tampoco ves la de
                    # nadie (se resuelve solo via el filtro en
                    # broadcast_live_positions, no hace falta nada mas aca).
                    enabled = bool(payload.get("enabled"))
                    explicit = payload.get("explicit")
                    # explicit True = el usuario toco el tilde; False = el
                    # reenvio automatico de una pestana al (re)conectar, con
                    # su default local. Ese reenvio no puede volver a prender
                    # lo que el usuario apago a mano (apagar si, siempre).
                    # Sin la clave es una pestana vieja: se aplica como antes
                    # (auditoria del 10-10).
                    if not (explicit is False and enabled and session.share_off_by_user):
                        if isinstance(explicit, bool):
                            session.share_off_by_user = not enabled
                        session.share_position = enabled
                        # Solo un nombre de variante valido: una lista o un
                        # dict rompia broadcast_live_positions y /live/summary
                        # para todos (mismo chequeo que clean_offmap_report).
                        variant = payload.get("mapVariant")
                        if not isinstance(variant, str) or not LIVE_MAP_VARIANT_RE.match(variant):
                            variant = None
                        session.map_variant = variant if session.share_position else None
                        # mismo chequeo contra el juego que reporta la telemetria
                        session.map_variant = coerce_map_variant(session.map_variant, (session.last_summary or {}).get("game"))
                        session.live_nick = clean_live_nick(payload.get("nick")) if session.share_position else None
                        if not session.share_position:
                            session.last_position = None
                            session.live_route = None
                    # A todas las pestanas, para que sincronicen el tilde
                    # (tambien a la que mando un reenvio que se ignoro).
                    estado = live_share_state_message(session)
                    for outbox in list(session.viewer_outboxes.values()):
                        outbox.push_control(estado)
                elif msg_type == "live_route":
                    # Sin compartir la posicion no hay mapa donde dibujarla.
                    nueva = clean_live_route(payload.get("points")) if session.share_position else None
                    if nueva != session.live_route:
                        session.live_route = nueva
                        session.live_route_rev += 1
                        live_route_push(session)
                elif msg_type == "offmap_report":
                    report = clean_offmap_report(payload)
                    if report and report["variant"] not in session.offmap_reported:
                        session.offmap_reported.add(report["variant"])
                        # PUT a R2 bloqueante: en un thread, como las demas stats.
                        asyncio.create_task(asyncio.to_thread(record_offmap_report, report))
                elif msg_type == "set_currency":
                    cur = payload.get("currency")
                    session.viewer_currency = cur.upper() if is_valid_currency(cur) else None
                elif msg_type and msg_type.startswith("convoy_"):
                    reply = handle_convoy_message(session, websocket, msg_type, payload)
                    if reply is not None:
                        await _safe_send(websocket, json.dumps(reply))
            except Exception:
                logging.exception("viewer message failed")
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in session.viewer_ws_list:
            session.viewer_ws_list.remove(websocket)
        outbox = session.viewer_outboxes.pop(websocket, None)
        if outbox is not None:
            outbox.close()
        session.last_seen = time.time()
        await notify_client_viewers(session)
