"""Arma los paquetes de la guia por voz (docs/app/voice/<voz>-vN.json).

Las frases y la lista de voces viven en docs/app/voice/voices.json, que es
la fuente unica: la app lo lee para el selector (y, en turco, para leer el
texto con la voz del sistema). Cada paquete es un JSON con un MP3 por frase
como data URL: una sola descarga por voz, y en el modo LAN un solo archivo
que el cliente baja una vez (lleva la version en el nombre, como vendor/).

Se corre a mano, solo cuando cambia una frase o una voz, y se commitean los
paquetes. Necesita Piper y un codificador de MP3:

  python -m venv tts-venv
  tts-venv/Scripts/python -m pip install piper-tts lameenc
  tts-venv/Scripts/python tools/build_voice_packs.py --voices-dir <carpeta>

Los modelos (.onnx) se bajan solos a --voices-dir la primera vez. Si cambia
el texto de una voz, subir la version del archivo en voices.json ("-v2"),
y tambien en WEB_FILES de client/local_server.py: el modo LAN no vuelve a
bajar un archivo que ya tiene.
"""
import argparse
import base64
import io
import json
import os
import subprocess
import sys
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, "docs", "app", "voice")

# Un poco de silencio antes de cada frase: algunos parlantes Bluetooth se
# comen el principio del audio mientras se despiertan.
SILENCIO_INICIAL_S = 0.15
KBPS = 48


def sintetizar(voz, texto: str) -> tuple[bytes, int]:
    """PCM de 16 bits mono y su frecuencia de muestreo."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        voz.synthesize_wav(texto, wf)
    buf.seek(0)
    with wave.open(buf, "rb") as wf:
        return wf.readframes(wf.getnframes()), wf.getframerate()


def a_mp3(pcm: bytes, frecuencia: int) -> bytes:
    import lameenc
    silencio = b"\x00\x00" * int(frecuencia * SILENCIO_INICIAL_S)
    enc = lameenc.Encoder()
    enc.set_bit_rate(KBPS)
    enc.set_in_sample_rate(frecuencia)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(silencio + pcm) + enc.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voices-dir", required=True, help="donde estan (o se bajan) los modelos .onnx de Piper")
    ap.add_argument("--only", help="solo esta voz (id de voices.json)")
    args = ap.parse_args()

    from piper import PiperVoice

    with open(os.path.join(VOICE_DIR, "voices.json"), encoding="utf-8") as f:
        catalogo = json.load(f)
    os.makedirs(args.voices_dir, exist_ok=True)
    for v in catalogo["voices"]:
        if v.get("system") or (args.only and v["id"] != args.only):
            continue
        modelo = os.path.join(args.voices_dir, v["model"] + ".onnx")
        if not os.path.isfile(modelo):
            subprocess.run([sys.executable, "-m", "piper.download_voices", v["model"],
                            "--data-dir", args.voices_dir], check=True)
        voz = PiperVoice.load(modelo)
        clips = {}
        for clave, texto in catalogo["phrases"][v["phrases"]].items():
            pcm, frecuencia = sintetizar(voz, texto)
            clips[clave] = "data:audio/mpeg;base64," + base64.b64encode(a_mp3(pcm, frecuencia)).decode()
        salida = os.path.join(VOICE_DIR, v["file"])
        with open(salida, "w", encoding="utf-8", newline="\n") as f:
            json.dump({"id": v["id"], "clips": clips}, f, separators=(",", ":"))
            f.write("\n")
        print(f"{v['id']:12s} {len(clips)} frases, {os.path.getsize(salida) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
