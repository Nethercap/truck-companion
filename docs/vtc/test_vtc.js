// Textos, colores de referencia y QR de las paginas de VTC: node --test docs/vtc/test_vtc.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const TEXTOS = require('./i18n.js');
const { codificar } = require('./qr.js');
const VTC = fs.readFileSync(path.join(__dirname, 'vtc.js'), 'utf8');

const huecos = (s) => (s.match(/\{\w+\}/g) || []).sort().join(' ');

test('los ocho idiomas tienen las mismas claves y los mismos huecos', () => {
  assert.deepStrictEqual(Object.keys(TEXTOS), ['en', 'es', 'de', 'fr', 'pt', 'pl', 'tr', 'ru']);
  const claves = Object.keys(TEXTOS.en);
  for (const [idioma, d] of Object.entries(TEXTOS)) {
    assert.deepStrictEqual(Object.keys(d).sort(), claves.slice().sort(), idioma);
    for (const k of claves) {
      assert.ok(d[k].trim(), idioma + '.' + k + ' vacia');
      assert.strictEqual(huecos(d[k]), huecos(TEXTOS.en[k]), idioma + '.' + k);
    }
  }
});

test('todo texto que pide la pagina existe', () => {
  const pedidos = new Set();
  for (const m of VTC.matchAll(/\b(?:t|vacio)\('([A-Za-z0-9_]+)'/g)) pedidos.add(m[1]);
  // Las que se arman con un prefijo (t('metric_' + m)): tiene que haber de esas.
  const todas = Object.keys(TEXTOS.en);
  for (const k of pedidos) {
    if (k.endsWith('_')) assert.ok(todas.some((x) => x.startsWith(k)), 'ninguna con ' + k);
    else assert.ok(k in TEXTOS.en, 'falta ' + k);
  }
});

test('las que se arman con lo que manda la API estan todas', () => {
  const de = (prefijo, lista) => lista.forEach((x) => assert.ok((prefijo + x) in TEXTOS.en, prefijo + x));
  de('metric_', ['distance', 'deliveries', 'hours', 'on_time', 'care', 'tonnes', 'economy']);
  de('period_', ['week', 'month', 'last_month', 'year', 'total']);
  de('feed_', ['founded', 'joined', 'left', 'kicked', 'applied', 'delivered', 'cancelled', 'promoted', 'role', 'owner', 'dissolved']);
  de('event_', ['delivered', 'cancelled', 'joined', 'left', 'kicked', 'applied', 'promoted', 'role', 'owner']);
  de('area_', ['members', 'applications', 'roles', 'dispatch', 'events', 'competitions', 'trips', 'settings', 'discord']);
  de('reason_', ['impossible_speed', 'impossible_pace', 'no_distance', 'distance_over_plan', 'low_coverage', 'top_speed', 'modded_economy', 'heavy_damage']);
  de('report_', ['name', 'content', 'impersonation', 'other']);
  de('card_', ['portrait', 'link', 'banner', 'signature']);
});

// Los motivos que devuelve la API (truckdash-loginapp: VtcError). Uno nuevo alla
// va aca y en los ocho idiomas, o la pagina dice solo "no funciono".
const ERRORES = [
  'demasiados_pedidos', 'falta_username', 'no_autenticado', 'viaje_no_encontrado', 'vtc_accept_public',
  'vtc_already_applied', 'vtc_already_member', 'vtc_answer_missing', 'vtc_application_closed',
  'vtc_application_not_found', 'vtc_applied_recently', 'vtc_closed', 'vtc_confirm_tag', 'vtc_default_role',
  'vtc_field', 'vtc_found_requirements', 'vtc_full', 'vtc_games', 'vtc_higher_role', 'vtc_invite_invalid',
  'vtc_link', 'vtc_member_is_public', 'vtc_member_not_found', 'vtc_name_chars', 'vtc_name_fixed',
  'vtc_name_length', 'vtc_name_reserved', 'vtc_name_taken', 'vtc_no_discord_icon', 'vtc_no_permission',
  'vtc_not_found', 'vtc_not_member', 'vtc_not_recruiting', 'vtc_not_yourself', 'vtc_owner_must_transfer',
  'vtc_owner_only', 'vtc_owner_role', 'vtc_permission_above_yours', 'vtc_rank_not_found', 'vtc_ranks_count',
  'vtc_ranks_from_zero', 'vtc_ranks_repeated', 'vtc_reason_needed', 'vtc_role_name', 'vtc_role_not_found',
  'vtc_tag_chars', 'vtc_tag_length', 'vtc_tag_reserved', 'vtc_tag_taken', 'vtc_text_long',
  'vtc_too_many_applications', 'vtc_too_many_invites', 'vtc_too_many_roles', 'vtc_too_many_webhooks',
  'vtc_webhook_failed', 'vtc_webhook_not_found', 'vtc_webhook_url',
];

test('los motivos de la API estan traducidos', () => {
  for (const e of ERRORES) assert.ok(e in TEXTOS.en, e);
});

// De la libreria qrcode de Python (la del cliente), correccion M, con esa mascara.
const QR = [
  ['KL', 0, 'fe1bfc17d06e92bb7485dbabaec10907faafe00000aa6890c7a9a9fdcf407b932f7200411bf822704447baeaadd1aaaeaddb04bbafed778'],
  ['https://trucksim-dash.com/vtc/?KL', 2, 'fe39bbfc1243106eb4a6bb7591a5dbaaf72ec17fe107faaaafe01ea000be1353e6830ffc5ec803c1386525a935868642c3bdc48a3d378f8bb0721692416629ccfd6a8471895024512a7704fb8057c47ff91e6b90559710bab2cfb5d6418beebffffd04d915afebc61e0'],
  ['https://trucksim-dash.com/vtc/?invite=ABCDEFGHJK', 5, 'fe2aac3fc16363106ebb19ebb7540235dba75642ec13b66507faaaaafe0164460082ed42e718989b87999e4b02ca28523bd8327fdb80c05460bf9be1d185f87620adda04dad8a871feb37bc464dda425bc05e56118eccc0c57714239873b1d7260042ce75f1bf98041dec57f90e86ad04de031eba0224fddd0c662fee9c3367f04b3353cfea073f10'],
  ['x'.repeat(84), 7, 'fe515553fc11ba38d06e8038e2bb749e5555dba78c71aec1550e3907faaaaaafe00e28e30096dd9c75044db9555361a80e3867d36638e20cf13555743eaa1c71a63c8b8e30b79f2aaab222adc71e67e6971c77f6d1aaaa2e72ef8e3965aed1c73d5ebe555535fe00e3867b97a38e20d65b5557426031c71a69e138e30a8b86aaab2f34dc71ff805071c47ff8b2aaeaf058b8e116ba2f1c6fd5d57555872e918e3b2704b238d70fedd555a58'],
  ['x'.repeat(106), 3, 'febddb6dbfc15e6492506e9fc4924bb7520b6db5dba64b6db2ec1170924907faaaaaaafe0197924900b7756db6a5fa842db6dd42f732492cc614e2492516be7db6d97a2f59b6db0c89ae49241743a649248a573c36db4cce6676db6bbd8f89249a13b8692493ce668edb6fa0050adb6dd58b152492cdc3632492501fcfdb6d9782c61b6db0edada492416785649248a822f36db4c9209f6db6ba8f6a9249a011f192493c7b806db6fa00592db6c57facf2496ad055e249111ba2cbb6cffdd578b6d646ea0c4927570485c927dafed1b6db9d0'],
];

test('el QR es el mismo que da la libreria de Python', () => {
  for (const [texto, mascara, esperado] of QR) {
    let bits = codificar(texto, mascara).flat().join('');
    bits += '0'.repeat((4 - bits.length % 4) % 4);
    const hex = bits.match(/.{4}/g).map((b) => parseInt(b, 2).toString(16)).join('');
    assert.strictEqual(hex, esperado, texto);
  }
});

test('un texto que no entra da null y uno corto elige mascara solo', () => {
  assert.strictEqual(codificar('x'.repeat(107)), null);
  assert.strictEqual(codificar('KL').length, 21);
});
