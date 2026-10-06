// Mapa en vivo publico (/app/?live=<variante>): espectador de TODOS los
// conductores que comparten su posicion en esa variante de mapa, sin juego ni
// codigo de pairing. Las tarjetas para elegir variante viven en /live/.
// Reusa el modo espectador del convoy (conn.spectator oculta HUD/botonera) y
// los mismos marcadores flecha. Se carga despues de app.js y convoy.js.

const liveMap = { variant: null, backend: null, ws: null, players: [], markers: new Map(), needFit: true, ended: false, followId: null,
  routes: new Map() }; // id -> { rev, points: [[x, z], ...] }
const LIVE_MAP_HUES = ['#3b9eff', '#ff8a3d', '#2ad3a4', '#b48cff', '#ffd166', '#ff6b8a', '#6be3ff', '#c5e17a', '#ffa8e8', '#8fd3ff'];

function liveMapColor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return LIVE_MAP_HUES[h % LIVE_MAP_HUES.length];
}
function liveMapName(p) { return p.nick || p.truck || t('liveMapAnon'); }

function liveMapStart(variant, backend) {
  if (typeof GAME_MAPS === 'undefined' || !GAME_MAPS[variant]) { showToast(t('liveMapUnknown'), 'danger', 8000); return; }
  liveMap.variant = variant;
  liveMap.backend = backend;
  conn.spectator = true;
  conn.socket = 'connecting';
  document.body.classList.add('livemap');
  document.getElementById('spectatorCode').textContent = `${t('liveMapChip')} · ${convoyVariantLabel(variant)}`;
  document.getElementById('liveMapCard').hidden = false;
  document.getElementById('liveMapVariant').textContent = GAME_MAPS[variant].label;
  renderConnectionUi();
  loadGameMap(variant);
  liveMapConnect();
  liveMapRenderPanel();
}

function liveMapConnect() {
  const base = liveMap.backend.replace('https://', 'wss://').replace('http://', 'ws://');
  const socket = new WebSocket(`${base}/ws/livemap/${encodeURIComponent(liveMap.variant)}`);
  liveMap.ws = socket;
  socket.onopen = () => { conn.socket = 'open'; conn.everOpen = true; renderConnectionUi(); };
  socket.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === 'live_route') {
      if (data.points && data.points.length > 1) liveMap.routes.set(data.id, { rev: data.rev, points: data.points });
      else liveMap.routes.delete(data.id);
      liveMapRenderRoutes();
      return;
    }
    if (data.type !== 'live_players') return;
    liveMap.players = data.players || [];
    // Rutas de quien ya no esta, o que dejo de compartirla (routeRev 0).
    const vivos = new Map(liveMap.players.map(p => [p.id, p]));
    let cambio = false;
    for (const id of [...liveMap.routes.keys()]) {
      const p = vivos.get(id);
      if (!p || !p.routeRev) { liveMap.routes.delete(id); cambio = true; }
    }
    if (cambio) liveMapRenderRoutes();
    liveMapRenderMarkers();
    liveMapRenderPanel();
  };
  socket.onclose = (ev) => {
    conn.socket = 'closed';
    renderConnectionUi();
    if (ev && (ev.code === 4404 || ev.code === 4403)) { showToast(ev.code === 4403 ? t('liveMapFull') : t('liveMapUnknown'), 'danger', 8000); return; }
    setTimeout(liveMapConnect, 5000);
  };
}

function liveMapFit() {
  if (!map || !toLngLat) return;
  const pts = liveMap.players.filter(p => p.x != null).map(p => toLngLat(p.x, p.z));
  if (!pts.length) return;
  if (pts.length === 1) { map.jumpTo({ center: pts[0], zoom: 8 }); return; }
  const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
  map.fitBounds(b, { padding: 60, maxZoom: 9 });
}

