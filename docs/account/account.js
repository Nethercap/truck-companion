// Pantalla de cuenta de Truck Dash.
//
// La web es publica y de codigo abierto; el servicio de cuentas no. Esto es
// solo la interfaz: todas las reglas (unicidad del nombre, enfriamiento, que
// login se puede desvincular) las decide la API, y aca se muestran sus
// respuestas. Duplicar las reglas en el navegador seria mentirle al usuario
// cuando las dos copias se desincronicen.

(function () {
  'use strict';

  // Los parametros de la URL se leen una sola vez, al arrancar: despues se
  // limpian de la barra de direcciones, asi que leerlos mas tarde devuelve
  // vacio. Es lo que dejaba el formulario sin el nombre sugerido.
  const PARAMS = new URLSearchParams(location.search);

  // ------------------------------------------------------------------ API
  const API_POR_DEFECTO = 'https://api.trucksim-dash.com';

  function baseApi() {
    // El override por querystring solo en local. En produccion, un link como
    // /account/?api=sitio-del-atacante mostraria datos ajenos dentro de
    // nuestro dominio, que es exactamente la forma de un phishing creible.
    const local = ['localhost', '127.0.0.1', '[::1]'].indexOf(location.hostname) >= 0;
    if (local) {
      const param = PARAMS.get('api');
      if (param) return param.replace(/\/+$/, '');
    }
    return API_POR_DEFECTO;
  }

  const API = baseApi();

  async function pedir(ruta, opciones) {
    const cfg = Object.assign({ credentials: 'include' }, opciones || {});
    if (cfg.body !== undefined) {
      cfg.headers = Object.assign({ 'Content-Type': 'application/json' }, cfg.headers || {});
      cfg.body = JSON.stringify(cfg.body);
    }
    const r = await fetch(API + ruta, cfg);
    let datos = null;
    try { datos = await r.json(); } catch (e) { datos = null; }
    return { ok: r.ok, status: r.status, datos: datos || {} };
  }

  // ------------------------------------------------------------- idiomas
  // EN y ES viven aca (EN es la referencia); los demas salen de i18n.js, el
  // mismo archivo que usa la app, para no tener dos lugares con traducciones.
  const TRANSLATIONS = {
    en: {
      loading: 'Loading...',
      offline: "Can't reach the account service right now. Try again in a minute.",
      signInTitle: 'Sign in',
      signInIntro: 'Sign in to keep your trips and your stats across devices.',
      signInDiscord: 'Continue with Discord',
      signInGoogle: 'Continue with Google',
      signInSoon: 'More ways to sign in are coming.',
      signInFree: 'Free, like the rest of Truck Dash. We never post anything on your behalf.',
      termsLink: 'Terms of use',
      privacyLink: 'Privacy policy',
      pickUsernameTitle: 'Choose your username',
      pickUsernameIntro: 'This is the name other drivers see. You can change it later, but not often.',
      usernameLabel: 'Username',
      usernameRules: '3 to 20 characters: letters, numbers, - and _',
      save: 'Save',
      change: 'Change',
      cancel: 'Cancel',
      checking: 'Checking...',
      available: 'Available',
      loginsTitle: 'Sign-in methods',
      linked: 'Linked',
      link: 'Link',
      unlink: 'Unlink',
      privacyTitle: 'Public profile',
      privacyLabel: 'Let anyone see my profile',
      privacyHint: 'Off by default. Your trips include where you were and when.',
      sessionsTitle: 'Open sessions',
      thisDevice: 'this device',
      unknownDevice: 'Unknown device',
      signOut: 'Sign out',
      signOutAll: 'Sign out everywhere',
      signedOutAll: (n) => 'Closed ' + n + ' sessions.',
      memberSince: (f) => 'Driver since ' + f,
      savedOk: 'Saved',
      deviceTitle: 'Link this PC',
      deviceHint: 'Truck Dash on your PC shows a code. Type it here so your trips are saved to this account.',
      deviceCodeLabel: 'Code',
      deviceApprove: 'Link',
      deviceLinked: (n) => n + ' is now linked to your account.',
      codigo_invalido_o_vencido: 'That code is not valid, or it expired. Ask for a new one in the app.',
      codigo_ya_usado: 'That code was already used.',
      dataTitle: 'Your data',
      exportData: 'Download my data',
      exportHint: 'A JSON file with everything this account holds.',
      deleteWarning: 'Deleting removes your account and everything in it, on every device. It cannot be undone.',
      deleteAccount: 'Delete account',
      deleteForGood: 'Delete for good',
      deleteConfirmLabel: (n) => 'Type ' + n + ' to confirm',
      confirmacion_no_coincide: 'That does not match.',
      recoveryWarning: 'Steam is your only sign-in method, and Steam gives us no email. If you lose access to it, there is no way back into this account. Link a second method.',
      cooldownLeft: (n) => 'You can change your name again in ' + n + (n === 1 ? ' day.' : ' days.'),
      // Motivos que devuelve la API. La clave es la misma de un lado y del otro.
      username_required: 'Type a username.',
      username_too_short: 'Too short: at least 3 characters.',
      username_too_long: 'Too long: 20 characters at most.',
      username_bad_chars: 'Only letters, numbers, - and _ (no spaces or accents).',
      username_all_digits: 'It cannot be only numbers.',
      username_bad_edges: 'It cannot start or end with - or _',
      username_double_separator: 'No two separators in a row.',
      username_reserved: 'That name is reserved.',
      username_ocupado: 'Already taken.',
      username_en_enfriamiento: 'You changed your name recently. Try again later.',
      falta_username: 'Choose a username first.',
      no_autenticado: 'Your session expired. Sign in again.',
      es_el_unico_login: 'It is your only way in, so it cannot be removed.',
      quedaria_solo_steam: 'That would leave Steam alone, and Steam gives us no way to get you back in. Link another method first.',
      proveedor_no_vinculado: 'That method is not linked.',
      login_ya_vinculado_a_otra_cuenta: 'That account is already linked to a different Truck Dash account.',
      ya_tiene_ese_proveedor: 'You already have one of those linked.',
      cancelado: 'Sign-in cancelled.',
      expiro: 'That took too long. Try again.',
      state_invalido: 'That sign-in link is not valid. Start again from this page.',
      respuesta_incompleta: 'The provider sent an incomplete answer. Try again.',
      codigo_invalido: 'That sign-in link was already used. Try again.',
      proveedor_no_responde: 'The provider is not answering. Try again in a minute.',
      proveedor_no_configurado: 'That sign-in method is not available yet.',
      error: 'Something went wrong. Try again.'
    },
    es: {
      loading: 'Cargando...',
      offline: 'No se puede contactar al servicio de cuentas. Proba de nuevo en un minuto.',
      signInTitle: 'Entrar',
      signInIntro: 'Entra para conservar tus viajes y tus estadisticas en todos tus dispositivos.',
      signInDiscord: 'Continuar con Discord',
      signInGoogle: 'Continuar con Google',
      signInSoon: 'Se vienen mas formas de entrar.',
      signInFree: 'Gratis, como todo Truck Dash. Nunca publicamos nada en tu nombre.',
      termsLink: 'Términos de uso',
      privacyLink: 'Política de privacidad',
      pickUsernameTitle: 'Elegi tu nombre de usuario',
      pickUsernameIntro: 'Es el nombre que ven los demas. Se puede cambiar, pero no seguido.',
      usernameLabel: 'Nombre de usuario',
      usernameRules: 'De 3 a 20 caracteres: letras, numeros, - y _',
      save: 'Guardar',
      change: 'Cambiar',
      cancel: 'Cancelar',
      checking: 'Verificando...',
      available: 'Disponible',
      loginsTitle: 'Formas de entrar',
      linked: 'Vinculada',
      link: 'Vincular',
      unlink: 'Desvincular',
      privacyTitle: 'Perfil publico',
      privacyLabel: 'Que cualquiera pueda ver mi perfil',
      privacyHint: 'Apagado por defecto. Tus viajes incluyen donde estuviste y cuando.',
      sessionsTitle: 'Sesiones abiertas',
      thisDevice: 'este dispositivo',
      unknownDevice: 'Dispositivo desconocido',
      signOut: 'Cerrar sesion',
      signOutAll: 'Cerrar sesion en todos lados',
      signedOutAll: (n) => 'Se cerraron ' + n + ' sesiones.',
      memberSince: (f) => 'Camionero desde ' + f,
      savedOk: 'Guardado',
      deviceTitle: 'Vincular esta PC',
      deviceHint: 'Truck Dash en tu PC muestra un codigo. Escribilo aca para que tus viajes queden en esta cuenta.',
      deviceCodeLabel: 'Codigo',
      deviceApprove: 'Vincular',
      deviceLinked: (n) => n + ' quedo vinculada a tu cuenta.',
      codigo_invalido_o_vencido: 'Ese codigo no es valido, o se vencio. Pedi uno nuevo en la aplicacion.',
      codigo_ya_usado: 'Ese codigo ya se uso.',
      dataTitle: 'Tus datos',
      exportData: 'Descargar mis datos',
      exportHint: 'Un archivo JSON con todo lo que guarda esta cuenta.',
      deleteWarning: 'Borrar elimina tu cuenta y todo lo que tiene adentro, en todos los dispositivos. No se puede deshacer.',
      deleteAccount: 'Borrar la cuenta',
      deleteForGood: 'Borrar definitivamente',
      deleteConfirmLabel: (n) => 'Escribi ' + n + ' para confirmar',
      confirmacion_no_coincide: 'No coincide.',
      recoveryWarning: 'Steam es tu unica forma de entrar, y Steam no nos da ningun mail. Si perdes el acceso, no hay manera de volver a esta cuenta. Vincula una segunda forma.',
      cooldownLeft: (n) => 'Vas a poder cambiarlo de nuevo en ' + n + (n === 1 ? ' dia.' : ' dias.'),
      username_required: 'Escribi un nombre.',
      username_too_short: 'Muy corto: minimo 3 caracteres.',
      username_too_long: 'Muy largo: maximo 20 caracteres.',
      username_bad_chars: 'Solo letras, numeros, - y _ (sin espacios ni acentos).',
      username_all_digits: 'No puede ser solo numeros.',
      username_bad_edges: 'No puede empezar ni terminar con - o _',
      username_double_separator: 'No puede llevar dos separadores seguidos.',
      username_reserved: 'Ese nombre esta reservado.',
      username_ocupado: 'Ya esta tomado.',
      username_en_enfriamiento: 'Lo cambiaste hace poco. Proba mas adelante.',
      falta_username: 'Primero elegi un nombre de usuario.',
      no_autenticado: 'Se venció tu sesion. Entra de nuevo.',
      es_el_unico_login: 'Es tu unica forma de entrar, asi que no se puede sacar.',
      quedaria_solo_steam: 'Quedaria solo Steam, que no nos da forma de devolverte el acceso. Vincula otra antes.',
      proveedor_no_vinculado: 'Esa forma no esta vinculada.',
      login_ya_vinculado_a_otra_cuenta: 'Esa cuenta ya esta vinculada a otra cuenta de Truck Dash.',
      ya_tiene_ese_proveedor: 'Ya tenes una vinculada de ese tipo.',
      cancelado: 'Cancelaste el inicio de sesion.',
      expiro: 'Tardo demasiado. Proba de nuevo.',
      state_invalido: 'Ese link de inicio de sesion no es valido. Empeza de nuevo desde esta pagina.',
      respuesta_incompleta: 'El proveedor mando una respuesta incompleta. Proba de nuevo.',
      codigo_invalido: 'Ese link de inicio de sesion ya se uso. Proba de nuevo.',
      proveedor_no_responde: 'El proveedor no responde. Proba en un minuto.',
      proveedor_no_configurado: 'Esa forma de entrar todavia no esta disponible.',
      error: 'Algo salio mal. Proba de nuevo.'
    }
  };

  if (typeof TRANSLATIONS_EXTRA !== 'undefined') {
    // Solo las claves de esta pantalla: i18n.js es compartido con la app.
    Object.keys(TRANSLATIONS_EXTRA).forEach((lang) => {
      const origen = TRANSLATIONS_EXTRA[lang];
      const destino = TRANSLATIONS[lang] || (TRANSLATIONS[lang] = {});
      Object.keys(TRANSLATIONS.en).forEach((clave) => {
        if (origen[clave] !== undefined) destino[clave] = origen[clave];
      });
    });
  }

  const LANG_KEY = 'truckdash_lang';  // la misma que la app, para que se respete
  const NOMBRES_IDIOMA = {
    en: 'English', es: 'Español', de: 'Deutsch', fr: 'Français',
    pt: 'Português', pl: 'Polski', tr: 'Türkçe', ru: 'Русский'
  };

  function detectarIdioma() {
    // Ingles por defecto, a proposito, y NO el idioma del navegador: es el
    // idioma del producto y la referencia de todas las traducciones. Lo unico
    // que lo cambia es haber elegido uno a mano, aca o en la app (las dos
    // guardan en la misma clave), porque eso si es una decision de la persona.
    try {
      const guardado = localStorage.getItem(LANG_KEY);
      if (guardado && TRANSLATIONS[guardado]) return guardado;
    } catch (e) {}
    return 'en';
  }

  let idioma = detectarIdioma();

  function t(clave) {
    const dic = TRANSLATIONS[idioma] || TRANSLATIONS.en;
    const valor = dic[clave] !== undefined ? dic[clave] : TRANSLATIONS.en[clave];
    if (valor === undefined) return clave;
    return typeof valor === 'function' ? valor.apply(null, [].slice.call(arguments, 1)) : valor;
  }

  function aplicarIdioma() {
    document.documentElement.lang = idioma;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
  }

  // ------------------------------------------------------------------ UI
  const $ = (id) => document.getElementById(id);

  function avisar(texto, tipo) {
    const div = document.createElement('div');
    div.className = 'toast ' + (tipo || '');
    div.textContent = texto;
    $('toastContainer').appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 300);
    }, 3500);
  }

  function mostrarVista(cual) {
    ['viewSignIn', 'viewUsername', 'viewAccount'].forEach((v) => {
      $(v).hidden = v !== cual;
    });
    $('loading').hidden = true;
    $('main').hidden = false;
  }

  function fecha(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(idioma, { year: 'numeric', month: 'long' });
    } catch (e) { return iso.slice(0, 10); }
  }

  function fechaHora(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(idioma); } catch (e) { return iso; }
  }

  // ------------------------------------------------------------- estado
  let usuario = null;

  const PROVEEDORES = ['discord', 'google', 'steam', 'email'];
  const NOMBRE_PROVEEDOR = { discord: 'Discord', google: 'Google', steam: 'Steam', email: 'Email' };
  // Lo dice la API (/auth/providers), no esta escrito aca: asi encender un
  // proveedor nuevo es cambiar una variable en el servidor, sin desplegar la
  // web, y nunca se ofrece un boton que termina en "no configurado". Los que
  // faltan igual se listan en la cuenta, para que se vea que la cuenta es una
  // sola y que mas adelante se pueden sumar.
  let disponibles = [];

  const LOGOS = {
    discord: '<svg viewBox="0 0 127 96" aria-hidden="true"><path fill="currentColor" d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"/></svg>',
    google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>'
  };

  function pintarBotonesDeEntrada() {
    const caja = $('signInButtons');
    caja.innerHTML = '';
    disponibles.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'btn proveedor ' + p;
      b.innerHTML = (LOGOS[p] || '') + '<span></span>';
      // El texto por textContent y no dentro del innerHTML de arriba: es una
      // traduccion y podria traer caracteres que rompan el markup.
      b.querySelector('span').textContent = t('signIn' + p.charAt(0).toUpperCase() + p.slice(1));
      b.addEventListener('click', () => irAProveedor(p));
      caja.appendChild(b);
    });
  }

  function irAProveedor(proveedor) {
    location.href = API + '/auth/' + proveedor + '/start?next=' +
      encodeURIComponent(location.pathname);
  }

  // --------------------------------------------------------- nombre
  let ultimaConsulta = 0;
  let temporizador = null;

  function pintarHint(texto, clase) {
    const hint = $('usernameHint');
    hint.textContent = texto;
    hint.className = 'hint' + (clase ? ' ' + clase : '');
  }

  async function consultarDisponibilidad(nombre) {
    const mio = ++ultimaConsulta;
    pintarHint(t('checking'));
    const { ok, datos } = await pedir('/user/check-username?u=' + encodeURIComponent(nombre));
    // Llega una respuesta vieja despues de una nueva: se descarta, o el cartel
    // terminaria hablando de un nombre que ya no esta escrito.
    if (mio !== ultimaConsulta) return;
    if (!ok) { pintarHint(t('error'), 'bad'); return false; }
    if (datos.error) { pintarHint(t(datos.error), 'bad'); return false; }
    if (!datos.disponible) { pintarHint(t('username_ocupado'), 'bad'); return false; }
    pintarHint(t('available'), 'ok');
    return true;
  }

  function alEscribirNombre() {
    const valor = $('usernameInput').value.trim();
    clearTimeout(temporizador);
    if (!valor) { pintarHint(''); return; }
    temporizador = setTimeout(() => consultarDisponibilidad(valor), 350);
  }

  async function guardarNombre(evento) {
    evento.preventDefault();
    const valor = $('usernameInput').value.trim();
    const boton = $('btnSaveUsername');
    boton.disabled = true;
    const { ok, datos } = await pedir('/user/username', { method: 'POST', body: { username: valor } });
    boton.disabled = false;
    if (!ok) {
      // El enfriamiento viene con los dias que faltan: decir "proba mas
      // adelante" sin decir cuanto obliga a probar de nuevo a ciegas.
      const motivo = (datos.error === 'username_en_enfriamiento' && datos.dias_restantes)
        ? t('cooldownLeft', datos.dias_restantes)
        : t(datos.error || 'error');
      pintarHint(motivo, 'bad');
      return;
    }
    avisar(t('savedOk'), 'ok');
    await cargar();
  }

  // --------------------------------------------------------- render
  function pintarLogins() {
    const lista = $('loginsList');
    lista.innerHTML = '';
    PROVEEDORES.forEach((p) => {
      const vinculado = usuario.logins.indexOf(p) >= 0;
      const li = document.createElement('li');
      const nombre = document.createElement('span');
      nombre.textContent = NOMBRE_PROVEEDOR[p];
      li.appendChild(nombre);

      if (vinculado) {
        const boton = document.createElement('button');
        boton.className = 'btn link';
        boton.textContent = t('unlink');
        // Con un solo login no se ofrece sacarlo: la API lo rechaza igual, y
        // ofrecer algo que siempre falla es peor que no ofrecerlo.
        boton.disabled = usuario.logins.length < 2;
        boton.addEventListener('click', () => desvincular(p));
        li.appendChild(boton);
      } else if (disponibles.indexOf(p) >= 0) {
        const boton = document.createElement('button');
        boton.className = 'btn link';
        boton.textContent = t('link');
        boton.addEventListener('click', () => irAProveedor(p));
        li.appendChild(boton);
      } else {
        const proximamente = document.createElement('span');
        proximamente.className = 'muted small';
        proximamente.textContent = '—';
        li.appendChild(proximamente);
      }
      lista.appendChild(li);
    });
  }

  async function desvincular(proveedor) {
    const { ok, datos } = await pedir('/user/login/' + proveedor, { method: 'DELETE' });
    if (!ok) { avisar(t(datos.error || 'error'), 'bad'); return; }
    avisar(t('savedOk'), 'ok');
    await cargar();
  }

  async function pintarSesiones() {
    const { ok, datos } = await pedir('/user/sesiones');
    if (!ok) return;
    const lista = $('sessionsList');
    lista.innerHTML = '';
    (datos.sesiones || []).forEach((s) => {
      const li = document.createElement('li');
      const izq = document.createElement('div');
      const nombre = document.createElement('div');
      nombre.textContent = s.dispositivo || t('unknownDevice');
      izq.appendChild(nombre);
      const cuando = document.createElement('div');
      cuando.className = 'when';
      cuando.textContent = fechaHora(s.creada);
      izq.appendChild(cuando);
      li.appendChild(izq);
      if (s.actual) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = t('thisDevice');
        li.appendChild(tag);
      }
      lista.appendChild(li);
    });
  }

  function pintarCuenta() {
    $('displayName').textContent = usuario.username || '';
    $('currentUsername').textContent = usuario.username || '';
    $('memberSince').textContent = t('memberSince', fecha(usuario.creado));
    if (usuario.avatar_url) {
      $('avatar').src = usuario.avatar_url;
      $('avatar').hidden = false;
    } else {
      $('avatar').hidden = true;
    }
    $('recoveryWarning').hidden = usuario.puede_recuperarse;
    $('recoveryWarning').textContent = t('recoveryWarning');
    $('publicToggle').checked = !!usuario.is_public;
    pintarLogins();
    pintarSesiones();
    mostrarConfirmacionDeBorrado(false);
    mostrarVista('viewAccount');
  }

  async function cambiarPrivacidad() {
    const valor = $('publicToggle').checked;
    const { ok, datos } = await pedir('/user/privacidad', { method: 'PATCH', body: { is_public: valor } });
    if (!ok) {
      $('publicToggle').checked = !valor;  // revertir: no se guardo
      avisar(t(datos.error || 'error'), 'bad');
      return;
    }
    avisar(t('savedOk'), 'ok');
    usuario.is_public = datos.is_public;
  }

  async function cerrarSesion() {
    await pedir('/auth/logout', { method: 'POST' });
    usuario = null;
    mostrarVista('viewSignIn');
  }

  async function cerrarTodas() {
    const { ok, datos } = await pedir('/auth/logout-all', { method: 'POST' });
    if (!ok) { avisar(t(datos.error || 'error'), 'bad'); return; }
    avisar(t('signedOutAll', datos.cerradas || 0), 'ok');
    usuario = null;
    mostrarVista('viewSignIn');
  }

  async function vincularDispositivo(evento) {
    evento.preventDefault();
    const code = $('deviceInput').value.trim();
    if (!code) return;
    const hint = $('deviceHintMsg');
    const boton = $('btnDeviceApprove');
    boton.disabled = true;

    // Primero se mira QUE se esta por vincular. Aprobar a ciegas un codigo
    // que alguien te dicto por telefono es como aprobarlo sin leerlo.
    const previo = await pedir('/user/device/' + encodeURIComponent(code));
    if (!previo.ok) {
      boton.disabled = false;
      hint.textContent = t(previo.datos.error || 'error');
      hint.className = 'hint bad';
      return;
    }

    const { ok, datos } = await pedir('/user/device/approve', {
      method: 'POST', body: { code }
    });
    boton.disabled = false;
    if (!ok) {
      hint.textContent = t(datos.error || 'error');
      hint.className = 'hint bad';
      return;
    }
    hint.textContent = '';
    $('deviceInput').value = '';
    avisar(t('deviceLinked', previo.datos.device_name || 'Truck Dash'), 'ok');
    pintarSesiones();
  }

  async function exportarDatos() {
    const { ok, datos } = await pedir('/user/export');
    if (!ok) { avisar(t(datos.error || 'error'), 'bad'); return; }
    // Se arma y descarga en el navegador: el archivo nunca pasa por otro lado.
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'truckdash-' + (usuario.username || 'cuenta') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function nombreDeConfirmacion() {
    // Sin nombre elegido no hay nada que escribir, asi que se pide DELETE.
    return usuario && usuario.username ? usuario.username : 'DELETE';
  }

  function mostrarConfirmacionDeBorrado(mostrar) {
    $('deleteConfirm').hidden = !mostrar;
    $('btnDelete').hidden = mostrar;
    if (mostrar) {
      $('deleteConfirmLabel').textContent = t('deleteConfirmLabel', nombreDeConfirmacion());
      $('deleteInput').value = '';
      $('deleteHint').textContent = '';
      $('deleteInput').focus();
    }
  }

  async function borrarCuenta() {
    const { ok, datos } = await pedir('/user/account', {
      method: 'DELETE', body: { confirmacion: $('deleteInput').value.trim() }
    });
    if (!ok) {
      $('deleteHint').textContent = t(datos.error || 'error');
      $('deleteHint').className = 'hint bad';
      return;
    }
    usuario = null;
    mostrarConfirmacionDeBorrado(false);
    mostrarVista('viewSignIn');
  }

  function pedirNombre(sugerido) {
    $('usernameInput').value = sugerido || '';
    pintarHint('');
    mostrarVista('viewUsername');
    $('usernameInput').focus();
    if (sugerido) consultarDisponibilidad(sugerido);
  }

  // ------------------------------------------------------------ arranque
  async function cargar() {
    const prov = await pedir('/auth/providers');
    if (prov.ok) disponibles = prov.datos.disponibles || [];
    pintarBotonesDeEntrada();

    const { ok, datos } = await pedir('/auth/me');
    if (!ok) {
      $('loading').hidden = true;
      $('offline').hidden = false;
      return;
    }
    usuario = datos.usuario;
    if (!usuario) { mostrarVista('viewSignIn'); return; }
    if (!usuario.username) {
      pedirNombre(PARAMS.get('sugerido') || '');
      return;
    }
    pintarCuenta();
  }

  function mostrarErrorDeVuelta() {
    const error = PARAMS.get('auth_error');
    if (error) {
      $('authError').textContent = t(error);
      $('authError').hidden = false;
    }
    if (PARAMS.get('vinculado')) avisar(t('savedOk'), 'ok');
    // Se limpian de la barra de direcciones SOLO los parametros de la vuelta
    // del proveedor: recargar no tiene que repetir el cartel. Borrar la
    // querystring entera se llevaba puesto cualquier otro parametro, que es
    // justo lo que pasa con ?api= al probar en local.
    // Sobre una copia: PARAMS lo sigue leyendo el resto del arranque (el
    // nombre sugerido, sin ir mas lejos), asi que borrarle claves aca dejaria
    // el formulario vacio otra vez.
    const limpios = new URLSearchParams(PARAMS.toString());
    let toco = false;
    ['auth_error', 'sugerido', 'vinculado', 'nuevo'].forEach((clave) => {
      if (limpios.has(clave)) { limpios.delete(clave); toco = true; }
    });
    if (toco) {
      const resto = limpios.toString();
      history.replaceState(null, '', location.pathname + (resto ? '?' + resto : ''));
    }
  }

  function armarSelectorDeIdioma() {
    const sel = $('langSelect');
    Object.keys(TRANSLATIONS).forEach((codigo) => {
      const op = document.createElement('option');
      op.value = codigo;
      op.textContent = NOMBRES_IDIOMA[codigo] || codigo;
      if (codigo === idioma) op.selected = true;
      sel.appendChild(op);
    });
    sel.addEventListener('change', () => {
      idioma = sel.value;
      try { localStorage.setItem(LANG_KEY, idioma); } catch (e) {}
      aplicarIdioma();
      pintarBotonesDeEntrada();
      if (usuario && usuario.username) pintarCuenta();
    });
  }

  function iniciar() {
    armarSelectorDeIdioma();
    aplicarIdioma();
    mostrarErrorDeVuelta();
    $('usernameInput').addEventListener('input', alEscribirNombre);
    $('usernameForm').addEventListener('submit', guardarNombre);
    $('btnChangeUsername').addEventListener('click', () => pedirNombre(usuario.username));
    $('publicToggle').addEventListener('change', cambiarPrivacidad);
    $('btnSignOut').addEventListener('click', cerrarSesion);
    $('btnSignOutAll').addEventListener('click', cerrarTodas);
    $('deviceForm').addEventListener('submit', vincularDispositivo);
    $('btnExport').addEventListener('click', exportarDatos);
    $('btnDelete').addEventListener('click', () => mostrarConfirmacionDeBorrado(true));
    $('btnDeleteCancel').addEventListener('click', () => mostrarConfirmacionDeBorrado(false));
    $('btnDeleteConfirm').addEventListener('click', borrarCuenta);
    cargar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
