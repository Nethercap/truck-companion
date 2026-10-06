// Guia de uso. Los textos viven en text.js (GUIDE_TEXT, uno por idioma; lo
// que le falte a un idioma cae al ingles). Los iconos NO se copian: se leen
// de /app/index.html al abrir la pagina, asi la guia muestra siempre los
// mismos botones que la app aunque cambie un dibujo.
(function () {
  'use strict';

  const LANG_KEY = 'truckdash_lang';  // la misma clave que la app y la cuenta
  const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'pl', 'tr', 'ru'];

  const MAP_BTNS = ['recenterBtn', 'fullscreenBtn', 'navToggleBtn', 'tilt3dBtn', 'waypointBtn',
    'commandsToggleBtn', 'convoyMsgBtn', 'panelToggleBtn', 'poiBtn'];
  const TOP_BTNS = ['dashBtn', 'settingsBtn', 'helpBtn', 'unitToggle', 'langSelect', 'modsBtn',
    'convoyBtn', 'discordBtn'];
  const CMDS = ['cmdHazards', 'cmdBeacon', 'cmdHandbrake', 'cmdEngine', 'cmdTrailer', 'cmdCamera',
    'cmdCruise', 'cmdLights', 'cmdHighBeam', 'cmdInfotainment', 'cmdLiftAxle', 'cmdWipers'];
  // Prendidos en la muestra, como se ven con el motor en marcha y las luces
  // puestas: el texto explica el azul.
  const CMDS_ON = ['cmdEngine', 'cmdLights'];
  const ADD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';

  const SECTIONS = [
    { id: 'start', fig: 'map' },
    { id: 'status' },
    { id: 'gps', legend: MAP_BTNS, kind: 'map', fig: 'phone' },
    { id: 'panel' },
    { id: 'dash', fig: 'dash' },
    { id: 'buttons', cmds: true },
    { id: 'settings', legend: TOP_BTNS, kind: 'top' },
    { id: 'convoy' },
    { id: 'client' },
    { id: 'account' },
  ];

  const $ = (id) => document.getElementById(id);
  let lang = 'en';
  let icons = null;  // id -> markup del icono, cuando llega /app/index.html

  function readLang() {
    try {
      const v = localStorage.getItem(LANG_KEY);
      if (LANGS.includes(v)) return v;
    } catch (e) { /* sin storage: ingles */ }
    return 'en';
  }

  function saveLang(v) {
    try { localStorage.setItem(LANG_KEY, v); } catch (e) { /* no pasa nada */ }
  }

  // Texto del idioma con respaldo en ingles, clave por clave (tambien dentro
  // de los grupos: un idioma puede traer solo parte de h, b, ic...).
  function tx(group, key) {
    const own = GUIDE_TEXT[lang] || {};
    const en = GUIDE_TEXT.en;
    if (key === undefined) return own[group] !== undefined ? own[group] : en[group];
    const g = own[group] || {};
    return g[key] !== undefined ? g[key] : (en[group] || {})[key];
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function iconHtml(id) {
    if (id === 'langSelect') return lang.toUpperCase();
    return icons && icons[id] !== undefined ? icons[id] : '';
  }

  function legendHtml(ids, kind) {
    return '<div class="legend">' + ids.map((id) => {
      const [name, desc] = tx('ic', id) || [id, ''];
      const cls = 'ico ' + kind + (id === 'discordBtn' ? ' discord' : '');
      return `<div class="legItem"><span class="${cls}" data-icon="${id}">${iconHtml(id)}</span>` +
        `<div><b>${esc(name)}</b><span class="d">${esc(desc)}</span></div></div>`;
    }).join('') + '</div>';
  }

  function cmdsHtml() {
    return '<div class="cmdGrid">' + CMDS.map((id) =>
      `<div class="cmd${CMDS_ON.includes(id) ? ' on' : ''}"><span data-icon="${id}">${iconHtml(id)}</span>${esc(tx('cmd', id))}</div>`
    ).join('') + `<div class="cmd add">${ADD_SVG}${esc(tx('cmd', 'add'))}</div></div>`;
  }

  function figureHtml(name) {
    const cls = name === 'phone' ? ' class="phone"' : '';
    return `<figure${cls}><img src="img/${lang}/${name}.webp" data-fallback="img/en/${name}.webp" alt="${esc(tx('cap', name))}" loading="lazy" />` +
      `<figcaption>${esc(tx('cap', name))}</figcaption></figure>`;
  }

  function render() {
    document.documentElement.lang = lang;
    document.title = 'Truck Dash — ' + tx('title');
    $('title').textContent = tx('title');
    $('lead').textContent = tx('lead');
    $('leadApp').textContent = tx('openApp');
    $('openApp').textContent = tx('openApp');
    $('leadDemo').textContent = tx('demo');
    $('tocTitle').textContent = tx('toc');
    $('backTop').textContent = tx('backTop');
    $('privacyLink').textContent = tx('privacy');
    $('supportLink').textContent = tx('support');
    $('langSelect').value = lang;

    $('tocList').innerHTML = SECTIONS.map((s) => `<li><a href="#${s.id}">${esc(tx('h', s.id))}</a></li>`).join('');
    $('sections').innerHTML = SECTIONS.map((s) => {
      let html = `<section id="${s.id}"><h2>${esc(tx('h', s.id))}</h2>${tx('b', s.id)}`;
      if (s.legend) html += `<h3>${esc(tx('legend', s.id))}</h3>` + legendHtml(s.legend, s.kind);
      if (s.cmds) html += cmdsHtml() + (tx('b2', s.id) || '');
      if (s.fig) html += figureHtml(s.fig);
      return html + '</section>';
    }).join('');

    // Si falta la captura de un idioma, la del ingles.
    for (const img of document.querySelectorAll('img[data-fallback]')) {
      img.addEventListener('error', () => {
        if (img.src.indexOf(img.dataset.fallback) === -1) img.src = img.dataset.fallback;
      }, { once: true });
    }
  }

  function fillIcons() {
    for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = iconHtml(el.dataset.icon);
  }

  async function loadIcons() {
    try {
      const res = await fetch('../app/index.html');
      if (!res.ok) return;
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      icons = {};
      for (const id of MAP_BTNS.concat(TOP_BTNS)) {
        const el = doc.getElementById(id);
        if (!el) continue;
        el.querySelectorAll('.mapBtnBadge').forEach((b) => b.remove());
        icons[id] = el.innerHTML.trim();
      }
      for (const id of CMDS) {
        const svg = doc.querySelector('#' + id + ' svg');
        if (svg) icons[id] = svg.outerHTML;
      }
      fillIcons();
    } catch (e) {
      // Sin iconos la guia se lee igual: quedan los nombres.
    }
  }

  function jumpToHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (el) el.scrollIntoView();
  }

  // Capturas en grande al tocarlas.
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = '<img alt="" />';
  box.addEventListener('click', () => box.classList.remove('open'));
  document.body.appendChild(box);
  document.addEventListener('click', (e) => {
    const img = e.target.closest && e.target.closest('figure img');
    if (!img) return;
    box.querySelector('img').src = img.currentSrc || img.src;
    box.classList.add('open');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.remove('open'); });

  $('langSelect').addEventListener('change', (e) => {
    lang = LANGS.includes(e.target.value) ? e.target.value : 'en';
    saveLang(lang);
    render();
    fillIcons();
  });

  lang = readLang();
  render();
  jumpToHash();
  loadIcons();
})();