function liveMapRenderMarkers() {
  if (!map || !mapReady || !toLngLat || currentGame !== liveMap.variant) return;
  // Encuadre inicial recien cuando el mapa termino de cargar (loadGameMap
  // termina con un jumpTo al origen que pisaria el encuadre).
  const loadingEl = document.getElementById('mapLoading');
  const settled = !loadingEl || loadingEl.style.display === 'none';
  if (liveMap.needFit && settled && liveMap.players.some(p => p.x != null)) { liveMap.needFit = false; liveMapFit(); }
  const seen = new Set();
  const bearing = map.getBearing();
  for (const p of liveMap.players) {
    if (p.x == null) continue;
    seen.add(p.id);
    const lngLat = toLngLat(p.x, p.z);
    let entry = liveMap.markers.get(p.id);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'convoyMarker liveMapMarker';
      el.innerHTML = `<div class="convoyArrow"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2 L20 21 L12 16 L4 21 Z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg></div><div class="convoyLabel"></div>`;
      el.addEventListener('click', () => liveMapFollow(p.id));
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(map);
      entry = { marker, el, arrow: el.querySelector('.convoyArrow'), path: el.querySelector('path'), label: el.querySelector('.convoyLabel') };
      liveMap.markers.set(p.id, entry);
    } else {
      entry.marker.setLngLat(lngLat);
    }
    entry.path.setAttribute('fill', liveMapColor(p.id));
    // El rumbo viene sobre la grilla del juego: a geografico, como el propio.
    entry.arrow.style.transform = `rotate(${gridHeadingToGeo(p.heading || 0, p.x, p.z, toLngLat) - bearing}deg)`;
    entry.label.textContent = liveMapName(p);
    entry.el.classList.toggle('paused', !!p.paused);
    entry.el.classList.toggle('followed', p.id === liveMap.followId);
  }
  for (const [id, entry] of liveMap.markers) if (!seen.has(id)) { entry.marker.remove(); liveMap.markers.delete(id); }
  // Camion fijado: la camara lo sigue en cada tick (si se desconecto, se
  // suelta). El truckMarker (oculto en modo espectador) se mueve con el para
  // que Recentrar y el modo nav del app, que miran ese marcador, funcionen.
  if (liveMap.followId) {
    const f = liveMap.players.find(p => p.id === liveMap.followId);
    if (!f) { liveMapFollow(null); }
    else if (f.x != null) {
      const ll = toLngLat(f.x, f.z);
      if (typeof truckMarker !== 'undefined' && truckMarker) truckMarker.setLngLat(ll);
      const fHeading = gridHeadingToGeo(f.heading || 0, f.x, f.z, toLngLat);
      if (typeof navMode !== 'undefined' && navMode) lastHeadingDeg = fHeading;
      // no pisar una animacion en curso (el zoom del pin, un "ver todos")
      if (!map.isMoving()) {
        const view = { center: ll, duration: 900, easing: t => t };
        if (typeof navMode !== 'undefined' && navMode) view.bearing = fHeading;
        map.easeTo(view);
      }
    }
  }
}

// Rutas de cada camion (las que sus duenos comparten): una linea fina del
// color de su flecha; la del camion fijado, mas gruesa y opaca. Una fuente
// GeoJSON con todas; se rearma si el estilo se recargo (cambio de variante).
const LIVE_ROUTES_SOURCE = 'live-routes';
function liveMapRenderRoutes() {
  if (!map || !mapReady || !toLngLat || currentGame !== liveMap.variant) return;
  const features = [];
  for (const [id, r] of liveMap.routes) {
    features.push({
      type: 'Feature',
      properties: { color: liveMapColor(id), followed: id === liveMap.followId ? 1 : 0 },
      geometry: { type: 'LineString', coordinates: r.points.map(q => toLngLat(q[0], q[1])) },
    });
  }
  const data = { type: 'FeatureCollection', features };
  const src = map.getSource(LIVE_ROUTES_SOURCE);
  if (src) { src.setData(data); return; }
  map.addSource(LIVE_ROUTES_SOURCE, { type: 'geojson', data });
  // Debajo de los nombres, para no tapar ciudades.
  const firstSymbol = (map.getStyle().layers || []).find(l => l.type === 'symbol');
  map.addLayer({
    id: 'live-routes-line', type: 'line', source: LIVE_ROUTES_SOURCE,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 5, ['case', ['==', ['get', 'followed'], 1], 3, 1.5], 12, ['case', ['==', ['get', 'followed'], 1], 7, 4]],
      'line-opacity': ['case', ['==', ['get', 'followed'], 1], 0.95, 0.55],
    },
  }, firstSymbol ? firstSymbol.id : undefined);
}

// Fijar un camion: la camara lo sigue hasta que el usuario arrastre el mapa
// o lo desfije. Repetir sobre el mismo lo suelta.
function liveMapFollow(id) {
  liveMap.followId = id && liveMap.followId !== id ? id : null;
  liveMap.needFit = false; // el usuario tomo el control del encuadre
  document.body.classList.toggle('livePinned', !!liveMap.followId);
  if (liveMap.followId) {
    const p = liveMap.players.find(x => x.id === id);
    if (p && map && toLngLat) {
      autoFollow = false;
      if (typeof truckMarker !== 'undefined' && truckMarker) truckMarker.setLngLat(toLngLat(p.x, p.z));
      map.easeTo({ center: toLngLat(p.x, p.z), zoom: Math.max(map.getZoom(), 11), duration: 600 });
    }
  } else if (typeof navMode !== 'undefined' && navMode) {
    setNavMode(false); // sin camion fijado el modo nav no tiene a quien seguir
  }
  liveMapRenderMarkers();
  liveMapRenderRoutes();
  liveMapRenderPanel();
}

