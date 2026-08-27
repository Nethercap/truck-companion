"""
Backend minimo del companion de ETS2/ATS.

Actua como relay en tiempo real entre:
  - el cliente local (lee la telemetria del juego y la manda por WebSocket)
  - la web (se conecta con el mismo codigo de pairing y recibe los datos)

No hay cuentas de usuario en esta primera etapa: el pairing es por codigo
corto generado en el momento (igual que vincular un Chromecast), valido
mientras dure la sesion del proceso. No se persiste nada en DB todavia.
"""

import random
import string
import time
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Truck Companion Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PAIRING_CODE_LENGTH = 6
PAIRING_CODE_TTL_SECONDS = 10 * 60


class Session:
    def __init__(self, code: str):
        self.code = code
        self.created_at = time.time()
        self.client_ws: Optional[WebSocket] = None
        self.viewer_ws_list: list[WebSocket] = []


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
def create_pairing_code():
    cleanup_expired_sessions()
    code = generate_code()
    sessions[code] = Session(code)
    return {"code": code, "ttl_seconds": PAIRING_CODE_TTL_SECONDS}


@app.get("/health")
def health():
    return {"status": "ok", "active_sessions": len(sessions)}


@app.websocket("/ws/client/{code}")
async def ws_client(websocket: WebSocket, code: str):
    """Conexion del cliente local (envia telemetria)."""
    session = sessions.get(code)
    if session is None:
        await websocket.close(code=4404, reason="codigo de pairing invalido o expirado")
        return

    await websocket.accept()
    session.client_ws = websocket
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
