// Paginas de las VTC: el directorio (/vtc/), la pagina de una empresa
// (/vtc/?TAG), fundar (/vtc/?new) y una invitacion (/vtc/?invite=CODIGO).
//
// Como en /account/, las reglas las decide la API y aca se muestran sus
// respuestas. Todo lo que escribe la gente (nombres, textos, links) entra al
// DOM como texto, nunca como HTML: ver el().

(function () {
  'use strict';

  const IDIOMAS = window.VTC_I18N;
  const PARAMS = new URLSearchParams(location.search);
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------ API
  const API = (function () {
    // El override por querystring solo en local (ver /account/).
    const local = ['localhost', '127.0.0.1', '[::1]'].indexOf(location.hostname) >= 0;
    const param = local ? PARAMS.get('api') : null;
    return param ? param.replace(/\/+$/, '') : 'https://api.trucksim-dash.com';
  })();

  async function pedir(ruta, opciones) {
    const cfg = Object.assign({ credentials: 'include' }, opciones || {});
    if (cfg.body !== undefined) {
      cfg.headers = Object.assign({ 'Content-Type': 'application/json' }, cfg.headers || {});
      cfg.body = JSON.stringify(cfg.body);
    }
    try {
      const r = await fetch(API + ruta, cfg);
      let datos = null;
      try { datos = await r.json(); } catch (e) { datos = null; }
      return { ok: r.ok, status: r.status, datos: datos || {} };
    } catch (e) {
      return { ok: false, status: 0, datos: {} };
    }
  }
  const mandar = (metodo, ruta, body) => pedir(ruta, { method: metodo, body: body === undefined ? {} : body });

  // ------------------------------------------------------------- idiomas
  const LANG_KEY = 'truckdash_lang';   // la misma que la app y la cuenta
  const NOMBRES_IDIOMA = {
    en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français', pt: 'Português', pl: 'Polski', tr: 'Türkçe', ru: 'Русский',
  };
  let idioma = 'en';                   // nunca el del navegador: solo el elegido a mano
  try { const g = localStorage.getItem(LANG_KEY); if (g && IDIOMAS[g]) idioma = g; } catch (e) {}

  function t(clave, datos) {
    const texto = (IDIOMAS[idioma] && IDIOMAS[idioma][clave]) || IDIOMAS.en[clave];
    if (texto === undefined) return clave;
    return datos ? texto.replace(/\{(\w+)\}/g, (m, k) => (datos[k] !== undefined && datos[k] !== null ? datos[k] : m)) : texto;
  }
  // El error de la API, con sus datos ("te faltan 3 entregas").
  const textoDeError = (datos) => (datos && datos.error && IDIOMAS.en[datos.error] ? t(datos.error, datos) : t('error'));

  // ------------------------------------------------------------- unidades
  const AJUSTES_APP = 'truckdash_settings';   // el mismo objeto que la app
  let enMillas = (function () {
    try { return !!(JSON.parse(localStorage.getItem(AJUSTES_APP)) || {}).useImperial; } catch (e) { return false; }
  })();
  const numero = (v, dec) => v.toLocaleString(idioma, { maximumFractionDigits: dec || 0 });
  const distancia = (km) => (km == null ? '-' : enMillas ? numero(km * 0.621371) + ' mi' : numero(km) + ' km');
  const consumo = (l) => (l == null ? '-' : enMillas ? numero(235.215 / l, 1) + ' mpg' : numero(l, 1) + ' L/100 km');
  const plata = (monto, moneda) => numero(monto) + (moneda ? ' ' + moneda : '');
  function horas(h) {
    if (h == null) return '-';
    const min = Math.round(h * 60);
    return min < 60 ? min + ' min' : numero(h, h < 10 ? 1 : 0) + ' h';
  }
  function fecha(iso, conHora) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString(idioma, conHora
        ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
        : { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return String(iso).slice(0, 10); }
  }
  // "1 day", "7 days": el plural de cada idioma lo sabe el navegador.
  const dias = (n) => new Intl.NumberFormat(idioma, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(n);
  function hace(iso) {
    if (!iso) return '';
    const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(idioma, { numeric: 'auto' });
    for (const [u, n] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
      if (Math.abs(s) >= n) return rtf.format(Math.trunc(s / n), u);
    }
    return rtf.format(0, 'minute');
  }

  // ------------------------------------------------------------------ DOM
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Un elemento con sus atributos y sus hijos. Los textos entran con append(),
  // o sea como texto: un nombre con <script> se ve escrito.
  function el(etiqueta, props, ...hijos) {
    const n = document.createElement(etiqueta);
    let valor;
    Object.keys(props || {}).forEach((k) => {
      const v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'on') Object.keys(v).forEach((e) => n.addEventListener(e, v[e]));
      else if (k === 'vars') Object.keys(v).forEach((c) => n.style.setProperty(c, v[c]));
      else if (k === 'value') valor = v;
      else if (v === true) { if (k in n) n[k] = true; else n.setAttribute(k, ''); }
      else n.setAttribute(k, v);
    });
    hijos.flat(3).forEach((h) => { if (h !== null && h !== undefined && h !== false) n.append(h); });
    // Al final: el valor de un select pide que esten sus opciones.
    if (valor !== undefined) n.value = valor;
    return n;
  }
  function svg(etiqueta, atributos, texto) {
    const n = document.createElementNS(SVG_NS, etiqueta);
    Object.keys(atributos || {}).forEach((k) => n.setAttribute(k, atributos[k]));
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function avisar(texto, tipo) {
    const div = el('div', { class: 'toast ' + (tipo || '') }, texto);
    $('toastContainer').appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 300);
    }, 3500);
  }

  // Un boton que hace un pedido: se traba mientras, y si falla lo dice.
  function boton(texto, clase, hacer) {
    const b = el('button', { type: 'button', class: 'btn ' + (clase || '') }, texto);
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await hacer(b); } finally { b.disabled = false; }
    });
    return b;
  }

  // Lo que no se deshace: el primer toque lo arma y el segundo lo hace.
  function botonArmado(texto, clase, hacer) {
    let armado = false;
    const b = boton(texto, clase, async () => {
      if (!armado) {
        armado = true;
        b.textContent = t('sure');
        setTimeout(() => { armado = false; b.textContent = texto; }, 4000);
        return;
      }
      await hacer();
    });
    return b;
  }

  async function hacerPedido(metodo, ruta, body, alListo, aviso) {
    const r = await mandar(metodo, ruta, body);
    if (!r.ok) { avisar(textoDeError(r.datos), 'bad'); return null; }
    if (aviso) avisar(aviso, 'ok');
    if (alListo) await alListo(r.datos);
    return r.datos;
  }

  function dialogo(titulo, contenido) {
    const d = el('dialog', { class: 'vtc-dialogo', 'aria-label': titulo }, el('h2', {}, titulo), contenido);
    document.body.appendChild(d);
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.showModal();
    return d;
  }

  // ------------------------------------------------------------- colores
  const COLOR_DE_FABRICA = '#3b9eff';
  // Texto negro o blanco segun lo claro que sea el color de la empresa.
  function tintaPara(hex) {
    const n = parseInt((hex || COLOR_DE_FABRICA).slice(1), 16);
    const l = [n >> 16, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] > 0.18 ? '#06121f' : '#ffffff';
  }
  const coloresDe = (v) => ({ '--e': v.color || COLOR_DE_FABRICA, '--e-tinta': tintaPara(v.color) });

  function escudo(v, tamano) {
    const caja = el('span', { class: 'escudo ' + (tamano || ''), vars: coloresDe(v), 'aria-hidden': 'true' });
    const iniciales = () => { caja.textContent = v.tag; };
    if (v.logo_url && /^https:\/\/cdn\.discordapp\.com\//.test(v.logo_url)) {
      caja.append(el('img', { src: v.logo_url, alt: '', loading: 'lazy', on: { error: iniciales } }));
    } else iniciales();
    return caja;
  }
  const etiquetaTag = (v) => el('span', { class: 'tag-vtc', vars: { '--e': v.color || COLOR_DE_FABRICA } }, '[' + v.tag + ']');

  function bandera(codigo) {
    if (!/^[A-Za-z]{2}$/.test(codigo || '')) return null;
    const cc = codigo.toUpperCase();
    let nombre = cc;
    try { nombre = new Intl.DisplayNames([idioma], { type: 'region' }).of(cc) || cc; } catch (e) {}
    return el('span', { class: 'bandera', role: 'img', 'aria-label': nombre, title: nombre },
      String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65));
  }
  // Chromium en Windows no dibuja las banderas de emoji: ver /account/.
  function dibujaBanderas() {
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = '32px sans-serif';
      return ctx.measureText('\u{1F1E6}\u{1F1E8}').width < ctx.measureText('\u{1F1E6}').width * 1.8;
    } catch (e) { return true; }
  }
  function nombreDeIdioma(codigo) {
    try { return new Intl.DisplayNames([idioma], { type: 'language' }).of(codigo) || codigo; } catch (e) { return codigo; }
  }
  function nombreDePais(codigo) {
    try { return new Intl.DisplayNames([idioma], { type: 'region' }).of(codigo) || codigo; } catch (e) { return codigo; }
  }

  function persona(p) {
    if (!p || !p.username) return el('span', { class: 'persona oculta' }, el('span', { class: 'inicial' }, '?'), el('span', {}, t('hiddenDriver')));
    const cara = p.avatar_url
      ? el('img', { src: p.avatar_url, alt: '', loading: 'lazy', on: { error: (e) => e.target.replaceWith(el('span', { class: 'inicial' }, p.username[0].toUpperCase())) } })
      : el('span', { class: 'inicial', 'aria-hidden': 'true' }, p.username[0].toUpperCase());
    return el('a', { class: 'persona', href: '/account/?u=' + encodeURIComponent(p.username) }, cara, el('span', {}, p.username));
  }
  const puestoChip = (p) => (p ? el('span', { class: 'puesto-chip', vars: { '--p': p.color || 'var(--muted)' } }, p.name) : null);
  const juegoChip = (j) => el('span', { class: 'chip chip-juego' }, j.toUpperCase());

  function cargando() { return el('p', { class: 'loading' }, t('loading')); }
  function vacio(clave, datos) { return el('p', { class: 'vacio' }, t(clave, datos)); }
  function tarjeta(titulo, ...contenido) {
    return el('section', { class: 'card' }, titulo ? el('h2', {}, titulo) : null, contenido);
  }

  // Selector con sus opciones: [[valor, texto], ...]
  function selector(opciones, valor, alCambiar, etiqueta) {
    return el('select', { value: valor == null ? '' : valor, 'aria-label': etiqueta, on: alCambiar ? { change: (e) => alCambiar(e.target.value) } : {} },
      opciones.map(([v, texto]) => el('option', { value: v }, texto)));
  }
  function campo(etiqueta, control, pista, ancho) {
    const id = 'c' + Math.random().toString(36).slice(2, 9);
    control.id = id;
    return el('div', { class: 'campo' + (ancho ? ' ancho' : '') }, el('label', { for: id }, etiqueta), control,
      pista instanceof Node ? pista : pista ? el('p', { class: 'pista' }, pista) : null);
  }
  function casilla(texto, marcada) {
    const input = el('input', { type: 'checkbox' });
    input.checked = !!marcada;
    const etq = el('label', { class: 'check-linea' }, input, texto);
    return { input, etq };
  }

  // -------------------------------------------------------------- estado
  let yo = { enabled: true, signed_in: false, vtc: null };
  let pagina = null;        // lo que devolvio /vtc/{tag}
  let vista = null;         // quien pinta, para repintar al cambiar idioma o unidades
  let latido = null;

  function enlace(tag, resto) {
    const q = new URLSearchParams();
    if (PARAMS.get('api')) q.set('api', PARAMS.get('api'));
    const extra = q.toString();
    return '/vtc/?' + (tag ? encodeURIComponent(tag) : '') + (extra ? (tag ? '&' : '') + extra : '') + (resto || '');
  }
  // El primer parametro sin "=": /vtc/?KL
  function tagDeLaDireccion() {
    const primero = location.search.replace(/^\?/, '').split('&')[0];
    if (PARAMS.get('tag')) return PARAMS.get('tag').trim();
    if (!primero || primero.indexOf('=') >= 0) return '';
    try { return decodeURIComponent(primero).trim(); } catch (e) { return primero; }
  }

  function irAEntrar() {
    // La cuenta vuelve aca despues de entrar (ver volverAVtc en account.js).
    try {
      sessionStorage.setItem('truckdash_volver', JSON.stringify({ a: location.pathname + location.search + location.hash, cuando: Date.now() }));
    } catch (e) {}
    location.href = '/account/';
  }

  function pintar(...nodos) {
    $('loading').hidden = true;
    const main = $('main');
    main.replaceChildren(...nodos.flat(3).filter(Boolean));
  }

  // ============================================================ directorio
  const filtros = { q: '', game: '', language: '', country: '', size: '', recruiting: false, sort: 'activity', page: 0 };

  async function verDirectorio() {
    document.title = 'Truck Dash – ' + t('navDirectory');
    const lista = el('div', { class: 'empresas', 'aria-live': 'polite' });
    const pie = el('div', { class: 'paginas' });
    const cuantas = el('p', { class: 'muted small' });
    let opciones = { languages: [], countries: [] };
    let espera = null;

    async function traer() {
      const q = new URLSearchParams();
      Object.keys(filtros).forEach((k) => { if (filtros[k]) q.set(k, filtros[k]); });
      const r = await pedir('/vtc?' + q.toString());
      if (!r.ok) { lista.replaceChildren(vacio('error')); return; }
      opciones = r.datos;
      pintarFiltros();
      cuantas.textContent = t('dirCount', { n: numero(r.datos.total) });
      lista.replaceChildren(...(r.datos.vtcs.length ? r.datos.vtcs.map(tarjetaDeEmpresa) : [vacio('dirEmpty')]));
      pie.replaceChildren(
        ...(filtros.page ? [boton(t('prev'), 'chico', () => { filtros.page--; return traer(); })] : []),
        ...((filtros.page + 1) * 50 < r.datos.total ? [boton(t('next'), 'chico', () => { filtros.page++; return traer(); })] : []));
    }

    const barra = el('div', { class: 'filtros' });
    function cambiar(clave) { return (v) => { filtros[clave] = v; filtros.page = 0; traer(); }; }
    const buscador = el('input', { type: 'search', placeholder: t('dirSearch'), 'aria-label': t('dirSearch'), value: filtros.q });
    buscador.addEventListener('input', () => {
      clearTimeout(espera);
      espera = setTimeout(() => { filtros.q = buscador.value.trim(); filtros.page = 0; traer(); }, 350);
    });
    function pintarFiltros() {
      const rec = casilla(t('recruiting'), filtros.recruiting);
      rec.input.addEventListener('change', () => cambiar('recruiting')(rec.input.checked));
      barra.replaceChildren(buscador,
        selector([['', t('anyGame')], ['ets2', 'ETS2'], ['ats', 'ATS']], filtros.game, cambiar('game'), t('fGames')),
        selector([['', t('anyLanguage')]].concat(opciones.languages.map((l) => [l, nombreDeIdioma(l)])), filtros.language, cambiar('language'), t('fLanguage')),
        selector([['', t('anyCountry')]].concat(opciones.countries.map((c) => [c, nombreDePais(c)])), filtros.country, cambiar('country'), t('fCountry')),
        selector([['', t('anySize')], ['s', '1-5'], ['m', '6-15'], ['l', '16-40'], ['xl', '41+']], filtros.size, cambiar('size'), t('members')),
        rec.etq,
        selector([['activity', t('sortActivity')], ['members', t('sortMembers')], ['new', t('sortNew')]], filtros.sort, cambiar('sort'), t('sort')));
    }
    pintarFiltros();

    const acciones = el('div', { class: 'botones' });
    if (yo.vtc) acciones.append(el('a', { class: 'btn primary', href: enlace(yo.vtc.tag) }, t('myCompany', { tag: yo.vtc.tag })));
    else if (!yo.signed_in) acciones.append(boton(t('signIn'), 'primary', irAEntrar));
    else acciones.append(el('a', { class: 'btn primary', href: enlace('new') }, t('foundCompany')));

    const misPostulaciones = (yo.applications || []).filter((p) => p.status === 'pending' || p.status === 'rejected').slice(0, 5);
    pintar(
      el('div', { class: 'portada' }, el('h1', {}, t('dirTitle')), el('p', {}, t('dirIntro')), acciones),
      misPostulaciones.length ? tarjeta(t('myApplications'), el('ul', { class: 'lista' }, misPostulaciones.map((p) => el('li', {},
        escudo(p.vtc, 'mini'), el('span', { class: 'crece' }, etiquetaTag(p.vtc), ' ', el('a', { class: 'persona', href: enlace(p.vtc.tag) }, p.vtc.name),
          p.reason ? el('span', { class: 'muted small' }, ' ' + p.reason) : null),
        el('span', { class: 'chip ' + (p.status === 'pending' ? 'warn' : 'bad') }, t('app_' + p.status)),
        p.status === 'pending' ? boton(t('withdraw'), 'chico', () => hacerPedido('POST', '/vtc/apps/' + p.id + '/withdraw', {}, recargarYo)) : null)))) : null,
      barra, cuantas, lista, pie);
    traer();
  }

  function tarjetaDeEmpresa(v) {
    return el('a', { class: 'empresa', href: enlace(v.tag), vars: coloresDe(v) },
      escudo(v),
      el('span', { class: 'nombre' }, etiquetaTag(v), el('b', {}, v.name)),
      el('span', { class: 'slogan' }, v.slogan || ' '),
      el('span', { class: 'datos' },
        el('span', {}, el('b', {}, numero(v.members)), ' ' + t('members').toLowerCase()),
        el('span', {}, el('b', {}, distancia(v.month_km)), ' ' + t('thisMonth').toLowerCase()),
        v.active ? el('span', {}, el('b', {}, distancia(v.month_km / v.active)), ' ' + t('perActive')) : null),
      el('span', { class: 'chips' }, v.games.map(juegoChip), bandera(v.country),
        v.language ? el('span', { class: 'chip' }, nombreDeIdioma(v.language)) : null,
        v.recruiting ? el('span', { class: 'chip ok' }, t('recruiting')) : null,
        v.new ? el('span', { class: 'chip warn' }, t('isNew')) : null));
  }

  // ================================================================ fundar
  const LINKS = ['discord', 'website', 'truckersmp', 'youtube', 'twitch'];
  const NOMBRE_LINK = { discord: 'Discord', website: 'Web', truckersmp: 'TruckersMP', youtube: 'YouTube', twitch: 'Twitch' };
  const IDIOMAS_VTC = ['en', 'de', 'es', 'fr', 'pt', 'pl', 'tr', 'ru', 'it', 'nl', 'cs', 'hu', 'ro', 'sv', 'no', 'da', 'fi', 'uk', 'sk', 'bg', 'hr', 'el', 'lt', 'lv', 'et', 'ja', 'zh', 'ko'];
  const PAISES_VTC = ['AR', 'AT', 'AU', 'BA', 'BE', 'BG', 'BR', 'BY', 'CA', 'CH', 'CL', 'CN', 'CO', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'JP', 'KR', 'LT', 'LU', 'LV', 'MK', 'MX', 'NL', 'NO', 'NZ', 'PE', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE', 'SI', 'SK', 'TR', 'UA', 'US', 'UY', 'VE', 'ZA'];

  // El formulario de la ficha: el mismo al fundar y al editar. Devuelve el
  // nodo y una funcion que junta los datos.
  function formularioDeFicha(v, alFundar) {
    const ordenar = (lista, nombre) => lista.map((c) => [c, nombre(c)]).sort((a, b) => a[1].localeCompare(b[1], idioma));
    const c = {
      slogan: el('input', { type: 'text', maxlength: 100, value: v.slogan || '' }),
      about: el('textarea', { maxlength: 4000, value: v.about || '' }),
      rules: el('textarea', { maxlength: 4000, value: v.rules || '' }),
      requirements: el('textarea', { maxlength: 1000, value: v.requirements || '' }),
      language: selector([['', '-']].concat(ordenar(IDIOMAS_VTC, nombreDeIdioma)), v.language || (alFundar ? idioma : '')),
      country: selector([['', '-']].concat(ordenar(PAISES_VTC, nombreDePais)), v.country || ''),
      min_age: el('input', { type: 'number', min: 13, max: 99, value: v.min_age || '' }),
      color: el('input', { type: 'color', value: v.color || COLOR_DE_FABRICA }),
    };
    const juegos = { ets2: casilla('ETS2', !v.games || v.games.indexOf('ets2') >= 0), ats: casilla('ATS', !v.games || v.games.indexOf('ats') >= 0) };
    const reclutando = casilla(t('fRecruiting'), alFundar ? true : v.recruiting);
    const links = {};
    LINKS.forEach((l) => { links[l] = el('input', { type: 'url', maxlength: 200, value: (v.links || {})[l] || '', placeholder: 'https://' }); });
    const preguntas = [0, 1, 2, 3, 4].map((i) => el('input', { type: 'text', maxlength: 200, value: (v.questions || [])[i] || '', 'aria-label': t('fQuestions') + ' ' + (i + 1) }));
    const nodo = el('div', { class: 'campos' },
      campo(t('fSlogan'), c.slogan, null, true),
      el('div', { class: 'campo' }, el('label', {}, t('fGames')), el('div', { class: 'opciones' }, juegos.ets2.etq, juegos.ats.etq)),
      campo(t('fColor'), c.color),
      campo(t('fLanguage'), c.language), campo(t('fCountry'), c.country),
      campo(t('fMinAge'), c.min_age),
      el('div', { class: 'campo' }, el('label', {}, t('fRecruitingTitle')), reclutando.etq),
      campo(t('fAbout'), c.about, null, true), campo(t('fRules'), c.rules, null, true), campo(t('fRequirements'), c.requirements, null, true),
      LINKS.map((l) => campo(NOMBRE_LINK[l], links[l], l === 'discord' ? t('fDiscordHint') : null)),
      el('div', { class: 'campo ancho' }, el('label', {}, t('fQuestions')), el('div', { class: 'campos una-columna' }, preguntas), el('p', { class: 'pista' }, t('fQuestionsHint'))));
    return {
      nodo,
      datos: () => ({
        slogan: c.slogan.value, about: c.about.value, rules: c.rules.value, requirements: c.requirements.value,
        language: c.language.value, country: c.country.value, min_age: c.min_age.value ? Number(c.min_age.value) : null,
        color: c.color.value === COLOR_DE_FABRICA && !v.color ? null : c.color.value,
        games: ['ets2', 'ats'].filter((j) => juegos[j].input.checked), recruiting: reclutando.input.checked,
        links: LINKS.reduce((o, l) => { if (links[l].value.trim()) o[l] = links[l].value.trim(); return o; }, {}),
        questions: preguntas.map((p) => p.value).filter((p) => p.trim()),
      }),
    };
  }

  function consentimiento() {
    const acepto = casilla(t('acceptPublic'), false);
    return { acepto: acepto.input, nodo: el('div', { class: 'consentimiento' }, el('p', {}, t('publicNotice')), acepto.etq) };
  }

  function verFundar() {
    document.title = 'Truck Dash – ' + t('foundCompany');
    if (!yo.signed_in) {
      pintar(el('div', { class: 'portada' }, el('h1', {}, t('foundCompany')), el('p', {}, t('foundSignIn')),
        el('div', { class: 'botones' }, boton(t('signIn'), 'primary', irAEntrar))));
      return;
    }
    if (yo.vtc) { location.replace(enlace(yo.vtc.tag)); return; }
    const puede = yo.can_found || { can: false };
    if (!puede.can) {
      pintar(el('div', { class: 'portada' }, el('h1', {}, t('foundCompany')),
        el('p', {}, puede.reason === 'vtc_found_requirements' ? t('vtc_found_requirements', puede) : textoDeError({ error: puede.reason })),
        el('div', { class: 'botones' }, el('a', { class: 'btn', href: enlace('') }, t('navDirectory')))));
      return;
    }
    const nombre = el('input', { type: 'text', maxlength: 40, autocomplete: 'off', required: true });
    const tag = el('input', { type: 'text', maxlength: 6, autocomplete: 'off', required: true });
    const pistas = { name: el('p', { class: 'pista', 'aria-live': 'polite' }), tag: el('p', { class: 'pista', 'aria-live': 'polite' }, t('fixedHint')) };
    let espera = null;
    async function revisar() {
      const q = new URLSearchParams();
      if (nombre.value.trim()) q.set('name', nombre.value.trim());
      if (tag.value.trim()) q.set('tag', tag.value.trim());
      const r = await pedir('/vtc/check?' + q.toString());
      if (!r.ok) return;
      [['name', nombre], ['tag', tag]].forEach(([k, control]) => {
        const error = r.datos[k];
        pistas[k].className = 'pista ' + (control.value.trim() ? (error ? 'mal' : 'bien') : '');
        pistas[k].textContent = !control.value.trim() ? (k === 'tag' ? t('fixedHint') : '') : error ? t(error, { min: k === 'tag' ? 2 : 3, max: k === 'tag' ? 6 : 40 }) : t('available');
      });
    }
    [nombre, tag].forEach((i) => i.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(revisar, 350); }));
    const ficha = formularioDeFicha({}, true), consenso = consentimiento();
    const formulario = el('form', { class: 'card' },
      el('div', { class: 'campos' }, campo(t('fName'), nombre, pistas.name), campo(t('fTag'), tag, pistas.tag)),
      el('h3', {}, t('fProfile')), ficha.nodo, el('h3', {}, ''), consenso.nodo,
      el('div', { class: 'botones', style: 'margin-top:1rem' }, el('button', { type: 'submit', class: 'btn primary' }, t('foundCompany'))));
    formulario.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = formulario.querySelector('button[type=submit]');
      b.disabled = true;
      const datos = Object.assign(ficha.datos(), { name: nombre.value, tag: tag.value, accept_public: consenso.acepto.checked });
      const r = await mandar('POST', '/vtc', datos);
      b.disabled = false;
      if (!r.ok) { avisar(textoDeError(r.datos), 'bad'); return; }
      location.href = enlace(r.datos.vtc.tag);
    });
    pintar(el('div', { class: 'portada' }, el('h1', {}, t('foundCompany')), el('p', {}, t('foundIntro'))), formulario);
  }

  // ============================================================ invitacion
  async function verInvitacion(codigo) {
    const r = await pedir('/vtc/invite/' + encodeURIComponent(codigo));
    if (!r.ok) {
      pintar(el('div', { class: 'portada' }, el('h1', {}, t('inviteTitle')), el('p', {}, textoDeError(r.datos)),
        el('div', { class: 'botones' }, el('a', { class: 'btn', href: enlace('') }, t('navDirectory')))));
      return;
    }
    const v = r.datos.vtc;
    const consenso = consentimiento();
    const cuerpo = !yo.signed_in
      ? el('div', { class: 'botones' }, boton(t('signIn'), 'primary', irAEntrar))
      : yo.vtc
        ? el('p', { class: 'vacio' }, t('vtc_already_member'))
        : [consenso.nodo, el('div', { class: 'botones', style: 'margin-top:1rem' }, boton(t('joinCompany', { tag: v.tag }), 'primary', () =>
          hacerPedido('POST', '/vtc/join/' + encodeURIComponent(codigo), { accept_public: consenso.acepto.checked }, () => { location.href = enlace(v.tag); })))];
    ponerColor(v);
    pintar(cabecera(v, {}, []), tarjeta(t('inviteTitle'), el('p', {}, t('inviteBody', { name: v.name, date: fecha(r.datos.expires_at) })), cuerpo));
  }

  // ==================================================== pagina de la empresa
  const PESTANAS = [
    // [hash, clave del texto, quien la ve]
    ['overview', 'tabOverview', () => true],
    ['members', 'tabMembers', (p) => p.relation.member],
    ['ranking', 'tabRanking', () => true],
    ['stats', 'tabStats', (p) => p.relation.member],
    ['trips', 'tabTrips', (p) => p.relation.member],
    ['map', 'tabMap', (p) => p.relation.member],
    ['applications', 'tabApplications', (p) => puede(p, 'applications')],
    ['roles', 'tabRoles', (p) => puede(p, 'roles')],
    ['discord', 'tabDiscord', (p) => puede(p, 'discord')],
    ['settings', 'tabSettings', (p) => p.relation.member],
  ];
  const puede = (p, area, nivel) => {
    const n = (p.relation.permissions || {})[area];
    return n === 'edit' || (n === 'view' && nivel !== 'edit');
  };

  function ponerColor(v) {
    document.documentElement.style.setProperty('--vtc', v.color || COLOR_DE_FABRICA);
    document.documentElement.style.setProperty('--vtc-tinta', tintaPara(v.color));
  }

  function cabecera(v, p, acciones) {
    const n = p.numbers;
    const km = (lista) => (lista || []).reduce((s, j) => s + j.distance_km, 0);
    const entregas = (lista) => (lista || []).reduce((s, j) => s + j.deliveries, 0);
    const links = LINKS.filter((l) => /^https:\/\//.test((v.links || {})[l] || ''));
    return el('section', { class: 'cabeza-vtc' },
      el('div', { class: 'arriba' }, escudo(v, 'grande'),
        el('div', { class: 'quien' }, el('h1', {}, etiquetaTag(v), ' ', v.name), v.slogan ? el('p', { class: 'slogan' }, v.slogan) : null,
          // Hasta 90 dias despues de cambiarlo: como se llamaba (nadie se hace pasar por otra).
          v.former ? el('p', { class: 'muted small antes' }, t('formerly', { old: '[' + v.former.tag + '] ' + v.former.name })) : null,
          el('div', { class: 'chips' }, (v.games || []).map(juegoChip), bandera(v.country),
            v.language ? el('span', { class: 'chip' }, nombreDeIdioma(v.language)) : null,
            v.min_age ? el('span', { class: 'chip' }, v.min_age + '+') : null,
            v.recruiting ? el('span', { class: 'chip ok' }, t('recruiting')) : null,
            links.map((l) => el('a', { class: 'chip', href: v.links[l], target: '_blank', rel: 'noopener nofollow ugc' }, NOMBRE_LINK[l])))),
        el('div', { class: 'acciones-vtc' }, acciones)),
      n ? el('div', { class: 'cinta-vtc' }, [
        [numero(n.members), t('members')], [numero(n.active_this_month), t('activeThisMonth')],
        [distancia(km(n.month)), t('kmThisMonth')], [numero(entregas(n.month)), t('deliveriesThisMonth')], [distancia(km(n.total)), t('kmTotal')],
      ].map(([valor, texto]) => el('div', {}, el('b', {}, valor), el('span', {}, texto)))) : null);
  }

  async function verEmpresa(tag) {
    const r = await pedir('/vtc/' + encodeURIComponent(tag));
    if (!r.ok) {
      pintar(el('div', { class: 'portada' }, el('h1', {}, t('vtc_not_found')),
        el('div', { class: 'botones' }, el('a', { class: 'btn', href: enlace('') }, t('navDirectory')))));
      return;
    }
    pagina = r.datos;
    // Un link con el tag de antes de un cambio: la API da la empresa, y la direccion pasa al de ahora.
    if (pagina.vtc.tag.toLowerCase() !== String(tag).toLowerCase() && !PARAMS.get('invite')) {
      try { history.replaceState(null, '', enlace(pagina.vtc.tag, location.hash)); } catch (e) { /* sin historial */ }
    }
    document.title = '[' + pagina.vtc.tag + '] ' + pagina.vtc.name + ' – Truck Dash';
    ponerColor(pagina.vtc);
    pintarEmpresa();
  }
  const recargarEmpresa = () => verEmpresa(pagina.vtc.tag);

  function pintarEmpresa() {
    clearInterval(latido);
    // El mapa se arma de nuevo al volver a su pestana: uno vivo afuera de la
    // pagina se queda con un contexto de WebGL.
    if (window.VtcMapa) VtcMapa.cerrar();
    const p = pagina, v = p.vtc, rel = p.relation;
    const acciones = [];
    if (!rel.member) {
      if (!p.signed_in) acciones.push(v.recruiting ? boton(t('signInToApply'), 'vtc', irAEntrar) : null);
      else if (rel.application) {
        acciones.push(el('span', { class: 'chip warn' }, t('app_pending')),
          boton(t('withdraw'), 'chico', () => hacerPedido('POST', '/vtc/apps/' + rel.application + '/withdraw', {}, recargarEmpresa)));
      } else if (rel.other_vtc) acciones.push(el('span', { class: 'chip' }, t('inOther', { tag: rel.other_vtc.tag })));
      else if (v.recruiting) acciones.push(boton(t('apply'), 'vtc', async () => dialogoPostular(v)));
    }
    acciones.push(boton(t('recruitImage'), '', async () => dialogoTarjeta(p)));

    const actual = (location.hash || '#overview').slice(1);
    const visibles = PESTANAS.filter(([, , ve]) => ve(p));
    const elegida = visibles.find(([h]) => h === actual) || visibles[0];
    const pendientes = p.pending || {};
    const numeritos = { applications: pendientes.applications, trips: pendientes.review };
    const cuerpo = el('div', {});
    pintar(
      v.hidden ? el('p', { class: 'notice warn' }, t('hiddenNotice')) : null,
      cabecera(v, p, acciones),
      rel.member ? barraDelMiembro() : null,
      el('nav', { class: 'pestanas-vtc', 'aria-label': v.name }, visibles.map(([h, clave]) => el('a', {
        href: '#' + h, 'aria-current': h === elegida[0] ? 'page' : null,
      }, t(clave), numeritos[h] ? el('span', { class: 'numerito' }, numeritos[h]) : null))),
      cuerpo,
      !rel.member && p.signed_in ? el('p', { class: 'muted small' }, el('button', { type: 'button', class: 'linkish', on: { click: () => dialogoReportar(v) } }, t('report'))) : null);
    // En el celular las pestanas se corren: la elegida, a la vista.
    const marcada = document.querySelector('.pestanas-vtc [aria-current]');
    if (marcada) marcada.parentNode.scrollLeft = marcada.offsetLeft - marcada.parentNode.offsetLeft - (marcada.parentNode.clientWidth - marcada.offsetWidth) / 2;
    VISTAS[elegida[0]](cuerpo, p);
  }

  // Para que son mis viajes, y el rango que viene.
  function barraDelMiembro() {
    const m = yo.member;
    if (!m) return null;
    const caja = el('div', { class: 'modo-vtc' });
    const cambiar = (modo) => hacerPedido('PATCH', '/vtc/me', { mode: modo }, (d) => { m.mode = d.mode; caja.replaceWith(barraDelMiembro()); }, t('modeSaved'));
    const opcion = (modo, texto) => el('button', { type: 'button', class: modo, 'aria-pressed': String(m.mode === modo), on: { click: () => m.mode !== modo && cambiar(modo) } }, texto);
    const base = m.rank ? m.rank.min_km : 0, meta = m.next_rank ? m.next_rank.min_km : null;
    const parte = meta ? Math.max(0, Math.min(1, (m.distance_km - base) / (meta - base || 1))) : 1;
    caja.append(el('span', { class: 'que' }, t('myTripsFor')),
      el('span', { class: 'interruptor', role: 'group', 'aria-label': t('myTripsFor') }, opcion('vtc', '[' + yo.vtc.tag + ']'), opcion('personal', t('modePersonal'))),
      el('div', { class: 'rango' },
        el('span', { class: 'small' }, m.rank ? el('b', { vars: { color: m.rank.color || 'inherit' } }, m.rank.name) : null, ' ',
          el('span', { class: 'muted' }, meta ? t('toNextRank', { km: distancia(Math.max(0, meta - m.distance_km)), rank: m.next_rank.name }) : distancia(m.distance_km))),
        el('div', { class: 'barra-rango' }, el('i', { vars: { width: Math.round(parte * 100) + '%' } }))));
    return caja;
  }

  function dialogoPostular(v) {
    const mensaje = el('textarea', { maxlength: 1000 });
    const respuestas = (v.questions || []).map((q) => ({ q, control: el('textarea', { maxlength: 500 }) }));
    const consenso = consentimiento();
    const cuerpo = el('div', { class: 'campos' }, campo(t('applyMessage'), mensaje, null, true),
      respuestas.map((r) => campo(r.q, r.control, null, true)), el('div', { class: 'campo ancho' }, consenso.nodo));
    const d = dialogo(t('applyTitle', { name: v.name }), el('div', {}, v.requirements ? [el('h3', {}, t('fRequirements')), el('p', { class: 'texto-largo' }, v.requirements)] : null, cuerpo,
      el('div', { class: 'botones' }, boton(t('cancel'), '', async () => d.close()), boton(t('apply'), 'vtc', () =>
        hacerPedido('POST', '/vtc/' + v.tag + '/apply', {
          message: mensaje.value, answers: respuestas.map((r) => r.control.value), accept_public: consenso.acepto.checked,
        }, async () => { d.close(); await recargarYo(true); await recargarEmpresa(); }, t('applied'))))));
  }

  function dialogoReportar(v) {
    const motivo = selector(['name', 'content', 'impersonation', 'other'].map((m) => [m, t('report_' + m)]), 'content');
    const texto = el('textarea', { maxlength: 500 });
    const d = dialogo(t('report'), el('div', {}, campo(t('reportReason'), motivo), campo(t('reportText'), texto),
      el('div', { class: 'botones' }, boton(t('cancel'), '', async () => d.close()), boton(t('send'), 'danger', () =>
        hacerPedido('POST', '/vtc/' + v.tag + '/report', { reason: motivo.value, text: texto.value }, () => d.close(), t('reportSent'))))));
  }

  // --------------------------------------------------------------- pestanas
  const VISTAS = {};

  VISTAS.overview = function (cuerpo, p) {
    const v = p.vtc;
    const izquierda = el('div', {}), derecha = el('div', {});
    if (p.relation.member) {
      const ruta = el('div', {}, cargando()), feed = el('div', {}, cargando());
      izquierda.append(tarjeta(t('onTheRoad'), ruta), tarjeta(t('activity'), feed));
      pintarEnRuta(ruta);
      pintarFeed(feed);
      latido = setInterval(() => { if (!document.hidden) pintarEnRuta(ruta); }, 60000);
    }
    const textos = [['fAbout', v.about], ['fRequirements', v.requirements], ['fRules', v.rules]].filter(([, x]) => x);
    if (textos.length) izquierda.append(tarjeta(null, textos.map(([clave, x]) => [el('h3', {}, t(clave)), el('p', { class: 'texto-largo' }, x)])));
    derecha.append(tarjeta(t('topMonth'), listaDeRanking(p.leaderboard, 'distance')),
      tarjeta(t('achievements'), (p.achievements || []).filter((l, i, todos) => l.unlocked || !todos.slice(0, i).some((o) => !o.unlocked && o.id.split('_')[0] === l.id.split('_')[0])).map(filaLogro)));
    cuerpo.replaceChildren(el('div', { class: 'dos' }, izquierda, derecha), tarjeta(t('team'), organigrama(p.roles)));
  };

  function filaLogro(l) {
    const [tipo, objetivo] = l.id.split('_');
    const n = Number(objetivo);
    const texto = tipo === 'km' ? t('achKm', { km: distancia(n) }) : tipo === 'members' ? t('achMembers', { n: numero(n) }) : t('achDeliveries', { n: numero(n) });
    const avance = tipo === 'km' ? distancia(l.value) + ' / ' + distancia(n) : numero(l.value) + ' / ' + numero(n);
    return el('div', { class: 'logro-vtc' + (l.unlocked ? ' listo' : '') },
      el('span', { class: 'linea' }, el('b', {}, (l.unlocked ? '★ ' : '') + texto), el('span', {}, l.unlocked ? '' : avance)),
      l.unlocked ? null : el('div', { class: 'barra-valor' }, el('i', { vars: { width: Math.round(l.value / l.target * 100) + '%' } })));
  }

  // El arbol de puestos. Los vacios no se muestran, salvo el del dueno.
  function organigrama(puestos) {
    const con = puestos.filter((x) => x.members.length || x.is_owner);
    const TOPE = 24;
    return el('div', { class: 'arbol' }, con.map((x) => el('div', { class: 'nivel' },
      el('span', { class: 'puesto', vars: { '--p': x.color || 'var(--muted)' } }, x.name),
      el('div', { class: 'gente' }, x.members.length ? x.members.slice(0, TOPE).map((m) => el('span', { class: 'ficha', vars: { '--r': (m.rank && m.rank.color) || 'var(--muted)' } },
        persona(m), m.rank ? el('small', {}, m.rank.name) : null)) : el('span', { class: 'vacante' }, t('nobody')),
      x.members.length > TOPE ? el('span', { class: 'vacante' }, t('andMore', { n: x.members.length - TOPE })) : null))));
  }

  async function pintarEnRuta(caja) {
    const r = await pedir('/vtc/' + pagina.vtc.tag + '/road');
    if (!r.ok) { caja.replaceChildren(vacio('error')); return; }
    caja.replaceChildren(r.datos.drivers.length ? el('ul', { class: 'lista en-ruta' }, r.datos.drivers.map((d) => el('li', {},
      // La API ya no manda los viajes personales (27-11); esto queda por una API vieja.
      el('span', { class: 'punto' + (d.for_vtc ? '' : ' personal'), title: d.for_vtc ? pagina.vtc.tag : t('modePersonal') }),
      persona(d), el('span', { class: 'crece small' },
        // De un viaje personal solo se sabe por donde anda.
        d.for_vtc ? [d.city_src || '?', ' → ', d.city_dst || '?', d.cargo ? el('span', { class: 'muted' }, ' · ' + d.cargo) : null] : t('modePersonal'),
        d.near ? el('span', { class: 'muted' }, ' · ' + t('near', { city: d.near.city })) : null),
      d.for_vtc ? el('span', { class: 'valor small' }, distancia(d.distance_tracked_km), d.distance_planned_km ? el('span', { class: 'muted' }, ' / ' + distancia(d.distance_planned_km)) : null) : null)))
      : vacio('nobodyDriving'));
  }

  async function pintarFeed(caja, antes) {
    const r = await pedir('/vtc/' + pagina.vtc.tag + '/feed?limit=12' + (antes ? '&before=' + antes : ''));
    if (!r.ok) { if (!antes) caja.replaceChildren(vacio('error')); return; }
    let lista = caja.querySelector('ul');
    if (!antes || !lista) { lista = el('ul', { class: 'lista renglones' }); caja.replaceChildren(lista); }
    r.datos.events.forEach((e) => lista.append(renglonDeFeed(e)));
    if (!lista.children.length) caja.replaceChildren(vacio('feedEmpty'));
    const viejo = caja.querySelector('.mas');
    if (viejo) viejo.remove();
    if (r.datos.more) {
      const ultimo = r.datos.events[r.datos.events.length - 1].id;
      const b = boton(t('showMore'), 'chico mas', () => pintarFeed(caja, ultimo));
      caja.append(b);
    }
  }

  function renglonDeFeed(e) {
    const x = e.trip;
    let texto;
    if (x) {
      texto = [el('span', {}, t('feed_' + e.type)), ' ', x.city_src || '?', ' → ', x.city_dst || '?', x.cargo ? el('span', { class: 'muted' }, ' · ' + x.cargo) : null,
        e.type === 'delivered' ? [' · ', el('b', {}, distancia(x.distance_km))] : null,
        e.type === 'delivered' && x.on_time === false ? [' ', el('span', { class: 'chip warn' }, t('late'))] : null,
        x.drive_mode === 'race' ? [' ', el('span', { class: 'chip' }, t('race'))] : null,
        e.type === 'delivered' && !x.counts ? [' ', el('span', { class: 'chip bad' }, t('notCounted'))] : null];
    } else if (e.type === 'renamed') {
      texto = t('feed_renamed', { old: '[' + e.from_tag + '] ' + e.from_name, new: '[' + e.to_tag + '] ' + e.to_name });
    } else texto = t('feed_' + e.type, { rank: e.rank, role: e.role });
    return el('li', {}, e.user ? persona(e.user) : null, el('span', { class: 'crece small' }, texto), el('span', { class: 'cuando', title: fecha(e.at, true) }, hace(e.at)));
  }

  // --------------------------------------------------------------- miembros
  const estado = { periodoMiembros: 'month', juegoMiembros: '', orden: 'distance_km', periodo: 'month', metrica: 'distance', juego: '', statsPeriodo: 'month', revision: false, mapaJuego: '', mapaPeriodo: 'month' };
  const opcionesPeriodo = () => ['week', 'month', 'last_month', 'year', 'total'].map((x) => [x, t('period_' + x)]);
  const opcionesJuego = () => [['', t('anyGame')]].concat((pagina.vtc.games || []).map((j) => [j, j.toUpperCase()]));

  VISTAS.members = async function (cuerpo, p) {
    const tabla = el('div', { class: 'tabla-caja' }, cargando());
    const recargar = () => VISTAS.members(cuerpo, p);
    cuerpo.replaceChildren(el('section', { class: 'card' },
      el('div', { class: 'filtros' },
        selector(opcionesPeriodo(), estado.periodoMiembros, (x) => { estado.periodoMiembros = x; recargar(); }, t('period')),
        selector(opcionesJuego(), estado.juegoMiembros, (x) => { estado.juegoMiembros = x; recargar(); }, t('fGames'))), tabla));
    const r = await pedir('/vtc/' + p.vtc.tag + '/members?period=' + estado.periodoMiembros + (estado.juegoMiembros ? '&game=' + estado.juegoMiembros : ''));
    if (!r.ok) { tabla.replaceChildren(vacio('error')); return; }
    pintarTablaDeMiembros(tabla, r.datos, recargar);
  };

  function pintarTablaDeMiembros(caja, datos, recargar) {
    // [clave, titulo, texto, si menos es mejor]
    const columnas = [
      ['distance_km', 'colDistance', (s) => distancia(s.distance_km)], ['deliveries', 'colDeliveries', (s) => numero(s.deliveries)],
      ['real_hours', 'colHours', (s) => horas(s.real_hours)], ['on_time_pct', 'colOnTime', (s) => (s.on_time_pct == null ? '-' : numero(s.on_time_pct) + ' %')],
      ['damage_per_1000km', 'colDamage', (s) => (s.damage_per_1000km == null ? '-' : numero(s.damage_per_1000km, 1) + ' %'), true],
      ['l_per_100km', 'colFuel', (s) => consumo(s.l_per_100km), true], ['last_delivery', 'colLast', (s) => hace(s.last_delivery)]];
    const col = columnas.find((c) => c[0] === estado.orden) || columnas[0];
    const filas = datos.members.slice().sort((a, b) => {
      const x = a.stats && a.stats[col[0]], y = b.stats && b.stats[col[0]];
      if (x == null || y == null) return (x == null) - (y == null);
      const d = x < y ? -1 : x > y ? 1 : 0;
      return col[3] ? d : -d;
    });
    const cuerpo = el('tbody', {});
    filas.forEach((m) => {
      const fila = el('tr', { class: 'fila' }, el('td', {}, persona(m)), el('td', { class: 'ancho-solo' }, puestoChip(m.role)),
        el('td', { class: 'ancho-solo' }, m.rank ? el('span', { vars: { color: m.rank.color || 'inherit' }, title: m.manual_rank ? t('manualRank') : '' }, m.rank.name + (m.manual_rank ? ' *' : '')) : '-'),
        columnas.map((c) => el('td', { class: 'num' }, m.stats ? c[2](m.stats) : '-')));
      cuerpo.append(fila);
      fila.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        const abierto = fila.nextSibling && fila.nextSibling.classList && fila.nextSibling.classList.contains('abajo');
        cuerpo.querySelectorAll('.abajo').forEach((x) => x.remove());
        if (!abierto) fila.after(el('tr', { class: 'abajo' }, el('td', { class: 'panel', colspan: String(3 + columnas.length) }, panelDeMiembro(m, datos, recargar))));
      });
    });
    caja.replaceChildren(el('table', { class: 'vtc' }, el('thead', {}, el('tr', {}, el('th', {}, t('colDriver')), el('th', { class: 'ancho-solo' }, t('colRole')), el('th', { class: 'ancho-solo' }, t('colRank')),
      columnas.map((c) => el('th', { class: 'num' }, el('button', { type: 'button', 'aria-sort': c === col ? 'descending' : null, on: { click: () => { estado.orden = c[0]; pintarTablaDeMiembros(caja, datos, recargar); } } },
        t(c[1]) + (c === col ? ' ▾' : '')))))), cuerpo));
  }

  function panelDeMiembro(m, datos, recargar) {
    const tag = pagina.vtc.tag;
    const info = el('p', { class: 'muted small' }, [m.role && m.role.name, m.rank && m.rank.name].filter(Boolean).join(' · '), ' · ', t('memberSince', { date: fecha(m.joined_at) }), ' · ', t('kmTotal') + ' ' + distancia(m.total_km),
      m.mode ? [' · ', m.mode === 'vtc' ? '[' + tag + ']' : t('modePersonal')] : null);
    if (!m.manageable) return el('div', {}, info);
    const cambiar = (cuerpo) => hacerPedido('PATCH', '/vtc/' + tag + '/members/' + m.member_id, cuerpo, recargar, t('saved'));
    const puestos = datos.roles.filter((x) => !x.is_owner);
    return el('div', {}, info, el('div', { class: 'filtros' },
      el('label', {}, t('colRole'), selector(puestos.map((x) => [x.id, x.name]), m.role && m.role.id, (x) => cambiar({ role_id: x }), t('colRole'))),
      el('label', {}, t('colRank'), selector([['', t('automaticRank')]].concat(datos.ranks.map((x) => [x.id, x.name])), m.manual_rank ? m.rank.id : '', (x) => cambiar({ rank_id: x || null }), t('colRank')))),
    el('div', { class: 'botones' },
      botonArmado(t('kick'), 'danger chico', () => hacerPedido('POST', '/vtc/' + tag + '/members/' + m.member_id + '/kick', {}, recargar, t('saved'))),
      pagina.relation.owner ? botonArmado(t('makeOwner'), 'chico', () => hacerPedido('POST', '/vtc/' + tag + '/transfer', { member_id: m.member_id }, async () => { await recargarYo(true); await recargarEmpresa(); }, t('saved'))) : null));
  }

  // --------------------------------------------------------------- rankings
  const VALOR = {
    distance: (x) => distancia(x), deliveries: (x) => numero(x), hours: (x) => horas(x), on_time: (x) => numero(x) + ' %',
    care: (x) => numero(x, 1) + ' % / 1000 km', tonnes: (x) => numero(x) + ' t', economy: (x) => consumo(x),
  };
  function listaDeRanking(filas, metrica) {
    if (!filas || !filas.length) return vacio('rankingEmpty');
    const maximo = Math.max(...filas.map((f) => f.value));
    return el('ol', { class: 'lista' }, filas.map((f) => el('li', { class: f.me ? 'yo' : '' }, el('span', { class: 'puesto-num' }, String(f.position)),
      el('span', { class: 'crece' }, persona(f), el('div', { class: 'barra-valor' }, el('i', { vars: { width: Math.round((maximo ? f.value / maximo : 0) * 100) + '%' } }))),
      el('span', { class: 'valor' }, VALOR[metrica](f.value)))));
  }

  VISTAS.ranking = async function (cuerpo, p) {
    const lista = el('div', {}, cargando());
    const recargar = () => VISTAS.ranking(cuerpo, p);
    const minimos = { on_time: 'minOnTime', care: 'minCare', economy: 'minEconomy' }[estado.metrica];
    cuerpo.replaceChildren(el('section', { class: 'card' },
      el('div', { class: 'filtros' },
        selector(Object.keys(VALOR).map((m) => [m, t('metric_' + m)]), estado.metrica, (x) => { estado.metrica = x; recargar(); }, t('metric')),
        selector(opcionesPeriodo(), estado.periodo, (x) => { estado.periodo = x; recargar(); }, t('period')),
        selector(opcionesJuego(), estado.juego, (x) => { estado.juego = x; recargar(); }, t('fGames'))),
      lista, el('p', { class: 'muted small' }, (minimos ? t(minimos) + ' ' : '') + t('rankingRules'))));
    const r = await pedir('/vtc/' + p.vtc.tag + '/leaderboard?metric=' + estado.metrica + '&period=' + estado.periodo + (estado.juego ? '&game=' + estado.juego : ''));
    lista.replaceChildren(r.ok ? listaDeRanking(r.datos.leaderboard, estado.metrica) : vacio('error'));
  };

  // ----------------------------------------------------------- estadisticas
  VISTAS.stats = async function (cuerpo, p) {
    const caja = el('div', {}, cargando());
    const recargar = () => VISTAS.stats(cuerpo, p);
    cuerpo.replaceChildren(el('div', { class: 'filtros', style: 'margin-top:1rem' },
      selector(opcionesPeriodo(), estado.statsPeriodo, (x) => { estado.statsPeriodo = x; recargar(); }, t('period'))), caja);
    const r = await pedir('/vtc/' + p.vtc.tag + '/stats?period=' + estado.statsPeriodo);
    if (!r.ok) { caja.replaceChildren(vacio('error')); return; }
    const d = r.datos;
    const grafico = el('div', { class: 'grafico-vtc' });
    caja.replaceChildren(
      ...(d.totals.length ? d.totals.map((j) => tarjeta(j.game.toUpperCase(),
        el('div', { class: 'cifras' }, [
          [numero(j.deliveries), 'colDeliveries'], [distancia(j.distance_km), 'colDistance'], [horas(j.real_hours), 'colHours'],
          [j.with_deadline ? numero(j.on_time / j.with_deadline * 100) + ' %' : '-', 'colOnTime'], [numero(j.tonnes) + ' t', 'metric_tonnes'],
          [numero(j.drivers), 'drivers'],
        ].concat(j.race ? [[numero(j.race), 'raceTrips']] : []).concat(j.car_jobs ? [[numero(j.car_jobs), 'carJobs']] : []).concat(j.bus_jobs ? [[numero(j.bus_jobs), 'busJobs']] : [])
          .concat(j.money.map((m) => [plata(m.revenue, m.currency), 'earned']))
          .map(([x, clave]) => el('div', {}, el('b', {}, x), el('span', {}, t(clave))))),
        topsDe(d.tops[j.game]))) : [tarjeta(null, vacio('statsEmpty'))]),
      tarjeta(t('kmPerWeek'), grafico));
    pintarGrafico(grafico, d.activity);
  };

  function topsDe(x) {
    if (!x) return null;
    const lista = (clave, items, texto) => (items && items.length ? el('div', {}, el('h4', {}, t(clave)), el('ol', {}, items.map((i) => el('li', {}, texto(i), ' ', el('span', {}, numero(i.trips)))))) : null);
    const region = (r) => (r.code && r.country === r.code ? nombreDePais(r.code) : r.name || r.code);
    return el('div', { class: 'tops tres' }, lista('topCargo', x.cargo, (i) => i.name), lista('topRoutes', x.routes, (i) => i.from + ' → ' + i.to),
      lista('topCities', x.cities, (i) => i.name), lista('topCompanies', x.companies, (i) => i.name), lista('topRegions', x.regions, region));
  }

  // Km por semana de los ultimos seis meses. Las semanas sin nada tambien:
  // un hueco dice algo.
  function pintarGrafico(caja, actividad) {
    const DIA = 86400000, hoy = new Date();
    const lunes = (d) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); return new Date(x - ((x.getUTCDay() + 6) % 7) * DIA); };
    const semanas = [];
    for (let i = 25; i >= 0; i--) semanas.push({ inicio: new Date(lunes(hoy) - i * 7 * DIA), km: 0 });
    const indice = new Map(semanas.map((s, i) => [s.inicio.getTime(), i]));
    actividad.forEach((a) => {
      const i = indice.get(lunes(new Date(a.date + 'T00:00:00Z')).getTime());
      if (i !== undefined) semanas[i].km += a.distance_km;
    });
    const ancho = Math.max(300, caja.clientWidth || 600), alto = 160, base = 130, paso = ancho / semanas.length;
    const maximo = Math.max(...semanas.map((s) => s.km));
    const texto = (f) => f.toLocaleDateString(idioma, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const dibujo = svg('svg', { viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': semanas.filter((s) => s.km).map((s) => texto(s.inicio) + ': ' + distancia(s.km)).join(', ') });
    const cada = ancho < 480 ? 6 : 3;
    semanas.forEach((s, i) => {
      const h = maximo ? s.km / maximo * (base - 20) : 0;
      const barra = svg('rect', { class: 'barra' + (s.km ? '' : ' vacia'), x: i * paso + paso * 0.15, width: paso * 0.7, y: base - Math.max(h, 1.5), height: Math.max(h, 1.5), rx: 2 });
      barra.appendChild(svg('title', {}, texto(s.inicio) + ': ' + distancia(s.km)));
      dibujo.appendChild(barra);
      if (s.km && s.km === maximo) dibujo.appendChild(svg('text', { class: 'tope', x: Math.min(Math.max(i * paso + paso / 2, 30), ancho - 30), y: base - h - 5, 'text-anchor': 'middle' }, distancia(s.km)));
      if ((semanas.length - 1 - i) % cada === 0) dibujo.appendChild(svg('text', { x: Math.min(Math.max(i * paso + paso / 2, 22), ancho - 22), y: alto - 8, 'text-anchor': 'middle' }, texto(s.inicio)));
    });
    caja.replaceChildren(dibujo);
  }

  // ------------------------------------------------------------------- mapa
  // Los recorridos de los viajes hechos para la empresa, un color por chofer
  // (mapa.js). De los personales nada: la API no los manda.
  VISTAS.map = async function (cuerpo, p) {
    const juegos = (p.vtc.games && p.vtc.games.length) ? p.vtc.games : ['ets2', 'ats'];
    if (!juegos.includes(estado.mapaJuego)) estado.mapaJuego = juegos[0];
    const juego = estado.mapaJuego, periodo = estado.mapaPeriodo;
    const recargar = () => VISTAS.map(cuerpo, p);
    const lienzo = el('div', { class: 'mapa-vtc' });
    const aviso = el('p', { class: 'mapa-aviso-vtc', role: 'status' }, t('mapLoading'));
    const resumen = el('p', { class: 'muted small' });
    const leyenda = el('div', { class: 'leyenda-vtc', role: 'group', 'aria-label': t('drivers') });
    cuerpo.replaceChildren(el('section', { class: 'card' },
      el('div', { class: 'filtros' },
        juegos.length > 1 ? selector(juegos.map((j) => [j, j.toUpperCase()]), juego, (x) => { estado.mapaJuego = x; recargar(); }, t('fGames')) : null,
        selector(opcionesPeriodo(), periodo, (x) => { estado.mapaPeriodo = x; recargar(); }, t('period'))),
      el('div', { class: 'mapa-caja-vtc' }, lienzo, aviso), resumen, leyenda,
      el('p', { class: 'muted small' }, t('mapOnlyCompany'))));
    const [problema, r] = await Promise.all([
      VtcMapa.abrir(lienzo, juego),
      pedir('/vtc/' + p.vtc.tag + '/map?game=' + juego + '&period=' + periodo),
    ]);
    // Se cambio de pestana, de juego o de periodo mientras tanto
    if (problema === 'cancelado' || !lienzo.isConnected) return;
    if (!r.ok) { aviso.textContent = t('error'); return; }
    const m = r.datos.map, choferes = r.datos.drivers;
    resumen.textContent = m.trips ? t('mapSummary', { trips: numero(m.trips), drivers: numero(choferes.length), cities: numero(m.cities.length) }) : '';
    pintarLeyenda(leyenda, choferes);
    if (problema) { aviso.textContent = t(problema); return; }
    aviso.textContent = m.trips ? '' : t('mapEmpty');
    aviso.hidden = !!m.trips;
    VtcMapa.dibujar(m, juego);
  };

  // Un boton por chofer con su color: tocarlo lo deja adelante en el mapa.
  function pintarLeyenda(caja, choferes) {
    const TOPE = 12;
    let elegido = null;
    const botones = choferes.slice(0, TOPE).map((d, i) => el('button', {
      type: 'button', class: 'chofer-mapa', 'aria-pressed': 'false', vars: { '--c': VtcMapa.color(i) },
      on: { click: () => { elegido = elegido === i ? null : i; VtcMapa.resaltar(elegido); marcar(); } },
    }, el('span', { class: 'muestra', 'aria-hidden': 'true' }),
      el('b', {}, d.user && d.user.username ? d.user.username : t('hiddenDriver')),
      el('span', { class: 'muted' }, t('mapDriverLine', { trips: numero(d.trips), km: distancia(d.km) }))));
    function marcar() { botones.forEach((b, i) => b.setAttribute('aria-pressed', String(i === elegido))); }
    caja.replaceChildren(...botones, choferes.length > TOPE ? el('span', { class: 'muted small' }, t('andMore', { n: choferes.length - TOPE })) : '');
  }

  // ----------------------------------------------------------------- viajes
  VISTAS.trips = async function (cuerpo, p, hoja) {
    hoja = hoja || 0;
    const verCola = puede(p, 'trips');
    const lista = el('div', {}, cargando());
    const recargar = () => VISTAS.trips(cuerpo, p, hoja);
    const cola = casilla(t('onlyReview'), estado.revision);
    cola.input.addEventListener('change', () => { estado.revision = cola.input.checked; VISTAS.trips(cuerpo, p, 0); });
    cuerpo.replaceChildren(el('section', { class: 'card' }, verCola ? el('div', { class: 'filtros' }, cola.etq) : null,
      estado.revision ? el('p', { class: 'muted small' }, t('reviewHelp')) : null, lista));
    const r = await pedir('/vtc/' + p.vtc.tag + '/trips?page=' + hoja + (estado.revision && verCola ? '&review=true' : ''));
    if (!r.ok) { lista.replaceChildren(vacio('error')); return; }
    lista.replaceChildren(r.datos.trips.length ? el('ul', { class: 'lista renglones' }, r.datos.trips.map((x) => renglonDeViaje(x, recargar))) : vacio(estado.revision ? 'reviewEmpty' : 'tripsEmpty'),
      el('div', { class: 'paginas' }, hoja ? boton(t('prev'), 'chico', () => VISTAS.trips(cuerpo, p, hoja - 1)) : '', r.datos.more ? boton(t('next'), 'chico', () => VISTAS.trips(cuerpo, p, hoja + 1)) : ''));
  };

  function chipsDeViaje(x) {
    const chips = [];
    if (x.status === 'cancelled') chips.push(['bad', t('cancelled')]);
    if (x.status === 'delivered' && x.on_time === false) chips.push(['warn', t('late')]);
    if (x.drive_mode === 'race') chips.push(['', t('race')]);
    if (x.modded) chips.push(['', t('reason_modded_economy')]);
    if (x.vtc_review) chips.push([x.vtc_review === 'accepted' ? 'ok' : 'bad', t('review_' + x.vtc_review)]);
    else if (x.integrity === 'excluded') chips.push(['bad', t('notCounted')]);
    else if (x.integrity === 'review') chips.push(['warn', t('toReview')]);
    return chips.map(([clase, texto]) => el('span', { class: 'chip ' + clase }, texto));
  }

  function renglonDeViaje(x, recargar) {
    const detalle = el('div', { class: 'abajo-todo', hidden: true, style: 'flex-basis:100%' });
    const li = el('li', {}, persona(x.user), el('span', { class: 'crece small' }, juegoChip(x.game), ' ', x.city_src || '?', ' → ', x.city_dst || '?', x.cargo ? el('span', { class: 'muted' }, ' · ' + x.cargo) : null, ' ', chipsDeViaje(x)),
      el('span', { class: 'valor' }, distancia(x.distance_game_km || x.distance_tracked_km)), el('span', { class: 'cuando' }, hace(x.delivered_at)),
      el('button', { type: 'button', class: 'btn chico', 'aria-expanded': 'false', on: { click: async (e) => {
        detalle.hidden = !detalle.hidden;
        e.target.setAttribute('aria-expanded', String(!detalle.hidden));
        if (detalle.hidden || detalle.childElementCount) return;
        detalle.replaceChildren(cargando());
        const r = await pedir('/vtc/' + pagina.vtc.tag + '/trips/' + x.id);
        detalle.replaceChildren(r.ok ? detalleDeViaje(r.datos.trip, recargar) : vacio('error'));
      } } }, t('details')), detalle);
    return li;
  }

  function detalleDeViaje(x, recargar) {
    const motivos = (x.integrity_reasons || []).filter((m) => IDIOMAS.en['reason_' + m]);
    const linea = (...partes) => el('p', { class: 'muted small', style: 'margin:.2rem 0' }, partes.filter(Boolean).join(' · '));
    const nodos = [dibujoDeRuta(x.route) || vacio('noRoute'),
      linea([x.company_src, x.company_dst].filter(Boolean).join(' → '), [x.truck_brand, x.truck_name].filter(Boolean).join(' ')),
      linea(x.distance_planned_km ? t('planned') + ' ' + distancia(x.distance_planned_km) : null, x.distance_game_km ? t('driven') + ' ' + distancia(x.distance_game_km) : null,
        t('tracked') + ' ' + distancia(x.distance_tracked_km), x.max_speed ? t('topSpeed') + ' ' + (enMillas ? numero(x.max_speed * 0.621371) + ' mph' : numero(x.max_speed) + ' km/h') : null,
        x.damage_delta ? t('damage') + ' ' + numero(x.damage_delta, 1) + ' %' : null),
      x.revenue && x.currency && x.status === 'delivered' && !x.modded ? linea(plata(x.revenue, x.currency)) : null];
    if (motivos.length) nodos.push(el('ul', { class: 'small' }, motivos.map((m) => el('li', {}, t('reason_' + m)))));
    if (x.vtc_review_reason) nodos.push(linea(t('reviewReason') + ': ' + x.vtc_review_reason));
    if (puede(pagina, 'trips', 'edit') && x.status === 'delivered') {
      const motivo = el('input', { type: 'text', maxlength: 300, placeholder: t('reviewReason'), 'aria-label': t('reviewReason') });
      const decidir = (decision) => hacerPedido('POST', '/vtc/' + pagina.vtc.tag + '/trips/' + x.id + '/review', { decision, reason: motivo.value }, async () => { await recargarYo(true); recargar(); }, t('saved'));
      nodos.push(el('div', { class: 'filtros', style: 'margin:.6rem 0 0' }, motivo, boton(t('reviewAccept'), 'chico', () => decidir('accepted')), boton(t('reviewExclude'), 'danger chico', () => decidir('excluded'))));
    }
    return nodos.filter(Boolean).length ? el('div', {}, nodos) : null;
  }

  // Por donde fue: norte arriba, un segmento por tramo (ver /account/).
  function dibujoDeRuta(segmentos) {
    const limpios = (segmentos || []).map((s) => s.filter((q) => q.length >= 2)).filter((s) => s.length > 1);
    const puntos = limpios.flat();
    if (puntos.length < 2) return null;
    const xs = puntos.map((q) => q[0]), zs = puntos.map((q) => q[1]);
    const minX = xs.reduce((a, b) => Math.min(a, b)), maxX = xs.reduce((a, b) => Math.max(a, b));
    const minZ = zs.reduce((a, b) => Math.min(a, b)), maxZ = zs.reduce((a, b) => Math.max(a, b));
    const ancho = maxX - minX || 1, alto = maxZ - minZ || 1, aire = Math.max(ancho, alto) * 0.06;
    const d = svg('svg', { class: 'ruta', viewBox: [minX - aire, minZ - aire, ancho + 2 * aire, alto + 2 * aire].join(' '), preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    d.style.cssText = 'display:block;width:100%;max-height:220px;margin:.5rem 0';
    limpios.forEach((s) => d.appendChild(svg('polyline', { points: s.map((q) => q[0] + ',' + q[1]).join(' '), fill: 'none', stroke: 'var(--vtc)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round' })));
    return d;
  }

  // ---------------------------------------------------------- postulaciones
  VISTAS.applications = async function (cuerpo, p) {
    const tag = p.vtc.tag, editar = puede(p, 'applications', 'edit');
    const recargar = async () => { await refrescarNumeritos(); VISTAS.applications(cuerpo, p); };
    const lista = el('div', {}, cargando()), invitaciones = el('div', {});
    cuerpo.replaceChildren(tarjeta(t('tabApplications'), lista), editar ? tarjeta(t('invites'), el('p', { class: 'muted small' }, t('invitesHelp')), invitaciones) : '');
    const r = await pedir('/vtc/' + tag + '/applications');
    lista.replaceChildren(!r.ok ? vacio('error') : r.datos.applications.length ? el('ul', { class: 'lista' }, r.datos.applications.map((a) => {
      const n = a.numbers;
      const motivo = el('input', { type: 'text', maxlength: 300, placeholder: t('rejectReason'), 'aria-label': t('rejectReason') });
      return el('li', {}, persona(a.user), el('span', { class: 'cuando' }, hace(a.created_at)),
        el('div', { class: 'crece', style: 'flex-basis:100%' },
          el('p', { class: 'small' }, t('applicantNumbers', { deliveries: numero(n.delivered), km: distancia(n.distance_km), hours: horas(n.real_hours), onTime: n.on_time_pct == null ? '-' : numero(n.on_time_pct) + ' %', days: numero(n.account_days) })),
          a.message ? el('p', { class: 'texto-largo' }, a.message) : null,
          a.answers.map((x) => [el('h3', {}, x.q), el('p', { class: 'texto-largo' }, x.a)]),
          editar ? el('div', { class: 'filtros' }, boton(t('accept'), 'vtc chico', () => hacerPedido('POST', '/vtc/' + tag + '/applications/' + a.id + '/accept', {}, recargar, t('saved'))),
            motivo, boton(t('reject'), 'danger chico', () => hacerPedido('POST', '/vtc/' + tag + '/applications/' + a.id + '/reject', { reason: motivo.value }, recargar, t('saved')))) : null));
    })) : vacio('applicationsEmpty'));
    if (editar) pintarInvitaciones(invitaciones, tag);
  };

  async function pintarInvitaciones(caja, tag) {
    const r = await pedir('/vtc/' + tag + '/invites');
    if (!r.ok) { caja.replaceChildren(vacio('error')); return; }
    const plazo = selector([1, 7, 30].map((n) => [n, dias(n)]), 7, null, t('expires'));
    const direccion = (codigo) => location.origin + '/vtc/?invite=' + codigo;
    const copiar = (codigo) => boton(t('copyLink'), 'chico', async () => {
      try { await navigator.clipboard.writeText(direccion(codigo)); avisar(t('copied'), 'ok'); } catch (e) { avisar(direccion(codigo), 'ok'); }
    });
    caja.replaceChildren(el('div', { class: 'filtros' }, plazo, boton(t('newInvite'), 'chico', () => hacerPedido('POST', '/vtc/' + tag + '/invites', { days: Number(plazo.value) }, () => pintarInvitaciones(caja, tag)))),
      el('ul', { class: 'lista' }, r.datos.invites.map((i) => el('li', {}, el('span', { class: 'crece mono' }, i.code), el('span', { class: 'cuando' }, t('expiresOn', { date: fecha(i.expires_at) })), copiar(i.code),
        boton(t('remove'), 'danger chico', () => hacerPedido('DELETE', '/vtc/' + tag + '/invites/' + i.code, undefined, () => pintarInvitaciones(caja, tag)))))));
  }

  // --------------------------------------------------------- puestos y rangos
  VISTAS.roles = async function (cuerpo, p) {
    const tag = p.vtc.tag, editar = puede(p, 'roles', 'edit');
    cuerpo.replaceChildren(tarjeta(null, cargando()));
    const r = await pedir('/vtc/' + tag + '/roles');
    if (!r.ok) { cuerpo.replaceChildren(tarjeta(null, vacio('error'))); return; }
    const recargar = () => VISTAS.roles(cuerpo, p);
    const d = r.datos, orden = d.roles.map((x) => x.id);
    const mover = (i, paso) => {
      const nuevo = orden.slice();
      [nuevo[i], nuevo[i + paso]] = [nuevo[i + paso], nuevo[i]];
      return hacerPedido('POST', '/vtc/' + tag + '/roles/order', { order: nuevo }, recargar);
    };
    const puestos = el('ul', { class: 'lista puestos' }, d.roles.map((x, i) => {
      const detalle = el('div', { hidden: true, style: 'flex-basis:100%' });
      const puedeSubir = editar && x.editable && !x.is_owner && d.roles[i - 1] && !d.roles[i - 1].is_owner && d.roles[i - 1].editable;
      const puedeBajar = editar && x.editable && !x.is_owner && d.roles[i + 1] && d.roles[i + 1].editable;
      return el('li', {}, el('span', { class: 'crece' }, puestoChip(x), ' ', el('span', { class: 'muted small' }, numero(x.members)), x.is_default ? [' ', el('span', { class: 'chip' }, t('defaultRole'))] : null),
        editar ? el('span', { class: 'mover' },
          el('button', { type: 'button', title: t('moveUp'), 'aria-label': t('moveUp'), disabled: !puedeSubir, on: { click: () => mover(i, -1) } }, '↑'),
          el('button', { type: 'button', title: t('moveDown'), 'aria-label': t('moveDown'), disabled: !puedeBajar, on: { click: () => mover(i, 1) } }, '↓')) : null,
        x.editable ? el('button', { type: 'button', class: 'btn chico', on: { click: () => {
          detalle.hidden = !detalle.hidden;
          if (!detalle.hidden) detalle.replaceChildren(editorDePuesto(x, d, tag, recargar));
        } } }, t('edit')) : null, detalle);
    }));
    cuerpo.replaceChildren(
      tarjeta(t('rolesTitle'), el('p', { class: 'muted small' }, t('rolesHelp')), puestos, editar ? nuevoPuesto(tag, recargar) : null),
      tarjeta(t('ranksTitle'), el('p', { class: 'muted small' }, t('ranksHelp')), editar ? editorDeRangos(d.ranks, tag, recargar) : el('ul', { class: 'lista' }, d.ranks.map((x) => el('li', {}, el('span', { class: 'crece', vars: { color: x.color || 'inherit' } }, x.name), distancia(x.min_km))))));
  };

  function nuevoPuesto(tag, recargar) {
    const nombre = el('input', { type: 'text', maxlength: 30, placeholder: t('newRole'), 'aria-label': t('newRole') });
    return el('div', { class: 'filtros', style: 'margin-top:.8rem' }, nombre, boton(t('add'), 'chico', () => hacerPedido('POST', '/vtc/' + tag + '/roles', { name: nombre.value, permissions: {} }, recargar)));
  }

  function editorDePuesto(x, d, tag, recargar) {
    const nombre = el('input', { type: 'text', maxlength: 30, value: x.name });
    const color = el('input', { type: 'color', value: x.color || '#9aa4b2' });
    const entrada = casilla(t('defaultRoleHelp'), x.is_default);
    const selectores = {};
    const permisos = x.is_owner ? el('p', { class: 'muted small' }, t('ownerAll')) : el('div', { class: 'permisos' }, d.areas.map((a) => {
      const mio = d.mine[a];
      const s = selector([['', t('permNone')], ['view', t('permView')], ['edit', t('permEdit')]], x.permissions[a] || '', null, t('area_' + a));
      // Solo se ofrece lo que uno tiene (o lo que el puesto ya tenia).
      Array.from(s.options).forEach((o) => {
        if (o.value && o.value !== x.permissions[a] && !(mio === 'edit' || (mio === 'view' && o.value === 'view'))) o.disabled = true;
      });
      selectores[a] = s;
      return el('label', {}, t('area_' + a), s);
    }));
    const guardar = () => {
      const cuerpo = { name: nombre.value, color: color.value };
      if (!x.is_owner) {
        cuerpo.permissions = {};
        d.areas.forEach((a) => { if (selectores[a].value) cuerpo.permissions[a] = selectores[a].value; });
        if (entrada.input.checked && !x.is_default) cuerpo.is_default = true;
      }
      return hacerPedido('PATCH', '/vtc/' + tag + '/roles/' + x.id, cuerpo, recargar, t('saved'));
    };
    return el('div', { class: 'card', style: 'margin:.6rem 0 0;background:var(--bg)' }, el('div', { class: 'campos' }, campo(t('fName'), nombre), campo(t('fColor'), color)), permisos,
      x.is_owner || x.is_default ? null : entrada.etq,
      el('div', { class: 'botones', style: 'margin-top:.8rem' }, boton(t('save'), 'primary chico', guardar),
        x.is_owner || x.is_default ? null : botonArmado(t('deleteRole'), 'danger chico', () => hacerPedido('DELETE', '/vtc/' + tag + '/roles/' + x.id, undefined, recargar, t('saved')))));
  }

  function editorDeRangos(rangos, tag, recargar) {
    const caja = el('div', {});
    const filas = rangos.map((r) => Object.assign({}, r));
    const factor = enMillas ? 0.621371 : 1;
    function pintarFilas() {
      caja.replaceChildren(...filas.map((f, i) => {
        const nombre = el('input', { type: 'text', maxlength: 30, value: f.name, 'aria-label': t('fName') });
        const km = el('input', { type: 'number', min: 0, value: String(Math.round(f.min_km * factor)), 'aria-label': enMillas ? 'mi' : 'km', disabled: i === 0 });
        const color = el('input', { type: 'color', value: f.color || '#9aa4b2', 'aria-label': t('fColor') });
        nombre.addEventListener('input', () => { f.name = nombre.value; });
        // Se guarda en km: sin tocarlo, el valor exacto que ya tenia.
        km.addEventListener('input', () => { f.min_km = Math.round(Number(km.value) / factor); });
        color.addEventListener('input', () => { f.color = color.value; });
        return el('div', { class: 'fila-rango' }, color, nombre, el('span', { class: 'con-unidad' }, km, enMillas ? 'mi' : 'km'), i ? boton('×', 'chico', async () => { filas.splice(i, 1); pintarFilas(); }) : el('span', {}));
      }));
    }
    pintarFilas();
    return el('div', {}, caja, el('div', { class: 'botones' },
      boton(t('addRank'), 'chico', async () => { filas.push({ name: '', min_km: (filas.length ? filas[filas.length - 1].min_km : 0) + 1000, color: '#3b9eff' }); pintarFilas(); }),
      boton(t('save'), 'primary chico', () => hacerPedido('POST', '/vtc/' + tag + '/ranks', { ranks: filas }, recargar, t('saved')))));
  }

  // ---------------------------------------------------------------- Discord
  VISTAS.discord = async function (cuerpo, p) {
    const tag = p.vtc.tag, editar = puede(p, 'discord', 'edit');
    const lista = el('div', {}, cargando());
    const recargar = () => VISTAS.discord(cuerpo, p);
    cuerpo.replaceChildren(tarjeta(t('webhooksTitle'), el('p', { class: 'muted small' }, t('webhooksHelp')), lista));
    const r = await pedir('/vtc/' + tag + '/webhooks');
    if (!r.ok) { lista.replaceChildren(vacio('error')); return; }
    lista.replaceChildren(el('div', {}, r.datos.webhooks.map((g) => editorDeGancho(g, r.datos, tag, editar, recargar)),
      editar && r.datos.webhooks.length < r.datos.max ? el('details', {}, el('summary', { class: 'linkish' }, t('newWebhook')), editorDeGancho(null, r.datos, tag, true, recargar)) : null));
  };

  function editorDeGancho(g, datos, tag, editar, recargar) {
    const url = el('input', { type: 'url', placeholder: g ? t('keepUrl', { hint: g.hint || '' }) : 'https://discord.com/api/webhooks/…', autocomplete: 'off' });
    const nombre = el('input', { type: 'text', maxlength: 40, value: (g && g.label) || '' });
    const o = (g && g.options) || { units: enMillas ? 'mi' : 'km', lang: idioma };
    const sucesos = datos.events.map((s) => [s, casilla(t('event_' + s), g ? g.events.indexOf(s) >= 0 : ['delivered', 'joined', 'promoted'].indexOf(s) >= 0)]);
    const plataOculta = casilla(t('hideMoney'), o.hide_money), nombresOcultos = casilla(t('hideNames'), o.hide_names);
    const juego = selector([['', t('anyGame')], ['ets2', 'ETS2'], ['ats', 'ATS']], o.game || '', null, t('fGames'));
    const unidades = selector([['km', 'km'], ['mi', 'mi']], o.units, null, t('units'));
    const lengua = selector(Object.keys(NOMBRES_IDIOMA).map((l) => [l, NOMBRES_IDIOMA[l]]), o.lang, null, t('fLanguage'));
    const cuerpo = () => Object.assign({
      label: nombre.value, events: sucesos.filter(([, c]) => c.input.checked).map(([s]) => s),
      options: { hide_money: plataOculta.input.checked, hide_names: nombresOcultos.input.checked, game: juego.value || null, units: unidades.value, lang: lengua.value },
    }, url.value.trim() ? { url: url.value.trim() } : {});
    const campos = el('div', {}, el('div', { class: 'campos' }, campo(t('webhookUrl'), url), campo(t('webhookLabel'), nombre)),
      el('h3', {}, t('webhookEvents')), el('div', { class: 'opciones' }, sucesos.map(([, c]) => c.etq)),
      el('h3', {}, t('webhookOptions')), el('div', { class: 'opciones' }, plataOculta.etq, nombresOcultos.etq), el('div', { class: 'filtros', style: 'margin-top:.6rem' }, juego, unidades, lengua));
    if (!g) return el('div', { class: 'card', style: 'background:var(--bg)' }, campos, el('div', { class: 'botones', style: 'margin-top:.8rem' }, boton(t('add'), 'primary chico', () => hacerPedido('POST', '/vtc/' + tag + '/webhooks', cuerpo(), recargar, t('saved')))));
    return el('div', { class: 'card', style: 'background:var(--bg)' },
      el('div', { class: 'cabecera' }, el('b', {}, g.label || 'Discord ' + (g.hint || '')), g.disabled ? el('span', { class: 'chip bad' }, t('webhookOff')) : g.last_error ? el('span', { class: 'chip warn' }, g.last_error) : el('span', { class: 'chip ok' }, t('webhookOn'))),
      editar ? [campos, el('div', { class: 'botones', style: 'margin-top:.8rem' }, boton(t('save'), 'primary chico', () => hacerPedido('PATCH', '/vtc/' + tag + '/webhooks/' + g.id, cuerpo(), recargar, t('saved'))),
        boton(t('test'), 'chico', () => hacerPedido('POST', '/vtc/' + tag + '/webhooks/' + g.id + '/test', {}, recargar, t('testSent'))),
        botonArmado(t('remove'), 'danger chico', () => hacerPedido('DELETE', '/vtc/' + tag + '/webhooks/' + g.id, undefined, recargar, t('saved'))))] : null);
  }

  // ---------------------------------------------------------------- ajustes
  VISTAS.settings = function (cuerpo, p) {
    const v = p.vtc, tag = v.tag;
    const nodos = [];
    if (yo.member) {
      const esconder = casilla(t('hideMyName'), yo.member.hide_name);
      esconder.input.addEventListener('change', () => hacerPedido('PATCH', '/vtc/me', { hide_name: esconder.input.checked }, (d) => { yo.member.hide_name = d.hide_name; }, t('saved')));
      nodos.push(tarjeta(t('myMembership'), el('p', { class: 'muted small' }, t('memberSince', { date: fecha(yo.member.joined_at) })), esconder.etq,
        el('p', { class: 'muted small' }, t('memberPublic')),
        p.relation.owner ? el('p', { class: 'muted small' }, t('vtc_owner_must_transfer'))
          : el('div', { class: 'botones' }, botonArmado(t('leave'), 'danger chico', () => hacerPedido('POST', '/vtc/' + tag + '/leave', {}, () => { location.href = enlace(''); })))));
    }
    if (puede(p, 'settings', 'edit')) {
      const ficha = formularioDeFicha(v, false);
      const formulario = el('form', { class: 'card' }, el('h2', {}, t('companyProfile')), ficha.nodo,
        el('div', { class: 'botones', style: 'margin-top:1rem' }, el('button', { type: 'submit', class: 'btn primary' }, t('save')),
          (v.links || {}).discord ? boton(t('refreshLogo'), '', () => hacerPedido('POST', '/vtc/' + tag + '/logo', {}, recargarEmpresa, t('saved'))) : null));
      formulario.addEventListener('submit', async (e) => {
        e.preventDefault();
        const b = formulario.querySelector('button[type=submit]');
        b.disabled = true;
        await hacerPedido('PATCH', '/vtc/' + tag, ficha.datos(), recargarEmpresa, t('saved'));
        b.disabled = false;
      });
      nodos.push(formulario);
    }
    if (p.relation.owner) nodos.push(tarjetaDeNombre(v));
    if (p.relation.owner) {
      const confirma = el('input', { type: 'text', maxlength: 6, autocomplete: 'off' });
      nodos.push(el('section', { class: 'card peligro' }, el('h2', {}, t('dissolveTitle')), el('p', { class: 'muted small' }, t('dissolveHelp')), campo(t('dissolveConfirm', { tag }), confirma),
        el('div', { class: 'botones' }, botonArmado(t('dissolve'), 'danger', () => hacerPedido('POST', '/vtc/' + tag + '/dissolve', { confirm: confirma.value }, () => { location.href = enlace(''); })))));
    }
    cuerpo.replaceChildren(...nodos);
  };

  // Cambiar nombre y tag: el dueno, una vez cada 90 dias (la API lo controla y
  // dice desde cuando se puede otra vez en rename_available_at).
  function tarjetaDeNombre(v) {
    const espera = v.rename_available_at;
    const nombre = el('input', { type: 'text', maxlength: 40, autocomplete: 'off', value: v.name });
    const tag = el('input', { type: 'text', maxlength: 6, autocomplete: 'off', value: v.tag });
    const pistas = { name: el('p', { class: 'pista', 'aria-live': 'polite' }), tag: el('p', { class: 'pista', 'aria-live': 'polite' }) };
    [nombre, tag].forEach((i) => { i.disabled = !!espera; });
    const cambio = () => {
      const d = {};
      if (nombre.value.trim() !== v.name) d.name = nombre.value.trim();
      if (tag.value.trim() !== v.tag) d.tag = tag.value.trim();
      return d;
    };
    let reloj = null;
    async function revisar() {
      const d = cambio(), q = new URLSearchParams();
      const mismo = (a, b) => a.toLowerCase().replace(/\s+/g, ' ') === b.toLowerCase().replace(/\s+/g, ' ');
      if (d.name && !mismo(d.name, v.name)) q.set('name', d.name);
      if (d.tag && !mismo(d.tag, v.tag)) q.set('tag', d.tag);
      ['name', 'tag'].forEach((k) => { if (!q.has(k)) { pistas[k].textContent = ''; pistas[k].className = 'pista'; } });
      if (!q.toString()) return;
      const r = await pedir('/vtc/check?' + q.toString());
      if (!r.ok) return;
      ['name', 'tag'].forEach((k) => {
        if (!q.has(k)) return;
        const error = r.datos[k];
        pistas[k].className = 'pista ' + (error ? 'mal' : 'bien');
        pistas[k].textContent = error ? t(error, { min: k === 'tag' ? 2 : 3, max: k === 'tag' ? 6 : 40 }) : t('available');
      });
    }
    [nombre, tag].forEach((i) => i.addEventListener('input', () => { clearTimeout(reloj); reloj = setTimeout(revisar, 350); }));
    const guardar = botonArmado(t('renameSave'), 'primary', () => {
      const d = cambio();
      if (!Object.keys(d).length) return;
      return hacerPedido('PATCH', '/vtc/' + v.tag, d, (r) => { location.href = enlace(r.vtc.tag, '#settings'); });
    });
    guardar.disabled = !!espera;
    return el('section', { class: 'card' }, el('h2', {}, t('renameTitle')),
      el('p', { class: 'muted small' }, t('renameHelp')),
      espera ? el('p', { class: 'notice' }, t('renameNext', { date: fecha(espera) })) : null,
      el('div', { class: 'campos' }, campo(t('fName'), nombre, pistas.name), campo(t('fTag'), tag, pistas.tag)),
      el('div', { class: 'botones' }, guardar));
  }

  // ------------------------------------------------- imagen de reclutamiento
  function dialogoTarjeta(p) {
    const v = p.vtc;
    const caja = el('div', { class: 'vista-tarjeta' });
    const formato = selector(Object.keys(window.VTC_TARJETA.FORMATOS).map((f) => [f, t('card_' + f)]), 'portrait', () => redibujar(), t('cardFormat'));
    let lienzo = null;
    async function redibujar() {
      const km = (lista) => (lista || []).reduce((s, j) => s + j.distance_km, 0);
      lienzo = await window.VTC_TARJETA.dibujar(formato.value, {
        v, tinta: tintaPara(v.color), color: v.color || COLOR_DE_FABRICA,
        url: 'https://trucksim-dash.com/vtc/?' + v.tag, corta: 'trucksim-dash.com/vtc/?' + v.tag,
        numeros: [[numero(p.numbers.members), t('members')], [distancia(km(p.numbers.month)), t('kmThisMonth')], [distancia(km(p.numbers.total)), t('kmTotal')]],
        chips: (v.games || []).map((j) => j.toUpperCase()).concat(v.language ? [nombreDeIdioma(v.language)] : []).concat(v.country ? [nombreDePais(v.country)] : []).concat(v.min_age ? [v.min_age + '+'] : []),
        links: LINKS.filter((l) => (v.links || {})[l]).map((l) => [NOMBRE_LINK[l], v.links[l].replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')]),
        requisitos: v.requirements || '', reclutando: v.recruiting ? t('cardRecruiting') : null, unite: t('cardScan'),
      });
      caja.replaceChildren(lienzo);
    }
    const d = dialogo(t('recruitImage'), el('div', {}, el('p', { class: 'muted small' }, t('cardHelp')), campo(t('cardFormat'), formato), caja,
      el('div', { class: 'botones' }, boton(t('close'), '', async () => d.close()), boton(t('download'), 'primary', async () => {
        const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/png'));
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: 'truckdash-' + v.tag.toLowerCase() + '-' + formato.value + '.png' });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }))));
    redibujar();
  }

  // ---------------------------------------------------------------- arranque
  async function recargarYo(callado) {
    const r = await pedir('/vtc/me');
    if (r.ok) yo = r.datos;
    if (!callado) vista();
  }
  async function refrescarNumeritos() {
    const r = await pedir('/vtc/' + pagina.vtc.tag);
    if (r.ok) { pagina = r.datos; pintarEmpresa(); }
  }

  function aplicarIdioma() {
    document.documentElement.lang = idioma;
    $('navDirectory').textContent = t('navDirectory');
    $('navAccount').textContent = t('navAccount');
    $('pieTerms').textContent = t('terms');
    $('piePrivacy').textContent = t('privacy');
    $('betaTexto').textContent = t('betaNotice');
    $('betaLink').textContent = t('betaFeedback');
  }

  async function arrancar() {
    if (!dibujaBanderas()) document.documentElement.classList.add('sin-banderas');
    const lenguas = $('langSelect');
    Object.keys(NOMBRES_IDIOMA).forEach((c) => lenguas.append(el('option', { value: c }, NOMBRES_IDIOMA[c])));
    lenguas.value = idioma;
    lenguas.addEventListener('change', () => {
      idioma = lenguas.value;
      try { localStorage.setItem(LANG_KEY, idioma); } catch (e) {}
      aplicarIdioma();
      if (vista) vista();
    });
    $('unitSelect').value = enMillas ? 'mi' : 'km';
    $('unitSelect').addEventListener('change', () => {
      enMillas = $('unitSelect').value === 'mi';
      try {
        const cfg = JSON.parse(localStorage.getItem(AJUSTES_APP)) || {};
        cfg.useImperial = enMillas;
        localStorage.setItem(AJUSTES_APP, JSON.stringify(cfg));
      } catch (e) {}
      if (vista) vista();
    });
    aplicarIdioma();

    const r = await pedir('/vtc/me');
    if (!r.ok) {
      vista = () => pintar(el('p', { class: 'notice danger' }, t('offline')));
      vista();
      return;
    }
    yo = r.datos;
    $('betaAviso').hidden = !yo.enabled;
    const tag = tagDeLaDireccion(), codigo = PARAMS.get('invite');
    if (!yo.enabled) vista = () => pintar(el('div', { class: 'portada' }, el('h1', {}, t('dirTitle')), el('p', {}, t('closed')), yo.signed_in ? null : el('div', { class: 'botones' }, boton(t('signIn'), '', irAEntrar))));
    else if (codigo) vista = () => verInvitacion(codigo);
    else if (tag === 'new') vista = verFundar;
    else if (tag) vista = () => (pagina ? pintarEmpresa() : verEmpresa(tag));
    else vista = verDirectorio;
    if (!tag || tag === 'new') $('navDirectory').setAttribute('aria-current', 'page');
    vista();
    window.addEventListener('hashchange', () => { if (pagina) pintarEmpresa(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
