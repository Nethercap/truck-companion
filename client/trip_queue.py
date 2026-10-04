"""Lo que no se pudo mandar a la cuenta, guardado en disco.

Mucha gente juega sin internet, o con internet que se corta, o apaga la PC a
mitad de un viaje. Sin esto, cada corte se lleva las stats de esa sesion y
la cuenta muestra un agujero que nadie puede explicar despues.

**No es una cola de eventos: es el ULTIMO ESTADO conocido de cada cosa.** Un
checkpoint no es un incremento, es una foto de los totales, asi que de cinco
checkpoints pendientes del mismo viaje solo importa el ultimo. Guardarlos
todos no seria solo desperdicio: si llegaran desordenados, una foto vieja
pisaria los numeros nuevos y el viaje retrocederia. Por eso lo que se encola
se reemplaza por clave.

Que esto funcione depende de que el servidor sea idempotente, y lo es a
proposito: abrir un viaje devuelve el que ya existe con esa huella, guardar
una sesion con el mismo client_id reescribe la misma fila, y cerrar un viaje
ya cerrado no mueve la fecha de entrega. Reintentar no puede duplicar nada.
"""

import json
import logging
import os
import tempfile
import time

import account
import trip_tracker

# Tope de cosas pendientes. Con el reemplazo por clave la cola es
# naturalmente chica (una sesion y un viaje a la vez), asi que llegar a esto
# significa semanas sin internet y muchos viajes.
MAXIMO = 500

# Codigos que no tiene sentido reintentar: el servidor ya dijo que no y va a
# volver a decir lo mismo. Se descartan para que una entrada envenenada no
# tape la cola para siempre, que seria perder TODO lo que venga despues por
# culpa de una sola cosa mal.
SIN_REINTENTO = (400, 403, 404, 409, 422)


def clave_de(accion: dict) -> str:
    """Que identifica a esta cosa, para que lo nuevo reemplace a lo viejo."""
    datos = accion.get("datos") or {}
    if accion.get("tipo") == "session":
        return "session:" + str(datos.get("client_id"))
    # Con el tramo: lo que quedo sin mandar del tramo anterior (el cliente se
    # cerro antes de vaciar la cola) no lo pisa el primero del nuevo.
    return ("trip:" + "|".join(str(datos.get(c)) for c in trip_tracker.CAMPOS_HUELLA)
            + "|" + str(datos.get("run_id")))


class Cola:
    """Las cosas pendientes, en un archivo JSON."""

    def __init__(self, ruta: str, maximo: int = MAXIMO):
        self.ruta = ruta
        self.maximo = maximo
        self._items = self._leer()

    def _leer(self) -> list:
        try:
            with open(self.ruta, encoding="utf-8") as f:
                datos = json.load(f)
            return datos if isinstance(datos, list) else []
        except FileNotFoundError:
            return []
        except Exception as exc:
            # Un archivo corrupto no puede impedir que el cliente arranque.
            # Se pierde lo pendiente, que es mejor que no abrir.
            logging.warning(f"La cola de la cuenta estaba ilegible, se empieza de cero ({exc})")
            return []

    def _guardar(self) -> None:
        """Escribe a un temporal y renombra: un corte de luz a mitad de la
        escritura deja el archivo viejo entero, no uno a medio escribir."""
        try:
            carpeta = os.path.dirname(self.ruta) or "."
            os.makedirs(carpeta, exist_ok=True)
            fd, temporal = tempfile.mkstemp(dir=carpeta, suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self._items, f)
            os.replace(temporal, self.ruta)
        except Exception as exc:
            logging.warning(f"No se pudo guardar la cola de la cuenta ({exc})")

    def encolar(self, accion: dict) -> None:
        """Agrega, o reemplaza lo pendiente de la misma cosa."""
        clave = clave_de(accion)
        entrada = {"clave": clave, "tipo": accion["tipo"],
                   "datos": accion["datos"], "ts": time.time()}
        for i, viejo in enumerate(self._items):
            if viejo["clave"] == clave:
                # Se conserva la posicion: lo que espera hace mas tiempo
                # sigue saliendo primero aunque se haya actualizado.
                self._items[i] = entrada
                break
        else:
            self._items.append(entrada)
        if len(self._items) > self.maximo:
            # Se tira lo mas viejo. Duele, pero la alternativa es un archivo
            # que crece sin limite en la PC de alguien.
            sobran = len(self._items) - self.maximo
            logging.warning(f"La cola de la cuenta llego al tope, se descartan {sobran}")
            self._items = self._items[sobran:]
        self._guardar()

    def pendientes(self) -> list:
        return list(self._items)

    def quitar(self, clave: str) -> None:
        antes = len(self._items)
        self._items = [i for i in self._items if i["clave"] != clave]
        if len(self._items) != antes:
            self._guardar()

    def vaciar(self) -> None:
        self._items = []
        self._guardar()

    def __len__(self) -> int:
        return len(self._items)


