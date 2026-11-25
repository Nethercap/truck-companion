// Codigo QR minimo para la imagen de reclutamiento: modo byte, correccion M,
// versiones 1 a 6 (hasta 106 bytes; la direccion de una empresa son unos 35).
// Sin librerias: la web no carga JS de terceros (ver docs/app/vendor).
// Comparado con la libreria de Python que usa el cliente (test_vtc.js).
(function (raiz) {
  'use strict';

  // [bytes de datos, bytes de correccion por bloque, bloques] para nivel M.
  const VERSIONES = [null, [16, 10, 1], [28, 16, 1], [44, 26, 1], [64, 18, 2], [86, 24, 2], [108, 16, 4]];

  // Cuerpo de Galois GF(256) con el polinomio 0x11D.
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function generador(grado) {
    let g = [1];
    for (let i = 0; i < grado; i++) {
      const n = new Array(g.length + 1).fill(0);
      g.forEach((c, j) => { n[j] ^= c; n[j + 1] ^= mul(c, EXP[i]); });
      g = n;
    }
    return g;
  }

  function correccion(datos, grado) {
    const g = generador(grado);
    const resto = datos.concat(new Array(grado).fill(0));
    for (let i = 0; i < datos.length; i++) {
      const f = resto[i];
      if (f) g.forEach((c, j) => { resto[i + j] ^= mul(c, f); });
    }
    return resto.slice(datos.length);
  }

  function bits(bytes, version) {
    const [capacidad, ec, bloques] = VERSIONES[version];
    const b = [];
    const poner = (valor, n) => { for (let i = n - 1; i >= 0; i--) b.push((valor >> i) & 1); };
    poner(4, 4);                 // modo byte
    poner(bytes.length, 8);      // versiones 1 a 9: el largo en 8 bits
    bytes.forEach((x) => poner(x, 8));
    poner(0, Math.min(4, capacidad * 8 - b.length));
    while (b.length % 8) b.push(0);
    const datos = [];
    for (let i = 0; i < b.length; i += 8) datos.push(parseInt(b.slice(i, i + 8).join(''), 2));
    for (let i = 0; datos.length < capacidad; i++) datos.push(i % 2 ? 0x11 : 0xec);

    // Los bloques se intercalan: un manchon rompe un poco de cada uno.
    const por = capacidad / bloques, partes = [], ecs = [];
    for (let i = 0; i < bloques; i++) {
      const p = datos.slice(i * por, (i + 1) * por);
      partes.push(p);
      ecs.push(correccion(p, ec));
    }
    const salida = [];
    for (let i = 0; i < por; i++) partes.forEach((p) => salida.push(p[i]));
    for (let i = 0; i < ec; i++) ecs.forEach((p) => salida.push(p[i]));
    const todos = [];
    salida.forEach((x) => { for (let i = 7; i >= 0; i--) todos.push((x >> i) & 1); });
    return todos;
  }

  const MASCARAS = [
    (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  function fija(version) {
    const n = 17 + 4 * version;
    const m = Array.from({ length: n }, () => new Array(n).fill(null));
    const buscador = (r0, c0) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const R = r0 + r, C = c0 + c;
          if (R < 0 || C < 0 || R >= n || C >= n) continue;
          const borde = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
          m[R][C] = borde || (r >= 2 && r <= 4 && c >= 2 && c <= 4) ? 1 : 0;
        }
      }
    };
    buscador(0, 0);
    buscador(0, n - 7);
    buscador(n - 7, 0);
    for (let i = 8; i < n - 8; i++) m[6][i] = m[i][6] = i % 2 ? 0 : 1;
    if (version > 1) {
      const p = n - 7;           // versiones 2 a 6: un solo patron de alineacion
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) m[p + r][p + c] = Math.max(Math.abs(r), Math.abs(c)) === 1 ? 0 : 1;
      }
    }
    m[n - 8][8] = 1;
    return m;
  }

  function formato(m, mascara) {
    const n = m.length;
    let d = mascara << 10;                    // nivel M = 00
    for (let i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0x537 << (i - 10);
    const f = ((mascara << 10) | d) ^ 0x5412;
    for (let i = 0; i < 15; i++) {
      const bit = (f >> i) & 1;
      if (i < 6) m[i][8] = bit;
      else if (i < 8) m[i + 1][8] = bit;
      else m[n - 15 + i][8] = bit;
      if (i < 8) m[8][n - 1 - i] = bit;
      else if (i < 9) m[8][7] = bit;
      else m[8][14 - i] = bit;
    }
  }

  function penalidad(m) {
    const n = m.length;
    let total = 0;
    const lineas = [];
    for (let i = 0; i < n; i++) {
      lineas.push(m[i]);
      lineas.push(m.map((f) => f[i]));
    }
    lineas.forEach((l) => {
      let racha = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && l[i] === l[i - 1]) { racha++; continue; }
        if (racha >= 5) total += racha - 2;
        racha = 1;
      }
      const s = l.join('');
      for (let i = 0; i + 11 <= n; i++) {
        const t = s.slice(i, i + 11);
        if (t === '10111010000' || t === '00001011101') total += 40;
      }
    });
    let negros = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        negros += m[r][c];
        if (r + 1 < n && c + 1 < n && m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) total += 3;
      }
    }
    return total + Math.floor(Math.abs((negros * 100) / (n * n) - 50) / 5) * 10;
  }

  function con(version, datos, mascara) {
    const m = fija(version), n = m.length, libre = fija(version);
    formato(libre, 0);                        // marca donde va el formato
    let i = 0, arriba = true;
    for (let c = n - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      for (let k = 0; k < n; k++) {
        const r = arriba ? n - 1 - k : k;
        for (let j = 0; j < 2; j++) {
          if (libre[r][c - j] !== null) continue;
          const bit = i < datos.length ? datos[i] : 0;
          i++;
          m[r][c - j] = MASCARAS[mascara](r, c - j) ? bit ^ 1 : bit;
        }
      }
      arriba = !arriba;
    }
    formato(m, mascara);
    return m;
  }

  // Matriz de 0 y 1, o null si el texto no entra. `mascara` fija una (tests).
  function codificar(texto, mascara) {
    const bytes = Array.from(new TextEncoder().encode(texto));
    let version = 0;
    for (let v = 1; v < VERSIONES.length; v++) {
      if (bytes.length <= VERSIONES[v][0] - 2) { version = v; break; }
    }
    if (!version) return null;
    const datos = bits(bytes, version);
    if (mascara !== undefined) return con(version, datos, mascara);
    let mejor = null, menos = Infinity;
    for (let k = 0; k < 8; k++) {
      const m = con(version, datos, k), p = penalidad(m);
      if (p < menos) { menos = p; mejor = m; }
    }
    return mejor;
  }

  // Dibuja el codigo con su margen en un cuadrado de `lado` px.
  function dibujar(ctx, texto, x, y, lado) {
    const m = codificar(texto);
    if (!m) return false;
    const margen = 3, celda = lado / (m.length + 2 * margen);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, lado, lado);
    ctx.fillStyle = '#0b0d10';
    m.forEach((fila, r) => fila.forEach((v, c) => {
      if (!v) return;
      const px = Math.round(x + (c + margen) * celda), py = Math.round(y + (r + margen) * celda);
      ctx.fillRect(px, py, Math.round(x + (c + margen + 1) * celda) - px, Math.round(y + (r + margen + 1) * celda) - py);
    }));
    return true;
  }

  const api = { codificar, dibujar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.VTC_QR = api;
})(typeof self !== 'undefined' ? self : this);
