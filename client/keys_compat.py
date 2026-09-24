"""Envio de teclas al juego, en Windows y en Linux.

En Windows esto lo hace pydirectinput: manda scancodes de DirectInput, que
es lo unico que el juego escucha (los eventos "virtuales" de mas alto nivel
los ignora). En Linux hay dos caminos y ninguno es pydirectinput:

  XTEST  - extension del servidor X. No necesita permisos ni configuracion:
           si hay DISPLAY y esta python-xlib, anda. Los eventos entran por
           el servidor X, asi que el juego los ve igual que el teclado real.
           Funciona tambien en Wayland si el juego corre sobre Xwayland,
           que es el caso normal de ETS2/ATS hoy.

  uinput - un teclado virtual a nivel kernel (/dev/uinput). Anda en todos
           lados, incluido Wayland puro, pero hace falta permiso sobre el
           dispositivo (grupo input o una regla de udev).

Se prefiere XTEST porque no pide nada al usuario, y uinput queda de reserva.

OJO con los teclados que no son US: XTEST manda un simbolo ("la tecla que
escribe la a"), mientras que Windows y uinput mandan una posicion fisica.
En un teclado US es lo mismo; en AZERTY no. Si a alguien le pasa, uinput es
el equivalente exacto del camino de Windows.

Uso:
    keys_compat.press("f5")
    keys_compat.key_down("ctrl"); keys_compat.key_up("ctrl")
    keys_compat.available()          # False si no hay por donde mandar
    keys_compat.unavailable_reason() # que falto, para mostrarselo al usuario
"""

import logging
import sys
import time

IS_WINDOWS = sys.platform == "win32"

# Cuanto se sostiene la tecla en Linux. El juego lee el teclado una vez por
# frame: un down+up en el mismo instante puede caer entero entre dos lecturas
# y perderse. 30 ms cubre hasta 30 fps y sigue siendo imperceptible.
KEY_HOLD_SECONDS = 0.03

# Teclas que pydirectinput no trae de fabrica (scancodes DirectInput): el
# teclado numerico (el juego lo distingue de la fila de numeros) y F13-F24.
WINDOWS_EXTRA_SCANCODES = {
    "num0": 0x52, "num1": 0x4F, "num2": 0x50, "num3": 0x51, "num4": 0x4B,
    "num5": 0x4C, "num6": 0x4D, "num7": 0x47, "num8": 0x48, "num9": 0x49,
    "f13": 0x64, "f14": 0x65, "f15": 0x66, "f16": 0x67, "f17": 0x68, "f18": 0x69,
    "f19": 0x6A, "f20": 0x6B, "f21": 0x6C, "f22": 0x6D, "f23": 0x6E, "f24": 0x6F,
}

# Nombre de cada tecla en X11 (keysym). Las letras y los digitos se llaman
# igual, asi que no hace falta listarlos.
X11_KEYSYMS = {
    "space": "space", "enter": "Return", "tab": "Tab", "esc": "Escape",
    "backspace": "BackSpace", "delete": "Delete", "insert": "Insert",
    "home": "Home", "end": "End", "pageup": "Prior", "pagedown": "Next",
    "up": "Up", "down": "Down", "left": "Left", "right": "Right",
    "add": "KP_Add", "subtract": "KP_Subtract", "multiply": "KP_Multiply",
    "divide": "KP_Divide", "decimal": "KP_Decimal",
    ";": "semicolon", "'": "apostrophe", ",": "comma", ".": "period",
    "/": "slash", "\\": "backslash", "[": "bracketleft", "]": "bracketright",
    "-": "minus", "=": "equal", "`": "grave",
    "ctrl": "Control_L", "shift": "Shift_L", "alt": "Alt_L",
}
X11_KEYSYMS.update({f"f{i}": f"F{i}" for i in range(1, 25)})
X11_KEYSYMS.update({f"num{i}": f"KP_{i}" for i in range(10)})


def x11_keysym_name(key: str) -> str | None:
    """Nombre X11 de una tecla nuestra, o None si no la conocemos."""
    if key in X11_KEYSYMS:
        return X11_KEYSYMS[key]
    if len(key) == 1 and (key.isalpha() or key.isdigit()):
        return key.lower()
    return None


