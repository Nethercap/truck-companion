"""Encontrar la ventana del juego y traerla al frente, en Windows y Linux.

En Windows son tres llamadas a user32 (FindWindowW, SetForegroundWindow y la
danza de AttachThreadInput). En Linux lo equivalente es X11: la lista de
ventanas la publica el gestor de ventanas en la propiedad _NET_CLIENT_LIST
del root, y se activa una mandandole un mensaje _NET_ACTIVE_WINDOW.

El "handle" es un int en los dos sistemas (HWND alla, window id aca), asi
que el resto del cliente no necesita saber en cual esta.

Nada de esto aplica a Proton: ahi el juego y el cliente corren los dos
adentro del prefijo, o sea como Windows, y se usa el camino de Windows.
"""

import logging
import os
import sys

IS_WINDOWS = sys.platform == "win32"

_display = None
_display_intentado = False


def _get_display():
    """La conexion con el servidor X, o None si no hay (Wayland puro, o una
    sesion sin X). Se abre una sola vez."""
    global _display, _display_intentado
    if not _display_intentado:
        _display_intentado = True
        try:
            from Xlib import display
            _display = display.Display()
        except Exception as exc:
            logging.info(f"Sin servidor X para buscar la ventana del juego ({exc})")
            _display = None
    return _display


def _prop(ventana, nombre, tipo):
    """Valor de una propiedad X, o None. Devuelve la lista cruda."""
    try:
        d = _get_display()
        atom = d.get_atom(nombre)
        r = ventana.get_full_property(atom, tipo)
        return r.value if r else None
    except Exception:
        return None


def _titulo(ventana) -> str:
    """_NET_WM_NAME (UTF-8, el que usan los juegos modernos) y si no WM_NAME."""
    valor = _prop(ventana, "_NET_WM_NAME", 0)  # 0 = AnyPropertyType
    if valor:
        if isinstance(valor, bytes):
            return valor.decode("utf-8", "replace")
        return str(valor)
    try:
        nombre = ventana.get_wm_name()
        if isinstance(nombre, bytes):
            return nombre.decode("utf-8", "replace")
        return nombre or ""
    except Exception:
        return ""


def _ventanas():
    """Las ventanas de nivel superior, segun el gestor de ventanas."""
    from Xlib import Xatom
    d = _get_display()
    if d is None:
        return []
    root = d.screen().root
    ids = _prop(root, "_NET_CLIENT_LIST", Xatom.WINDOW)
    if ids:
        return [d.create_resource_object("window", i) for i in ids]
    # Sin gestor de ventanas que publique la lista: se recorre el arbol.
    try:
        return list(root.query_tree().children)
    except Exception:
        return []


def find_game_window(titulos):
    """Handle de la primera ventana cuyo titulo este en `titulos`, o None."""
    if IS_WINDOWS:
        import ctypes
        for titulo in titulos:
            hwnd = ctypes.windll.user32.FindWindowW(None, titulo)
            if hwnd:
                return hwnd
        return None
    if _get_display() is None:
        return None
    try:
        ventanas = _ventanas()
    except Exception as exc:
        logging.info(f"No se pudo listar las ventanas ({exc})")
        return None
    for titulo in titulos:
        for ventana in ventanas:
            try:
                if _titulo(ventana) == titulo:
                    return ventana.id
            except Exception:
                continue
    return None


def bring_to_foreground(handle) -> None:
    """Trae la ventana al frente. En Linux se pide por el protocolo del
    gestor de ventanas; si no hay gestor, se levanta y se enfoca a mano."""
    if IS_WINDOWS:
        raise RuntimeError("en Windows lo hace client.bring_window_to_foreground")
    from Xlib import X
    d = _get_display()
    if d is None:
        return
    ventana = d.create_resource_object("window", handle)
    root = d.screen().root
    try:
        # 2 = pedido de una aplicacion "pager"; los gestores le hacen mas
        # caso que al 1 (aplicacion normal), que suelen limitar para que una
        # ventana no se robe el foco sola.
        datos = [2, X.CurrentTime, 0, 0, 0]
        from Xlib.protocol import event as xevent
        mensaje = xevent.ClientMessage(
            window=ventana,
            client_type=d.get_atom("_NET_ACTIVE_WINDOW"),
            data=(32, datos),
        )
        root.send_event(mensaje, event_mask=X.SubstructureRedirectMask | X.SubstructureNotifyMask)
        d.sync()
    except Exception as exc:
        logging.debug(f"_NET_ACTIVE_WINDOW fallo ({exc}), se prueba a mano")
    try:
        ventana.configure(stack_mode=X.Above)
        ventana.set_input_focus(X.RevertToParent, X.CurrentTime)
        d.sync()
    except Exception as exc:
        logging.info(f"No se pudo enfocar la ventana del juego ({exc})")


def process_info(handle) -> dict | None:
    """{'exe_path': ..., 'elevated_guess': ...} del proceso duenio de la
    ventana. En Linux sale de _NET_WM_PID y /proc."""
    if IS_WINDOWS:
        raise RuntimeError("en Windows lo hace client.running_game_info")
    from Xlib import Xatom
    d = _get_display()
    if d is None:
        return None
    try:
        ventana = d.create_resource_object("window", handle)
        pids = _prop(ventana, "_NET_WM_PID", Xatom.CARDINAL)
        if not pids:
            return None
        pid = int(pids[0])
        try:
            exe_path = os.readlink(f"/proc/{pid}/exe")
        except OSError:
            exe_path = None
        # El equivalente de "el juego corre como admin y nosotros no": el
        # proceso es de otro usuario, asi que no lo podemos tocar.
        try:
            uid_juego = os.stat(f"/proc/{pid}").st_uid
            elevated_guess = uid_juego != os.getuid()
        except OSError:
            elevated_guess = False
        return {"pid": pid, "exe_path": exe_path, "elevated_guess": elevated_guess}
    except Exception as exc:
        logging.debug(f"No se pudo leer el proceso de la ventana ({exc})")
        return None


def data_dir() -> str:
    """Carpeta que contiene "Euro Truck Simulator 2" / "American Truck
    Simulator" con los perfiles y el game.log.txt. En Linux nativo el juego
    no usa ningun "Documentos": escribe en XDG_DATA_HOME."""
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return base
