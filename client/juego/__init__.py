"""Lectura propia de los archivos de ETS2 y ATS (fase 1 del parser propio).

Hasta aca los mapas salian del parser de truckermudgeon/maps (TypeScript,
GPL-3.0), con nuestros parches encima (`builder/truckdash.patch`). El plan del
25-11-2026 es tener todo en Python y bajo la licencia del repo: primero leer
los archivos (esto), despues los sectores y prefabs del mapa, los tiles y por
ultimo "Build my map" sin Node.

Esta fase solo LEE archivos del disco: nunca la memoria del juego.

- `cityhash`: CityHash64, con el que HashFS ubica cada archivo.
- `archivos`: los .scs (HashFS v1 y v2, ZIP, tambien los ZIP con firma "AEM!"),
  las carpetas sueltas y los mods en partes ("base" y "dlc_<nombre>").
- `sii`: los .sii en texto, en binario (BSII) y cifrados (ScsC), y el locale.
- `montaje`: los archivos del juego, sus DLC y los mods juntos, como los ve
  el juego: el ultimo que se monta gana.

El conocimiento de los formatos viene de truckermudgeon/maps (GPL-3.0,
compatible con la AGPL-3.0 de este repo) y de ConverterPIX (LGPL-3.0); los
casos raros de mods, de lo aprendido en el armador. No se porta codigo de
TruckLib ni del Extractor de sk-zk (GPL-2.0).
"""