function liveMapFocus(id) {
  const p = liveMap.players.find(x => x.id === id);
  if (!p || !map || !toLngLat) return;
  autoFollow = false;
  map.easeTo({ center: toLngLat(p.x, p.z), zoom: Math.max(map.getZoom(), 10), duration: 600 });
}

function liveMapRenderPanel() {
  const list = document.getElementById('liveMapList');
  const count = document.getElementById('liveMapCount');
  if (!list) return;
  const n = liveMap.players.length;
  count.textContent = t(n === 1 ? 'liveMapDriversOne' : 'liveMapDrivers').replace('{n}', n);
  if (!n) { list.innerHTML = `<div class="convoyMeta">${escapeHtml(t('liveMapEmpty'))}</div>`; return; }
  list.innerHTML = liveMap.players.map(p => {
    const left = p.distanceKm > 0 ? liveMapDistance(p.distanceKm) : '';
    const eta = p.etaSeconds > 0 && typeof formatSeconds === 'function' ? formatSeconds(p.etaSeconds) : '';
    const route = p.citySrc && p.cityDst ? `${escapeHtml(p.citySrc)} → ${escapeHtml(p.cityDst)}` : '';
    // Lo que falta en un renglon propio: al lado de las ciudades se cortaba.
    const remaining = [left, eta].filter(Boolean).map(escapeHtml).join(' · ');
    const speed = p.speedKmh != null ? formatSpeedShort(p.speedKmh) : '';
    const status = p.paused ? t('convoyInMenu') : speed;
    const followed = p.id === liveMap.followId;
    return `<div class="liveMapRow${followed ? ' followed' : ''}" data-id="${escapeHtml(p.id)}">
      <span class="convoyDot" style="background:${liveMapColor(p.id)}"></span>
      <div class="liveMapRowBody"><div><span class="convoyName">${escapeHtml(liveMapName(p))}</span>${p.nick && p.truck ? ` <small class="convoyTag">${escapeHtml(p.truck)}</small>` : ''}</div>
      <div class="convoyMeta">${route || escapeHtml(p.cargo || '')}</div>${route && remaining ? `<div class="convoyMeta">${remaining}</div>` : ''}</div>
      <span class="convoyStatus">${escapeHtml(status)}</span>
      <button class="liveMapPin${followed ? ' active' : ''}" data-pin="${escapeHtml(p.id)}" title="${escapeHtml(t(followed ? 'liveMapUnpin' : 'liveMapPin'))}">📌</button></div>`;
  }).join('');
  list.querySelectorAll('.liveMapRow').forEach(row => row.addEventListener('click', () => liveMapFocus(row.dataset.id)));
  list.querySelectorAll('.liveMapPin').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); liveMapFollow(btn.dataset.pin); }));
}

// Lo que le falta (km del juego, como el GPS del juego), en las unidades de la app.
function liveMapDistance(km) {
  const imperial = typeof useImperial !== 'undefined' && useImperial;
  return imperial ? `${Math.round(km * 0.621371)} mi` : `${Math.round(km)} km`;
}

// km/h o mph segun las unidades elegidas en la app.
function formatSpeedShort(kmh) {
  const imperial = typeof useImperial !== 'undefined' && useImperial;
  return imperial ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.__liveMapSpectator) { const sp = window.__liveMapSpectator; window.__liveMapSpectator = null; liveMapStart(sp.variant, sp.backend); }
  const fitBtn = document.getElementById('liveMapFitBtn');
  if (fitBtn) fitBtn.addEventListener('click', () => { if (liveMap.followId) liveMapFollow(null); liveMapFit(); });
  const hook = () => { if (map) { map.on('rotate', () => liveMapRenderMarkers()); map.on('dragstart', () => { if (liveMap.followId) liveMapFollow(null); }); } };
  const iv = setInterval(() => { if (map) { hook(); clearInterval(iv); } }, 500);
  // Marcadores recien cuando el mapa de la variante esta listo (loadGameMap es async).
  const iv2 = setInterval(() => {
    if (!liveMap.variant || currentGame !== liveMap.variant || !mapReady) return;
    if (liveMap.players.length) liveMapRenderMarkers();
    // Las rutas pueden llegar antes de que el mapa este listo, y un estilo
    // recargado se lleva la fuente: se rearma sola.
    if (liveMap.routes.size && !map.getSource(LIVE_ROUTES_SOURCE)) liveMapRenderRoutes();
  }, 1000);
  if (!window.__liveMapKeepInterval) window.__liveMapKeepInterval = iv2;
});
