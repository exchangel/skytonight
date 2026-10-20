// Görünürlük modeli amatör gözlemcilerin bilinen deneyimleriyle uyumlu mu?

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateTarget, skyBrightness, nakedEyeLimit, bortleInfo } from '../core/visibility.js';
import { resolveEquipment, eyepieceViews, suggestEyepiece, limitingMagnitudeGain } from '../core/equipment.js';

const eye = resolveEquipment('eye');
const omegon = resolveEquipment('omegon130');
const bino = resolveEquipment('bino10x50');

const darkNight = { sunAlt: -30, moonAlt: -20, moonIllum: 0, alt: 60 };
const rate = (target, equipment, bortle, extra = {}) => rateTarget(target, { equipment, bortle, ...darkNight, ...extra }).level;

const M31 = { kind: 'galaxy', mag: 3.44, size: [177.8, 69.7] };
const M51 = { kind: 'galaxy', mag: 8.4, size: [13.7, 11.7] };
const M57 = { kind: 'planetary', mag: 8.8, size: [1.27] };
const M13 = { kind: 'globular', mag: 5.8, size: [16.5] };
const M45 = { kind: 'open', mag: 1.2, size: [150, 150] };

test('Omegon 130/920 optik değerleri', () => {
  const views = eyepieceViews(omegon);
  assert.equal(Math.round(views[0].magnification), 37);
  assert.equal(Math.round(views[1].magnification), 92);
  assert.ok(Math.abs(views[0].fovDeg - 1.41) < 0.02);
  // Üreticinin verdiği limit kadir ~12,4; Bortle 3'te modelimiz yakın olmalı.
  const limit = bortleInfo(3).nelm + limitingMagnitudeGain(omegon);
  assert.ok(limit > 12 && limit < 13.2, `limit ${limit}`);
});

test('Gökyüzü parlaklığı: dolunay karanlık gökyüzünü belirgin aydınlatır', () => {
  const dark = skyBrightness({ bortle: 2 });
  const moonlit = skyBrightness({ bortle: 2, moonAlt: 60, moonIllum: 1 });
  assert.ok(dark - moonlit > 2.5, `${dark} → ${moonlit}`);
  assert.ok(nakedEyeLimit(2, moonlit) < 5.5);
});

test('Andromeda (M31): karanlıkta çıplak gözle görünür, şehirde görünmez', () => {
  assert.notEqual(rate(M31, eye, 3), 'invisible');
  assert.equal(rate(M31, eye, 9), 'invisible');
});

test('Girdap Galaksisi (M51): çıplak gözle hiçbir yerde, 130 mm ile karanlıkta görünür', () => {
  assert.equal(rate(M51, eye, 1), 'invisible');
  assert.ok(['easy', 'moderate'].includes(rate(M51, omegon, 3)));
  assert.equal(rate(M51, omegon, 8), 'invisible');
});

test('Halka Bulutsusu (M57): 130 mm ile şehirde bile görülebilir', () => {
  assert.notEqual(rate(M57, omegon, 7), 'invisible');
});

test('Herkül Kümesi (M13): dürbünle de görünür; dolunay zorlaştırır', () => {
  assert.notEqual(rate(M13, bino, 5), 'invisible');
  const moonless = rateTarget(M13, { equipment: omegon, bortle: 4, ...darkNight }).margin;
  const moonlit = rateTarget(M13, { equipment: omegon, bortle: 4, ...darkNight, moonAlt: 50, moonIllum: 1, moonSep: 60 }).margin;
  assert.ok(moonlit < moonless - 1);
});

test('Ülker (M45) şehirde bile çıplak gözle kolay', () => {
  assert.equal(rate(M45, eye, 8), 'easy');
});

test('Çift yıldızlar: ayırma gücü belirleyici', () => {
  const albireo = { kind: 'double', mag: 3.1, magB: 5.1, sep: 34.4 };
  const epsLyrClose = { kind: 'double', mag: 5.0, magB: 6.1, sep: 2.3 };
  const mizarAlcor = { kind: 'double', mag: 2.2, magB: 4.0, sep: 708 };
  assert.equal(rate(albireo, eye, 5), 'invisible');
  assert.equal(rate(albireo, omegon, 7), 'easy');
  assert.equal(rate(mizarAlcor, eye, 5), 'easy');
  assert.equal(rate(epsLyrClose, eye, 3), 'invisible');
  assert.notEqual(rate(epsLyrClose, omegon, 5, { seeing: 1 }), 'invisible');
  assert.equal(rate(epsLyrClose, omegon, 5, { seeing: 0.25 }), 'invisible');
});

test('Gezegenler ve Ay: ufkun üstündeyse kolay; ufkun altındaysa görünmez', () => {
  assert.equal(rate({ kind: 'planet', mag: 0.3 }, eye, 9), 'easy');
  assert.equal(rate({ kind: 'moon', mag: -12 }, eye, 9), 'easy');
  assert.equal(rate({ kind: 'planet', mag: -2 }, omegon, 5, { alt: -5 }), 'invisible');
});

test('Göz merceği önerisi: Ülker sığmaz, Satürn için yüksek büyütme', () => {
  assert.equal(suggestEyepiece(omegon, M45).fits, false);
  assert.match(suggestEyepiece(omegon, { kind: 'planet', size: [0.3] }).text, /10 mm/);
  assert.equal(suggestEyepiece(eye, M45), null);
});
