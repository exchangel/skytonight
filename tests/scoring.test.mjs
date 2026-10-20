// Skor motorunun sınır durumları: "mantıklı" kararlar veriyor mu?

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hourScores, effectiveCloud, statusFromScore, bestBlock, summarizeNight } from '../core/scoring.js';

/** Kusursuz bir saatlik hava kaydı; testler istediği alanı değiştirir. */
const clearHour = (over = {}) => ({
  temp: 12, rh: 55, dew: 3, pop: 0, cloud: 0, low: 0, mid: 0, high: 0,
  visibility: 40000, wind: 5, gust: 8, jet: 40, aod: 0.08, dust: 0, ...over,
});

const dark = { sunAlt: -30, moonAlt: -20, moonIllum: 0, bortle: 3, brightTargetUp: true };

test('Etkin bulut: katmanlar birleşir, sirrus yarım sayılır', () => {
  assert.equal(effectiveCloud({ low: 0, mid: 0, high: 0 }), 0);
  assert.equal(effectiveCloud({ low: 40, mid: 40, high: 0 }), 64);
  assert.equal(effectiveCloud({ low: 0, mid: 0, high: 100 }), 50);
});

test('Açık, karanlık, sakin gece: iki skor da yeşil', () => {
  const s = hourScores({ weather: clearHour(), ...dark });
  assert.ok(s.planet >= 90, `gezegen ${s.planet}`);
  assert.ok(s.deepSky >= 85, `derin uzay ${s.deepSky}`);
});

test('Tamamen kapalı gökyüzü: her şey kırmızı', () => {
  const s = hourScores({ weather: clearHour({ low: 100, cloud: 100 }), ...dark });
  assert.equal(statusFromScore(s.planet), 'bad');
  assert.equal(statusFromScore(s.deepSky), 'bad');
});

test('Açık hava + tepede dolunay: gezegen yeşil, derin uzay kırmızı', () => {
  const s = hourScores({ weather: clearHour(), ...dark, moonAlt: 50, moonIllum: 1 });
  assert.equal(statusFromScore(s.planet), 'good');
  assert.equal(statusFromScore(s.deepSky), 'bad');
});

test('Güçlü jet akımı gezegen skorunu düşürür ama derin uzayı pek etkilemez', () => {
  const calm = hourScores({ weather: clearHour(), ...dark });
  const jet = hourScores({ weather: clearHour({ jet: 180 }), ...dark });
  assert.ok(jet.planet < calm.planet - 25, `gezegen ${calm.planet} → ${jet.planet}`);
  assert.ok(Math.abs(jet.deepSky - calm.deepSky) < 1);
  assert.ok(jet.photo < 30, `foto ${jet.photo}`);
});

test('Şehir ışığı derin uzay skorunu sınırlar, gezegeni etkilemez', () => {
  const village = hourScores({ weather: clearHour(), ...dark, bortle: 2 });
  const city = hourScores({ weather: clearHour(), ...dark, bortle: 9 });
  assert.ok(city.deepSky < village.deepSky * 0.6);
  assert.equal(city.planet, village.planet);
});

test('Parlak hedef yoksa gezegen skoru hesaplanmaz', () => {
  const s = hourScores({ weather: clearHour(), ...dark, brightTargetUp: false });
  assert.equal(s.planet, null);
  assert.equal(s.photo, null);
});

test('En iyi blok: bulutlu saatler akşamki iyi pencereyi gölgelemez', () => {
  const t0 = Date.UTC(2026, 9, 20, 17);
  const values = [85, 90, 88, 30, 10, 5];
  const hours = values.map((v, i) => ({ time: new Date(t0 + i * 3600e3), scores: { deepSky: v } }));
  const b = bestBlock(hours, 'deepSky');
  assert.equal(b.score, 88);
  assert.equal(b.start.getTime(), t0);
  assert.equal(b.end.getTime(), t0 + 3 * 3600e3);
});

test('Gece özeti: neden listesi ve başlık üretilir', () => {
  const t0 = Date.UTC(2026, 9, 20, 17);
  const hours = Array.from({ length: 8 }, (_, i) => {
    const weather = clearHour();
    return { time: new Date(t0 + i * 3600e3), sunAlt: -30, moonAlt: -10, weather, scores: hourScores({ weather, ...dark }) };
  });
  const s = summarizeNight(hours, { bortle: 3, moonIllum: 0.05, hasAstroDark: true });
  assert.equal(s.status, 'good');
  assert.equal(s.summary.cloudText, 'Açık');
  assert.ok(s.reasons.some((r) => r.tone === 'good'));
  assert.match(s.headline, /iyi bir gece/);
});

test('Hava verisi yoksa durum "none"', () => {
  const s = summarizeNight([{ time: new Date(), sunAlt: -30, moonAlt: 0, weather: null, scores: null }], { bortle: 5, moonIllum: 0, hasAstroDark: true });
  assert.equal(s.status, 'none');
});
