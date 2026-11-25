// La imagen de reclutamiento de una VTC, dibujada en un canvas con los datos
// de la empresa y un QR a su pagina. Cuatro formatos: vertical (Discord,
// Instagram), vista previa de un link, cabecera (Discord, TruckersMP) y firma
// de foro. Solo dibuja: los textos y los numeros llegan ya escritos (vtc.js).
(function () {
  'use strict';

  const FORMATOS = { portrait: [1080, 1350], link: [1200, 630], banner: [1920, 480], signature: [1200, 300] };
  const LETRA = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const fuente = (peso, tam) => `${peso} ${tam}px ${LETRA}`;

  function cargar(src, conCors) {
    return new Promise((ok) => {
      const img = new Image();
      // Sin CORS el canvas queda sucio y no se puede bajar: si el servidor no
      // lo da, la imagen no carga y va el tag en su lugar.
      if (conCors) img.crossOrigin = 'anonymous';
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = src;
    });
  }

  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function cortar(ctx, texto, ancho) {
    if (ctx.measureText(texto).width <= ancho) return texto;
    let s = texto;
    while (s.length > 1 && ctx.measureText(s + '…').width > ancho) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }

  // El tamano mas grande que entra, sin bajar de `minimo`.
  function ajustar(ctx, texto, ancho, tam, minimo, peso) {
    let n = tam;
    ctx.font = fuente(peso, n);
    while (n > minimo && ctx.measureText(texto).width > ancho) { n -= 2; ctx.font = fuente(peso, n); }
    return n;
  }

  // Texto en varios renglones; el ultimo se corta con puntos suspensivos.
  function parrafo(ctx, texto, x, y, ancho, alto, maximo) {
    const palabras = texto.replace(/\s+/g, ' ').trim().split(' ');
    const lineas = [];
    let actual = '';
    palabras.forEach((p) => {
      const prueba = actual ? actual + ' ' + p : p;
      if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba;
      else { lineas.push(actual); actual = p; }
    });
    if (actual) lineas.push(actual);
    const vistas = lineas.slice(0, maximo);
    if (lineas.length > maximo) vistas[maximo - 1] = cortar(ctx, vistas[maximo - 1] + ' ' + lineas[maximo], ancho);
    vistas.forEach((l, i) => ctx.fillText(cortar(ctx, l, ancho), x, y + i * alto));
    return vistas.length * alto;
  }

  function chip(ctx, texto, x, y, tam, color, relleno) {
    ctx.font = fuente(700, tam);
    const w = ctx.measureText(texto).width + tam * 1.3, h = tam * 1.75;
    redondeado(ctx, x, y, w, h, h / 2);
    if (relleno) {
      ctx.fillStyle = relleno;
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, x + tam * 0.65, y + h / 2 + 1);
    ctx.textBaseline = 'alphabetic';
    return w;
  }

  function fondo(ctx, W, H, color) {
    ctx.fillStyle = '#0c0f13';
    ctx.fillRect(0, 0, W, H);
    const halo = ctx.createRadialGradient(W * 0.08, 0, 0, W * 0.08, 0, Math.max(W, H) * 0.95);
    halo.addColorStop(0, color + '66');
    halo.addColorStop(0.55, color + '14');
    halo.addColorStop(1, color + '00');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    // Las lineas de una ruta que se va hacia la derecha.
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'butt';
    const lado = Math.min(W, H);
    [[0.18, 0.05, []], [0.42, 0.05, []], [0.3, 0.022, [lado * 0.14, lado * 0.1]]].forEach(([corrida, grosor, rayas], i) => {
      ctx.globalAlpha = i === 2 ? 0.22 : 0.1;
      ctx.lineWidth = lado * grosor;
      ctx.setLineDash(rayas);
      ctx.beginPath();
      ctx.moveTo(W * 0.35 + lado * corrida, H * 1.05);
      ctx.bezierCurveTo(W * 0.62 + lado * corrida, H * 0.7, W * 0.7 + lado * corrida, H * 0.5, W * 1.05, H * (0.08 + corrida * 0.6));
      ctx.stroke();
    });
    ctx.restore();
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, Math.max(6, Math.round(H * 0.012)));
  }

  function escudo(ctx, d, logo, x, y, lado) {
    ctx.save();
    redondeado(ctx, x, y, lado, lado, lado * 0.2);
    ctx.clip();
    if (logo) ctx.drawImage(logo, x, y, lado, lado);
    else {
      ctx.fillStyle = d.color;
      ctx.fillRect(x, y, lado, lado);
      ctx.fillStyle = d.tinta;
      const n = ajustar(ctx, d.v.tag, lado * 0.82, Math.round(lado * 0.42), 10, 800);
      ctx.font = fuente(800, n);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.v.tag, x + lado / 2, y + lado / 2 + n * 0.04);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  function marca(ctx, logo, x, y, tam, derecha) {
    ctx.font = fuente(700, tam);
    const a = ctx.measureText('Truck ').width, b = ctx.measureText('Dash').width, i = tam * 1.25;
    const x0 = derecha ? x - (i + a + b) : x;
    if (logo) ctx.drawImage(logo, x0, y - tam * 0.95, tam * 1.1, tam * 1.1);
    ctx.fillStyle = '#e9ecf1';
    ctx.fillText('Truck', x0 + i, y);
    ctx.fillStyle = '#3b9eff';
    ctx.fillText('Dash', x0 + i + a, y);
  }

  function numeros(ctx, d, x, y, ancho, tam) {
    const col = ancho / d.numeros.length;
    d.numeros.forEach(([valor, texto], i) => {
      ctx.fillStyle = '#ffffff';
      ajustar(ctx, valor, col - tam * 0.5, tam, tam * 0.5, 800);
      ctx.fillText(valor, x + i * col, y);
      ctx.fillStyle = '#a3adba';
      ajustar(ctx, texto, col - tam * 0.3, Math.round(tam * 0.42), Math.round(tam * 0.3), 500);
      ctx.fillText(cortar(ctx, texto, col - tam * 0.3), x + i * col, y + tam * 0.66);
    });
  }

  function filaDeChips(ctx, d, x, y, tam, limite) {
    let cx = x;
    if (d.reclutando) cx += chip(ctx, d.reclutando, cx, y, tam, d.tinta, d.color) + tam * 0.5;
    d.chips.forEach((c) => {
      ctx.font = fuente(700, tam);
      if (cx + ctx.measureText(c).width + tam * 1.3 > limite) return;
      cx += chip(ctx, c, cx, y, tam, '#e9ecf1') + tam * 0.5;
    });
  }

  function nombre(ctx, d, x, y, ancho, tam, minimo) {
    const n = ajustar(ctx, d.v.name, ancho, tam, minimo, 800);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cortar(ctx, d.v.name, ancho), x, y);
    return n;
  }

  function vertical(ctx, d, img, W, H) {
    const M = 72, A = W - 2 * M;
    escudo(ctx, d, img.logo, M, 92, 210);
    marca(ctx, img.marca, W - M, 128, 34, true);
    ctx.font = fuente(800, 54);
    ctx.fillStyle = d.color;
    ctx.fillText('[' + d.v.tag + ']', M + 246, 205);
    ctx.font = fuente(500, 30);
    ctx.fillStyle = '#a3adba';
    ctx.fillText(cortar(ctx, d.corta, A - 246), M + 246, 262);
    const n = nombre(ctx, d, M, 408, A, 92, 46);
    let y = 408 + Math.round(n * 0.35);
    if (d.v.slogan) {
      ctx.font = fuente(500, 38);
      ctx.fillStyle = '#c9d0da';
      y += 30 + parrafo(ctx, d.v.slogan, M, y + 44, A, 50, 2);
    }
    filaDeChips(ctx, d, M, y + 44, 28, W - M);
    numeros(ctx, d, M, y + 220, A, 64);
    y += 330;
    if (d.requisitos && y < 900) {
      ctx.font = fuente(500, 30);
      ctx.fillStyle = '#a3adba';
      parrafo(ctx, d.requisitos, M, y, A, 42, Math.max(1, Math.min(3, Math.floor((980 - y) / 42))));
    }
    const lado = 250, by = H - M - lado;
    redondeado(ctx, M, by, lado, lado, 20);
    ctx.save();
    ctx.clip();
    window.VTC_QR.dibujar(ctx, d.url, M, by, lado);
    ctx.restore();
    const lx = M + lado + 40, la = W - M - lx;
    ctx.font = fuente(700, 36);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cortar(ctx, d.unite, la), lx, by + 40);
    d.links.slice(0, 4).forEach(([que, donde], i) => {
      const ly = by + 96 + i * 46;
      ctx.font = fuente(700, 27);
      ctx.fillStyle = d.color;
      ctx.fillText(que, lx, ly);
      const w = Math.max(ctx.measureText('TruckersMP').width, ctx.measureText(que).width) + 22;
      ctx.font = fuente(500, 27);
      ctx.fillStyle = '#e9ecf1';
      ctx.fillText(cortar(ctx, donde, la - w), lx + w, ly);
    });
  }

  // Los tres apaisados comparten la forma: escudo, textos al medio y QR.
  function apaisado(ctx, d, img, W, H, o) {
    const M = o.margen, lado = o.escudo, ey = o.arriba ? M + 10 : (H - lado) / 2;
    escudo(ctx, d, img.logo, M, ey, lado);
    const qr = o.qr, qx = W - M - qr, qy = (H - qr) / 2;
    const x = M + lado + o.aire, a = qx - o.aire - x;
    ctx.save();
    redondeado(ctx, qx, qy, qr, qr, qr * 0.07);
    ctx.clip();
    window.VTC_QR.dibujar(ctx, d.url, qx, qy, qr);
    ctx.restore();
    let y = o.y;
    ctx.font = fuente(800, o.tag);
    ctx.fillStyle = d.color;
    ctx.fillText('[' + d.v.tag + ']', x, y);
    y += o.nombre * 1.02;
    nombre(ctx, d, x, y, a, o.nombre, o.nombre * 0.45);
    if (d.v.slogan && o.slogan) {
      ctx.font = fuente(500, o.slogan);
      ctx.fillStyle = '#c9d0da';
      y += o.slogan * 1.55;
      ctx.fillText(cortar(ctx, d.v.slogan, a), x, y);
    }
    filaDeChips(ctx, d, x, y + o.chip * 1.1, o.chip, x + a);
    if (o.numeros) numeros(ctx, d, x, y + o.chip * 3.6 + o.numeros * 1.05, a, o.numeros);
    ctx.font = fuente(600, o.pie);
    ctx.fillStyle = '#a3adba';
    ctx.textAlign = 'center';
    ctx.fillText(cortar(ctx, d.corta, qr + 2 * o.aire), qx + qr / 2, qy + qr + o.pie * 1.6);
    ctx.textAlign = 'left';
    marca(ctx, img.marca, W - M, qy - o.pie * 0.9, o.pie * 1.05, true);
  }

  async function dibujar(formato, d) {
    const [W, H] = FORMATOS[formato];
    const lienzo = document.createElement('canvas');
    lienzo.width = W;
    lienzo.height = H;
    const ctx = lienzo.getContext('2d');
    const img = {
      marca: await cargar('/app/assets/logo.svg'),
      logo: d.v.logo_url ? await cargar(d.v.logo_url, true) : null,
    };
    fondo(ctx, W, H, d.color);
    if (formato === 'portrait') vertical(ctx, d, img, W, H);
    else {
      apaisado(ctx, d, img, W, H, {
        link: { margen: 64, escudo: 190, aire: 44, qr: 250, y: 190, tag: 40, nombre: 70, slogan: 30, chip: 24, numeros: 48, pie: 22 },
        banner: { margen: 90, escudo: 260, aire: 60, qr: 250, y: 150, tag: 44, nombre: 92, slogan: 34, chip: 26, numeros: 0, pie: 24 },
        signature: { margen: 48, escudo: 170, aire: 40, qr: 170, y: 92, tag: 30, nombre: 60, slogan: 26, chip: 22, numeros: 0, pie: 19 },
      }[formato]);
    }
    return lienzo;
  }

  window.VTC_TARJETA = { FORMATOS, dibujar };
})();
