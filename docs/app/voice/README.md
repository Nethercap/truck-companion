# Guia por voz

Frases pregrabadas para las indicaciones del modo navegacion: un aviso
anticipado y otro en el punto para cada maniobra, mas la llegada. Sin nombres
de rutas ni numeros (ver `createVoiceGuide` en `../pure.js`).

- `voices.json`: la lista de voces y el texto de cada frase. Es la fuente
  unica: la usa la app y la usa el generador.
- `<voz>-vN.json`: un paquete por voz, con un MP3 por frase como data URL.
  Se generan con `python tools/build_voice_packs.py --voices-dir <carpeta>`
  (Piper + lameenc; instrucciones en el script). Si cambia una frase, subir
  la version del archivo en `voices.json` y en `WEB_FILES` de
  `client/local_server.py`.

Turco no tiene una voz de Piper con licencia libre (la unica, `dfki`, es
CC BY-NC-SA): la app lee el mismo texto con la voz del sistema.

## Voces y licencias

Generadas con [Piper](https://github.com/OHF-Voice/piper1-gpl). Las voces son
modelos de [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices),
entrenados sobre estos datos:

| Paquete | Modelo | Datos | Licencia |
|---|---|---|---|
| `en-kristin-v1.json` | en_US-kristin-medium | LibriVox | Dominio publico |
| `en-joe-v1.json` | en_US-joe-medium | [OHF-Voice/voice-datasets](https://github.com/OHF-Voice/voice-datasets) | CC0 |
| `es-daniela-v1.json` | es_AR-daniela-high | [OpenSLR 61](https://www.openslr.org/61/), Google (Argentine Spanish) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| `es-claude-v1.json` | es_MX-claude-high | [HirCoir/Piper-TTS-Spanish](https://huggingface.co/spaces/HirCoir/Piper-TTS-Spanish) | Apache 2.0 |
| `de-thorsten-v1.json` | de_DE-thorsten-high | Thorsten Müller | CC0 |
| `fr-siwis-v1.json` | fr_FR-siwis-medium | [SIWIS French Speech Synthesis Database](https://datashare.is.ed.ac.uk/handle/10283/2353), University of Edinburgh | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `pt-cadu-v1.json` | pt_BR-cadu-medium | OHF-Voice | CC0 |
| `pl-gosia-v1.json` | pl_PL-gosia-medium | OHF-Voice | CC0 |
| `ru-dmitri-v1.json` | ru_RU-dmitri-medium | [OHF-Voice/voice-datasets](https://github.com/OHF-Voice/voice-datasets) | CC0 |

Los audios de `es-daniela-v1.json` se publican bajo CC BY-SA 4.0, como sus
datos. Los de `fr-siwis-v1.json`, bajo CC BY 4.0 con el credito de arriba. El
resto, como el repositorio (MIT).
