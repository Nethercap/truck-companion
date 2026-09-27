"""Une el acumulador con la cola y con la API.

El acumulador dice QUE mandar, la cola lo guarda hasta que se pueda, y esto
las conecta con el bucle de telemetria. Es la unica pieza de las tres que
toca el reloj, el disco y la red.

Dos reglas que no se pueden romper, por donde corre esto:

- **Nada de aca puede tirar una excepcion hacia afuera.** Corre al lado del
  bucle de telemetria; si se cae, se lleva puesto el tablero, que es lo que
  la persona vino a usar. La cuenta es opcional, el tablero no.
- **Nada de aca puede bloquear el bucle.** El envio es HTTP contra un
  servidor que puede estar caido, asi que va en otro hilo.

**Sin cuenta vinculada no se acumula nada.** No es solo ahorro: guardar en
disco por donde anduvo alguien que nunca dijo que si, por las dudas de que
algun dia se registre, es exactamente lo que no queremos hacer. Vincular es
el si. Subir lo de antes de vincular es otra funcion (punto 6 del diseño) y
se vera aparte.
"""

import asyncio
import logging
import os
import time

import account
import trip_queue
import win_integration
from accumulator import Acumulador

# Cada cuanto se intenta vaciar la cola. Holgado a proposito: lo que la cola
# guarda no se pierde, asi que apurarse no gana nada y sumaria un pedido
# HTTP cada pocos segundos al lado del bucle de telemetria.
INTERVALO_DRENAJE_S = 60
# Cada cuanto se relee el token del disco, para que vincular la cuenta a
# mitad de una partida empiece a andar sin reiniciar el cliente.
INTERVALO_TOKEN_S = 30

NOMBRE_COLA = "cuenta-pendiente.json"


def ruta_cola() -> str:
    return os.path.join(win_integration.base_dir(), NOMBRE_COLA)


class Sincronizador:
    """Acumula, encola y manda. Todo protegido: nunca levanta."""

    def __init__(self, ruta=None, pedir=None, ahora=time.time):
        self._ahora = ahora
        self._cola = trip_queue.Cola(ruta or ruta_cola())
        self._enviador = trip_queue.Enviador(self._cola, pedir)
        self._acumulador = None
        self._token = None
        self._base = account.API_POR_DEFECTO
        self._token_leido = 0.0

    # --- lo que llama el bucle de telemetria ---

    def tick(self, payload: dict, raw: dict) -> None:
        """Una lectura. No bloquea y no levanta."""
        try:
            ahora = self._ahora()
            self._refrescar_token(ahora)
            if not self._token:
                # Sin cuenta no se acumula. Si habia algo a medias, se cierra
                # y queda en la cola para cuando se vuelva a vincular.
                if self._acumulador is not None:
                    self._encolar(self._acumulador.cerrar(ahora))
                    self._acumulador = None
                return
            if self._acumulador is None:
                self._acumulador = Acumulador()
            self._encolar(self._acumulador.tick(payload, raw, ahora))
        except Exception:
            logging.exception("El acumulador de la cuenta fallo (se sigue igual)")

    def cerrar_sesion(self) -> None:
        """El juego se cerro o el cliente se va."""
        try:
            if self._acumulador is not None:
                self._encolar(self._acumulador.cerrar(self._ahora()))
                self._acumulador = None
        except Exception:
            logging.exception("No se pudo cerrar la sesion de la cuenta")

    async def drenar(self) -> dict:
        """Vacia la cola en otro hilo. Nunca levanta."""
        try:
            self._refrescar_token(self._ahora(), forzar=True)
            if not self._token or not len(self._cola):
                return {}
            resumen = await asyncio.to_thread(
                self._enviador.drenar, self._token, self._base)
            if resumen.get("enviados"):
                logging.info("Cuenta: %s enviados, %s pendientes",
                             resumen["enviados"], len(self._cola))
            if resumen.get("token_invalido"):
                logging.info("Cuenta: el token ya no vale, se espera a vincular de nuevo")
            return resumen
        except Exception:
            logging.exception("No se pudo vaciar la cola de la cuenta")
            return {}

    def pendientes(self) -> int:
        return len(self._cola)

    # --- adentro ---

    def _refrescar_token(self, ahora, forzar=False):
        if not forzar and ahora - self._token_leido < INTERVALO_TOKEN_S:
            return
        self._token_leido = ahora
        settings = win_integration.load_settings()
        self._token = account.token_guardado(settings)
        self._base = account.base_api(settings)

    def _encolar(self, acciones):
        for accion in acciones or []:
            self._cola.encolar(accion)
            _anotar(accion)


def _anotar(accion: dict) -> None:
    """Deja en el log lo que se manda, con los numeros a la vista.

    Es la unica forma de comparar contra la pantalla del juego sin adivinar
    de donde salio cada numero. Va a INFO porque se mira cuando algo no
    cuadra, y son unas pocas lineas por hora.
    """
    datos = accion.get("datos") or {}
    if accion["tipo"] == "session":
        logging.info("Cuenta [sesion%s] %.1f km, %.2f h al volante, %.1f l",
                     " cerrada" if datos.get("ended_at") else "",
                     datos.get("distance_km") or 0,
                     datos.get("real_hours") or 0,
                     datos.get("fuel_used") or 0)
    else:
        logging.info("Cuenta [%s] %s -> %s: %.1f km, %.2f h, %s km/h prom",
                     accion["tipo"].replace("trip_", "viaje "),
                     datos.get("city_src") or "?", datos.get("city_dst") or "?",
                     datos.get("distance_tracked_km") or 0,
                     datos.get("real_hours") or 0,
                     datos.get("avg_speed") or "-")


async def bucle(sync: "Sincronizador") -> None:
    """Vacia la cola cada tanto. Se arranca junto al bucle de telemetria."""
    while True:
        await asyncio.sleep(INTERVALO_DRENAJE_S)
        await sync.drenar()
