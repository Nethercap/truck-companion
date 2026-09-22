// Modo convoy (beta). Varios jugadores, cada uno con su cliente y su juego,
// comparten un codigo y se ven en el mapa + un carrusel de tarjetas; con el
// link (/app/?convoy=CODE) cualquiera mira de espectador sin juego.
//
// Vive aparte de app.js pero usa sus globals (map, toLngLat, lastData, ws,
// conn, waypoints, t, showToast, escapeHtml...). Los ganchos desde app.js
// son cuatro: convoyOnSocketOpen(), convoyHandleMessage(data),
// convoyOnRouteChanged() y convoyOnTelemetry(data). Ver el bloque
// "Convoy" en connectWs/updateDestinationMarker/handleTelemetry.
//
// Reglas (ver el plan): el miembro es la SESION de pairing (sobrevive a que
// esta pestana se reconecte); hacia afuera solo viaja un id publico; los
// botones de comando nunca actuan sobre otro camion; mismo juego = mismas
// coordenadas (los mods extienden el mapa, no lo mueven), asi que un
// companero con otra variante se dibuja igual, mas tenue y con etiqueta.

const CONVOY_COLORS = ['#3b9eff', '#ff8a3d', '#4caf50', '#e040fb', '#ffd740', '#ff5252', '#26c6da', '#ab47bc', '#8d6e63', '#9ccc65', '#ff7043', '#78909c'];
const CONVOY_QUICK = [
  { key: 'ok', icon: '👍' }, { key: 'stop_next', icon: '🅿️' }, { key: 'fuel', icon: '⛽' },
  { key: 'behind', icon: '🐢' }, { key: 'wait', icon: '✋' }, { key: 'go', icon: '🚀' },
];
const CONVOY_ROUTE_MAX_POINTS = 600;
const CONVOY_ROUTE_RESEND_MS = 10000;
const CONVOY_FOLLOW_MOVE_M = 500; // el waypoint "lider" se mueve si su destino cambio mas que esto

const convoy = {
  code: null, you: null, creatorId: null, members: [], spectators: 0, ended: false,
  routes: new Map(),          // id -> { rev, points: [[x,z],...] }
  pending: null,              // { kind: 'create'|'join', code, nickname } para (re)enviar al abrir el socket
  spectator: false, spectatorWs: null, spectatorGame: null,
  follow: false, followWaypoint: null,
  showLeaderRoute: true,
  markers: new Map(),         // id -> { marker, el, arrow, label }
  edges: new Map(),           // id -> indicador de borde
  msgNotes: new Map(),        // id -> { key, until }
  lastRouteSentAt: 0, lastRouteSig: null,
  lastVariantSent: null,
};
let convoyNick = _savedSettings.convoyNick || '';
let convoyMuted = !!_savedSettings.convoyMuted;
let convoyShareIncome = !!_savedSettings.convoyShareIncome;
let convoyShowMarkers = _savedSettings.convoyShowMarkers !== false; // flechas + chapitas de borde de los companeros

function convoySaveSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    Object.assign(raw, { convoyNick, convoyMuted, convoyShareIncome, convoyShowMarkers });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(raw));
  } catch (e) {}
}

function convoyInRoom() { return !!(convoy.code && convoy.you); }
function convoyAvailable() { return !conn.local && !conn.demo && !convoy.spectator; }
function convoyMyVariant() { return resolveEffectiveGame(lastData?.game); }
function convoyMyGame() { return lastData?.game || null; }
function convoyMe() { return convoy.members.find(m => m.id === convoy.you) || null; }
function convoyLeader() { return convoy.members.find(m => m.id === convoy.creatorId) || null; }
function convoyColor(m) { return CONVOY_COLORS[(m && m.color) % CONVOY_COLORS.length || 0]; }

function convoySend(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !convoyAvailable()) return false;
  ws.send(JSON.stringify(obj));
  return true;
}

// ---------------------------------------------------------------- ganchos desde app.js
function convoyOnSocketOpen() {
  // Tras (re)conectar el backend no recuerda nada de esta pestana: se vuelve
  // a entrar con el mismo codigo/apodo. Si eramos el creador y el convoy ya
  // no existe (redeploy), se recrea con el mismo codigo.
  if (!convoy.pending) return;
  const p = convoy.pending;
  convoySend({ type: p.kind === 'create' ? 'convoy_create' : 'convoy_join', code: p.code, nickname: p.nickname,
    mapVariant: convoyMyVariant(), shareIncome: convoyShareIncome, postSummary: !!p.postSummary });
}

