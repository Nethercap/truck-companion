// El mapa de viajes de una empresa (pestana Mapa, /vtc/{tag}/map). Como el
// mapa de la cuenta (account.js, "mapa de todo"): MapLibre y pmtiles de la app
// (../app/vendor), cargados recien al abrir la pestana, los tiles del juego de
// R2 con un estilo minimo y lo manejado encima, aca con un color por chofer.
// Solo dibuja: los datos y la leyenda los pone vtc.js.
(function (raiz) {
  'use strict';
  const R2 = 'https://maps.trucksim-dash.com';
  const VENDOR = '../app/vendor/';
  // Los glifos de los nombres, del propio sitio como en la app (localGlyphs)
  const GLIFOS = new Set(['0-255', '256-511', '512-767', '768-1023', '1024-1279', '7680-7935', '8192-8447']);
  // Que se distingan sobre el fondo oscuro. Con mas choferes se repiten: la
  // leyenda dice cual es cual.
  const PALETA = ['#ff8a3d', '#4dabf7', '#69db7c', '#f783ac', '#ffd43b', '#9775fa', '#3bc9db', '#ff6b6b', '#a9e34b', '#e599f7'];
  const color = (i) => PALETA[i % PALETA.length];

  let libs = null;
  let mapa = null;
  let juegoCargado = null;
  let contenedor = null;
  let pedido = 0;

  function script(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => mal(new Error(src));
      document.head.appendChild(s);
    });
  }

  function cargarLibs() {
    if (!libs) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = VENDOR + 'maplibre-gl-5.24.0.css';
      document.head.appendChild(css);
      // variants.js por MAP_DATA_VERSION: el ?v= de los tiles, como en la app
      libs = Promise.all([VENDOR + 'maplibre-gl-5.24.0.js', VENDOR + 'pmtiles-4.5.0.js', '../app/variants.js'].map(script))
        .then(() => { maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile); });
      libs.catch(() => { libs = null; });
    }
    return libs;
  }

  function hayWebgl() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }

  function estilo(juego) {
    const v = (typeof MAP_DATA_VERSION !== 'undefined' && MAP_DATA_VERSION[juego]) || '';
    // tipos: los de ROAD_LAYER_TYPES de app/pure.js; 'unknown' es una calle con
    // carriles propios de un mod, y va con las locales.
    const capa = (tipos, extra) => Object.assign({ source: 'vec', 'source-layer': juego }, extra,
      { filter: ['all', ['==', ['get', 'type'], 'road'], ['in', ['get', 'roadType'], ['literal', tipos]]] });
    const ancho = (a, b) => ['interpolate', ['linear'], ['zoom'], 4, a, 10, b];
    return {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: { vec: { type: 'vector', url: `pmtiles://${R2}/vector/${juego}.pmtiles?v=${v}` } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#1b1e23' } },
        capa(['local', 'unknown'], { id: 'road-local', type: 'line', paint: { 'line-color': '#363b43', 'line-width': ancho(0.4, 1.2) } }),
        capa(['divided'], { id: 'road-divided', type: 'line', paint: { 'line-color': '#444a53', 'line-width': ancho(0.6, 1.8) } }),
        capa(['freeway'], { id: 'road-freeway', type: 'line', paint: { 'line-color': '#545b65', 'line-width': ancho(0.8, 2.4) } }),
        { id: 'country-label', type: 'symbol', source: 'vec', 'source-layer': juego, maxzoom: 8,
          filter: ['==', ['get', 'type'], 'country'],
          layout: { 'text-field': ['get', 'name'], 'text-size': 12 },
          paint: { 'text-color': '#7d8693', 'text-halo-color': '#000', 'text-halo-width': 1 } },
        { id: 'city-label', type: 'symbol', source: 'vec', 'source-layer': juego, minzoom: 5,
          filter: ['==', ['get', 'type'], 'city'],
          layout: { 'text-field': ['get', 'name'], 'text-size': 11 },
          paint: { 'text-color': '#c6ccd4', 'text-halo-color': '#000', 'text-halo-width': 1.2 } },
      ],
    };
  }

  function glifosLocales(url, tipo) {
    if (tipo !== 'Glyphs') return undefined;
    const m = /\/font\/([^/]+)\/(\d+-\d+)\.pbf/.exec(url);
    if (!m || !decodeURIComponent(m[1]).startsWith('Open Sans Regular') || !GLIFOS.has(m[2])) return undefined;
    return { url: new URL(VENDOR + 'glyphs-open-sans-omt2/' + m[2] + '.pbf', location.href).href };
  }

  // Las lineas de la API (map.lines y map.line_drivers) como una feature por
  // chofer: `d` es su lugar en la lista de choferes, y de ahi el color.
  function porChofer(m) {
    const grupos = new Map();
    m.lines.forEach((linea, i) => {
      const d = m.line_drivers ? m.line_drivers[i] : 0;
      if (!grupos.has(d)) grupos.set(d, []);
      grupos.get(d).push(linea);
    });
    return { type: 'FeatureCollection', features: [...grupos].map(([d, lineas]) => ({
      type: 'Feature', properties: { d, c: color(d) }, geometry: { type: 'MultiLineString', coordinates: lineas } })) };
  }

  function cerrar() {
    pedido++;
    if (mapa) mapa.remove();
    mapa = null;
    juegoCargado = null;
    contenedor = null;
  }

  // Deja el mapa del juego listo en `caja`. Devuelve null o la clave del
  // texto del problema ('mapNoWebgl', 'mapFailed'); 'cancelado' si mientras
  // tanto se pidio otro.
  async function abrir(caja, juego) {
    const mio = ++pedido;
    if (!hayWebgl()) return 'mapNoWebgl';
    try { await cargarLibs(); } catch (e) { return 'mapFailed'; }
    if (mio !== pedido) return 'cancelado';
    if (mapa && juegoCargado === juego && contenedor === caja) return null;
    if (mapa) mapa.remove();
    juegoCargado = juego;
    contenedor = caja;
    mapa = new maplibregl.Map({
      container: caja, style: estilo(juego), center: juego === 'ats' ? [-105, 39] : [10, 50], zoom: 4,
      // Los tiles del juego empiezan en el zoom 4: mas lejos queda vacio
      minZoom: 4,
      attributionControl: false, transformRequest: glifosLocales,
      // En el celular, un dedo hace scroll de la pagina y dos mueven el mapa
      cooperativeGestures: true, dragRotate: false, pitchWithRotate: false,
    });
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const este = mapa;
    await new Promise((ok) => este.once('load', ok));
    if (mio !== pedido || este !== mapa) return 'cancelado';
    mapa.addSource('viajes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    mapa.addSource('ciudades', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    mapa.addLayer({ id: 'viajes', type: 'line', source: 'viajes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'c'], 'line-opacity': 0.85,
               'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.6, 10, 3.5] } }, 'country-label');
    mapa.addLayer({ id: 'ciudades', type: 'circle', source: 'ciudades',
      paint: { 'circle-color': '#fff', 'circle-stroke-color': '#7d8693', 'circle-stroke-width': 2,
               'circle-radius': ['interpolate', ['linear'], ['get', 'n'], 1, 3, 20, 7] } }, 'country-label');
    return null;
  }

  function dibujar(m, juego) {
    if (!mapa || !mapa.getSource('viajes')) return;
    mapa.getSource('viajes').setData(porChofer(m));
    mapa.getSource('ciudades').setData({ type: 'FeatureCollection', features: m.cities.map((c) => ({
      type: 'Feature', properties: { n: c.visits }, geometry: { type: 'Point', coordinates: c.lnglat } })) });
    resaltar(null);
    // Encuadre en todo lo manejado; sin viajes, el mapa entero del juego
    const puntos = m.lines.flat().concat(m.cities.map((c) => c.lnglat));
    if (puntos.length) {
      const caja = puntos.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])],
        [Infinity, Infinity, -Infinity, -Infinity]);
      const margen = mapa.getContainer().clientWidth < 500 ? 16 : 40;
      mapa.fitBounds([[caja[0], caja[1]], [caja[2], caja[3]]], { padding: margen, maxZoom: 9, duration: 0 });
    } else {
      mapa.fitBounds(juego === 'ats' ? [[-125, 25], [-93, 50]] : [[-10, 36], [32, 64]], { padding: 20, duration: 0 });
    }
  }

  // Un chofer adelante y el resto apagado; null, todos igual.
  function resaltar(d) {
    if (!mapa || !mapa.getLayer('viajes')) return;
    mapa.setPaintProperty('viajes', 'line-opacity', d == null ? 0.85 : ['case', ['==', ['get', 'd'], d], 1, 0.12]);
    mapa.setPaintProperty('viajes', 'line-width', d == null
      ? ['interpolate', ['linear'], ['zoom'], 4, 1.6, 10, 3.5]
      : ['interpolate', ['linear'], ['zoom'], 4, ['case', ['==', ['get', 'd'], d], 2.6, 1.2], 10, ['case', ['==', ['get', 'd'], d], 5, 2.5]]);
  }

  raiz.VtcMapa = { abrir, dibujar, resaltar, cerrar, color, porChofer, PALETA };
})(typeof window !== 'undefined' ? window : globalThis);