# Codigos del kernel (linux/input-event-codes.h). El bloque principal
# coincide numero por numero con los scancodes de DirectInput, que es lo que
# se usa en Windows: KEY_ESC=1 es DIK_ESCAPE=0x01, y asi.
LINUX_KEYCODES = {
    "esc": 1, "1": 2, "2": 3, "3": 4, "4": 5, "5": 6, "6": 7, "7": 8, "8": 9,
    "9": 10, "0": 11, "-": 12, "=": 13, "backspace": 14, "tab": 15,
    "q": 16, "w": 17, "e": 18, "r": 19, "t": 20, "y": 21, "u": 22, "i": 23,
    "o": 24, "p": 25, "[": 26, "]": 27, "enter": 28, "ctrl": 29,
    "a": 30, "s": 31, "d": 32, "f": 33, "g": 34, "h": 35, "j": 36, "k": 37,
    "l": 38, ";": 39, "'": 40, "`": 41, "shift": 42, "\\": 43,
    "z": 44, "x": 45, "c": 46, "v": 47, "b": 48, "n": 49, "m": 50,
    ",": 51, ".": 52, "/": 53, "multiply": 55, "alt": 56, "space": 57,
    "num7": 71, "num8": 72, "num9": 73, "subtract": 74,
    "num4": 75, "num5": 76, "num6": 77, "add": 78,
    "num1": 79, "num2": 80, "num3": 81, "num0": 82, "decimal": 83,
    "divide": 98,
    "home": 102, "up": 103, "pageup": 104, "left": 105, "right": 106,
    "end": 107, "down": 108, "pagedown": 109, "insert": 110, "delete": 111,
}
LINUX_KEYCODES.update({f"f{i}": 58 + i for i in range(1, 11)})     # F1..F10 = 59..68
LINUX_KEYCODES.update({"f11": 87, "f12": 88})
LINUX_KEYCODES.update({f"f{i}": 170 + i for i in range(13, 25)})   # F13..F24 = 183..194


class UnsupportedKey(Exception):
    """La tecla existe en nuestro vocabulario pero el backend no la alcanza
    (tipico: un keysym que no esta en la distribucion de teclado actual)."""


class WindowsBackend:
    name = "pydirectinput"

    def __init__(self):
        import pydirectinput
        # Por defecto pausa 0.1s despues de cada tecla (pensado para macros)
        # - para un boton individual eso se siente como lag.
        pydirectinput.PAUSE = 0
        pydirectinput.KEYBOARD_MAPPING.update(WINDOWS_EXTRA_SCANCODES)
        self._pdi = pydirectinput

    def key_down(self, key):
        self._pdi.keyDown(key)

    def key_up(self, key):
        self._pdi.keyUp(key)

    def press(self, key):
        self._pdi.press(key)

    def close(self):
        pass


class XTestBackend:
    name = "xtest"

    def __init__(self):
        from Xlib import X, XK, display
        from Xlib.ext import xtest
        self._X, self._XK, self._xtest = X, XK, xtest
        self._display = display.Display()
        if not self._display.has_extension("XTEST"):
            self._display.close()
            raise RuntimeError("el servidor X no tiene la extension XTEST")

    def _keycode(self, key):
        nombre = x11_keysym_name(key)
        if nombre is None:
            raise UnsupportedKey(f"tecla desconocida: {key}")
        keysym = self._XK.string_to_keysym(nombre)
        keycode = self._display.keysym_to_keycode(keysym) if keysym else 0
        if not keycode:
            raise UnsupportedKey(
                f"'{key}' no existe en la distribucion de teclado actual")
        return keycode

    def _send(self, key, tipo):
        self._xtest.fake_input(self._display, tipo, self._keycode(key))
        self._display.sync()

    def key_down(self, key):
        self._send(key, self._X.KeyPress)

    def key_up(self, key):
        self._send(key, self._X.KeyRelease)

    def press(self, key):
        self.key_down(key)
        time.sleep(KEY_HOLD_SECONDS)
        self.key_up(key)

    def close(self):
        try:
            self._display.close()
        except Exception:
            pass