function convoyHandleMessage(data) {
  switch (data.type) {
    case 'convoy_state': convoyApplyState(data); break;
    case 'convoy_route': convoy.routes.set(data.id, { rev: data.rev, points: data.points || [] }); convoyRenderLeaderRoute(); convoyUpdateFollow(); break;
    case 'convoy_msg': convoyOnQuickMessage(data); break;
    case 'convoy_event': convoyOnEvent(data); break;
    case 'convoy_error': convoyOnError(data); break;
  }
}

function convoyOnRouteChanged() { convoySendRoute(true); }

function convoyOnTelemetry(data) {
  if (!convoyInRoom()) return;
  const v = resolveEffectiveGame(data.game);
  if (v !== convoy.lastVariantSent) {
    convoy.lastVariantSent = v;
    convoySend({ type: 'convoy_variant', mapVariant: v, shareIncome: convoyShareIncome });
  }
  convoySendRoute(false);
  convoyUpdateFollow();
}

// ---------------------------------------------------------------- estado
function convoyApplyState(st) {
  const wasIn = convoyInRoom();
  if (st.left || st.kicked || st.ended) {
    const kicked = !!st.kicked;
    convoyReset();
    if (kicked) showToast(t('convoyKicked'), 'danger', 6000);
    else if (st.ended) showToast(t('convoyEnded'), 'info', 5000);
    convoyRenderAll();
    return;
  }
  convoy.code = st.code;
  convoy.you = st.you;
  convoy.creatorId = st.creatorId || null;
  convoy.members = st.members || [];
  convoy.spectators = st.spectators || 0;
  if (!convoy.spectator) {
    // entrar bien: recordar para reconexiones
    const me = convoyMe();
    if (me) convoy.pending = { kind: me.creator ? 'create' : 'join', code: st.code, nickname: me.nickname, postSummary: !!st.postSummary };
    if (!wasIn && me) { convoy.lastVariantSent = null; convoySendRoute(true); }
  }
  for (const id of [...convoy.routes.keys()]) if (!convoy.members.some(m => m.id === id)) convoy.routes.delete(id);
  convoyRenderAll();
}

function convoyReset() {
  convoy.code = null; convoy.you = null; convoy.creatorId = null; convoy.members = []; convoy.spectators = 0;
  convoy.routes.clear(); convoy.pending = null; convoy.lastVariantSent = null; convoy.lastRouteSig = null;
  convoySetFollow(false);
}

function convoyLeaveRoom() {
  convoySend({ type: 'convoy_leave' });
  convoyReset();
  convoyRenderAll();
}

function convoyOnEvent(ev) {
  if (!convoy.you && !convoy.spectator) return; // todavia no estoy adentro: el evento es el mio
  if (ev.event === 'joined' && ev.id !== convoy.you) { showToast(t('convoyJoined').replace('{n}', ev.nickname), 'info', 3000); convoyPlaySound('join'); }
  if (ev.event === 'left' && ev.id !== convoy.you) { showToast(t('convoyLeft').replace('{n}', ev.nickname), 'info', 3000); convoyPlaySound('leave'); }
}

function convoyOnError(err) {
  const key = { bad_nickname: 'convoyErrNick', not_found: 'convoyErrNotFound', banned: 'convoyErrBanned', full: 'convoyErrFull', nickname_taken: 'convoyErrTaken', not_in_convoy: 'convoyErrNotIn' }[err.reason] || 'convoyErrGeneric';
  showToast(t(key), 'danger', 5000);
  if (convoy.pending && (err.reason === 'not_found' || err.reason === 'banned') && !convoyInRoom()) convoy.pending = null;
  convoyRenderModal();
}

function convoyOnQuickMessage(msg) {
  const label = t('convoyMsg_' + msg.key);
  const icon = (CONVOY_QUICK.find(q => q.key === msg.key) || {}).icon || '💬';
  if (msg.id !== convoy.you) {
    showToast(`${icon} ${msg.nickname}: ${label}`, 'info', 6000);
    convoyPlaySound('msg');
  }
  convoy.msgNotes.set(msg.id, { key: msg.key, until: Date.now() + 60000 });
  convoyRenderCards();
}

