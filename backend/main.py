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
import os
import random
import string
import threading
import time
from collections import defaultdict, deque
from typing import Optional

import boto3
from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

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


def record_session_started():
    with _stats_lock:
        stats = _load_stats()
        today = time.strftime("%Y-%m-%d", time.gmtime())
        stats["total_sessions"] = stats.get("total_sessions", 0) + 1
        stats.setdefault("daily", {})
        stats["daily"][today] = stats["daily"].get(today, 0) + 1
        _save_stats()


class Session:
    def __init__(self, code: str):
        self.code = code
        self.created_at = time.time()
        self.client_ws: Optional[WebSocket] = None
        self.viewer_ws_list: list[WebSocket] = []
        self.counted = False  # ya se sumo al contador historico (una vez por sesion, no por reconexion)


sessions: dict[str, Session] = {}


def generate_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(random.choices(alphabet, k=PAIRING_CODE_LENGTH))
        if code not in sessions:
            return code


def cleanup_expired_sessions():
    now = time.time()
    expired = [
        code
        for code, session in sessions.items()
        if session.client_ws is None
        and now - session.created_at > PAIRING_CODE_TTL_SECONDS
    ]
    for code in expired:
        del sessions[code]


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
    return {"status": "ok", "active_sessions": len(sessions)}


@app.get("/stats/public")
def stats_public():
    """Contador historico total, para mostrar en la landing (no requiere auth)."""
    stats = _load_stats()
    return {"total_sessions": stats.get("total_sessions", 0)}


@app.get("/admin/stats")
def stats_admin(x_admin_key: Optional[str] = Header(default=None)):
    if not ADMIN_KEY or x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403)
    return _load_stats()


@app.websocket("/ws/client/{code}")
async def ws_client(websocket: WebSocket, code: str):
    """Conexion del cliente local (envia telemetria)."""
    client_ip = websocket.client.host if websocket.client else "unknown"
    if not check_rate_limit(client_ip):
        await websocket.close(code=4429, reason="demasiados intentos, esperá un minuto")
        return

    session = sessions.get(code)
    if session is None:
        await websocket.close(code=4404, reason="codigo de pairing invalido o expirado")
        return

    await websocket.accept()
    session.client_ws = websocket
    if not session.counted:
        session.counted = True
        # PUT a R2 es I/O bloqueante - correrlo en un thread para no trabar el
        # event loop (que en paralelo esta reenviando telemetria a viewers).
        asyncio.create_task(asyncio.to_thread(record_session_started))
    try:
        while True:
            data = await websocket.receive_text()
            for viewer in list(session.viewer_ws_list):
                try:
                    await viewer.send_text(data)
                except Exception:
                    session.viewer_ws_list.remove(viewer)
    except WebSocketDisconnect:
        pass
    finally:
        session.client_ws = None


@app.websocket("/ws/live/{code}")
async def ws_viewer(websocket: WebSocket, code: str):
    """Conexion de la web (recibe telemetria en vivo)."""
    client_ip = websocket.client.host if websocket.client else "unknown"
    if not check_rate_limit(client_ip):
        await websocket.close(code=4429, reason="demasiados intentos, esperá un minuto")
        return

    session = sessions.get(code)
    if session is None:
        await websocket.close(code=4404, reason="codigo de pairing invalido o expirado")
        return

    await websocket.accept()
    session.viewer_ws_list.append(websocket)
    try:
        while True:
            # No esperamos mensajes del viewer, solo mantenemos la conexion viva.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in session.viewer_ws_list:
            session.viewer_ws_list.remove(websocket)
