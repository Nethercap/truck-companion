# Librerias de terceros

Copias sin tocar de los `dist/` de npm, servidas desde el propio sitio en vez
de jsDelivr. Con el CDN, si jsDelivr no cargaba (bloqueador, red de empresa,
caida del CDN) `app.js` moria en la primera linea con `proj4 is not defined`
y se llevaba todo: velocimetro, botonera y panel, que no necesitan el mapa.
Servidas de aca, ademas, el service worker las precachea y el modo LAN del
cliente las tiene sin internet.

El nombre lleva la version: el archivo no cambia nunca, asi que no necesita
el `?v=` de cache busting. Para actualizar una, se baja la version nueva con
`npm pack <paquete>@<version>`, se copia el archivo del `dist/` con el nombre
nuevo y se cambian las referencias en `docs/app/index.html`, `docs/app/sw.js`
y `client/local_server.py` (el test `test_lan_server_serves_every_file_the_pages_load`
avisa si falta la ultima).

| Archivo | Paquete | Licencia | SHA-256 |
|---|---|---|---|
| `maplibre-gl-4.7.1.js` | `maplibre-gl@4.7.1` `dist/maplibre-gl.js` | BSD-3-Clause, `LICENSE-maplibre-gl.txt` | `be9633c4d870e26fb37f1cfe5c5a77181667114003ea16207ac7850d8da8add1` |
| `maplibre-gl-4.7.1.css` | `maplibre-gl@4.7.1` `dist/maplibre-gl.css` | BSD-3-Clause | `576b085fdd9487a65a19215328c1e086c07ce5bf6da09b666b3806d3d008dae9` |
| `pmtiles-3.2.0.js` | `pmtiles@3.2.0` `dist/pmtiles.js` | BSD-3-Clause, https://github.com/protomaps/PMTiles/blob/main/LICENSE | `367c19f8936d1d6c1b1820b0dee053f793fc29277655c3e471f5ed4d37b5f045` |
| `proj4-2.15.0.js` | `proj4@2.15.0` `dist/proj4.js` | MIT, `LICENSE-proj4.md` | `5c73f2719b0c33c8d8e709fc3d71056b39623d5f9182fb06a7b8e5173cfd8651` |

## Glifos del mapa

`glyphs-open-sans-omt2/<rango>.pbf`: las letras de los nombres del mapa en
el formato de MapLibre (SDF en protobuf), Open Sans Regular de
[openmaptiles/fonts](https://github.com/openmaptiles/fonts) (rama
`gh-pages`, version 2), sin tocar. Son los mismos bytes que sirve
demotiles.maplibre.org para esos rangos; la app los pide de aca
(`localGlyphs` en `app.js`) y lo que no esta sigue saliendo de demotiles.
Licencia Apache 2.0, `LICENSE-open-sans.txt`. Los rangos son los que usan
las ciudades y paises de todas las variantes (latin, latin extendido,
griego, cirilico, puntuacion); si una variante nueva trae otro alfabeto,
agregar el rango aca, en `LOCAL_GLYPH_RANGES` y en `WEB_FILES` del cliente.

| Rango | SHA-256 |
|---|---|
| `0-255` | `0c8bdb284f2ad6f69bbb434a0208393f3a517bc8bf7ed1eccc4ac4791ebbcbfe` |
| `256-511` | `9962ad38d064edbeb226a6c7dcf1d58e7678508a805f980d2fe81bb3178ba68a` |
| `512-767` | `2a7c191141c66e209d08d834df530a06a234224d48ae97d69f1bde1b1b5db404` |
| `768-1023` | `fea6a1c8e1be55d9725520627b108d425723b2dc189b7dddfe56abd7d8238ea9` |
| `1024-1279` | `36d60967995aa49522f4c6466550ef75c0c7255fa5ee414b928db238a4d97e86` |
| `7680-7935` | `d83e773d45d475f5ffd25917cd8735450586bc9d42a53fb54ccce5618241d976` |
| `8192-8447` | `a57611157f0597b267ef36eb07ce5a41dddcc3b2f3b5b85779108b7bb48b1cde` |
