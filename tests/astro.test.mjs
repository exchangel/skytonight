// Astronomi hesaplarını bağımsız kaynaklarla karşılaştırır.
// Referanslar:
//  - NASA JPL Horizons (ssd.jpl.nasa.gov), gözlemci İstanbul 41.01K 28.97D, 40 m,
//    kırılma dahil görünür azimut/irtifa, 2026-10-20 20:00 UTC.
//  - USNO (aa.usno.navy.mil) aynı konum, 2026-10-20: gün batımı 18:16, sivil alacakaranlık sonu 18:44.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeObserver, bodyPosition, nightWindow, moonInfo, skyFrame, fixedPosition, findCrossings, timeSteps, constellationAt } from '../core/astro.js';
import { formatTime } from '../core/format.js';

const TZ = 'Europe/Istanbul';
const observer = makeObserver({ lat: 41.01, lon: 28.97, elevation: 40 });
const when = new Date('2026-10-20T20:00:00Z');

const near = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} ≠ ${expected} ± ${tolerance}`);
};

test('Satürn konumu JPL Horizons ile 0,1° içinde', () => {
  const p = bodyPosition('Saturn', when, observer);
  near(p.az, 161.472517, 0.1, 'azimut');
  near(p.alt, 49.026037, 0.1, 'irtifa');
});

test('Ay konumu JPL Horizons ile 0,1° içinde', () => {
  const p = bodyPosition('Moon', when, observer);
  near(p.az, 217.162919, 0.1, 'azimut');
  near(p.alt, 24.874485, 0.1, 'irtifa');
});

test('Jüpiter o saatte ufkun altında (Horizons: −26,0°)', () => {
  near(bodyPosition('Jupiter', when, observer).alt, -26.032679, 0.2, 'irtifa');
});

test('Gece penceresi USNO ile ±2 dk tutarlı', () => {
  const w = nightWindow('2026-10-20', observer, TZ);
  assert.equal(formatTime(w.sunset, TZ), '18:16');
  assert.equal(formatTime(w.civilDusk, TZ), '18:44');
  assert.ok(w.hasAstroDark, 'Ekim ayında İstanbul\'da astronomik karanlık olmalı');
  assert.ok(w.astroDusk < w.astroDawn && w.sunset < w.astroDusk && w.astroDawn < w.sunrise, 'olaylar sıralı olmalı');
});

test('Ay evresi: 20 Ekim 2026 büyüyen şişkin ay (USNO: %66 civarı)', () => {
  const m = moonInfo(new Date('2026-10-20T18:00:00Z'));
  assert.equal(m.phaseName, 'Büyüyen şişkin ay');
  near(m.illumination, 0.68, 0.05, 'aydınlanma');
});

test('Sabit cisim dönüşümü: Kutup Yıldızı İstanbul\'da kuzeyde, ~enlem yüksekliğinde', () => {
  const p = fixedPosition(skyFrame(when, observer), 2.5303, 89.2642);
  near(p.alt, 41.5, 1.2, 'irtifa');
  assert.ok(p.az < 3 || p.az > 357, `azimut kuzeyde olmalı: ${p.az}`);
});

test('Takımyıldız tespiti', () => {
  assert.equal(constellationAt(5.5881, -5.3897), 'Ori'); // M42
  assert.equal(constellationAt(0.7123, 41.269), 'And'); // M31
});

test('Ufuk geçişleri doğrusal ara değerlemeyle bulunur', () => {
  const times = timeSteps(new Date(0), new Date(3 * 3600e3), 60);
  const { rise, set } = findCrossings(times, [-10, 10, 5, -5]);
  assert.equal(rise.getTime(), 1800e3); // −10 → +10 arasının tam ortası
  assert.equal(set.getTime(), 2 * 3600e3 + 1800e3);
});