// ---------------------------------------------------------------- ruta propia -> convoy
function convoySendRoute(force) {
  if (!convoyInRoom() || !currentRouteWorldPoints || currentRouteWorldPoints.length < 2) {
    if (convoyInRoom() && convoy.lastRouteSig !== 'none' && force) { convoy.lastRouteSig = 'none'; convoySend({ type: 'convoy_route', points: [] }); }
    return;
  }
  const now = Date.now();
  if (!force && now - convoy.lastRouteSentAt < CONVOY_ROUTE_RESEND_MS) return;
  const pts = currentRouteWorldPoints;
  const step = Math.max(1, Math.ceil(pts.length / CONVOY_ROUTE_MAX_POINTS));
  const out = [];
  for (let i = 0; i < pts.length; i += step) out.push([Math.round(pts[i][0]), Math.round(pts[i][1])]);
  const last = pts[pts.length - 1];
  if (out.length && (out[out.length - 1][0] !== Math.round(last[0]) || out[out.length - 1][1] !== Math.round(last[1]))) out.push([Math.round(last[0]), Math.round(last[1])]);
  const sig = `${out.length}|${out[out.length - 1]}`;
  if (!force && sig === convoy.lastRouteSig) return;
  convoy.lastRouteSig = sig;
  convoy.lastRouteSentAt = now;
  convoySend({ type: 'convoy_route', points: out });
}

