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
