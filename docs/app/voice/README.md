# Guia por voz

Frases pregrabadas para las indicaciones del modo navegacion: un aviso
anticipado y otro en el punto para cada maniobra (en las rotondas, que salida
tomar, de la primera a la octava), mas la llegada. Desde la v3 (11-10), tambien
avisos de estado: trabajo nuevo, poco combustible y descanso cerca
(`createStatusAlerts`). Desde la v5 (24-11), el ferry y el tren. Sin nombres de
rutas, de puertos ni numeros de ruta (ver `createVoiceGuide` en `../pure.js`).

- `voices.json`: la lista de voces y el texto de cada frase. Es la fuente
  unica: la usa la app y la usa el generador.
- `<voz>-vN.json`: un paquete por voz, con un MP3 por frase como data URL.
  Se generan con `python tools/build_voice_packs.py --voices-dir <carpeta>`
  (Piper + lameenc; instrucciones en el script). Si cambia una frase, subir
  la version del archivo en `voices.json` y en `WEB_FILES` de
  `client/local_server.py`. Los paquetes de la version anterior quedan en el
  repo para las paginas viejas que todavia los pidan (cache del navegador,
  modo LAN de un cliente viejo). En la v2 (10-10) las frases de la v1 se
  copiaron tal cual y solo se generaron las de rotonda: Piper no da dos veces
  el mismo audio. La v3 se armo igual, con `--reuse-from v2`, la v4 (15-10: de
  la sexta a la octava salida) con `--reuse-from v3` y la v5 (24-11: ferry y
  tren) con `--reuse-from v4`.
- Una palabra que Piper lee mal va en `PRONUNCIACION` del generador, no mal
  escrita aca: en frances lee "ferry" a la inglesa, y se le escribe "ferri".

Turco no tiene una voz de Piper con licencia libre (la unica, `dfki`, es
CC BY-NC-SA): la app lee el mismo texto con la voz del sistema.

## Voces y licencias

Generadas con [Piper](https://github.com/OHF-Voice/piper1-gpl). Las voces son
modelos de [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices),
entrenados sobre estos datos:

| Paquete | Modelo | Datos | Licencia |
|---|---|---|---|
| `en-kristin-v5.json` | en_US-kristin-medium | LibriVox | Dominio publico |
| `en-joe-v5.json` | en_US-joe-medium | [OHF-Voice/voice-datasets](https://github.com/OHF-Voice/voice-datasets) | CC0 |
| `es-daniela-v5.json` | es_AR-daniela-high | [OpenSLR 61](https://www.openslr.org/61/), Google (Argentine Spanish) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `es-claude-v5.json` | es_MX-claude-high | [HirCoir/Piper-TTS-Spanish](https://huggingface.co/spaces/HirCoir/Piper-TTS-Spanish) | Apache 2.0 |
| `de-thorsten-v5.json` | de_DE-thorsten-high | Thorsten Müller | CC0 |
| `fr-siwis-v5.json` | fr_FR-siwis-medium | [SIWIS French Speech Synthesis Database](https://datashare.is.ed.ac.uk/handle/10283/2353), University of Edinburgh | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `pt-cadu-v5.json` | pt_BR-cadu-medium | OHF-Voice | CC0 |
| `pl-gosia-v5.json` | pl_PL-gosia-medium | OHF-Voice | CC0 |
| `ru-dmitri-v5.json` | ru_RU-dmitri-medium | [OHF-Voice/voice-datasets](https://github.com/OHF-Voice/voice-datasets) | CC0 |

Los audios de `es-daniela-v5.json` se publican bajo CC BY-SA 4.0, como sus
datos. Los de `fr-siwis-v5.json`, bajo CC BY 4.0 con el credito de arriba. El
resto, como el repositorio (AGPL-3.0; MIT hasta el commit `a990dcd`).