// ---------------------------------------------------------------- distancias
function convoyDistanceScale() {
  const g = convoy.spectator ? (convoy.spectatorGame || 'ats') : (lastData?.game || 'ats');
  return g === 'ets2' ? 19 : 20;
}
function convoyFormatDistance(rawMeters) {
  const km = rawMeters * convoyDistanceScale() / 1000;
  if (useImperial) { const mi = km * KM_TO_MI; return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`; }
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
function convoyMyPos() {
  const p = lastData?.position;
  return p && p.x != null ? [p.x, p.z] : null;
}
// Distancia por la ruta del lider si estoy sobre ella (a < 200 m), si no en linea recta.
function convoyDistanceTo(m) {
  const me = convoyMyPos();
  if (!me || m.x == null) return null;
  const straight = Math.hypot(m.x - me[0], m.z - me[1]);
  const route = convoy.routes.get(m.id);
  if (route && route.points.length > 1) {
    const pts = route.points;
    let best = Infinity, bestIdx = -1, bestT = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, lenSq = dx * dx + dz * dz;
      let tt = lenSq > 0 ? ((me[0] - ax) * dx + (me[1] - az) * dz) / lenSq : 0;
      tt = Math.max(0, Math.min(1, tt));
      const d = Math.hypot(me[0] - (ax + tt * dx), me[1] - (az + tt * dz));
      if (d < best) { best = d; bestIdx = i; bestT = tt; }
    }
    if (best < 200 && bestIdx >= 0) {
      // la ruta del lider empieza en su posicion: la distancia por la ruta hasta mi proyeccion es cuanto voy detras
      let along = 0;
      for (let i = 0; i < bestIdx; i++) along += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      along += bestT * Math.hypot(pts[bestIdx + 1][0] - pts[bestIdx][0], pts[bestIdx + 1][1] - pts[bestIdx][1]);
      return { meters: along, behind: true };
    }
  }
  return { meters: straight, behind: false };
}

// ---------------------------------------------------------------- seguir al lider
function convoySetFollow(on) {
  convoy.follow = on;
  if (!on && convoy.followWaypoint) {
    const idx = waypoints.indexOf(convoy.followWaypoint);
    if (idx >= 0) removeWaypoint(idx);
    convoy.followWaypoint = null;
  }
  if (on) convoyUpdateFollow();
  convoyRenderCards();
}
function convoyUpdateFollow() {
  if (!convoy.follow || !convoyInRoom()) return;
  const leader = convoyLeader();
  const route = leader ? convoy.routes.get(leader.id) : null;
  const dest = route && route.points.length ? route.points[route.points.length - 1] : null;
  if (!dest) {
    if (convoy.followWaypoint) { const idx = waypoints.indexOf(convoy.followWaypoint); if (idx >= 0) removeWaypoint(idx); convoy.followWaypoint = null; }
    return;
  }
  const cur = convoy.followWaypoint;
  if (cur && waypoints.includes(cur) && Math.hypot(cur.pos[0] - dest[0], cur.pos[1] - dest[1]) < CONVOY_FOLLOW_MOVE_M) return;
  if (cur) { const idx = waypoints.indexOf(cur); if (idx >= 0) removeWaypoint(idx); }
  if (!toLngLat) return;
  const label = `📍 ${t('convoyLeaderTag')}: ${leader.cityDst || leader.nickname}`;
  addWaypoint([dest[0], dest[1]], toLngLat(dest[0], dest[1]), false, label);
  convoy.followWaypoint = waypoints[waypoints.length - 1] || null;
}

// ---------------------------------------------------------------- mapa: marcadores + borde + ruta del lider
function convoyEnsureLayers() {
  if (!map || !mapReady || map.getSource('convoy-route')) return;
  map.addSource('convoy-route', { type: 'geojson', data: emptyLineString() });
  map.addLayer({ id: 'convoy-route-line', type: 'line', source: 'convoy-route', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#3b9eff', 'line-width': 3, 'line-opacity': 0.5, 'line-dasharray': [1.5, 2] } });
}
function convoyRenderLeaderRoute() {
  if (!map || !mapReady || !toLngLat) return;
  convoyEnsureLayers();
  const leader = convoyLeader();
  const route = leader && leader.id !== convoy.you && convoy.showLeaderRoute ? convoy.routes.get(leader.id) : null;
  const src = map.getSource('convoy-route');
  if (!src) return;
  if (!route || route.points.length < 2) { src.setData(emptyLineString()); return; }
  const coords = route.points.map(p => toLngLat(p[0], p[1]));
  if (leader.x != null) coords.unshift(toLngLat(leader.x, leader.z));
  src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
  const dim = !convoy.spectator && leader.variant && leader.variant !== convoyMyVariant();
  map.setPaintProperty('convoy-route-line', 'line-color', convoyColor(leader));
  map.setPaintProperty('convoy-route-line', 'line-opacity', dim ? 0.3 : 0.5);
}

function convoySameGame(m) {
  const mine = convoy.spectator ? convoy.spectatorGame : convoyMyGame();
  return !!m.game && (!mine || m.game === mine);
}

function convoyRenderMarkers() {
  if (!map || !mapReady || !toLngLat) return;
  if (!convoyShowMarkers) {
    for (const [id, entry] of convoy.markers) { entry.marker.remove(); convoy.markers.delete(id); }
    for (const el of convoy.edges.values()) el.style.display = 'none';
    return;
  }
  // Encuadre inicial del espectador: recien cuando el mapa termino de cargar
  // del todo (loadGameMap termina con un jumpTo al origen que pisaria el
  // encuadre si se hiciera antes).
  const loadingEl = document.getElementById('mapLoading');
  const settled = !!currentGame && (!loadingEl || loadingEl.style.display === 'none');
  if (convoy.needFit && settled && convoy.members.some(m => m.x != null)) { convoy.needFit = false; convoyFitMembers(); }
  const seen = new Set();
  const myVariant = convoy.spectator ? null : convoyMyVariant();
  for (const m of convoy.members) {
    if (m.id === convoy.you || !m.online || m.x == null || !convoySameGame(m)) continue;
    seen.add(m.id);
    const lngLat = toLngLat(m.x, m.z);
    let entry = convoy.markers.get(m.id);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'convoyMarker';
      el.innerHTML = `<div class="convoyArrow"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M12 2 L20 21 L12 16 L4 21 Z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg></div><div class="convoyLabel"></div>`;
      el.addEventListener('click', () => { if (map) { autoFollow = false; map.easeTo({ center: toLngLat(m.x, m.z), duration: 500 }); } });
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(map);
      entry = { marker, el, arrow: el.querySelector('.convoyArrow'), path: el.querySelector('path'), label: el.querySelector('.convoyLabel') };
      convoy.markers.set(m.id, entry);
    } else {
      entry.marker.setLngLat(lngLat);
    }
    entry.path.setAttribute('fill', convoyColor(m));
    const bearing = map ? map.getBearing() : 0;
    entry.arrow.style.transform = `rotate(${(m.heading || 0) - bearing}deg)`;
    const tag = myVariant && m.variant && m.variant !== myVariant ? ` <small>${escapeHtml(convoyVariantLabel(m.variant))}</small>` : '';
    entry.label.innerHTML = `${escapeHtml(m.nickname)}${tag}`;
    entry.el.classList.toggle('dim', !!(myVariant && m.variant && m.variant !== myVariant));
    entry.el.classList.toggle('paused', !!m.paused);
  }
  for (const [id, entry] of convoy.markers) if (!seen.has(id)) { entry.marker.remove(); convoy.markers.delete(id); }
  convoyRenderEdgeIndicators();
}

function convoyVariantLabel(v) {
  return {
    ats_c2c: 'C2C', ats_promods: 'ProMods', ats_c2c_promods: 'C2C+ProMods', ats_reforma: 'Reforma', ats_reforma_c2c_promods: 'Reforma+C2C+PM',
    ets2_promods: 'ProMods', ets2_promods_rusmap: 'ProMods+RusMap', ets2_promods_roex: 'ProMods+Roex', ets2_promods_rusmap_roex: 'PM+RusMap+Roex', ets2_gu: 'Grand Utopia', ets2_tmp: 'TruckersMP',
    ats: 'ATS', ets2: 'ETS2',
  }[v] || v;
}

// Companeros fuera de pantalla: una chapita pegada al borde del mapa, del
// lado en que estan, con apodo y distancia. Se recalcula al mover el mapa.
function convoyRenderEdgeIndicators() {
  const layer = document.getElementById('convoyEdgeLayer');
  if (!layer || !map || !toLngLat || !convoyShowMarkers) return;
  const rect = map.getContainer().getBoundingClientRect();
  const W = rect.width, H = rect.height, PAD = 26;
  const seen = new Set();
  for (const m of convoy.members) {
    if (m.id === convoy.you || !m.online || m.x == null || !convoySameGame(m)) continue;
    const p = map.project(toLngLat(m.x, m.z));
    const inside = p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
    let el = convoy.edges.get(m.id);
    if (inside) { if (el) el.style.display = 'none'; continue; }
    seen.add(m.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'convoyEdge';
      el.addEventListener('click', () => { autoFollow = false; map.easeTo({ center: toLngLat(m.x, m.z), duration: 500 }); });
      layer.appendChild(el);
      convoy.edges.set(m.id, el);
    }
    const cx = W / 2, cy = H / 2;
    const dx = p.x - cx, dy = p.y - cy;
    // abajo hay mas margen: ahi van el nombre del mapa y el mini-HUD
    const padY = dy > 0 ? PAD + 22 : PAD;
    const sx = (W / 2 - PAD) / Math.abs(dx || 1e-6), sy = (H / 2 - padY) / Math.abs(dy || 1e-6);
    const k = Math.min(sx, sy);
    const ex = cx + dx * k, ey = cy + dy * k;
    const dist = convoy.spectator ? null : convoyDistanceTo(m);
    el.style.display = '';
    el.style.left = `${Math.round(ex)}px`;
    el.style.top = `${Math.round(ey)}px`;
    el.style.borderColor = convoyColor(m);
    el.innerHTML = `<span class="convoyEdgeArrow" style="transform:rotate(${Math.round(Math.atan2(dy, dx) * 180 / Math.PI)}deg)">➤</span> ${escapeHtml(m.nickname)}${dist ? ` · ${convoyFormatDistance(dist.meters)}` : ''}`;
  }
  for (const [id, el] of convoy.edges) if (!seen.has(id)) { el.style.display = 'none'; }
}

// ---------------------------------------------------------------- carrusel
function convoyRenderCards() {
  const wrap = document.getElementById('convoyCards');
  const scroller = document.getElementById('convoyCardsScroll');
  if (!wrap || !scroller) return;
  const others = convoy.code ? convoy.members.filter(m => m.id !== convoy.you) : [];
  wrap.hidden = !others.length;
  if (!others.length) { scroller.innerHTML = ''; return; }
  const myVariant = convoy.spectator ? null : convoyMyVariant();
  const seen = new Set();
  for (const m of others) {
    seen.add(m.id);
    let card = scroller.querySelector(`.convoyCard[data-id="${m.id}"]`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'convoyCard';
      card.dataset.id = m.id;
      scroller.appendChild(card);
    }
    const status = !m.online ? t('convoyOffline') : (m.paused ? t('convoyInMenu') : null);
    const otherGame = m.game && !convoySameGame(m) ? t('convoyOtherGame').replace('{game}', (m.game || '').toUpperCase()) : null;
    const dist = !convoy.spectator && m.online && m.x != null && convoySameGame(m) ? convoyDistanceTo(m) : null;
    const distText = dist ? (dist.behind ? t('convoyBehind') : t('convoyAway')).replace('{d}', convoyFormatDistance(dist.meters)) : '';
    const note = convoy.msgNotes.get(m.id);
    const noteText = note && note.until > Date.now() ? `${(CONVOY_QUICK.find(q => q.key === note.key) || {}).icon || ''} ${t('convoyMsg_' + note.key)}` : '';
    const variantTag = myVariant && m.variant && m.variant !== myVariant ? `<span class="convoyTag">${escapeHtml(convoyVariantLabel(m.variant))}</span>` : '';
    const leaderTag = m.creator ? `<span class="convoyTag leader">${t('convoyLeaderTag')}</span>` : '';
    const eta = m.etaSeconds != null ? formatSeconds(m.etaSeconds) : '-';
    const mass = m.cargoMassKg ? ` (${(m.cargoMassKg / 1000).toFixed(1)} TN)` : '';
    const showFollow = !convoy.spectator && m.creator && !otherGame;
    const income = m.jobIncome ? `<div class="row"><span class="label">${t('jobPay')}</span><span>${moneyLine(m.jobIncome, m.game)}</span></div>` : '';
    card.innerHTML = `
      <div class="convoyCardHead" style="border-color:${convoyColor(m)}">
        <span class="convoyDot" style="background:${convoyColor(m)}"></span>
        <span class="convoyName">${escapeHtml(m.nickname)}</span>${leaderTag}${variantTag}
        <span class="convoyStatus">${escapeHtml(status || otherGame || distText || '')}</span>
      </div>
      ${noteText ? `<div class="convoyNote">${escapeHtml(noteText)}</div>` : ''}
      <div class="row"><span class="label">${t('speed')}</span><span>${m.online && m.speedKmh != null ? Math.round(useImperial ? m.speedKmh * KM_TO_MI : m.speedKmh) + (useImperial ? ' mph' : ' km/h') : '-'}</span></div>
      <div class="row"><span class="label">${t('cargo')}</span><span>${escapeHtml(m.cargo || t('noCargo'))}${escapeHtml(mass)}</span></div>
      <div class="row"><span class="label">${t('route')}</span><span>${escapeHtml(m.citySrc || '?')} → ${escapeHtml(m.cityDst || '?')}</span></div>
      <div class="row"><span class="label">${t('etaGame')}</span><span>${eta}${m.distanceKm ? ` (${useImperial ? (m.distanceKm * KM_TO_MI).toFixed(0) + ' mi' : m.distanceKm.toFixed(0) + ' km'})` : ''}</span></div>
      <div class="row"><span class="label">${t('fuel')}</span><span>${m.fuelPct != null ? m.fuelPct + '%' : '-'}</span></div>
      <div class="row"><span class="label">${t('nextRest')}</span><span>${m.restMin != null && m.restMin > 0 && m.restMin < 1440 ? formatSeconds(m.restMin * 60) : '-'}</span></div>
      ${income}
      ${m.truck ? `<div class="row"><span class="label">${t('truck')}</span><span>${escapeHtml(m.truck)}</span></div>` : ''}
      ${showFollow ? `<div class="convoyCardActions"><button class="waypointClearBtn convoyFollowBtn">${convoy.follow ? t('convoyUnfollow') : t('convoyFollow')}</button><button class="waypointClearBtn convoyRouteBtn">${convoy.showLeaderRoute ? t('convoyHideRoute') : t('convoyShowRoute')}</button></div>` : ''}
    `;
    const fb = card.querySelector('.convoyFollowBtn');
    if (fb) fb.addEventListener('click', () => convoySetFollow(!convoy.follow));
    const rb = card.querySelector('.convoyRouteBtn');
    if (rb) rb.addEventListener('click', () => { convoy.showLeaderRoute = !convoy.showLeaderRoute; convoyRenderLeaderRoute(); convoyRenderCards(); });
  }
  scroller.querySelectorAll('.convoyCard').forEach(c => { if (!seen.has(c.dataset.id)) c.remove(); });
  const dots = document.getElementById('convoyDots');
  if (dots) dots.textContent = others.length > 1 ? '●'.repeat(others.length) : '';
}

// ---------------------------------------------------------------- UI: boton de la barra, modal, popover de mensajes
function convoyRenderAll() {
  convoyRenderModal();
  convoyRenderCards();
  convoyRenderMarkers();
  convoyRenderLeaderRoute();
  const btn = document.getElementById('convoyBtn');
  const badge = document.getElementById('convoyBadge');
  if (btn) btn.classList.toggle('active', convoyInRoom() || convoy.spectator);
  if (badge) { const n = convoy.code ? convoy.members.length : 0; badge.textContent = String(n); badge.style.display = n ? '' : 'none'; }
  const msgBtn = document.getElementById('convoyMsgBtn');
  if (msgBtn) msgBtn.style.display = convoyInRoom() ? '' : 'none';
  document.body.classList.toggle('inConvoy', convoyInRoom() || convoy.spectator);
}

function convoyRenderModal() {
  const modal = document.getElementById('convoyModal');
  if (!modal) return;
  const inRoom = convoyInRoom() || convoy.spectator;
  document.getElementById('convoyOut').hidden = inRoom;
  document.getElementById('convoyIn').hidden = !inRoom;
  const unavailable = document.getElementById('convoyUnavailable');
  const available = convoyAvailable();
  unavailable.hidden = available;
  unavailable.textContent = conn.local ? t('convoyUnavailableLan') : (conn.demo ? t('convoyUnavailableDemo') : '');
  document.getElementById('convoyCreateBtn').disabled = !available || conn.socket !== 'open';
  document.getElementById('convoyJoinBtn').disabled = !available || conn.socket !== 'open';
  const notConnected = document.getElementById('convoyNotConnected');
  notConnected.hidden = !available || conn.socket === 'open';
  document.getElementById('convoyNick').value = convoyNick;
  document.getElementById('convoyShareIncome').checked = convoyShareIncome;
  document.getElementById('convoyMute').checked = convoyMuted;
  document.getElementById('convoyShowMarkers').checked = convoyShowMarkers;
  if (!inRoom) return;
  document.getElementById('convoyCodeBig').textContent = convoy.code || '';
  document.getElementById('convoySpectators').textContent = t('convoySpectators').replace('{n}', convoy.spectators);
  const me = convoyMe();
  document.getElementById('convoyCloseConvoyBtn').hidden = !(me && me.creator);
  document.getElementById('convoyLeaveBtn').hidden = convoy.spectator;
  const list = document.getElementById('convoyMemberList');
  list.innerHTML = convoy.members.map(m => {
    const status = m.id === convoy.you ? t('convoyYou') : (!m.online ? t('convoyOffline') : (m.paused ? t('convoyInMenu') : (m.game || '').toUpperCase()));
    const kick = me && me.creator && m.id !== convoy.you ? `<button class="waypointClearBtn" data-kick="${m.id}">${t('convoyKick')}</button>` : '';
    return `<div class="convoyMemberRow"><span class="convoyDot" style="background:${convoyColor(m)}"></span><span class="convoyName">${escapeHtml(m.nickname)}</span>${m.creator ? `<span class="convoyTag leader">${t('convoyLeaderTag')}</span>` : ''}<span class="convoyStatus">${escapeHtml(status)}</span>${kick}</div>`;
  }).join('');
  list.querySelectorAll('button[data-kick]').forEach(b => b.addEventListener('click', () => convoySend({ type: 'convoy_kick', id: b.dataset.kick })));
}

function convoyOpenModal(prefillCode) {
  convoyRenderModal();
  if (prefillCode) document.getElementById('convoyCodeInput').value = prefillCode;
  document.getElementById('convoyModal').style.display = 'flex';
}

function convoyLink() { return `${location.origin}${location.pathname}?convoy=${convoy.code}`; }

function convoyWireUi() {
  const $ = id => document.getElementById(id);
  if (!$('convoyModal')) return;
  $('convoyBtn').addEventListener('click', () => convoyOpenModal());
  $('convoyModalClose').addEventListener('click', () => { $('convoyModal').style.display = 'none'; });
  $('convoyNick').addEventListener('input', e => { convoyNick = e.target.value.trim().slice(0, 16); convoySaveSettings(); });
  $('convoyShareIncome').addEventListener('change', e => { convoyShareIncome = e.target.checked; convoySaveSettings(); if (convoyInRoom()) convoySend({ type: 'convoy_variant', mapVariant: convoyMyVariant(), shareIncome: convoyShareIncome }); });
  $('convoyMute').addEventListener('change', e => { convoyMuted = e.target.checked; convoySaveSettings(); });
  $('convoyShowMarkers').addEventListener('change', e => { convoyShowMarkers = e.target.checked; convoySaveSettings(); convoyRenderMarkers(); });
  $('convoyCodeInput').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6); });
  const start = (kind) => {
    const nickname = ($('convoyNick').value || '').trim();
    if (nickname.length < 2) { showToast(t('convoyErrNick'), 'danger'); return; }
    const code = kind === 'join' ? $('convoyCodeInput').value.trim().toUpperCase() : null;
    if (kind === 'join' && code.length !== 6) { showToast(t('convoyErrNotFound'), 'danger'); return; }
    convoy.pending = { kind, code, nickname, postSummary: $('convoyPostSummary').checked };
    convoyOnSocketOpen();
  };
  $('convoyCreateBtn').addEventListener('click', () => start('create'));
  $('convoyJoinBtn').addEventListener('click', () => start('join'));
  $('convoyCopyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(convoyLink()); showToast(t('convoyCopied'), 'success', 2500); }
    catch (e) { prompt(t('convoyCopyLink'), convoyLink()); }
  });
  $('convoyLeaveBtn').addEventListener('click', () => { convoyLeaveRoom(); $('convoyModal').style.display = 'none'; });
  $('convoyCloseConvoyBtn').addEventListener('click', () => { convoySend({ type: 'convoy_close' }); convoyReset(); convoyRenderAll(); $('convoyModal').style.display = 'none'; });
  // popover de mensajes rapidos
  const pop = $('convoyMsgPop');
  pop.innerHTML = CONVOY_QUICK.map(q => `<button class="convoyQuickBtn" data-key="${q.key}"><span>${q.icon}</span><span data-i18n="convoyMsg_${q.key}">${t('convoyMsg_' + q.key)}</span></button>`).join('');
  pop.querySelectorAll('button[data-key]').forEach(b => b.addEventListener('click', () => { convoySend({ type: 'convoy_msg', key: b.dataset.key }); pop.style.display = 'none'; }));
  $('convoyMsgBtn').addEventListener('click', () => {
    // El boton vive en la columna flex de la izquierda: su altura depende de
    // cuantos botones esten visibles, asi que el popover se ancla a el.
    const btn = $('convoyMsgBtn').getBoundingClientRect();
    const panel = document.getElementById('mapPanel').getBoundingClientRect();
    pop.style.top = `${Math.max(8, btn.top - panel.top)}px`;
    pop.style.left = `${btn.right - panel.left + 8}px`;
    pop.style.display = pop.style.display === 'none' ? '' : 'none';
  });
  document.addEventListener('click', (e) => { if (!pop.contains(e.target) && e.target !== $('convoyMsgBtn') && !$('convoyMsgBtn').contains(e.target)) pop.style.display = 'none'; });
  pop.style.display = 'none';
  convoyRenderAll();
}

// ---------------------------------------------------------------- sonidos (sintetizados, sin archivos)
let convoyAudioCtx = null;
function convoyPlaySound(kind) {
  if (convoyMuted || convoy.spectator) return;
  try {
    convoyAudioCtx = convoyAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = convoyAudioCtx;
    const seq = { join: [[660, 0], [880, 0.12]], leave: [[880, 0], [660, 0.12]], msg: [[988, 0], [988, 0.15]] }[kind] || [[880, 0]];
    for (const [freq, at] of seq) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.14);
    }
  } catch (e) {}
}

// ---------------------------------------------------------------- espectador (/app/?convoy=CODE sin cliente)
function convoyStartSpectator(code, backend) {
  convoy.spectator = true;
  conn.spectator = true;
  conn.socket = 'connecting';
  renderConnectionUi();
  const base = backend.replace('https://', 'wss://').replace('http://', 'ws://');
  const socket = new WebSocket(`${base}/ws/convoy/${code}`);
  convoy.spectatorWs = socket;
  socket.onopen = () => { conn.socket = 'open'; conn.everOpen = true; renderConnectionUi(); };
  socket.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === 'convoy_state') {
      if (data.ended) { convoy.ended = true; showToast(t('convoyEnded'), 'info', 6000); }
      convoy.code = data.code; convoy.you = null; convoy.creatorId = data.creatorId || null;
      convoy.members = data.members || []; convoy.spectators = data.spectators || 0;
      // el mapa del espectador es el del lider (o el primer miembro con juego)
      const ref = convoy.members.find(m => m.creator && m.game) || convoy.members.find(m => m.game);
      if (ref && !convoy.spectatorGame) {
        convoy.spectatorGame = ref.game;
        // loadGameMap termina con un jumpTo al origen del mapa: el encuadre
        // sobre los miembros va despues de eso.
        convoy.needFit = true;
        loadGameMap(ref.variant || ref.game);
      }
      convoyRenderAll();
      return;
    }
    convoyHandleMessage(data);
  };
  socket.onclose = (ev) => {
    conn.socket = 'closed';
    renderConnectionUi();
    if (ev && ev.code === 4404) { showToast(t('convoyErrNotFound'), 'danger', 8000); return; }
    if (!convoy.ended) setTimeout(() => convoyStartSpectator(code, backend), 5000);
  };
  document.getElementById('spectatorCode').textContent = code;
}
function convoyFitMembers() {
  if (!map || !toLngLat) return;
  const pts = convoy.members.filter(m => m.x != null && convoySameGame(m)).map(m => toLngLat(m.x, m.z));
  if (!pts.length) return;
  if (pts.length === 1) { map.jumpTo({ center: pts[0], zoom: 9 }); return; }
  const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]));
  map.fitBounds(b, { padding: 60, maxZoom: 10 });
}

// El mapa rota en modo nav: las flechas y las chapitas del borde se rehacen.
document.addEventListener('DOMContentLoaded', () => {
  convoyWireUi();
  if (window.__convoySpectator) { const sp = window.__convoySpectator; window.__convoySpectator = null; convoyStartSpectator(sp.code, sp.backend); }
  const hook = () => { if (map) { map.on('move', () => { convoyRenderEdgeIndicators(); }); map.on('rotate', () => convoyRenderMarkers()); } };
  const iv = setInterval(() => { if (map) { hook(); clearInterval(iv); } }, 500);
});