class Enviador:
    """Vacia la cola contra la API. No levanta nunca hacia afuera."""

    def __init__(self, cola: Cola, pedir=None):
        self.cola = cola
        # Inyectable para poder probar cada codigo de respuesta sin red.
        self._pedir = pedir or account._pedir
        # Huella -> id del viaje, para no pedir /trips/open en cada envio.
        self._ids = {}

    def drenar(self, token: str, base: str, maximo: int = 20) -> dict:
        """Manda lo pendiente. Devuelve un resumen de lo que paso.

        Corta al primer fallo de red: si no hay internet para uno, no lo hay
        para el siguiente, y seguir intentando solo gasta tiempo al lado del
        bucle de telemetria.
        """
        resumen = {"enviados": 0, "descartados": 0, "sin_conexion": False,
                   "token_invalido": False}
        if not token:
            return resumen
        for entrada in self.cola.pendientes()[:maximo]:
            codigo = self._mandar(entrada, token, base)
            if codigo in (200, 201):
                self.cola.quitar(entrada["clave"])
                resumen["enviados"] += 1
            elif codigo == 401:
                # El token dejo de valer: no se descarta nada, se espera a
                # que la persona vuelva a vincular.
                resumen["token_invalido"] = True
                break
            elif codigo in SIN_REINTENTO:
                logging.warning("La API rechazo algo de la cola (%s), se descarta: %s",
                                codigo, entrada["clave"])
                self.cola.quitar(entrada["clave"])
                resumen["descartados"] += 1
            else:
                # 0 (sin red) o 5xx: se deja para la proxima.
                resumen["sin_conexion"] = True
                break
        return resumen

    # --- adentro ---

    def _mandar(self, entrada: dict, token: str, base: str) -> int:
        if entrada["tipo"] == "session":
            datos = entrada["datos"]
            codigo, _ = self._pedir(f"{base}/sessions/{datos['client_id']}",
                                    datos, token, "PUT")
            return codigo
        return self._mandar_viaje(entrada, token, base)

    def _mandar_viaje(self, entrada: dict, token: str, base: str) -> int:
        """Abrir y despues actualizar.

        Siempre se abre primero, aunque el viaje ya exista: la cola guarda
        el ultimo estado y no la historia, asi que puede no haber ninguna
        entrada de apertura pendiente y aun asi hacer falta el id. Abrir es
        idempotente: devuelve el viaje que ya estaba.
        """
        datos = dict(entrada["datos"])
        estado = datos.pop("status", None)
        clave = entrada["clave"]

        trip_id = self._ids.get(clave)
        if trip_id is None:
            codigo, respuesta = self._pedir(f"{base}/trips/open", datos, token)
            if codigo not in (200, 201):
                return codigo
            trip_id = ((respuesta or {}).get("trip") or {}).get("id")
            if not trip_id:
                return 400
            self._ids[clave] = trip_id

        if estado:
            datos["status"] = estado
            codigo, _ = self._pedir(f"{base}/trips/{trip_id}/close", datos, token)
            if codigo in (200, 201):
                self._ids.pop(clave, None)
            return codigo
        codigo, _ = self._pedir(f"{base}/trips/{trip_id}/checkpoint", datos, token)
        if codigo == 404:
            # El viaje ya no esta (lo borro la persona desde la web). El id
            # cacheado no sirve; se olvida para que el proximo intento lo
            # vuelva a abrir en vez de reintentar contra un id muerto.
            self._ids.pop(clave, None)
        return codigo