class UinputBackend:
    """Teclado virtual por /dev/uinput. Se arma a mano con ioctl para no
    depender de ningun paquete: son cuatro numeros y dos structs."""

    name = "uinput"

    DEVICE = "/dev/uinput"
    UI_SET_EVBIT = 0x40045564
    UI_SET_KEYBIT = 0x40045565
    UI_DEV_CREATE = 0x5501
    UI_DEV_DESTROY = 0x5502
    EV_SYN = 0x00
    EV_KEY = 0x01
    SYN_REPORT = 0

    def __init__(self):
        import fcntl
        import os
        import struct
        self._os, self._struct = os, struct
        self._fd = os.open(self.DEVICE, os.O_WRONLY | os.O_NONBLOCK)
        try:
            fcntl.ioctl(self._fd, self.UI_SET_EVBIT, self.EV_KEY)
            fcntl.ioctl(self._fd, self.UI_SET_EVBIT, self.EV_SYN)
            for codigo in sorted(set(LINUX_KEYCODES.values())):
                fcntl.ioctl(self._fd, self.UI_SET_KEYBIT, codigo)
            # struct uinput_user_dev: name[80], input_id, ff_effects_max y
            # cuatro tablas abs de 64 enteros que no usamos.
            dev = (b"Truck Dash virtual keyboard".ljust(80, b"\0")
                   + struct.pack("HHHH", 0x03, 0x1209, 0x7444, 1)  # BUS_USB
                   + struct.pack("i", 0)
                   + b"\0" * (4 * 64 * 4))
            os.write(self._fd, dev)
            fcntl.ioctl(self._fd, self.UI_DEV_CREATE)
        except Exception:
            os.close(self._fd)
            self._fd = None
            raise
        # El kernel avisa del dispositivo nuevo por udev y los clientes
        # tardan un instante en abrirlo; sin esta espera las primeras teclas
        # se mandan a un teclado que todavia nadie esta escuchando.
        time.sleep(0.3)

    def _emit(self, tipo, codigo, valor):
        # struct input_event: timeval (dos long), type, code, value.
        self._os.write(self._fd, self._struct.pack(
            "llHHi", 0, 0, tipo, codigo, valor))

    def _codigo(self, key):
        codigo = LINUX_KEYCODES.get(key)
        if codigo is None:
            raise UnsupportedKey(f"tecla desconocida: {key}")
        return codigo

    def _sync(self):
        self._emit(self.EV_SYN, self.SYN_REPORT, 0)

    def key_down(self, key):
        self._emit(self.EV_KEY, self._codigo(key), 1)
        self._sync()

    def key_up(self, key):
        self._emit(self.EV_KEY, self._codigo(key), 0)
        self._sync()

    def press(self, key):
        self.key_down(key)
        time.sleep(KEY_HOLD_SECONDS)
        self.key_up(key)

    def close(self):
        if self._fd is None:
            return
        try:
            import fcntl
            fcntl.ioctl(self._fd, self.UI_DEV_DESTROY)
        except Exception:
            pass
        try:
            self._os.close(self._fd)
        except Exception:
            pass
        self._fd = None


_backend = None
_reason = ""
_tried = False


def _elegir():
    """Primer backend que arranque, con el motivo de cada uno que no."""
    if IS_WINDOWS:
        return WindowsBackend(), ""
    fallas = []
    for clase in (XTestBackend, UinputBackend):
        try:
            return clase(), ""
        except Exception as exc:
            fallas.append(f"{clase.name}: {exc}")
    return None, "; ".join(fallas)


def backend():
    global _backend, _reason, _tried
    if not _tried:
        _tried = True
        try:
            _backend, _reason = _elegir()
        except Exception as exc:          # pragma: no cover - defensivo
            _backend, _reason = None, str(exc)
        if _backend is None:
            logging.warning(f"No hay forma de mandar teclas al juego ({_reason})")
        else:
            logging.info(f"Teclas al juego via {_backend.name}")
    return _backend


def available() -> bool:
    return backend() is not None


def unavailable_reason() -> str:
    backend()
    return _reason


def press(key):
    b = backend()
    if b is None:
        raise RuntimeError(_reason or "no hay backend de teclado")
    b.press(key)


def key_down(key):
    b = backend()
    if b is None:
        raise RuntimeError(_reason or "no hay backend de teclado")
    b.key_down(key)


def key_up(key):
    b = backend()
    if b is None:
        raise RuntimeError(_reason or "no hay backend de teclado")
    b.key_up(key)


def close():
    global _backend, _tried, _reason
    if _backend is not None:
        _backend.close()
    _backend, _tried, _reason = None, False, ""
