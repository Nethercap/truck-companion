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
  // Perfil publico: /account/?u=nombre (la direccion corta /u/?nombre
  // redirige aca). Es esta misma pantalla en solo lectura, sin entrar, asi
  // muestra exactamente lo mismo que ve la persona en su cuenta.
  const PERFIL = (PARAMS.get('u') || '').trim();
  const modoPublico = !!PERFIL;

  // Vincular la PC desde el link que abre el cliente: /account/?link=CODIGO.
  // Se guarda en la sesion del navegador porque, si hay que entrar primero,
  // la vuelta de Discord o Google llega sin el parametro.
  const CLAVE_LINK = 'truckdash_link_pendiente';
  function linkPendiente() {
    try { return sessionStorage.getItem(CLAVE_LINK); } catch (e) { return null; }
  }
  function guardarLinkPendiente(codigo) {
    try {
      if (codigo) sessionStorage.setItem(CLAVE_LINK, codigo);
      else sessionStorage.removeItem(CLAVE_LINK);
    } catch (e) {}
  }
  if (PARAMS.get('link')) guardarLinkPendiente(PARAMS.get('link').trim().toUpperCase());
  let perfilPublico = null;

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
      statsTitle: 'Your stats',
      statsTrips: 'Trips',
      statsDelivered: 'Delivered',
      statsOnTime: 'On time',
      statsLate: 'Late',
      statsUnfinished: 'Unfinished',
      statsDistance: 'In trips',
      statsWheel: 'At the wheel',
      statsTopSpeed: 'Top speed',
      statsDamage: 'Avg damage',
      statsEarned: 'Earned',
      statsCountries: 'Countries',
      statsLongest: 'Longest trip',
      statsModded: (n) => n + ' with a modded economy, left out of the money.',
      statsOnlyTrips: "Only driving with a job counts here. Distance driven, at the top, also has driving without one.",
      jobKindCar: "car",
      filterKind: "Type",
      filterTruck: "Truck",
      filterCar: "Car",
      tripVehicle: "Vehicle",
      statsCarJobs: "Car jobs",
      achCar_t: "Car delivery",
      achCar_d: "Deliver a car job.",
      linkPendingTitle: "Link Truck Dash on this PC?",
      linkPendingBody: (n) => 'Truck Dash on "' + n + '" wants to save your trips to this account. Check that this code matches the one shown in Truck Dash:',
      linkSignInFirst: "Sign in to link Truck Dash on your PC. The code waits for you here.",
      tripSpeed: "Speed",
      navAchievements: "Achievements",
      achievementsTitle: "Achievements",
      recentAchTitle: "Recent achievements",
      achAll: "All achievements",
      achCount: (n, total) => n + ' of ' + total,
      achUnlocked: (d) => 'Unlocked ' + d,
      achLocked: "Locked",
      achFirst_t: "First delivery",
      achFirst_d: "Deliver your first job.",
      achDeliveries_t: (n) => n + ' deliveries',
      achDeliveries_d: (n) => 'Deliver ' + n + ' jobs.',
      achKm_t: (d) => d + ' on the road',
      achKm_d: (d) => 'Drive ' + d + ', with or without a job.',
      achLong_t: "Long haul",
      achUltraLong_t: "Across the continent",
      achLong_d: (d) => 'Deliver a job of ' + d + ' or more.',
      achCountries_t: (n) => n + ' countries',
      achCountries_d: (n) => 'Drive through ' + n + ' countries in ETS2.',
      achStates_t: (n) => n + ' states',
      achStates_d: (n) => 'Drive through ' + n + ' states in ATS.',
      achStreak_t: "Always on time",
      achStreak_d: (n) => n + ' deliveries on time in a row.',
      achClean_t: "Clean record",
      achClean_d: (n) => n + ' deliveries in a row without a fine.',
      achSpotless_t: "Not a scratch",
      achSpotless_d: (d) => 'Deliver a job of ' + d + ' or more with no damage.',
      achHeavy_t: "Heavy hauler",
      achHeavy_d: (m) => 'Deliver a load of ' + m + ' or more.',
      achFerry_t: "Sea legs",
      achFerry_d: "Take a ferry or a train during a job.",
      achPayday_t: "Big payday",
      achPayday_d: (n) => 'Earn ' + n + ' in a single delivery.',
      achBoth_t: "Both sides of the ocean",
      achBoth_d: "Deliver in ETS2 and in ATS.",
      recordsTitle: "Personal records",
      recBestPay: "Best pay",
      recBestAvg: "Best average",
      recHeaviest: "Heaviest load",
      recEfficient: "Lowest consumption",
      fuelByTruckTitle: "Fuel by truck",
      drivingNow: "Driving now",
      drivingProgress: (a, b) => a + ' of ' + b,
      drivingSince: (d) => 'since ' + d,
      tripMarkCancelled: "Mark as cancelled",
      tripMarkUnfinished: "Mark as unfinished",
      tripNoteLabel: "Note",
      tripNotePlaceholder: "Only you see this.",
      tripNoteSave: "Save note",
      estado_invalido: "That status can't be set by hand.",
      viaje_cerrado: "This trip is already closed.",
      nota_muy_larga: "The note can be up to 500 characters.",
      exportCsv: "Export CSV",
      publicLabel: "Driver profile",
      publicNotFound: "This profile does not exist or is private.",
      publicLinkLabel: "Your public profile:",
      copyLink: "Copy",
      linkCopied: "Link copied",
      activityTitle: "Activity",
      metricDistance: "Distance",
      metricTrips: "Deliveries",
      metricHours: "Hours at the wheel",
      periodWeek: "Weekly",
      periodMonth: "Monthly",
      calendarTitle: "Days on the road",
      calLess: "Less",
      calMore: "More",
      activityEmpty: "No driving in the last year yet.",
      statsFreeRoam: (d, h) => 'Free roam: ' + d + ' \u00b7 ' + h + ' at the wheel',
      topCountries: "Most visited countries",
      topStates: "Most visited states",
      topTrucks: "Most used trucks",
      topCargo: "Most hauled cargo",
      topCompanies: "Most worked companies",
      topCities: "Most visited cities",
      topRoutes: "Most repeated routes",
      totalsAll: 'all driving, with or without a job',
      navOverview: "Overview",
      navLogbook: "Logbook",
      navFollowing: 'Following',
      followTitle: 'Follow someone',
      followPlaceholder: 'Username',
      followBtn: 'Follow',
      followSent: (n) => 'Request sent to ' + n + '. You will see their activity once they accept.',
      followAlready: (n) => 'You already follow ' + n + '.',
      followNotFound: 'Nobody with that username.',
      followTooMany: 'Too many requests today. Try again tomorrow.',
      followHint: 'Following is one-way and needs approval. When you accept a follower, they see your trips with their routes, where you are while you drive and your achievements, even if your profile is private. Your notes stay yours.',
      requestsTitle: 'Follow requests',
      accept: 'Accept',
      reject: 'Decline',
      liveTitle: 'Right now',
      liveEmpty: 'You are not following anyone yet. Follow someone by their username, or from their public profile.',
      liveDriving: 'Driving',
      liveNear: (c) => 'near ' + c,
      liveLast: (r) => 'Last drove ' + r,
      liveNever: 'No trips yet',
      feedTitle: 'Recent activity',
      feedEmpty: 'Nothing from the people you follow in the last 30 days.',
      feedDelivered: (n, r) => n + ' delivered ' + r,
      feedStarted: (n, r) => n + ' started ' + r,
      feedCancelled: (n, r) => n + ' cancelled ' + r,
      feedAchievement: (n, a) => n + ' unlocked ' + a,
      followingList: 'You follow',
      followersList: 'Your followers',
      outgoingList: 'Requests you sent',
      blockedList: 'Blocked',
      listEmpty: 'Nobody yet.',
      unfollow: 'Unfollow',
      removeFollower: 'Remove',
      block: 'Block',
      unblock: 'Unblock',
      cancelRequest: 'Cancel request',
      sureAgain: 'Sure? Click again',
      followStateFollowing: 'Following',
      followStatePending: 'Request sent',
      followsYou: 'Follows you',
      followsYouPending: (n) => n + ' wants to follow you',
      privateLocked: (n) => 'This profile is private. Follow ' + n + ' to see their trips once they accept.',
      signInToFollow: 'Sign in to follow',
      navSettings: "Settings",
      dashLabel: "Driver dashboard",
      welcomeBack: (n) => 'Welcome back, ' + n + '!',
      quickDistance: "Distance driven",
      quickDeliveries: "Deliveries",
      quickHours: "At the wheel",
      quickLastSeen: "Last seen",
      quickOnTime: (n) => n + ' on time',
      quickSessions: (n) => n + ' sessions',
      recentTitle: "Recent trips",
      openLogbook: "My logbook",
      logbookTitle: "Logbook",
      logbookCount: (n) => n === 1 ? '1 trip' : n + ' trips',
      logbookNoMatch: "No trips match these filters.",
      filterGame: "Game",
      filterStatus: "Status",
      filterAll: "All",
      filterInProgress: "In progress",
      filterCancelled: "Cancelled",
      filterAbandoned: "Unfinished",
      colDate: "Date",
      colRoute: "From → To",
      colDistance: "Distance",
      colTime: "Time",
      colPay: "Pay",
      tripDetails: 'Details',
      tripPlanned: 'Planned',
      tripTruck: 'Truck',
      tripAvgSpeed: 'Avg speed',
      tripGameTime: 'Game time',
      tripRouteGaps: 'Dashed where the route was not followed: Truck Dash closed, or a jump (quick job, ferry, train).',
      tripNoRoute: 'No route was recorded for this trip.',
      tripTrimmed: 'This trip went past the storage limit, so part of its route or of the distance we tracked was not saved. The delivery, the pay and the in-game distance are complete.',
      tripAbandonedHelp: 'We stopped hearing from this job without seeing it delivered or cancelled. If you delivered it with Truck Dash closed, or loaded another save, we could not see how it ended. You can mark it as cancelled below; a delivery can only come from the game.',
      tripsTitle: 'Your trips',
      tripsEmpty: 'Nothing here yet. Link this PC to Truck Dash and your trips will show up on their own as you drive.',
      tripsEmptyDriven: 'No trips saved yet. Driving without a job counts in your totals, but it is not a trip.',
      tripsMore: 'Show more',
      tripUnnamed: 'Trip',
      tripOpen: 'driving now',
      tripOnTime: 'on time',
      tripLate: 'late',
      tripCancelled: 'cancelled',
      tripAbandoned: 'unfinished',
      tripModded: 'modded economy',
      tripTracked: (d) => 'we tracked ' + d,
      tripWheel: (h) => h + ' at the wheel',
      tripTotalTime: (h) => h + ' in total',
      tripAsleep: (h) => h + ' asleep',
      tripTop: (v) => 'top ' + v,
      tripFuel: 'Fuel',
      tripTolls: 'Tolls',
      tripPenalty: 'Cancellation penalty',
      tripOffered: 'Offered',
      statsPenalties: 'Cancellation penalties',
      tripFines: 'Fines',
      tripFerries: 'Ferries',
      tripDamage: 'Damage',
      tripRemove: 'Remove',
      tripRemoveSure: 'Remove for good?',
      loading: 'Loading...',
      offline: "Can't reach the account service right now. Try again in a minute.",
      signInTitle: 'Sign in',
      signInIntro: 'Sign in to keep your trips and your stats across devices.',
      signInDiscord: 'Continue with Discord',
      signInGoogle: 'Continue with Google',
      supportStats: 'Enjoying your stats? Truck Dash is free and made by one person.',
      teaButton: 'Buy me a cup of tea!',
      emailOr: 'or with your email',
      emailLabel: 'Email',
      emailPasswordLabel: 'Password',
      emailNewPasswordLabel: 'New password',
      emailPasswordRules: 'At least 8 characters.',
      emailSignIn: 'Sign in',
      emailCreateAccount: 'Create an account',
      emailForgot: 'Forgot your password?',
      emailBackToSignIn: 'Back to sign in',
      emailSendCode: 'Send code',
      emailCodeLabel: 'Code from the email',
      emailCreate: 'Create account',
      emailSavePassword: 'Save and sign in',
      emailResend: 'Send another code',
      emailCodeResent: 'We sent a new code.',
      emailTitleSignup: 'Create an account',
      emailTitleReset: 'Choose a new password',
      emailLinkTitle: 'Add email and password',
      mail_invalido: 'That does not look like an email address.',
      codigo_mail_invalido: 'That code is not right. Use the one from the last email.',
      codigo_mail_vencido: 'That code expired or was tried too many times. Ask for a new one.',
      contrasena_corta: 'The password needs at least 8 characters.',
      contrasena_larga: 'The password is too long: 200 characters at most.',
      credenciales_invalidas: 'Wrong email or password.',
      mail_no_enviado: 'We could not send the email right now. Try again in a few minutes, or sign in with Discord or Google.',
      emailCodeSent: (m) => 'We sent a 6-digit code to ' + m + '. It is valid for 15 minutes. If that email already has an account, the email tells you instead.',
      emailResetSent: (m) => 'If ' + m + ' has an account, we sent it a 6-digit code. It is valid for 15 minutes.',
      demasiados_intentos: (s) => 'Too many tries. Try again in ' + s + '.',
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
      deviceHint: 'In Truck Dash on your PC, open "Setup & status" and click "Link account": it shows a code like ABCD-1234. Type it here so your trips are saved to this account. It is not the 8-character pairing code you use for the dashboard.',
      devicePairingCode: 'That looks like the pairing code for the dashboard. Here you need the account code: in "Setup & status", click "Link account".',
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
      statsTitle: 'Tus estadisticas',
      statsTrips: 'Viajes',
      statsDelivered: 'Entregados',
      statsOnTime: 'A tiempo',
      statsLate: 'Tarde',
      statsUnfinished: 'Sin terminar',
      statsDistance: 'En viajes',
      statsWheel: 'Al volante',
      statsTopSpeed: 'Maxima',
      statsDamage: 'Daño promedio',
      statsEarned: 'Ganado',
      statsCountries: 'Paises',
      statsLongest: 'Viaje mas largo',
      statsModded: (n) => n + ' con economia modeada, afuera de la plata.',
      statsOnlyTrips: "Aca solo cuenta lo manejado con un trabajo. La distancia manejada de arriba suma tambien lo manejado sin trabajo.",
      jobKindCar: "auto",
      filterKind: "Tipo",
      filterTruck: "Camion",
      filterCar: "Auto",
      tripVehicle: "Vehiculo",
      statsCarJobs: "Trabajos con auto",
      achCar_t: "Entrega en auto",
      achCar_d: "Entrega un trabajo con auto.",
      linkPendingTitle: "Vincular Truck Dash en esta PC?",
      linkPendingBody: (n) => 'Truck Dash en "' + n + '" quiere guardar tus viajes en esta cuenta. Verifica que este codigo sea el mismo que muestra Truck Dash:',
      linkSignInFirst: "Entra para vincular Truck Dash en tu PC. El codigo te espera aca.",
      tripSpeed: "Velocidad",
      navAchievements: "Logros",
      achievementsTitle: "Logros",
      recentAchTitle: "Ultimos logros",
      achAll: "Todos los logros",
      achCount: (n, total) => n + ' de ' + total,
      achUnlocked: (d) => 'Desbloqueado el ' + d,
      achLocked: "Bloqueado",
      achFirst_t: "Primera entrega",
      achFirst_d: "Entrega tu primer trabajo.",
      achDeliveries_t: (n) => n + ' entregas',
      achDeliveries_d: (n) => 'Entrega ' + n + ' trabajos.',
      achKm_t: (d) => d + ' de ruta',
      achKm_d: (d) => 'Maneja ' + d + ', con o sin trabajo.',
      achLong_t: "Larga distancia",
      achUltraLong_t: "De punta a punta",
      achLong_d: (d) => 'Entrega un trabajo de ' + d + ' o mas.',
      achCountries_t: (n) => n + ' paises',
      achCountries_d: (n) => 'Pasa por ' + n + ' paises en ETS2.',
      achStates_t: (n) => n + ' estados',
      achStates_d: (n) => 'Pasa por ' + n + ' estados en ATS.',
      achStreak_t: "Siempre a tiempo",
      achStreak_d: (n) => n + ' entregas seguidas a tiempo.',
      achClean_t: "Sin antecedentes",
      achClean_d: (n) => n + ' entregas seguidas sin multas.',
      achSpotless_t: "Ni un rayon",
      achSpotless_d: (d) => 'Entrega un trabajo de ' + d + ' o mas sin daño.',
      achHeavy_t: "Carga pesada",
      achHeavy_d: (m) => 'Entrega una carga de ' + m + ' o mas.',
      achFerry_t: "Marinero",
      achFerry_d: "Toma un ferry o un tren durante un trabajo.",
      achPayday_t: "Dia de cobro",
      achPayday_d: (n) => 'Gana ' + n + ' en una sola entrega.',
      achBoth_t: "De los dos lados del charco",
      achBoth_d: "Entrega en ETS2 y en ATS.",
      recordsTitle: "Records personales",
      recBestPay: "Mejor pago",
      recBestAvg: "Mejor promedio",
      recHeaviest: "Carga mas pesada",
      recEfficient: "Menor consumo",
      fuelByTruckTitle: "Consumo por camion",
      drivingNow: "Manejando ahora",
      drivingProgress: (a, b) => a + ' de ' + b,
      drivingSince: (d) => 'desde ' + d,
      tripMarkCancelled: "Marcar como cancelado",
      tripMarkUnfinished: "Marcar como sin terminar",
      tripNoteLabel: "Nota",
      tripNotePlaceholder: "Solo la ves vos.",
      tripNoteSave: "Guardar nota",
      estado_invalido: "Ese estado no se puede poner a mano.",
      viaje_cerrado: "Este viaje ya esta cerrado.",
      nota_muy_larga: "La nota puede tener hasta 500 caracteres.",
      exportCsv: "Exportar CSV",
      publicLabel: "Perfil del conductor",
      publicNotFound: "Este perfil no existe o es privado.",
      publicLinkLabel: "Tu perfil publico:",
      copyLink: "Copiar",
      linkCopied: "Link copiado",
      activityTitle: "Actividad",
      metricDistance: "Distancia",
      metricTrips: "Entregas",
      metricHours: "Horas al volante",
      periodWeek: "Por semana",
      periodMonth: "Por mes",
      calendarTitle: "Dias en la ruta",
      calLess: "Menos",
      calMore: "Mas",
      activityEmpty: "Todavia no hay manejo en el ultimo ano.",
      statsFreeRoam: (d, h) => 'Manejo libre: ' + d + ' \u00b7 ' + h + ' al volante',
      topCountries: "Paises mas visitados",
      topStates: "Estados mas visitados",
      topTrucks: "Camiones mas usados",
      topCargo: "Cargas mas llevadas",
      topCompanies: "Empresas mas trabajadas",
      topCities: "Ciudades mas visitadas",
      topRoutes: "Rutas mas repetidas",
      totalsAll: 'todo lo manejado, con o sin trabajo',
      navOverview: "Resumen",
      navLogbook: "Bitacora",
      navFollowing: 'Siguiendo',
      followTitle: 'Seguir a alguien',
      followPlaceholder: 'Nombre de usuario',
      followBtn: 'Seguir',
      followSent: (n) => 'Solicitud enviada a ' + n + '. Vas a ver su actividad cuando la acepte.',
      followAlready: (n) => 'Ya seguís a ' + n + '.',
      followNotFound: 'No hay nadie con ese nombre de usuario.',
      followTooMany: 'Demasiadas solicitudes por hoy. Probá mañana.',
      followHint: 'Seguir es en un solo sentido y hay que aceptarlo. Cuando aceptás a alguien, ve tus viajes con su recorrido, dónde estás mientras manejás y tus logros, aunque tu perfil sea privado. Tus notas siguen siendo tuyas.',
      requestsTitle: 'Solicitudes para seguirte',
      accept: 'Aceptar',
      reject: 'Rechazar',
      liveTitle: 'Ahora',
      liveEmpty: 'Todavía no seguís a nadie. Seguí a alguien por su nombre de usuario o desde su perfil público.',
      liveDriving: 'Manejando',
      liveNear: (c) => 'cerca de ' + c,
      liveLast: (r) => 'Manejó por última vez ' + r,
      liveNever: 'Todavía sin viajes',
      feedTitle: 'Actividad reciente',
      feedEmpty: 'Nada de la gente que seguís en los últimos 30 días.',
      feedDelivered: (n, r) => n + ' entregó ' + r,
      feedStarted: (n, r) => n + ' arrancó ' + r,
      feedCancelled: (n, r) => n + ' canceló ' + r,
      feedAchievement: (n, a) => n + ' desbloqueó ' + a,
      followingList: 'Seguís a',
      followersList: 'Te siguen',
      outgoingList: 'Solicitudes que enviaste',
      blockedList: 'Bloqueados',
      listEmpty: 'Nadie todavía.',
      unfollow: 'Dejar de seguir',
      removeFollower: 'Sacar',
      block: 'Bloquear',
      unblock: 'Desbloquear',
      cancelRequest: 'Retirar solicitud',
      sureAgain: '¿Seguro? Tocá de nuevo',
      followStateFollowing: 'Siguiendo',
      followStatePending: 'Solicitud enviada',
      followsYou: 'Te sigue',
      followsYouPending: (n) => n + ' quiere seguirte',
      privateLocked: (n) => 'Este perfil es privado. Seguí a ' + n + ' para ver sus viajes cuando acepte.',
      signInToFollow: 'Entrá para seguir',
      navSettings: "Ajustes",
      dashLabel: "Panel del conductor",
      welcomeBack: (n) => 'Hola de nuevo, ' + n + '!',
      quickDistance: "Distancia manejada",
      quickDeliveries: "Entregas",
      quickHours: "Al volante",
      quickLastSeen: "Ultimo lugar",
      quickOnTime: (n) => n + ' a tiempo',
      quickSessions: (n) => n + ' sesiones',
      recentTitle: "Ultimos viajes",
      openLogbook: "Mi bitacora",
      logbookTitle: "Bitacora",
      logbookCount: (n) => n === 1 ? '1 viaje' : n + ' viajes',
      logbookNoMatch: "Ningun viaje coincide con estos filtros.",
      filterGame: "Juego",
      filterStatus: "Estado",
      filterAll: "Todos",
      filterInProgress: "En curso",
      filterCancelled: "Cancelados",
      filterAbandoned: "Sin terminar",
      colDate: "Fecha",
      colRoute: "Origen → destino",
      colDistance: "Distancia",
      colTime: "Tiempo",
      colPay: "Pago",
      tripDetails: 'Detalle',
      tripPlanned: 'Planeado',
      tripTruck: 'Camion',
      tripAvgSpeed: 'Promedio',
      tripGameTime: 'Tiempo de juego',
      tripRouteGaps: 'Punteado donde no se siguio el recorrido: Truck Dash cerrado, o un salto (quick job, ferry, tren).',
      tripNoRoute: 'De este viaje no se guardo el recorrido.',
      tripTrimmed: 'Este viaje paso el limite de lo que se guarda, asi que falta parte del recorrido o de la distancia que rastreamos. La entrega, el pago y la distancia del juego estan completos.',
      tripAbandonedHelp: 'Dejamos de tener noticias de este trabajo sin verlo entregado ni cancelado. Si lo entregaste con Truck Dash cerrado, o cargaste otra partida, no pudimos ver cómo terminó. Abajo lo podés marcar como cancelado; una entrega solo la puede decir el juego.',
      tripsTitle: 'Tus viajes',
      tripsEmpty: 'Todavia no hay nada. Vincula esta PC a Truck Dash y tus viajes van a ir apareciendo solos mientras manejas.',
      tripsEmptyDriven: 'Todavia no hay viajes guardados. Manejar sin carga suma a tus totales, pero no es un viaje.',
      tripsMore: 'Ver mas',
      tripUnnamed: 'Viaje',
      tripOpen: 'manejando ahora',
      tripOnTime: 'a tiempo',
      tripLate: 'tarde',
      tripCancelled: 'cancelado',
      tripAbandoned: 'sin terminar',
      tripModded: 'economia modeada',
      tripTracked: (d) => 'rastreamos ' + d,
      tripWheel: (h) => h + ' al volante',
      tripTotalTime: (h) => h + ' en total',
      tripAsleep: (h) => h + ' durmiendo',
      tripTop: (v) => 'maxima ' + v,
      tripFuel: 'Combustible',
      tripTolls: 'Peajes',
      tripPenalty: 'Penalidad por cancelar',
      tripOffered: 'Ofrecido',
      statsPenalties: 'Penalidades por cancelar',
      tripFines: 'Multas',
      tripFerries: 'Ferries',
      tripDamage: 'Daño',
      tripRemove: 'Borrar',
      tripRemoveSure: '¿Borrar para siempre?',
      loading: 'Cargando...',
      offline: 'No se puede contactar al servicio de cuentas. Proba de nuevo en un minuto.',
      signInTitle: 'Entrar',
      signInIntro: 'Entra para conservar tus viajes y tus estadisticas en todos tus dispositivos.',
      signInDiscord: 'Continuar con Discord',
      signInGoogle: 'Continuar con Google',
      supportStats: '¿Te gustan tus estadísticas? Truck Dash es gratis y lo hace una sola persona.',
      teaButton: '¡Invitame un tecito!',
      emailOr: 'o con tu mail',
      emailLabel: 'Mail',
      emailPasswordLabel: 'Contraseña',
      emailNewPasswordLabel: 'Contraseña nueva',
      emailPasswordRules: 'Al menos 8 caracteres.',
      emailSignIn: 'Entrar',
      emailCreateAccount: 'Crear una cuenta',
      emailForgot: '¿Olvidaste tu contraseña?',
      emailBackToSignIn: 'Volver a entrar',
      emailSendCode: 'Mandar código',
      emailCodeLabel: 'Código del mail',
      emailCreate: 'Crear cuenta',
      emailSavePassword: 'Guardar y entrar',
      emailResend: 'Mandar otro código',
      emailCodeResent: 'Te mandamos un código nuevo.',
      emailTitleSignup: 'Crear una cuenta',
      emailTitleReset: 'Elegir una contraseña nueva',
      emailLinkTitle: 'Agregar mail y contraseña',
      mail_invalido: 'Eso no parece un mail.',
      codigo_mail_invalido: 'Ese código no es. Usá el del último mail.',
      codigo_mail_vencido: 'Ese código venció o se probó demasiadas veces. Pedí uno nuevo.',
      contrasena_corta: 'La contraseña necesita al menos 8 caracteres.',
      contrasena_larga: 'La contraseña es demasiado larga: 200 caracteres como máximo.',
      credenciales_invalidas: 'Mail o contraseña incorrectos.',
      mail_no_enviado: 'No pudimos mandar el mail ahora. Probá de nuevo en unos minutos, o entrá con Discord o Google.',
      emailCodeSent: (m) => 'Te mandamos un código de 6 cifras a ' + m + '. Vale 15 minutos. Si ese mail ya tiene cuenta, el mail te lo dice.',
      emailResetSent: (m) => 'Si ' + m + ' tiene cuenta, le mandamos un código de 6 cifras. Vale 15 minutos.',
      demasiados_intentos: (s) => 'Demasiados intentos. Probá de nuevo en ' + s + '.',
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
      deviceHint: 'En Truck Dash en tu PC, abrí "Configuración y estado" y tocá "Vincular cuenta": muestra un código como ABCD-1234. Escribilo acá para que tus viajes queden en esta cuenta. No es el código de 8 caracteres con el que conectás el tablero.',
      devicePairingCode: 'Ese parece el código para conectar el tablero. Acá va el de la cuenta: en "Configuración y estado", tocá "Vincular cuenta".',
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
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
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
    // El mail no es un boton: tiene su formulario (ver login con mail).
    disponibles.filter((p) => p !== 'email').forEach((p) => {
      const b = document.createElement('button');
      b.className = 'btn proveedor ' + p;
      b.innerHTML = (LOGOS[p] || '') + '<span></span>';
      // El texto por textContent y no dentro del innerHTML de arriba: es una
      // traduccion y podria traer caracteres que rompan el markup.
      b.querySelector('span').textContent = t('signIn' + p.charAt(0).toUpperCase() + p.slice(1));
      b.addEventListener('click', () => irAProveedor(p));
      caja.appendChild(b);
    });
    const conMail = disponibles.indexOf('email') >= 0;
    $('emailForm').hidden = !conMail;
    $('signInOr').hidden = !conMail || !caja.children.length;
    pintarMail();
  }

  // ------------------------------------------------------ login con mail
  // Un formulario, tres modos: entrar (mail y contrasena), crear cuenta y
  // contrasena nueva; los dos ultimos en dos pasos, con un codigo por mail.
  // La API nunca dice si un mail tiene cuenta, y los textos tampoco: "te
  // mandamos un codigo" vale para los dos casos.
  const mail = { modo: 'login', paso: 'mail', vinculando: false };
  let sugeridoMail = '';

  function pintarMail() {
    const conCodigo = mail.modo !== 'login';
    const paso2 = conCodigo && mail.paso === 'codigo';
    const titulo = mail.vinculando ? t('emailLinkTitle')
      : mail.modo === 'signup' ? t('emailTitleSignup')
      : mail.modo === 'reset' ? t('emailTitleReset') : '';
    $('emailTitle').textContent = titulo;
    $('emailTitle').hidden = !titulo;
    $('viewSignIn').classList.toggle('vinculando-mail', mail.vinculando);
    $('emailInput').readOnly = paso2;
    $('emailCodeRow').hidden = !paso2;
    $('emailPasswordRow').hidden = conCodigo && !paso2;
    $('emailPasswordLabel').textContent = t(mail.modo === 'reset' ? 'emailNewPasswordLabel' : 'emailPasswordLabel');
    $('emailPasswordInput').autocomplete = mail.modo === 'login' ? 'current-password' : 'new-password';
    $('emailPasswordRules').hidden = mail.modo === 'login';
    $('btnEmail').textContent = t(!conCodigo ? 'emailSignIn' : !paso2 ? 'emailSendCode'
      : mail.modo === 'signup' ? 'emailCreate' : 'emailSavePassword');
    $('emailToSignup').hidden = mail.modo !== 'login';
    $('emailToReset').hidden = mail.modo !== 'login';
    $('emailResend').hidden = !paso2;
    $('emailToLogin').hidden = mail.modo === 'login' || mail.vinculando;
    $('emailCancelLink').hidden = !mail.vinculando;
  }

  function pistaMail(texto, clase) {
    const h = $('emailHint');
    h.textContent = texto;
    h.className = 'hint' + (clase ? ' ' + clase : '');
  }

  function cambiarModoMail(modo) {
    mail.modo = modo;
    mail.paso = 'mail';
    $('emailCodeInput').value = '';
    $('emailPasswordInput').value = '';
    pistaMail('');
    pintarMail();
  }

  // Desde Ajustes: agregarle mail y contrasena a la cuenta abierta. La API
  // vincula en vez de crear otra cuenta porque hay sesion (como con Google).
  function abrirMail(modo, vinculando) {
    mail.vinculando = !!vinculando;
    cambiarModoMail(modo);
    if (vinculando) {
      $('emailInput').value = '';
      mostrarVista('viewSignIn');
    }
    $('emailInput').focus();
  }

  function esperaLegible(segundos) {
    const s = Math.max(1, Math.round(segundos || 60));
    return s >= 120 ? Math.ceil(s / 60) + ' min' : s + ' s';
  }

  function errorDeMail(r) {
    if (r.status === 429) return t('demasiados_intentos', esperaLegible(r.datos.reintentar_en));
    return t((r.datos && r.datos.error) || 'error');
  }

  async function pedirCodigoMail() {
    const r = await pedir('/auth/email/code', { method: 'POST', body: {
      email: $('emailInput').value.trim(), purpose: mail.modo, lang: idioma } });
    if (!r.ok) { pistaMail(errorDeMail(r), 'bad'); return false; }
    return true;
  }

  async function enviarMail(evento) {
    evento.preventDefault();
    const boton = $('btnEmail');
    const email = $('emailInput').value.trim();
    boton.disabled = true;
    try {
      if (mail.modo === 'login') {
        const r = await pedir('/auth/email/login', { method: 'POST', body: {
          email: email, password: $('emailPasswordInput').value } });
        if (!r.ok) { pistaMail(errorDeMail(r), 'bad'); return; }
        cambiarModoMail('login');
        await cargar();
        return;
      }
      if (mail.paso === 'mail') {
        if (!(await pedirCodigoMail())) return;
        mail.paso = 'codigo';
        pintarMail();
        pistaMail(t(mail.modo === 'signup' ? 'emailCodeSent' : 'emailResetSent', email));
        $('emailCodeInput').focus();
        return;
      }
      const ruta = mail.modo === 'signup' ? '/auth/email/signup' : '/auth/email/reset';
      const r = await pedir(ruta, { method: 'POST', body: { email: email,
        code: $('emailCodeInput').value.trim(), password: $('emailPasswordInput').value } });
      if (!r.ok) { pistaMail(errorDeMail(r), 'bad'); return; }
      if (r.datos.vinculado) avisar(t('savedOk'), 'ok');
      // Alta nueva: la pantalla de elegir nombre arranca con uno libre,
      // sacado del mail, igual que con Discord.
      sugeridoMail = r.datos.sugerido || '';
      mail.vinculando = false;
      cambiarModoMail('login');
      await cargar();
    } finally {
      boton.disabled = false;
    }
  }

  async function reenviarCodigoMail() {
    if (await pedirCodigoMail()) pistaMail(t('emailCodeResent'), 'ok');
  }

  function cancelarVinculoMail() {
    mail.vinculando = false;
    cambiarModoMail('login');
    cargar();
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
        boton.addEventListener('click', () => (p === 'email' ? abrirMail('signup', true) : irAProveedor(p)));
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

  function pintarTitulo(titulo) {
    $('userTitle').textContent = titulo || '';
    $('userTitle').hidden = !titulo;
  }

  function pintarCuenta() {
    $('displayName').textContent = t('welcomeBack', usuario.username || '');
    pintarTitulo(usuario.title);
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
    pintarLinkPublico();
    mostrarVinculoPendiente();
    pintarLogins();
    pintarSesiones();
    mostrarViajes();
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
    pintarLinkPublico();
  }

  function linkPublico() {
    return location.origin + '/u/?' + encodeURIComponent(usuario.username || '');
  }

  function pintarLinkPublico() {
    const visible = !!(usuario && usuario.is_public && usuario.username);
    $('publicLink').hidden = !visible;
    if (visible) {
      $('publicLinkUrl').href = linkPublico();
      $('publicLinkUrl').textContent = linkPublico().replace(/^https?:\/\//, '');
    }
  }

  async function cerrarSesion() {
    await pedir('/auth/logout', { method: 'POST' });
    usuario = null;
    olvidarViajes();
    mostrarVista('viewSignIn');
  }

  async function cerrarTodas() {
    const { ok, datos } = await pedir('/auth/logout-all', { method: 'POST' });
    if (!ok) { avisar(t(datos.error || 'error'), 'bad'); return; }
    avisar(t('signedOutAll', datos.cerradas || 0), 'ok');
    usuario = null;
    olvidarViajes();
    mostrarVista('viewSignIn');
  }

  // ------------------------------------------- vincular desde el link
  // El link del cliente trae el codigo, pero NO vincula solo: si lo hiciera,
  // alguien podria arrancar una vinculacion en su PC, mandarte el link y
  // quedarse con un token de tu cuenta con que lo abras. Se muestra el
  // nombre de la PC y el codigo, para compararlo con el de Truck Dash, y se
  // pide confirmar.
  let vinculoMostrado = null;

  async function mostrarVinculoPendiente() {
    const codigo = linkPendiente();
    const tarjeta = $('cardLinkPending');
    if (!codigo) { tarjeta.hidden = true; return; }
    if (vinculoMostrado === codigo && !tarjeta.hidden) return;
    vinculoMostrado = codigo;
    const previo = await pedir('/user/device/' + encodeURIComponent(codigo));
    if (!previo.ok) {
      // Vencido o ya usado: se dice y se olvida, no queda dando vueltas.
      guardarLinkPendiente(null);
      tarjeta.hidden = true;
      avisar(t(previo.datos.error || 'error'), 'bad');
      return;
    }
    $('linkPendingBody').textContent = t('linkPendingBody', previo.datos.device_name || 'Truck Dash');
    $('linkPendingCode').textContent = codigo;
    $('linkPendingHint').textContent = '';
    tarjeta.hidden = false;
    tarjeta.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  async function aprobarVinculoPendiente() {
    const codigo = linkPendiente();
    if (!codigo) return;
    const boton = $('btnLinkApprove');
    boton.disabled = true;
    const previo = await pedir('/user/device/' + encodeURIComponent(codigo));
    const { ok, datos } = await pedir('/user/device/approve', { method: 'POST', body: { code: codigo } });
    boton.disabled = false;
    if (!ok) {
      $('linkPendingHint').textContent = t(datos.error || 'error');
      $('linkPendingHint').className = 'hint bad';
      return;
    }
    guardarLinkPendiente(null);
    $('cardLinkPending').hidden = true;
    avisar(t('deviceLinked', (previo.ok && previo.datos.device_name) || 'Truck Dash'), 'ok');
    pintarSesiones();
  }

  function cancelarVinculoPendiente() {
    guardarLinkPendiente(null);
    $('cardLinkPending').hidden = true;
  }

  async function vincularDispositivo(evento) {
    evento.preventDefault();
    const code = $('deviceInput').value.trim();
    if (!code) return;
    const hint = $('deviceHintMsg');
    const boton = $('btnDeviceApprove');
    // El cliente muestra dos codigos y es facil pegar el que no es: el de
    // conectar el tablero usa letras que el de la cuenta nunca tiene (B, I,
    // O, S, 0, 1, 2...; ver devices.ALFABETO en la API). Se dice cual falta
    // en vez del "no vale o vencio" de siempre.
    const limpio = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (limpio.length === 8 && /[^ACDEFHJKLMNPQRTVWXY3-9]/.test(limpio)) {
      hint.textContent = t('devicePairingCode');
      hint.className = 'hint bad';
      return;
    }
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
    // Sin sangria: trae el recorrido de cada viaje, y con sangria cada
    // coordenada ocupa su propia linea y el archivo pesa varias veces mas.
    const blob = new Blob([JSON.stringify(datos)], { type: 'application/json' });
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
    if (modoPublico) { cargarPublico(); return; }
    $('supportLine').hidden = false;
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
    if (!usuario) {
      // Vino a vincular la PC sin haber entrado: se le dice por que tiene
      // que entrar, y el codigo espera en la sesion.
      $('linkSignInNotice').hidden = !linkPendiente();
      mostrarVista('viewSignIn');
      return;
    }
    if (!usuario.username) {
      pedirNombre(PARAMS.get('sugerido') || sugeridoMail || '');
      return;
    }
    pintarCuenta();
    // Cuantas solicitudes esperan respuesta, para el numerito del menu.
    pedir('/follow').then((r) => { if (r.ok) pintarBadge((r.datos.requests || []).length); });
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
    ['auth_error', 'sugerido', 'vinculado', 'nuevo', 'link'].forEach((clave) => {
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
      else if (modoPublico) pintarPublico();
    });
  }

  // ------------------------------------------------------------ banderas
  // Chromium en Windows no dibuja las banderas de emoji, y ahi esta la mayor
  // parte de la gente que abre esto desde la PC donde juega. Se mide una vez
  // y, si no las dibuja, la hoja de estilos engancha una fuente que si.
  function dibujaBanderas() {
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return true;   // sin canvas no se puede saber: no molestar
      ctx.font = '32px sans-serif';
      // Si las dibuja, el par es UN glifo y mide como un emoji solo. Si no,
      // son dos letras sueltas en sus recuadros y mide el doble.
      const par = ctx.measureText('\u{1F1E6}\u{1F1E8}').width;
      const una = ctx.measureText('\u{1F1E6}').width;
      return par < una * 1.8;
    } catch (e) { return true; }
  }

  function banderaDe(codigo) {
    // Los indicadores regionales son las dos letras corridas a U+1F1E6.
    if (!/^[A-Za-z]{2}$/.test(codigo)) return null;
    const cc = codigo.toUpperCase();
    return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65,
                                0x1F1E6 + cc.charCodeAt(1) - 65);
  }

  let nombresDePais = null;
  function nombreDePais(codigo) {
    // Los sabe el navegador en los ocho idiomas. Una tabla propia serian
    // ocho listas de doscientos paises para mantener a mano.
    try {
      if (!nombresDePais || nombresDePais.idioma !== idioma) {
        nombresDePais = {
          idioma: idioma,
          nombres: new Intl.DisplayNames([idioma], { type: 'region' })
        };
      }
      return nombresDePais.nombres.of(codigo.toUpperCase()) || codigo;
    } catch (e) { return codigo; }
  }

  function listaDePaises(codigos, etiqueta) {
    const caja = document.createElement('div');
    caja.className = 'paises';
    if (etiqueta) {
      const etq = document.createElement('span');
      etq.className = 'etq';
      etq.textContent = etiqueta;
      caja.appendChild(etq);
    }
    codigos.forEach((codigo) => {
      const bandera = banderaDe(codigo);
      const nombre = nombreDePais(codigo);
      const span = document.createElement('span');
      // Un codigo que no sea de dos letras (un mod raro) sigue saliendo como
      // texto: mejor eso que un recuadro vacio.
      span.className = bandera ? 'bandera' : 'tag';
      span.textContent = bandera || codigo.toUpperCase();
      span.title = nombre;
      // Una bandera sola no le dice nada a un lector de pantalla.
      span.setAttribute('role', 'img');
      span.setAttribute('aria-label', nombre);
      caja.appendChild(span);
    });
    return caja;
  }

  // -------------------------------------------------------- estadisticas
  // El resumen lo calcula el servidor: la web ve los viajes de a diez, asi
  // que sumar aca daria el resumen de la primera pagina y lo llamaria "tus
  // estadisticas".
  let resumen = [];
  let resumenPedido = false;

  function nombreDeRegion(region, juego) {
    // En ETS2 es un pais: el nombre lo pone el navegador en el idioma
    // elegido. En ATS es un estado y viene con su nombre en ingles, que es
    // como se llaman (y como los muestra el juego). Un pais de un mod sin
    // codigo (Grand Utopia) va con el nombre que trae.
    if (!region) return null;
    if (juego === 'ets2' && region.code) return nombreDePais(region.code);
    return region.name || region.code || null;
  }

  function listaTop(titulo, items, texto) {
    if (!items || !items.length) return null;
    const caja = document.createElement('div');
    const h = document.createElement('h4');
    h.textContent = titulo;
    caja.appendChild(h);
    const ol = document.createElement('ol');
    items.forEach((it) => {
      const li = document.createElement('li');
      li.appendChild(document.createTextNode(texto(it)));
      const cuenta = document.createElement('span');
      cuenta.textContent = ' \u00b7 ' + t('logbookCount', it.trips);
      li.appendChild(cuenta);
      ol.appendChild(li);
    });
    caja.appendChild(ol);
    return caja;
  }

  function cifra(valor, etiqueta) {
    if (valor == null) return null;
    const caja = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = valor;
    const s = document.createElement('span');
    s.textContent = etiqueta;
    caja.appendChild(b);
    caja.appendChild(s);
    return caja;
  }

  function renglon(partes) {
    // Sin nada que decir no hay renglon: si no, un viaje sin velocidad
    // media ni paises dejaba una linea vacia ocupando lugar.
    const texto = partes.filter(Boolean).join(' \u00b7 ');
    if (!texto) return null;
    const div = document.createElement('div');
    div.className = 'renglon';
    div.textContent = texto;
    return div;
  }

  function sumar(caja, nodo) {
    if (nodo) caja.appendChild(nodo);
  }

  function bloqueJuego(s) {
    const caja = document.createElement('div');
    caja.className = 'juego';
    const titulo = document.createElement('h3');
    titulo.textContent = (s.game || '').toUpperCase();
    caja.appendChild(titulo);

    const cifras = document.createElement('div');
    cifras.className = 'cifras';
    [
      cifra(numero(s.trips), t('statsTrips')),
      cifra(numero(s.delivered), t('statsDelivered')),
      s.car_jobs ? cifra(numero(s.car_jobs), t('statsCarJobs')) : null,
      s.on_time ? cifra(numero(s.on_time), t('statsOnTime')) : null,
      s.late ? cifra(numero(s.late), t('statsLate')) : null,
      s.unfinished ? cifra(numero(s.unfinished), t('statsUnfinished')) : null,
      cifra(distancia(s.distance_km), t('statsDistance')),
      cifra(duracion(s.real_hours), t('statsWheel')),
      s.max_speed ? cifra(velocidad(s.max_speed), t('statsTopSpeed')) : null,
      s.damage_avg ? cifra(numero(s.damage_avg, 1) + ' %', t('statsDamage')) : null,
      s.fuel_used ? cifra(volumen(s.fuel_used), t('tripFuel')) : null
    ].filter(Boolean).forEach((c) => cifras.appendChild(c));
    caja.appendChild(cifras);

    // Manejo libre: lo de las sesiones que no fue viaje (ir a buscar la
    // carga, volver vacio). Lo calcula el servidor.
    if (s.free && (s.free.distance_km || s.free.real_hours)) {
      sumar(caja, renglon([t('statsFreeRoam', distancia(s.free.distance_km),
                             duracion(s.free.real_hours) || '0 min')]));
    }

    // La plata, por moneda: sumar euros con libras no da nada.
    (s.money || []).forEach((m) => {
      sumar(caja, renglon([
        t('statsEarned') + ' ' + plata(m.revenue, m.currency),
        m.tolls ? t('tripTolls') + ' ' + plata(m.tolls, m.currency) : null,
        m.fines ? t('tripFines') + ' ' + plata(m.fines, m.currency) : null,
        m.ferries ? t('tripFerries') + ' ' + plata(m.ferries, m.currency) : null,
        m.penalties ? t('statsPenalties') + ' ' + plata(m.penalties, m.currency) : null
      ]));
    });
    // Por que la plata no cierra con la cantidad de viajes.
    if (s.modded) {
      const aviso = document.createElement('div');
      aviso.className = 'aviso';
      aviso.textContent = t('statsModded', numero(s.modded));
      caja.appendChild(aviso);
    }

    if ((s.countries || []).length) {
      caja.appendChild(listaDePaises(s.countries, t('statsCountries')));
    }
    // Lo mas repetido, de a tres.
    const top = s.top || {};
    const tops = document.createElement('div');
    tops.className = 'tops';
    [
      listaTop(t(s.game === 'ats' ? 'topStates' : 'topCountries'), top.regions,
               (r) => nombreDeRegion(r, s.game) || '?'),
      listaTop(t('topTrucks'), top.trucks, (c) => c.name),
      listaTop(t('topCargo'), top.cargo, (c) => c.name),
      listaTop(t('topCompanies'), top.companies, (c) => c.name),
      listaTop(t('topCities'), top.cities, (c) => c.name),
      listaTop(t('topRoutes'), top.city_pairs, (r) => r.from + ' \u2192 ' + r.to)
    ].filter(Boolean).forEach((l) => tops.appendChild(l));
    if (tops.children.length) caja.appendChild(tops);

    // Records personales: cada uno con el viaje que lo marco.
    const r = s.records || {};
    const donde = (x) => [x.city_src, x.city_dst].filter(Boolean).join(' \u2192 ') || t('tripUnnamed');
    const records = [
      r.best_pay ? [t('recBestPay'), plata(r.best_pay.value, r.best_pay.currency), r.best_pay] : null,
      s.longest ? [t('statsLongest'), distancia(s.longest.distance_km), s.longest] : null,
      r.best_avg_speed ? [t('recBestAvg'), velocidad(r.best_avg_speed.value), r.best_avg_speed] : null,
      r.heaviest ? [t('recHeaviest'), [masa(r.heaviest.value), r.heaviest.cargo].filter(Boolean).join(' \u00b7 '), r.heaviest] : null,
      r.most_efficient ? [t('recEfficient'), consumo(r.most_efficient.value), r.most_efficient] : null
    ].filter(Boolean);
    const bloques = document.createElement('div');
    bloques.className = 'tops';
    if (records.length) {
      const caja2 = document.createElement('div');
      const h = document.createElement('h4');
      h.textContent = t('recordsTitle');
      caja2.appendChild(h);
      const ul = document.createElement('ul');
      ul.className = 'records';
      records.forEach(([rotulo, valor, viaje]) => {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = rotulo + ': ' + valor;
        li.appendChild(b);
        const sub = document.createElement('span');
        sub.textContent = ' \u00b7 ' + donde(viaje);
        li.appendChild(sub);
        ul.appendChild(li);
      });
      caja2.appendChild(ul);
      bloques.appendChild(caja2);
    }
    // Consumo por camion, del que menos gasta al que mas: con los km que
    // midio el cliente, que son en los que se midio el combustible.
    if ((s.fuel_by_truck || []).length) {
      const caja3 = document.createElement('div');
      const h = document.createElement('h4');
      h.textContent = t('fuelByTruckTitle');
      caja3.appendChild(h);
      const ul = document.createElement('ul');
      ul.className = 'records';
      s.fuel_by_truck.forEach((c) => {
        const li = document.createElement('li');
        li.appendChild(document.createTextNode(c.name + ' \u00b7 '));
        const b = document.createElement('b');
        b.textContent = consumo(c.l_per_100km);
        li.appendChild(b);
        const sub = document.createElement('span');
        sub.textContent = ' \u00b7 ' + distancia(c.distance_km);
        li.appendChild(sub);
        ul.appendChild(li);
      });
      caja3.appendChild(ul);
      bloques.appendChild(caja3);
    }
    if (bloques.children.length) caja.appendChild(bloques);
    return caja;
  }

  function pintarResumen() {
    const cuerpo = $('statsBody');
    cuerpo.innerHTML = '';
    resumen.forEach((s) => cuerpo.appendChild(bloqueJuego(s)));
    if (resumen.length) {
      const nota = document.createElement('div');
      nota.className = 'nota-stats';
      nota.textContent = t('statsOnlyTrips');
      cuerpo.appendChild(nota);
    }
    $('cardStats').hidden = resumen.length === 0;
  }

  async function traerResumen() {
    const { ok, datos } = await pedir('/trips/stats');
    if (!ok) return;
    resumen = datos.stats || [];
    pintarResumen();
    // Las entregas de la cinta salen de aca: las tres peticiones vuelven en
    // cualquier orden y cada una repinta lo que le toca.
    pintarCinta();
  }

  // ------------------------------------------------------------- viajes
  // Los totales salen de /sessions/totals y NO de sumar los viajes: los
  // kilometros de un viaje tambien son kilometros de sesion, asi que sumar
  // las dos tablas los cuenta dos veces. El backend tiene esa ruta
  // justamente para que esa cuenta se haga en un solo lugar.
  // Las unidades son las de la app: mismo dominio, misma clave, misma
  // preferencia. Se pueden cambiar desde aca o desde la app, pero es UNA
  // sola: cambiarla aca la cambia alla, y no hay dos interruptores que
  // digan cosas distintas.
  const AJUSTES_APP = 'truckdash_settings';
  let enMillas = (() => {
    try {
      const cfg = JSON.parse(localStorage.getItem(AJUSTES_APP)) || {};
      return !!cfg.useImperial;
    } catch (e) { return false; }
  })();
  function imperial() { return enMillas; }

  function armarSelectorDeUnidades() {
    const sel = $('unitSelect');
    sel.value = enMillas ? 'mi' : 'km';
    sel.addEventListener('change', () => {
      enMillas = sel.value === 'mi';
      try {
        // Se escribe encima de lo que ya tiene la app: ese objeto guarda
        // todos sus ajustes, no solo este.
        const cfg = JSON.parse(localStorage.getItem(AJUSTES_APP)) || {};
        cfg.useImperial = enMillas;
        localStorage.setItem(AJUSTES_APP, JSON.stringify(cfg));
      } catch (e) {}
      if (usuario && usuario.username) pintarCuenta();
      else if (modoPublico) pintarPublico();
    });
  }

  function numero(valor, decimales) {
    return valor.toLocaleString(idioma, { maximumFractionDigits: decimales || 0 });
  }
  function distancia(km) {
    if (km == null) return null;
    return imperial() ? numero(km * 0.621371) + ' mi' : numero(km) + ' km';
  }
  function velocidad(kmh) {
    if (kmh == null) return null;
    return imperial() ? numero(kmh * 0.621371) + ' mph' : numero(kmh) + ' km/h';
  }
  function volumen(litros) {
    if (litros == null) return null;
    return imperial() ? numero(litros * 0.264172) + ' gal' : numero(litros) + ' L';
  }
  function masa(kg) {
    if (kg == null) return null;
    return imperial() ? numero(kg * 2.20462) + ' lb' : numero(kg / 1000, 1) + ' t';
  }
  function duracion(horas) {
    if (horas == null) return null;
    const min = Math.round(horas * 60);
    if (min < 60) return min + ' min';
    // "9 h" y no "9 h 00": las horas justas son comunes (dormir son 9).
    if (min % 60 === 0) return (min / 60) + ' h';
    return Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0');
  }
  function consumo(litrosCada100) {
    // En millas, mpg (galon de EE. UU.): 235,215 / (l/100 km).
    if (litrosCada100 == null) return null;
    return imperial() ? numero(235.215 / litrosCada100, 1) + ' mpg'
                      : numero(litrosCada100, 1) + ' L/100 km';
  }
  function plata(monto, moneda) {
    // Sin convertir: el dinero del juego es del juego, y dos economias no se
    // comparan aunque las dos digan "EUR".
    if (monto == null) return null;
    return numero(monto) + (moneda ? ' ' + moneda : '');
  }

  function linea(partes) {
    const div = document.createElement('div');
    div.className = 'sub';
    div.textContent = partes.filter(Boolean).join(' \u00b7 ');
    return div;
  }

  function etiqueta(clase, texto) {
    const span = document.createElement('span');
    span.className = 'tag ' + clase;
    span.textContent = texto;
    return span;
  }

  // ------------------------------------------------------- detalle del viaje
  // Mapa de calor de velocidad: cada tramo de verde (lento) a rojo (rapido).
  // La escala es la del propio viaje, hasta el percentil 95: con un tope fijo
  // un viaje de pueblo saldria todo verde, y con el maximo un pico de un
  // segundo dejaria todo lo demas en verde.
  function topeDeVelocidad(segmentos) {
    const velocidades = [];
    segmentos.forEach((seg) => seg.forEach((p) => { if (p.length > 2) velocidades.push(p[2]); }));
    if (velocidades.length < 2) return null;
    velocidades.sort((a, b) => a - b);
    return Math.max(30, velocidades[Math.floor(0.95 * (velocidades.length - 1))]);
  }
  function colorDeVelocidad(kmh, tope) {
    const f = Math.max(0, Math.min(1, kmh / tope));
    return 'hsl(' + Math.round(120 - 120 * f) + ', 80%, 50%)';
  }

  function leyendaDeVelocidad(tope) {
    const caja = document.createElement('div');
    caja.className = 'leyenda-vel';
    caja.appendChild(document.createTextNode(t('tripSpeed') + ' '));
    const min = document.createElement('span');
    min.textContent = velocidad(0);
    caja.appendChild(min);
    const barra = document.createElement('i');
    caja.appendChild(barra);
    const max = document.createElement('span');
    max.textContent = velocidad(tope);
    caja.appendChild(max);
    return caja;
  }

  // Un salto de mas de 1,5 km entre dos puntos seguidos no es manejo: es un
  // teletransporte (quick job, ferry, tren, viaje rapido). El cliente ya no
  // los une, pero los viajes guardados antes si: aca se cortan al dibujar, y
  // un punto suelto antes del salto (de donde salio el quick job) se saca.
  const SALTO_MAXIMO_M = 1500;
  function cortarSaltos(segmentos) {
    const salida = [];
    segmentos.forEach((seg) => {
      let actual = [];
      seg.forEach((p) => {
        const previo = actual[actual.length - 1];
        if (previo && Math.hypot(p[0] - previo[0], p[1] - previo[1]) > SALTO_MAXIMO_M) {
          if (actual.length > 1) salida.push(actual);
          actual = [];
        }
        actual.push(p);
      });
      if (actual.length) salida.push(actual);
    });
    // Un punto solo al principio, lejos de todo lo demas, es de antes de
    // empezar: dibujarlo dejaba una punta azul a 22 km del viaje.
    if (salida.length > 1 && salida[0].length === 1) {
      const a = salida[0][0], b = salida[1][0];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > SALTO_MAXIMO_M) salida.shift();
    }
    return salida;
  }

  function dibujarRecorrido(segmentosCrudos) {
    // El recorrido es un array de SEGMENTOS, no una linea sola: manejar con
    // el cliente cerrado deja un agujero, y ese agujero va punteado. Unir
    // los extremos con una recta seria dibujar un tramo que nunca manejo.
    const segmentos = cortarSaltos(segmentosCrudos);
    const puntos = [];
    segmentos.forEach((seg) => seg.forEach((p) => puntos.push(p)));
    if (puntos.length < 2) return null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    puntos.forEach((p) => {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    });
    const ancho = (maxX - minX) || 1, alto = (maxY - minY) || 1;
    const aire = Math.max(ancho, alto) * 0.06;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ruta');
    // La z del juego crece hacia el sur y la y del SVG hacia abajo, asi que
    // el norte queda arriba sin dar vuelta nada.
    svg.setAttribute('viewBox',
      [minX - aire, minY - aire, ancho + aire * 2, alto + aire * 2].join(' '));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // La forma del recorrido decide el ancho; el alto lo pone el CSS.
    svg.style.aspectRatio = (ancho + aire * 2) + ' / ' + (alto + aire * 2);

    const linea = (clase, puntos2) => {
      const el = document.createElementNS(SVG_NS, 'polyline');
      el.setAttribute('class', clase);
      el.setAttribute('points', puntos2.map((p) => p[0] + ',' + p[1]).join(' '));
      // Sin esto el grosor se escala con el viewBox y un viaje corto sale
      // con una linea finita y uno largo con una gruesa.
      el.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(el);
    };
    // Con velocidad, tramo por tramo y del color de su velocidad; sin ella
    // (los viajes de antes de que el cliente la mandara), en azul como
    // siempre.
    const tope = topeDeVelocidad(segmentos);
    const tramos = document.createElementNS(SVG_NS, 'g');
    segmentos.forEach((seg, i) => {
      if (seg.length > 1) {
        if (tope && seg.every((p) => p.length > 2)) {
          for (let k = 1; k < seg.length; k++) {
            const a = seg[k - 1], b = seg[k];
            const el = document.createElementNS(SVG_NS, 'line');
            el.setAttribute('class', 'tramo');
            el.setAttribute('x1', a[0]); el.setAttribute('y1', a[1]);
            el.setAttribute('x2', b[0]); el.setAttribute('y2', b[1]);
            el.setAttribute('stroke', colorDeVelocidad((a[2] + b[2]) / 2, tope));
            el.setAttribute('vector-effect', 'non-scaling-stroke');
            tramos.appendChild(el);
          }
        } else {
          linea('traza', seg);
        }
      }
      const previo = segmentos[i - 1];
      if (previo && previo.length && seg.length) {
        linea('hueco', [previo[previo.length - 1], seg[0]]);
      }
    });
    svg.appendChild(tramos);
    [[puntos[0], ''], [puntos[puntos.length - 1], ' fin']].forEach(([p, extra]) => {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('class', 'punta' + extra);
      c.setAttribute('cx', p[0]);
      c.setAttribute('cy', p[1]);
      c.setAttribute('r', Math.max(ancho, alto) / 90);
      svg.appendChild(c);
    });
    return svg;
  }

  function panelDetalle(v) {
    const caja = document.createElement('div');
    caja.className = 'detalle';
    const d = v._detalle;
    if (!d) { sumar(caja, renglon([t('loading')])); return caja; }

    const dibujo = dibujarRecorrido(d.route || []);
    if (dibujo) {
      caja.appendChild(dibujo);
      const tope = topeDeVelocidad(cortarSaltos(d.route || []));
      if (tope) caja.appendChild(leyendaDeVelocidad(tope));
      // Solo se aclara si hay hueco: en un viaje entero no hay nada que
      // explicar.
      if (cortarSaltos(d.route || []).length > 1) sumar(caja, renglon([t('tripRouteGaps')]));
    } else {
      sumar(caja, renglon([t('tripNoRoute')]));
    }
    // Paso un tope del servidor (tramos o puntos): se dice que falta, para
    // que un hueco en el mapa o unos km de menos no parezcan un error.
    if (d.trimmed) sumar(caja, renglon([t('tripTrimmed')]));
    // Abandonado no es un error nuestro ni del jugador: dejamos de verlo. Lo
    // mas comun es haberlo entregado con el cliente cerrado, y sin esto
    // llegaba como "entregue y dice abandonado".
    if (d.status === 'abandoned') sumar(caja, renglon([t('tripAbandonedHelp')]));

    const empresas = [d.company_src, d.company_dst].filter(Boolean).join(' \u2192 ');
    if (empresas) sumar(caja, renglon([empresas]));
    sumar(caja, renglon([
      d.truck_name || d.truck_brand ? t(d.job_kind === 'car' ? 'tripVehicle' : 'tripTruck') + ' ' + [d.truck_brand, d.truck_name].filter(Boolean).join(' ') : null,
      d.distance_planned_km ? t('tripPlanned') + ' ' + distancia(d.distance_planned_km) : null,
      d.distance_tracked_km ? t('tripTracked', distancia(d.distance_tracked_km)) : null
    ]));
    // Los tiempos en horas de juego, como los muestra el juego. El total
    // (de tomar el trabajo a entregarlo) trae paradas y sueno, asi que se
    // dice cuanto fue durmiendo: si no, 4 h 11 contra 13 h 30 parece un
    // error. "4 h 11 al volante · 13 h 30 en total, 9 h durmiendo".
    // Aproximado cuando el juego no dio la hora de inicio (trabajo especial,
    // o seguido despues de reabrir el juego): sale de cuando se lo vio.
    const total = d.total_game_hours
      ? t('tripTotalTime', (d.total_game_hours_approx ? '≈ ' : '') + duracion(d.total_game_hours)) : null;
    const sueno = d.sleep_hours ? t('tripAsleep', duracion(d.sleep_hours)) : null;
    sumar(caja, renglon([
      d.game_hours ? t('tripWheel', duracion(d.game_hours)) : null,
      total && sueno ? total + ', ' + sueno : (total || sueno)
    ]));
    sumar(caja, renglon([
      d.avg_speed ? t('tripAvgSpeed') + ' ' + velocidad(d.avg_speed) : null,
      d.max_speed ? t('statsTopSpeed') + ' ' + velocidad(d.max_speed) : null
    ]));
    if ((d.countries || []).length) caja.appendChild(listaDePaises(d.countries));
    return caja;
  }

  // --------------------------------------------------------- manejando ahora
  async function traerActivo() {
    const { ok, datos } = await pedir('/trips/active');
    const caja = $('drivingBody');
    caja.innerHTML = '';
    const v = ok ? datos.trip : null;
    $('cardDriving').hidden = !v;
    if (!v) return;
    const ruta = document.createElement('div');
    ruta.className = 'ruta-ahora';
    ruta.textContent = [v.city_src, v.city_dst].filter(Boolean).join(' \u2192 ') || t('tripUnnamed');
    caja.appendChild(ruta);
    sumar(caja, renglon([v.cargo, masa(v.cargo_mass), [v.truck_brand, v.truck_name].filter(Boolean).join(' ')]));
    // El avance con lo que midio el cliente contra lo planeado: es lo unico
    // que hay mientras se maneja (la distancia del juego llega al entregar).
    const hecho = v.distance_tracked_km || 0, total = v.distance_planned_km || 0;
    if (total) {
      const barra = document.createElement('div');
      barra.className = 'barrita';
      const lleno = document.createElement('i');
      lleno.style.width = Math.min(100, hecho / total * 100).toFixed(1) + '%';
      barra.appendChild(lleno);
      caja.appendChild(barra);
      sumar(caja, renglon([t('drivingProgress', distancia(hecho), distancia(total)),
                           t('drivingSince', fechaHora(v.started_at))]));
    } else {
      sumar(caja, renglon([t('drivingSince', fechaHora(v.started_at))]));
    }
  }

  // ------------------------------------------------------------------ logros
  // La API dice cuales estan y cuando; el nombre, la descripcion y el icono
  // los pone la web por el id, en los ocho idiomas.
  let logros = [];
  const ICONOS_LOGRO = {
    entrega: 'M3 7h11v9H3zm11 3h4l3 3v3h-7zM6.5 19a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
    ruta: 'M12 2a6 6 0 0 1 6 6c0 4.5-6 11-6 11S6 12.5 6 8a6 6 0 0 1 6-6zm0 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4 21h16v1.5H4z',
    mundo: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 2.1A8 8 0 0 0 4.1 11H8c.1-2.6.9-5 3-6.9zm2 0c2.1 1.9 2.9 4.3 3 6.9h3.9A8 8 0 0 0 13 4.1zM10 11h4c-.1-2.3-.8-4.3-2-5.8-1.2 1.5-1.9 3.5-2 5.8zm-5.9 2A8 8 0 0 0 11 19.9c-2.1-1.9-2.9-4.3-3-6.9zm5.9 0c.1 2.3.8 4.3 2 5.8 1.2-1.5 1.9-3.5 2-5.8zm6 0c-.1 2.6-.9 5-3 6.9a8 8 0 0 0 6.9-6.9z',
    reloj: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 4v7l5 3 1-1.6-4-2.4V6z',
    escudo: 'M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5zm-1.2 13.4L17 9.2l-1.4-1.4-4.8 4.8-2.4-2.4L7 11.6z',
    pesa: 'M6 5h3v14H6zm9 0h3v14h-3zM2 8h3v8H2zm17 0h3v8h-3zM9 11h6v2H9z',
    barco: 'M4 14h16l-2 6H6zm2-8h5V3h2v3h5v6H6zm2 2v2h8V8z',
    moneda: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm1 4h-2v1.1c-1.8.4-3 1.6-3 3.1 0 1.9 1.6 2.7 3.6 3.2 1.6.4 2.1.8 2.1 1.4 0 .7-.8 1.2-1.9 1.2-1.3 0-2-.6-2.1-1.4H7.9c.1 1.7 1.3 2.8 3.1 3.2V19h2v-1.2c1.9-.4 3.1-1.6 3.1-3.2 0-2.2-1.9-2.9-3.8-3.4-1.4-.3-1.9-.7-1.9-1.3s.6-1.1 1.7-1.1c1.1 0 1.7.5 1.8 1.2h1.9c-.1-1.5-1.1-2.6-2.8-3z',
    dos: 'M2 6h9v12H2zm11 0h9v12h-9zM4 8v8h5V8zm11 0v8h5V8z',
    auto: 'M5 11l1.6-4.5A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.5L19 11a2 2 0 0 1 2 2v4h-2v1.5a1.5 1.5 0 0 1-3 0V17H8v1.5a1.5 1.5 0 0 1-3 0V17H3v-4a2 2 0 0 1 2-2zm2.1 0h9.8l-1.1-3.4a1 1 0 0 0-.9-.6h-5.8a1 1 0 0 0-.9.6zM6.5 15a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm11 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z'
  };

  function datosDeLogro(l) {
    // [icono, titulo, descripcion, como mostrar el progreso]
    const m = /^(deliveries|km|long_haul|countries|states)_(\d+)$/.exec(l.id);
    if (m) {
      const n = Number(m[2]);
      if (m[1] === 'deliveries') {
        return n === 1 ? ['entrega', t('achFirst_t'), t('achFirst_d'), numero]
                       : ['entrega', t('achDeliveries_t', numero(n)), t('achDeliveries_d', numero(n)), numero];
      }
      if (m[1] === 'km') return ['ruta', t('achKm_t', distancia(n)), t('achKm_d', distancia(n)), distancia];
      if (m[1] === 'long_haul') {
        return ['ruta', t(n >= 2500 ? 'achUltraLong_t' : 'achLong_t'), t('achLong_d', distancia(n)), distancia];
      }
      if (m[1] === 'countries') return ['mundo', t('achCountries_t', n), t('achCountries_d', n), numero];
      return ['mundo', t('achStates_t', n), t('achStates_d', n), numero];
    }
    const meta = l.progress ? l.progress.goal : 0;
    switch (l.id) {
      case 'on_time_streak': return ['reloj', t('achStreak_t'), t('achStreak_d', meta), numero];
      case 'clean_record': return ['escudo', t('achClean_t'), t('achClean_d', meta), numero];
      case 'spotless': return ['escudo', t('achSpotless_t'), t('achSpotless_d', distancia(300)), null];
      case 'heavy_load': return ['pesa', t('achHeavy_t'), t('achHeavy_d', masa(30000)), null];
      case 'ferry': return ['barco', t('achFerry_t'), t('achFerry_d'), null];
      case 'big_payday': return ['moneda', t('achPayday_t'), t('achPayday_d', numero(100000)), null];
      case 'both_games': return ['dos', t('achBoth_t'), t('achBoth_d'), null];
      case 'car_job': return ['auto', t('achCar_t'), t('achCar_d'), null];
      default: return ['entrega', l.id, '', null];
    }
  }

  function tarjetaLogro(l) {
    const [icono, titulo, desc, formato] = datosDeLogro(l);
    const caja = document.createElement('div');
    caja.className = 'logro' + (l.unlocked_at ? '' : ' bloqueado');
    const circulo = document.createElement('div');
    circulo.className = 'icono';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const camino = document.createElementNS(SVG_NS, 'path');
    camino.setAttribute('d', ICONOS_LOGRO[icono] || ICONOS_LOGRO.entrega);
    svg.appendChild(camino);
    circulo.appendChild(svg);
    caja.appendChild(circulo);
    const texto = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = titulo;
    texto.appendChild(b);
    const d = document.createElement('span');
    d.className = 'desc';
    d.textContent = desc;
    texto.appendChild(d);
    const pie = document.createElement('span');
    pie.className = 'pie';
    if (l.unlocked_at) {
      pie.textContent = t('achUnlocked', fechaCorta(l.unlocked_at));
    } else if (formato && l.progress && l.progress.goal > 1) {
      pie.textContent = formato(l.progress.value) + ' / ' + formato(l.progress.goal);
      const barra = document.createElement('div');
      barra.className = 'barrita';
      const lleno = document.createElement('i');
      lleno.style.width = Math.min(100, l.progress.value / l.progress.goal * 100).toFixed(1) + '%';
      barra.appendChild(lleno);
      texto.appendChild(pie);
      texto.appendChild(barra);
      caja.appendChild(texto);
      return caja;
    } else {
      pie.textContent = t('achLocked');
    }
    texto.appendChild(pie);
    caja.appendChild(texto);
    return caja;
  }

  function ordenarLogros(lista) {
    // Primero los desbloqueados, del mas nuevo; despues los que faltan, del
    // que esta mas cerca.
    const avance = (l) => (l.progress && l.progress.goal ? l.progress.value / l.progress.goal : 0);
    return lista.slice().sort((a, b) => {
      if (a.unlocked_at && b.unlocked_at) return b.unlocked_at.localeCompare(a.unlocked_at);
      if (a.unlocked_at) return -1;
      if (b.unlocked_at) return 1;
      return avance(b) - avance(a);
    });
  }

  function pintarLogros() {
    const hechos = logros.filter((l) => l.unlocked_at).length;
    const grilla = $('achievementsGrid');
    grilla.innerHTML = '';
    ordenarLogros(logros).forEach((l) => grilla.appendChild(tarjetaLogro(l)));
    $('achievementsCount').textContent = t('achCount', hechos, logros.length);
    // En el resumen, los ultimos cuatro (en el perfil publico, todos).
    const recientesLogros = ordenarLogros(logros.filter((l) => l.unlocked_at));
    const muestra = modoPublico ? recientesLogros : recientesLogros.slice(0, 4);
    const chica = $('recentAchGrid');
    chica.innerHTML = '';
    muestra.forEach((l) => chica.appendChild(tarjetaLogro(l)));
    $('recentAchCount').textContent = modoPublico ? numero(hechos) : t('achCount', hechos, logros.length);
    $('cardRecentAch').hidden = muestra.length === 0;
  }

  async function traerLogros() {
    const { ok, datos } = await pedir('/trips/achievements');
    if (!ok) return;
    logros = datos.achievements || [];
    pintarLogros();
  }

  // ------------------------------------------------------------- exportar CSV
  async function exportarCsv() {
    // Todo el logbook con los filtros que esten puestos, de a 50 (el tope
    // de la API). Se arma en el navegador: el archivo no pasa por otro lado.
    const boton = $('btnExportCsv');
    boton.disabled = true;
    const todos = [];
    let total = Infinity;
    while (todos.length < total) {
      const consulta = ['limite=50', 'desde=' + todos.length].concat(filtrosDelLogbook());
      const { ok, datos } = await pedir('/trips?' + consulta.join('&'));
      if (!ok) { boton.disabled = false; avisar(t('error'), 'bad'); return; }
      const pagina = datos.trips || [];
      total = datos.total != null ? datos.total : todos.length + pagina.length;
      todos.push(...pagina);
      if (!pagina.length) break;
    }
    const columnas = ['started_at', 'delivered_at', 'game', 'job_kind', 'status', 'city_src', 'city_dst',
      'company_src', 'company_dst', 'cargo', 'cargo_mass', 'distance_planned_km',
      'distance_game_km', 'distance_tracked_km', 'game_hours', 'total_game_hours', 'total_game_hours_approx',
      'sleep_hours', 'real_hours', 'revenue', 'currency', 'modded', 'fuel_used', 'tolls',
      'fines', 'ferries', 'cancel_penalty', 'damage_delta', 'on_time', 'truck_brand', 'truck_name',
      'countries', 'note', 'trimmed'];
    const celdaCsv = (valor) => {
      if (valor == null) return '';
      const texto = Array.isArray(valor) ? valor.join(' ') : String(valor);
      return /[",\n\r;]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
    };
    const lineas = [columnas.join(',')].concat(
      todos.map((v) => columnas.map((c) => celdaCsv(v[c])).join(',')));
    // La marca BOM es para que Excel lea los acentos como UTF-8.
    const blob = new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'truckdash-logbook.csv';
    a.click();
    URL.revokeObjectURL(url);
    boton.disabled = false;
  }

  // ----------------------------------------------------------- perfil publico
  function pintarPublico() {
    const p = perfilPublico;
    if (!p) return;
    $('displayName').textContent = p.user.username;
    pintarTitulo(p.user.title);
    $('dashLabel').textContent = t('publicLabel');
    $('memberSince').textContent = t('memberSince', fecha(p.user.creado));
    if (p.user.avatar_url) { $('avatar').src = p.user.avatar_url; $('avatar').hidden = false; }
    else $('avatar').hidden = true;
    totales = p.totals || [];
    resumen = p.stats || [];
    recientes = p.recent || [];
    logros = p.achievements || [];
    pintarCinta();
    pintarRecientes();
    $('cardRecent').hidden = false;
    pintarResumen();
    pintarLogros();
    document.title = p.user.username + ' \u2014 Truck Dash';
  }

  // Perfil de alguien que sigo (aceptado): se ve todo y los viajes se abren
  // con el recorrido (/follow/trip). Si no, el perfil publico de siempre.
  let perfilCompleto = false;
  let relacionPerfil = null;   // null = sin sesion

  async function cargarPublico() {
    document.documentElement.classList.add('publico');
    const mio = await pedir('/follow/user/' + encodeURIComponent(PERFIL));
    if (mio.ok && mio.datos.self) { location.href = location.pathname; return; }
    if (mio.ok) {
      relacionPerfil = mio.datos.relation || {};
      perfilCompleto = !!mio.datos.full;
      if (perfilCompleto || !mio.datos.public) {
        perfilPublico = perfilCompleto ? mio.datos
          : { user: mio.datos.user, totals: [], stats: [], recent: [], achievements: [] };
        pintarPublico();
        pintarSeguirPerfil();
        if (perfilCompleto && mio.datos.status) {
          $('profileLive').innerHTML = '';
          $('profileLive').appendChild(tarjetaVivo(mio.datos.status));
          $('cardProfileLive').hidden = false;
        }
        if (!perfilCompleto) {
          $('cardRecent').hidden = true;
          $('privateLocked').textContent = t('privateLocked', mio.datos.user.username);
          $('privateLocked').hidden = false;
        }
        mostrarVista('viewAccount');
        return;
      }
    } else if (mio.status === 404) {
      // no existe o hay un bloqueo: lo mismo que un perfil que no es publico
    }
    const { ok, status, datos } = await pedir('/public/' + encodeURIComponent(PERFIL));
    if (!ok) {
      $('loading').hidden = true;
      $('offline').hidden = false;
      $('offline').setAttribute('data-i18n', status === 404 ? 'publicNotFound' : 'offline');
      $('offline').textContent = t(status === 404 ? 'publicNotFound' : 'offline');
      return;
    }
    perfilPublico = datos;
    pintarPublico();
    pintarSeguirPerfil();
    mostrarVista('viewAccount');
  }

  // El boton Seguir del perfil de otro, segun la relacion.
  function pintarSeguirPerfil() {
    const caja = $('followBox');
    caja.innerHTML = '';
    caja.hidden = false;
    const nombre = perfilPublico && perfilPublico.user ? perfilPublico.user.username : PERFIL;
    if (relacionPerfil === null) {
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = location.pathname;
      a.textContent = t('signInToFollow');
      caja.appendChild(a);
      return;
    }
    const recargar = () => { location.reload(); };
    const mio = relacionPerfil.following;
    if (!mio) {
      caja.appendChild(botonAccion(t('followBtn'), '/follow/request', nombre, recargar, false, 'primary'));
    } else if (mio === 'pending') {
      const e = document.createElement('span');
      e.className = 'estado';
      e.textContent = t('followStatePending');
      caja.appendChild(e);
      caja.appendChild(botonAccion(t('cancelRequest'), '/follow/unfollow', nombre, recargar, true));
    } else {
      const e = document.createElement('span');
      e.className = 'estado';
      e.textContent = t('followStateFollowing');
      caja.appendChild(e);
      caja.appendChild(botonAccion(t('unfollow'), '/follow/unfollow', nombre, recargar, true));
    }
    if (relacionPerfil.follows_me === 'pending') {
      const e = document.createElement('span');
      e.className = 'estado';
      e.textContent = t('followsYouPending', nombre);
      caja.appendChild(e);
      caja.appendChild(botonAccion(t('accept'), '/follow/accept', nombre, recargar, false, 'primary'));
    } else if (relacionPerfil.follows_me === 'accepted') {
      const e = document.createElement('span');
      e.className = 'estado';
      e.textContent = t('followsYou');
      caja.appendChild(e);
    }
  }

  // ------------------------------------------------------------- seguir
  // Un boton que llama a /follow/<accion> con el nombre. Los que cortan algo
  // (dejar de seguir, sacar, bloquear) piden un segundo toque.
  function botonAccion(texto, ruta, nombre, despues, confirmar, clase) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn small' + (clase ? ' ' + clase : '');
    b.textContent = texto;
    let armado = false;
    b.addEventListener('click', async () => {
      if (confirmar && !armado) {
        armado = true;
        b.textContent = t('sureAgain');
        setTimeout(() => { armado = false; b.textContent = texto; }, 4000);
        return;
      }
      b.disabled = true;
      const r = await pedir(ruta, { method: 'POST', body: { username: nombre } });
      b.disabled = false;
      if (!r.ok) { avisar(t(r.datos.error || 'offline'), 'error'); return; }
      despues(r);
    });
    return b;
  }

  // "hace 3 minutos", en el idioma de la pantalla.
  function hace(iso) {
    if (!iso) return '';
    const s = (Date.parse(iso) - Date.now()) / 1000;
    const unidades = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    try {
      const fmt = new Intl.RelativeTimeFormat(idioma, { numeric: 'auto' });
      for (const [u, seg] of unidades) {
        if (Math.abs(s) >= seg) return fmt.format(Math.round(s / seg), u);
      }
      return fmt.format(0, 'minute');
    } catch (e) { return fecha(iso); }
  }

  function avatarDe(p) {
    if (!p.avatar_url) {
      const letra = document.createElement('span');
      letra.className = 'letra';
      letra.setAttribute('aria-hidden', 'true');
      letra.textContent = (p.username || '?').charAt(0);
      return letra;
    }
    const img = document.createElement('img');
    img.alt = '';
    img.src = p.avatar_url;
    return img;
  }

  function linkAPerfil(p) {
    const a = document.createElement('a');
    a.className = 'nombre';
    a.href = '/account/?u=' + encodeURIComponent(p.username);
    a.textContent = p.username;
    return a;
  }

  function rutaDe(x) {
    return [x.city_src || '?', x.city_dst || '?'].join(' \u2192 ');
  }

  // Tarjeta del estado en vivo: manejando (ruta, ciudad cercana, mapita) o
  // cuando manejo por ultima vez.
  function tarjetaVivo(p) {
    const caja = document.createElement('div');
    caja.className = 'vivo';
    const cabeza = document.createElement('div');
    cabeza.className = 'cabeza';
    cabeza.appendChild(avatarDe(p));
    cabeza.appendChild(linkAPerfil(p));
    if (p.title) {
      const tit = document.createElement('span');
      tit.className = 'titulo-usuario';
      tit.textContent = p.title;
      cabeza.appendChild(tit);
    }
    caja.appendChild(cabeza);
    const linea = document.createElement('p');
    linea.className = 'linea-estado' + (p.driving ? ' manejando' : ' muted');
    if (p.driving && p.trip) {
      const partes = [t('liveDriving') + ': ' + rutaDe(p.trip)];
      if (p.near && p.near.city) partes.push(t('liveNear', p.near.city + (p.near.region ? ', ' + p.near.region : '')));
      partes.push(hace(p.last_seen));
      linea.textContent = partes.join(' \u00b7 ');
    } else {
      linea.textContent = p.last_seen ? t('liveLast', hace(p.last_seen)) : t('liveNever');
    }
    caja.appendChild(linea);
    if (p.driving && p.route && p.route.length > 1) {
      const dibujo = dibujarRecorrido([p.route]);
      if (dibujo) {
        const ultimo = p.route[p.route.length - 1];
        const punto = document.createElementNS(SVG_NS, 'circle');
        punto.setAttribute('cx', ultimo[0]);
        punto.setAttribute('cy', ultimo[1]);
        // El mapita esta en coordenadas del juego: el radio, relativo al
        // tamano del recorrido, para que se vea igual en uno corto o largo.
        const vb = (dibujo.getAttribute('viewBox') || '').split(' ').map(Number);
        punto.setAttribute('r', String(Math.max(vb[2] || 0, vb[3] || 0) * 0.035 || 6));
        punto.setAttribute('class', 'aqui');
        dibujo.appendChild(punto);
        caja.appendChild(dibujo);
      }
    }
    return caja;
  }

  let seguirCargando = false;
  async function traerSeguir() {
    if (seguirCargando) return;
    seguirCargando = true;
    const [listas, vivos, feed] = await Promise.all([pedir('/follow'), pedir('/follow/status'), pedir('/follow/feed')]);
    seguirCargando = false;
    if (listas.ok) pintarListas(listas.datos);
    if (vivos.ok) pintarVivos(vivos.datos.people || []);
    if (feed.ok) pintarFeed(feed.datos.events || []);
  }

  function filaPersona(p, botones) {
    const li = document.createElement('li');
    li.appendChild(avatarDe(p));
    li.appendChild(linkAPerfil(p));
    const acciones = document.createElement('span');
    acciones.className = 'acciones-fila';
    botones.forEach((b) => acciones.appendChild(b));
    li.appendChild(acciones);
    return li;
  }

  function pintarLista(id, gente, botones) {
    const ul = $(id);
    ul.innerHTML = '';
    if (!gente.length) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = t('listEmpty');
      ul.appendChild(li);
      return;
    }
    gente.forEach((p) => ul.appendChild(filaPersona(p, botones(p))));
  }

  function pintarListas(d) {
    const otra = () => traerSeguir();
    const pedidos = d.requests || [];
    $('cardRequests').hidden = !pedidos.length;
    pintarBadge(pedidos.length);
    pintarLista('requestsList', pedidos, (p) => [
      botonAccion(t('accept'), '/follow/accept', p.username, otra, false, 'primary'),
      botonAccion(t('reject'), '/follow/reject', p.username, otra, false),
      botonAccion(t('block'), '/follow/block', p.username, otra, true)]);
    pintarLista('followingList', d.following || [], (p) => [
      botonAccion(t('unfollow'), '/follow/unfollow', p.username, otra, true)]);
    pintarLista('followersList', d.followers || [], (p) => [
      botonAccion(t('removeFollower'), '/follow/reject', p.username, otra, true),
      botonAccion(t('block'), '/follow/block', p.username, otra, true)]);
    pintarLista('outgoingList', d.outgoing || [], (p) => [
      botonAccion(t('cancelRequest'), '/follow/unfollow', p.username, otra, false)]);
    pintarLista('blockedList', d.blocked || [], (p) => [
      botonAccion(t('unblock'), '/follow/unblock', p.username, otra, false)]);
  }

  function pintarBadge(n) {
    const b = $('followBadge');
    b.textContent = n ? String(n) : '';
    b.hidden = !n;
  }

  function pintarVivos(gente) {
    const caja = $('liveList');
    caja.innerHTML = '';
    $('liveEmpty').hidden = gente.length > 0;
    gente.forEach((p) => caja.appendChild(tarjetaVivo(p)));
  }

  function pintarFeed(eventos) {
    const ul = $('feedList');
    ul.innerHTML = '';
    $('feedEmpty').hidden = eventos.length > 0;
    eventos.forEach((e) => {
      const li = document.createElement('li');
      li.appendChild(avatarDe(e.user));
      const texto = document.createElement('span');
      const nombre = e.user.username;
      let frase = '';
      let meta = '';
      if (e.type === 'delivered') {
        frase = t('feedDelivered', nombre, rutaDe(e));
        meta = [e.distance_km ? distancia(e.distance_km) : '', e.on_time ? t('statsOnTime') : ''].filter(Boolean).join(' \u00b7 ');
      } else if (e.type === 'started') {
        frase = t('feedStarted', nombre, rutaDe(e));
      } else if (e.type === 'cancelled') {
        frase = t('feedCancelled', nombre, rutaDe(e));
      } else if (e.type === 'achievement') {
        frase = t('feedAchievement', nombre, datosDeLogro({ id: e.achievement })[1]);
      }
      texto.textContent = frase;
      li.appendChild(texto);
      if (meta) {
        const m = document.createElement('span');
        m.className = 'meta';
        m.textContent = meta;
        li.appendChild(m);
      }
      const cuando = document.createElement('span');
      cuando.className = 'cuando';
      cuando.textContent = hace(e.at);
      li.appendChild(cuando);
      ul.appendChild(li);
    });
  }

  async function seguirPorNombre(ev) {
    ev.preventDefault();
    const nombre = $('followInput').value.trim();
    if (!nombre) return;
    const msg = $('followMsg');
    const r = await pedir('/follow/request', { method: 'POST', body: { username: nombre } });
    msg.hidden = false;
    if (r.ok) {
      const quien = (r.datos.user && r.datos.user.username) || nombre;
      msg.textContent = r.datos.status === 'accepted' ? t('followAlready', quien) : t('followSent', quien);
      $('followInput').value = '';
      traerSeguir();
    } else {
      msg.textContent = t({ no_existe: 'followNotFound', demasiadas_solicitudes: 'followTooMany' }[r.datos.error] || r.datos.error || 'offline');
    }
  }

  // ------------------------------------------------------------- paginas
  // Resumen, logbook y ajustes, cada una con su #hash: el link a
  // /account/#logbook abre ahi y el boton de atras del navegador anda.
  const PAGINAS = { overview: 'pageOverview', logbook: 'pageLogbook',
                    achievements: 'pageAchievements', following: 'pageFollowing',
                    settings: 'pageSettings' };
  let logbookPedido = false;

  function paginaDelHash() {
    const h = (location.hash || '').replace('#', '');
    return PAGINAS[h] ? h : 'overview';
  }

  function mostrarPagina() {
    const actual = paginaDelHash();
    Object.keys(PAGINAS).forEach((p) => { $(PAGINAS[p]).hidden = p !== actual; });
    document.querySelectorAll('#sideNav a').forEach((a) => {
      const es = a.getAttribute('data-pagina') === actual;
      a.classList.toggle('activo', es);
      if (es) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    // El logbook se pide recien cuando alguien lo abre: el resumen ya trae
    // los ultimos viajes y la mayoria no pasa de ahi.
    if (actual === 'logbook' && usuario && !logbookPedido) traerViajes(false);
    if (actual === 'following' && usuario) traerSeguir();
  }

  // ---------------------------------------------------- cinta del resumen
  function fechaCorta(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(idioma, { day: 'numeric', month: 'short', year: '2-digit' });
    } catch (e) { return iso.slice(0, 10); }
  }

  function pintarCinta() {
    const caja = $('quickStats');
    caja.innerHTML = '';
    if (!totales.length && !resumen.length && !recientes.length) { caja.hidden = true; return; }
    // Kilometros y horas se pueden sumar entre juegos; la plata no (dos
    // economias distintas), por eso aca no hay plata: va por juego abajo.
    // La distancia sale de las sesiones, no de los viajes (ver arriba).
    const suma = (lista, campo) => lista.reduce((a, x) => a + (x[campo] || 0), 0);
    const ultimo = recientes[0];
    let lugar = null, cuando = null;
    if (ultimo) {
      const enCurso = ultimo.status === 'in_progress';
      lugar = enCurso ? (ultimo.city_src || ultimo.city_dst) : (ultimo.city_dst || ultimo.city_src);
      const region = enCurso ? (ultimo.region_src || ultimo.region_dst)
                             : (ultimo.region_dst || ultimo.region_src);
      cuando = [nombreDeRegion(region, ultimo.game), (ultimo.game || '').toUpperCase(),
                enCurso ? t('tripOpen') : fechaCorta(ultimo.delivered_at || ultimo.started_at)]
        .filter(Boolean).join(' · ');
    }
    const aTiempo = suma(resumen, 'on_time');
    const sesiones = suma(totales, 'sessions');
    [
      [distancia(suma(totales, 'distance_km')), t('quickDistance'), t('totalsAll')],
      [numero(suma(resumen, 'delivered')), t('quickDeliveries'),
       aTiempo ? t('quickOnTime', numero(aTiempo)) : null],
      [duracion(suma(totales, 'real_hours')) || '0 min', t('quickHours'),
       sesiones ? t('quickSessions', numero(sesiones)) : null],
      [lugar || '-', t('quickLastSeen'), cuando]
    ].forEach(([valor, rotulo, sub]) => {
      const div = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = valor;
      b.title = valor;
      div.appendChild(b);
      const etq = document.createElement('span');
      etq.className = 'etq';
      etq.textContent = rotulo;
      div.appendChild(etq);
      if (sub) {
        const s = document.createElement('span');
        s.className = 'sub';
        s.textContent = sub;
        div.appendChild(s);
      }
      caja.appendChild(div);
    });
    caja.hidden = false;
  }

  // ------------------------------------------------------ tabla de viajes
  // La misma tabla para los ultimos viajes del resumen y para el logbook.
  // Cada una se repinta con su propia funcion, que se pasa para que abrir el
  // detalle o borrar un viaje repinte la tabla en la que se hizo.
  function etiquetaDeEstado(v) {
    if (v.status === 'in_progress') return etiqueta('open', t('tripOpen'));
    if (v.status === 'cancelled') return etiqueta('late', t('tripCancelled'));
    if (v.status === 'abandoned') return etiqueta('gris', t('tripAbandoned'));
    if (v.on_time === true) return etiqueta('ontime', t('tripOnTime'));
    if (v.on_time === false) return etiqueta('late', t('tripLate'));
    return null;
  }

  // Lo que se cobro, o lo que costo. Un viaje cancelado no cobro el pago
  // ofrecido: mostrarlo en la columna se leia como plata ganada (Atenas ->
  // Pristina, 34.790 EUR, cuando cancelar costo 12.000). En curso se muestra
  // lo ofrecido, que es lo que se va a cobrar.
  function celdaPago(fila, v) {
    if (v.status === 'cancelled' || v.status === 'abandoned') {
      const td = celda(fila, v.cancel_penalty ? '\u2212' + plata(v.cancel_penalty, v.currency) : '',
                       'num negativo');
      if (v.cancel_penalty) td.title = t('tripPenalty');
      return td;
    }
    return celda(fila, v.revenue ? plata(v.revenue, v.currency) : '', 'num');
  }

  function celda(fila, texto, clase) {
    const td = document.createElement('td');
    if (clase) td.className = clase;
    if (texto != null) td.textContent = texto;
    fila.appendChild(td);
    return td;
  }

  function distanciaEnTabla(v) {
    // Las tres distancias son distintas a proposito: la del viaje es la del
    // juego. La nuestra solo aparece sola si el juego no dio la suya, y
    // dicha como lo que es.
    if (v.distance_game_km) return distancia(v.distance_game_km);
    if (v.distance_tracked_km) return t('tripTracked', distancia(v.distance_tracked_km));
    return '';
  }

  function tablaViajes(lista, repintar) {
    const tabla = document.createElement('table');
    tabla.className = 'viajes';
    const cabeza = document.createElement('thead');
    const tr = document.createElement('tr');
    // "Vehiculo" y no "camion": en un trabajo con auto ahi va el auto.
    [['colDate', ''], ['colRoute', ''], ['tripVehicle', ''],
     ['colDistance', 'num'], ['colTime', 'num'], ['colPay', 'num']].forEach(([clave, clase]) => {
      const th = document.createElement('th');
      th.textContent = t(clave);
      if (clase) th.className = clase;
      tr.appendChild(th);
    });
    cabeza.appendChild(tr);
    tabla.appendChild(cabeza);

    const cuerpo = document.createElement('tbody');
    lista.forEach((v) => {
      const fila = document.createElement('tr');
      fila.className = 'fila' + (v._abierto ? ' abierta' : '');
      fila.tabIndex = 0;
      fila.setAttribute('aria-expanded', v._abierto ? 'true' : 'false');
      celda(fila, fechaCorta(v.delivered_at || v.started_at), 'cuando');

      const ruta = celda(fila, null, 'ruta-celda');
      const chip = document.createElement('span');
      chip.className = 'juego-chip';
      chip.textContent = (v.game || '').toUpperCase();
      ruta.appendChild(chip);
      // Trabajo con auto (ATS 1.61): lo deduce la API, porque llega sin peso
      // de carga. Se marca para que no parezca un viaje de camion raro.
      if (v.job_kind === 'car') {
        const auto = document.createElement('span');
        auto.className = 'juego-chip auto';
        auto.textContent = t('jobKindCar');
        ruta.appendChild(auto);
      }
      ruta.appendChild(document.createTextNode(
        [v.city_src, v.city_dst].filter(Boolean).join(' → ') || t('tripUnnamed')));
      const estado = etiquetaDeEstado(v);
      if (estado) ruta.appendChild(estado);
      // La economia modeada se muestra y no se esconde: un viaje de 900 000
      // euros con un mod de dinero no es comparable con el resto.
      if (v.modded) ruta.appendChild(etiqueta('gris', t('tripModded')));
      const carga = [v.cargo, masa(v.cargo_mass)].filter(Boolean).join(' · ');
      if (carga) {
        const chico = document.createElement('span');
        chico.className = 'chico-gris';
        chico.textContent = carga;
        ruta.appendChild(chico);
      }

      celda(fila, [v.truck_brand, v.truck_name].filter(Boolean).join(' '), 'oculto-movil camion');
      celda(fila, distanciaEnTabla(v), 'num');
      celda(fila, duracion(v.real_hours) || '', 'num');
      celdaPago(fila, v);

      // En el perfil publico no se abre el detalle: el recorrido es por
      // donde pasaste, y un perfil publico no lo da punto a punto. Si lo
      // sigo (aceptado), si: aceptar es dar ese permiso.
      if (!modoPublico || perfilCompleto) {
        const abrir = () => alternarDetalle(v, repintar);
        fila.addEventListener('click', abrir);
        fila.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
        });
      } else {
        fila.removeAttribute('tabindex');
        fila.removeAttribute('aria-expanded');
      }
      cuerpo.appendChild(fila);

      if (v._abierto) {
        const det = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.className = 'detalle-celda';
        td.appendChild(panelDetalle(v));
        // Lo que el viaje costo aparte del sueldo. Si no se muestra nunca,
        // nadie se entera de que un dia deja de llegar.
        const sinCobrar = v.status === 'cancelled' || v.status === 'abandoned';
        sumar(td, renglon([
          sinCobrar && v.cancel_penalty ? t('tripPenalty') + ' ' + plata(v.cancel_penalty, v.currency) : null,
          sinCobrar && v.revenue ? t('tripOffered') + ' ' + plata(v.revenue, v.currency) : null,
          v.fuel_used ? t('tripFuel') + ' ' + volumen(v.fuel_used) : null,
          v.tolls ? t('tripTolls') + ' ' + plata(v.tolls, v.currency) : null,
          v.fines ? t('tripFines') + ' ' + plata(v.fines, v.currency) : null,
          v.ferries ? t('tripFerries') + ' ' + plata(v.ferries, v.currency) : null,
          v.damage_delta ? t('tripDamage') + ' +' + numero(v.damage_delta, 1) + ' %' : null
        ]));
        // Recien con el detalle: mientras llega, la tabla se redibuja y un
        // campo de nota a medio escribir se perdia.
        // Corregir, la nota y borrar son del dueno del viaje.
        if (!modoPublico) {
          if (v._detalle) td.appendChild(panelCorreccion(v, repintar));
          const acciones = document.createElement('div');
          acciones.className = 'acciones';
          acciones.appendChild(botonBorrar(v));
          td.appendChild(acciones);
        }
        det.appendChild(td);
        cuerpo.appendChild(det);
      }
    });
    tabla.appendChild(cuerpo);
    return tabla;
  }

  function panelCorreccion(v, repintar) {
    // Lo que la persona puede corregir: un viaje que quedo en curso (un
    // trabajo cancelado que el cliente no vio) y una nota. Entregado a mano
    // no: eso lo dice el juego, con su distancia y su pago.
    const caja = document.createElement('div');
    caja.className = 'correccion';
    if (v.status === 'in_progress' || v.status === 'abandoned') {
      const botones = document.createElement('div');
      botones.className = 'botones';
      const opciones = v.status === 'in_progress' ? ['cancelled', 'abandoned'] : ['cancelled'];
      opciones.forEach((estado) => {
        const b = document.createElement('button');
        b.className = 'btn chico';
        b.textContent = t(estado === 'cancelled' ? 'tripMarkCancelled' : 'tripMarkUnfinished');
        b.addEventListener('click', () => corregirViaje(v, { status: estado }, repintar, b));
        botones.appendChild(b);
      });
      caja.appendChild(botones);
    }
    const etiquetaNota = document.createElement('label');
    etiquetaNota.textContent = t('tripNoteLabel');
    const area = document.createElement('textarea');
    area.maxLength = 500;
    area.placeholder = t('tripNotePlaceholder');
    // Lo escrito sobrevive a que la tabla se redibuje (llega otro dato, se
    // abre otro viaje): se guarda en el viaje hasta que se manda.
    area.value = v._borradorNota != null ? v._borradorNota : (v.note || '');
    area.addEventListener('input', () => { v._borradorNota = area.value; });
    etiquetaNota.appendChild(area);
    caja.appendChild(etiquetaNota);
    const guardar = document.createElement('button');
    guardar.className = 'btn chico';
    guardar.textContent = t('tripNoteSave');
    guardar.addEventListener('click', () => corregirViaje(v, { note: area.value }, repintar, guardar));
    const fila = document.createElement('div');
    fila.className = 'botones';
    fila.appendChild(guardar);
    caja.appendChild(fila);
    return caja;
  }

  async function corregirViaje(v, cambios, repintar, boton) {
    boton.disabled = true;
    const { ok, datos } = await pedir('/trips/' + v.id, { method: 'PATCH', body: cambios });
    boton.disabled = false;
    if (!ok) { avisar(t(datos.error || 'error'), 'bad'); return; }
    if ('note' in cambios) v._borradorNota = null;
    // El viaje puede estar en las dos tablas: se actualiza en las dos.
    [viajes, recientes].forEach((lista) => lista.forEach((x) => {
      if (x.id === v.id) Object.assign(x, datos.trip);
    }));
    if (v._detalle) Object.assign(v._detalle, datos.trip);
    Object.assign(v, datos.trip);
    repintar();
    pintarRecientes();
    avisar(t('savedOk'), 'ok');
    // Cambiar el estado mueve los numeros (entregas, paises): se piden de nuevo.
    if (cambios.status) { traerResumen(); traerActivo(); traerLogros(); }
  }

  async function alternarDetalle(v, repintar) {
    v._abierto = !v._abierto;
    repintar();
    if (!v._abierto || v._detalle) return;
    // El recorrido son un par de KB por viaje, asi que se pide solo cuando
    // alguien abre uno, y una sola vez.
    const { ok, datos } = await pedir((modoPublico ? '/follow/trip/' : '/trips/') + v.id);
    if (!ok) { v._abierto = false; repintar(); return; }
    v._detalle = datos.trip;
    repintar();
  }

  function botonBorrar(viaje) {
    // Dos pasos y no un confirm() del navegador: un viaje lleva por donde
    // pasaste y a que hora, asi que poder sacar uno solo es parte de que los
    // datos sean tuyos, pero no con un click distraido.
    const boton = document.createElement('button');
    boton.className = 'linkish';
    boton.textContent = t('tripRemove');
    let armado = false;
    const desarmar = () => {
      armado = false;
      boton.textContent = t('tripRemove');
      boton.classList.remove('armado');
    };
    boton.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!armado) {
        armado = true;
        boton.textContent = t('tripRemoveSure');
        boton.classList.add('armado');
        setTimeout(() => { if (armado) desarmar(); }, 5000);
        return;
      }
      boton.disabled = true;
      const { ok, status, datos } = await pedir('/trips/' + viaje.id, { method: 'DELETE' });
      // Un 404 es que ya no estaba: el resultado que se pidio, no un error.
      if (!ok && status !== 404) {
        boton.disabled = false;
        desarmar();
        avisar(t(datos.error || 'error'), 'bad');
        return;
      }
      // Puede estar en las dos tablas a la vez: sale de las dos, y el
      // resumen se vuelve a pedir porque contaba a este viaje.
      viajes = viajes.filter((v) => v.id !== viaje.id);
      if (totalLogbook) totalLogbook -= 1;
      pintarViajes();
      traerRecientes();
      traerResumen();
      avisar(t('savedOk'), 'ok');
    });
    return boton;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ------------------------------------------------------ ultimos viajes
  const RECIENTES = 5;
  let recientes = [];

  function pintarRecientes() {
    const lista = $('recentList');
    lista.innerHTML = '';
    const vacio = $('recentEmpty');
    vacio.hidden = recientes.length > 0;
    vacio.textContent = t(totales.length ? 'tripsEmptyDriven' : 'tripsEmpty');
    if (recientes.length) lista.appendChild(tablaViajes(recientes, pintarRecientes));
  }

  async function traerRecientes() {
    const { ok, datos } = await pedir('/trips?limite=' + RECIENTES);
    if (!ok) return;   // sin viajes la pantalla sigue siendo util
    recientes = datos.trips || [];
    pintarRecientes();
    pintarCinta();
    $('cardRecent').hidden = false;
  }

  // ------------------------------------------------------------ actividad
  // La API la da por dia (en la hora de quien mira); aca se agrupa por
  // semana o mes para el grafico, y se dibuja tal cual en el calendario.
  // Distancia y horas son de las sesiones (todo lo manejado), entregas de los
  // viajes: los dos juegos se suman, porque km y horas si se pueden sumar.
  let actividad = [];
  const PERIODOS_GRAFICO = 12;
  const DIA_MS = 86400000;

  function fechaUTC(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
  }
  function isoDe(fecha) { return fecha.toISOString().slice(0, 10); }
  function lunesDe(fecha) {
    // Semana de lunes a domingo, como en casi todo el mundo que juega ETS2.
    const dia = (fecha.getUTCDay() + 6) % 7;
    return new Date(fecha.getTime() - dia * DIA_MS);
  }
  function hoyLocal() {
    const ahora = new Date();
    return new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()));
  }

  function porDia() {
    const dias = new Map();
    actividad.forEach((d) => {
      const x = dias.get(d.date) || { distance_km: 0, real_hours: 0, trips: 0 };
      x.distance_km += d.distance_km || 0;
      x.real_hours += d.real_hours || 0;
      x.trips += d.trips || 0;
      dias.set(d.date, x);
    });
    return dias;
  }

  function valorEnTexto(metrica, valor) {
    if (metrica === 'distance_km') return distancia(valor);
    if (metrica === 'real_hours') return duracion(valor) || '0 min';
    return numero(valor);
  }

  function pintarGrafico(dias) {
    const caja = $('activityChart');
    caja.innerHTML = '';
    const metrica = $('activityMetric').value;
    const mensual = $('activityPeriod').value === 'month';
    // Las ultimas 12 semanas o 12 meses, con los vacios en cero: un hueco
    // en el grafico tambien dice algo.
    const hoy = hoyLocal();
    const periodos = [];
    for (let i = PERIODOS_GRAFICO - 1; i >= 0; i--) {
      let inicio;
      if (mensual) inicio = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
      else inicio = new Date(lunesDe(hoy).getTime() - i * 7 * DIA_MS);
      periodos.push({ inicio, valor: 0 });
    }
    const clave = (f) => (mensual ? isoDe(f).slice(0, 7) : isoDe(lunesDe(f)));
    const indice = new Map(periodos.map((p, i) => [clave(p.inicio), i]));
    dias.forEach((x, iso) => {
      const i = indice.get(clave(fechaUTC(iso)));
      if (i !== undefined) periodos[i].valor += x[metrica];
    });

    const maximo = Math.max(...periodos.map((p) => p.valor));
    // Al ancho real de la tarjeta y no escalado: escalado, en un celular la
    // letra de las fechas quedaba de 6 px.
    const ancho = Math.max(300, Math.round(caja.clientWidth || 600));
    const alto = 170, base = 140, arriba = 18;
    const angosto = ancho < 480;
    const paso = ancho / periodos.length;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + ancho + ' ' + alto);
    svg.setAttribute('role', 'img');
    const etiquetaFecha = (f) => (mensual
      ? f.toLocaleDateString(idioma, { month: 'short', timeZone: 'UTC' })
      : f.toLocaleDateString(idioma, { day: 'numeric', month: 'short', timeZone: 'UTC' }));
    svg.setAttribute('aria-label', periodos.map((p) =>
      etiquetaFecha(p.inicio) + ': ' + valorEnTexto(metrica, p.valor)).join(', '));
    periodos.forEach((p, i) => {
      const h = maximo ? (p.valor / maximo) * (base - arriba) : 0;
      const x = i * paso + paso * 0.18;
      const barra = document.createElementNS(SVG_NS, 'rect');
      barra.setAttribute('class', 'barra' + (p.valor ? '' : ' vacia'));
      barra.setAttribute('x', x);
      barra.setAttribute('width', paso * 0.64);
      // Un periodo sin nada igual se ve, como una raya en el piso.
      barra.setAttribute('y', base - Math.max(h, 1.5));
      barra.setAttribute('height', Math.max(h, 1.5));
      barra.setAttribute('rx', 2);
      const titulo = document.createElementNS(SVG_NS, 'title');
      titulo.textContent = etiquetaFecha(p.inicio) + ': ' + valorEnTexto(metrica, p.valor);
      barra.appendChild(titulo);
      svg.appendChild(barra);
      if (p.valor && p.valor === maximo) {
        const tope = document.createElementNS(SVG_NS, 'text');
        tope.setAttribute('class', 'tope');
        tope.setAttribute('x', x + paso * 0.32);
        tope.setAttribute('y', base - h - 5);
        tope.setAttribute('text-anchor', 'middle');
        tope.textContent = valorEnTexto(metrica, p.valor);
        svg.appendChild(tope);
      }
      // Una etiqueta si y una no en semanal: doce fechas no entran en un
      // celular sin pisarse.
      if ((mensual && !angosto) || i % 2 === (periodos.length - 1) % 2) {
        const txt = document.createElementNS(SVG_NS, 'text');
        txt.setAttribute('x', x + paso * 0.32);
        txt.setAttribute('y', alto - 8);
        txt.setAttribute('text-anchor', 'middle');
        txt.textContent = etiquetaFecha(p.inicio);
        svg.appendChild(txt);
      }
    });
    const piso = document.createElementNS(SVG_NS, 'line');
    piso.setAttribute('class', 'piso');
    piso.setAttribute('x1', 0); piso.setAttribute('x2', ancho);
    piso.setAttribute('y1', base + 0.5); piso.setAttribute('y2', base + 0.5);
    svg.appendChild(piso);
    caja.appendChild(svg);
  }

  function pintarCalendario(dias) {
    // Un cuadrito por dia del ultimo ano, como el de GitHub: columnas por
    // semana (de lunes a domingo) y el color segun lo manejado.
    const caja = $('activityCalendar');
    caja.innerHTML = '';
    const hoy = hoyLocal();
    const semanas = 53;
    const primero = new Date(lunesDe(hoy).getTime() - (semanas - 1) * 7 * DIA_MS);
    const kms = [...dias.values()].map((x) => x.distance_km).filter((k) => k > 0).sort((a, b) => a - b);
    // Cuatro tonos por cuartiles de lo propio: con umbrales fijos, alguien
    // que maneja 50 km por dia tendria todo en el tono mas bajo.
    const cuartil = (q) => kms.length ? kms[Math.min(kms.length - 1, Math.floor(q * kms.length))] : 0;
    const cortes = [cuartil(0.25), cuartil(0.5), cuartil(0.75)];
    const nivel = (km) => !km ? 0 : km <= cortes[0] ? 1 : km <= cortes[1] ? 2 : km <= cortes[2] ? 3 : 4;

    const lado = 11, aire = 2, izquierda = 0, arriba = 16;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + (izquierda + semanas * (lado + aire)) + ' ' + (arriba + 7 * (lado + aire)));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('calendarTitle'));
    let mesAnterior = -1;
    let ultimaEtiqueta = -10;
    for (let s = 0; s < semanas; s++) {
      for (let d = 0; d < 7; d++) {
        const fecha = new Date(primero.getTime() + (s * 7 + d) * DIA_MS);
        if (fecha > hoy) continue;
        const iso = isoDe(fecha);
        const x = dias.get(iso);
        const cuadro = document.createElementNS(SVG_NS, 'rect');
        cuadro.setAttribute('class', 'dia n' + nivel(x ? x.distance_km : 0));
        cuadro.setAttribute('x', izquierda + s * (lado + aire));
        cuadro.setAttribute('y', arriba + d * (lado + aire));
        cuadro.setAttribute('width', lado);
        cuadro.setAttribute('height', lado);
        cuadro.setAttribute('rx', 2);
        const titulo = document.createElementNS(SVG_NS, 'title');
        const cuando = fecha.toLocaleDateString(idioma, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
        titulo.textContent = x && (x.distance_km || x.trips)
          ? [cuando, distancia(x.distance_km), x.trips ? t('logbookCount', x.trips) : null].filter(Boolean).join(' · ')
          : cuando;
        cuadro.appendChild(titulo);
        svg.appendChild(cuadro);
        // El nombre del mes arriba de la primera semana que lo empieza.
        if (d === 0 && fecha.getUTCMonth() !== mesAnterior) {
          mesAnterior = fecha.getUTCMonth();
          // Una sola si quedan pegadas (el mes que empieza en la primera
          // columna y el siguiente, dos semanas despues: "sepoct").
          if (s < semanas - 2 && s - ultimaEtiqueta >= 3) {
            ultimaEtiqueta = s;
            const mes = document.createElementNS(SVG_NS, 'text');
            mes.setAttribute('x', izquierda + s * (lado + aire));
            mes.setAttribute('y', 10);
            mes.textContent = fecha.toLocaleDateString(idioma, { month: 'short', timeZone: 'UTC' });
            svg.appendChild(mes);
          }
        }
      }
    }
    caja.appendChild(svg);
    // En un celular el ano no entra: se desplaza de costado y arranca
    // mostrando lo ultimo.
    requestAnimationFrame(() => { caja.scrollLeft = caja.scrollWidth; });
    // La leyenda va afuera de lo que se desplaza: adentro, en un celular
    // quedaba fuera de la vista.
    const leyenda = $('activityLegend');
    leyenda.innerHTML = '';
    leyenda.appendChild(document.createTextNode(t('calLess')));
    for (let n = 0; n <= 4; n++) {
      const muestra = document.createElement('i');
      muestra.className = 'n' + n;
      leyenda.appendChild(muestra);
    }
    leyenda.appendChild(document.createTextNode(t('calMore')));
  }

  function pintarActividad() {
    const dias = porDia();
    const hay = [...dias.values()].some((x) => x.distance_km || x.trips);
    $('activityEmpty').hidden = hay;
    $('activityChart').hidden = !hay;
    $('activityCalendar').hidden = !hay;
    $('activityLegend').hidden = !hay;
    if (hay) {
      pintarGrafico(dias);
      pintarCalendario(dias);
    }
  }

  async function traerActividad() {
    // getTimezoneOffset da los minutos de la hora local a UTC (Buenos Aires
    // +180); la API pide lo contrario.
    const tz = -new Date().getTimezoneOffset();
    const { ok, datos } = await pedir('/trips/activity?tz=' + tz);
    if (!ok) return;
    actividad = datos.days || [];
    // Primero visible: el grafico se dibuja al ancho de la tarjeta.
    $('cardActivity').hidden = false;
    pintarActividad();
  }

  // ------------------------------------------------------------ logbook
  const VIAJES_POR_PAGINA = 10;
  let viajes = [];      // lo ya traido, para repintar sin volver a pedir
  let totales = [];
  let hayMasViajes = false;
  let totalLogbook = 0;
  let viajesPedidos = false;

  function filtrosDelLogbook() {
    const partes = [];
    if ($('filterGame').value) partes.push('game=' + encodeURIComponent($('filterGame').value));
    if ($('filterStatus').value) partes.push('status=' + encodeURIComponent($('filterStatus').value));
    if ($('filterKind').value) partes.push('kind=' + encodeURIComponent($('filterKind').value));
    return partes;
  }

  function pintarViajes() {
    const lista = $('tripsList');
    lista.innerHTML = '';
    if (viajes.length) lista.appendChild(tablaViajes(viajes, pintarViajes));
    $('logbookCount').textContent = logbookPedido ? t('logbookCount', totalLogbook) : '';
    const cartel = $('tripsEmpty');
    cartel.hidden = !logbookPedido || viajes.length > 0;
    // Con filtros, "no hay viajes" seria mentira: hay, pero no de esos.
    cartel.textContent = filtrosDelLogbook().length ? t('logbookNoMatch')
      : t(totales.length ? 'tripsEmptyDriven' : 'tripsEmpty');
    $('btnMoreTrips').hidden = !hayMasViajes;
  }

  async function traerViajes(mas) {
    logbookPedido = true;
    const desde = mas ? viajes.length : 0;
    const consulta = ['limite=' + VIAJES_POR_PAGINA, 'desde=' + desde].concat(filtrosDelLogbook());
    const { ok, datos } = await pedir('/trips?' + consulta.join('&'));
    if (!ok) return;
    const nuevos = datos.trips || [];
    viajes = mas ? viajes.concat(nuevos) : nuevos;
    totalLogbook = datos.total != null ? datos.total : viajes.length;
    hayMasViajes = viajes.length < totalLogbook && nuevos.length === VIAJES_POR_PAGINA;
    pintarViajes();
  }

  async function traerTotales() {
    const { ok, datos } = await pedir('/sessions/totals');
    if (!ok) return;
    totales = datos.totals || [];
    pintarCinta();
    pintarRecientes();
  }

  function mostrarViajes() {
    // pintarCuenta() se vuelve a llamar al cambiar de idioma: ahi alcanza con
    // repintar lo que ya tenemos, sin pedir todo de nuevo ni perder las
    // paginas que la persona ya abrio.
    if (viajesPedidos) {
      pintarCinta(); pintarRecientes(); pintarResumen(); pintarViajes();
      if (actividad.length) pintarActividad();
      pintarLogros();
      traerActivo();
      mostrarPagina();
      return;
    }
    viajesPedidos = true;
    traerRecientes();
    traerTotales();
    traerResumen();
    traerActividad();
    traerActivo();
    traerLogros();
    mostrarPagina();
  }

  function olvidarViajes() {
    viajes = [];
    totales = [];
    recientes = [];
    hayMasViajes = false;
    totalLogbook = 0;
    viajesPedidos = false;
    logbookPedido = false;
    resumen = [];
    actividad = [];
    logros = [];
    $('cardDriving').hidden = true;
    $('cardRecentAch').hidden = true;
    $('cardRecent').hidden = true;
    $('cardActivity').hidden = true;
    $('cardStats').hidden = true;
    $('quickStats').hidden = true;
    $('tripsList').innerHTML = '';
  }

  function iniciar() {
    if (!dibujaBanderas()) document.documentElement.classList.add('sin-banderas');
    armarSelectorDeIdioma();
    armarSelectorDeUnidades();
    aplicarIdioma();
    mostrarErrorDeVuelta();
    $('usernameInput').addEventListener('input', alEscribirNombre);
    $('usernameForm').addEventListener('submit', guardarNombre);
    $('emailForm').addEventListener('submit', enviarMail);
    $('emailToSignup').addEventListener('click', () => cambiarModoMail('signup'));
    $('emailToReset').addEventListener('click', () => cambiarModoMail('reset'));
    $('emailToLogin').addEventListener('click', () => cambiarModoMail('login'));
    $('emailResend').addEventListener('click', reenviarCodigoMail);
    $('emailCancelLink').addEventListener('click', cancelarVinculoMail);
    $('btnChangeUsername').addEventListener('click', () => pedirNombre(usuario.username));
    $('publicToggle').addEventListener('change', cambiarPrivacidad);
    $('btnSignOut').addEventListener('click', cerrarSesion);
    $('btnSignOutAll').addEventListener('click', cerrarTodas);
    $('deviceForm').addEventListener('submit', vincularDispositivo);
    $('btnExport').addEventListener('click', exportarDatos);
    $('btnMoreTrips').addEventListener('click', () => traerViajes(true));
    $('btnExportCsv').addEventListener('click', exportarCsv);
    $('followForm').addEventListener('submit', seguirPorNombre);
    $('btnLinkApprove').addEventListener('click', aprobarVinculoPendiente);
    $('btnLinkCancel').addEventListener('click', cancelarVinculoPendiente);
    $('btnCopyPublic').addEventListener('click', () => {
      try {
        navigator.clipboard.writeText(linkPublico());
        avisar(t('linkCopied'), 'ok');
      } catch (e) { avisar(linkPublico(), 'ok'); }
    });
    ['filterGame', 'filterStatus', 'filterKind'].forEach((id) => {
      $(id).addEventListener('change', () => { viajes = []; traerViajes(false); });
    });
    window.addEventListener('hashchange', () => { if (usuario) mostrarPagina(); });
    ['activityMetric', 'activityPeriod'].forEach((id) => {
      $(id).addEventListener('change', pintarActividad);
    });
    let esperaAncho = null;
    window.addEventListener('resize', () => {
      clearTimeout(esperaAncho);
      esperaAncho = setTimeout(() => { if (actividad.length) pintarActividad(); }, 200);
    });
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
