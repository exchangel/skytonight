// Uçtan uca: bir gecenin değerlendirmesi, hedef listesi ve olaylar (sahte hava verisiyle).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateNight, evaluateWeek } from '../core/night.js';
import { buildTargets, evaluateTargets, topPicks } from '../core/objects.js';
import { upcomingEvents } from '../core/events.js';
import { resolveEquipment } from '../core/equipment.js';

const readJson = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const data = {
  catalog: readJson('data/catalog.json'),
  planets: readJson('data/planets.json'),
  constellations: readJson('data/constellations.json'),
};
const showers = readJson('data/meteor-showers.json');

const TZ = 'Europe/Istanbul';
const istanbul = { lat: 41.01, lon: 28.97, elevation: 40 };

/** 10 gün boyunca saatlik, tamamen açık ve sakin sahte hava. */
function fakeWeather({ cloud = 0 } = {}) {
  const start = Date.UTC(2026, 9, 19, 0);
  const hours = Array.from({ length: 240 }, (_, i) => ({
    time: new Date(start + i * 3600e3),
    temp: 12, rh: 60, dew: 4, pop: 0, cloud, low: cloud, mid: 0, high: 0,
    visibility: 30000, wind: 6, gust: 10, jet: 45, aod: 0.1, dust: 0,
  }));
  return { timezone: TZ, hours };
}

const night = evaluateNight({ key: '2026-10-20', location: istanbul, timeZone: TZ, weather: fakeWeather(), bortle: 6 });

test('Açık bir gecede durum yeşil ve gerekçeler var', () => {
  assert.equal(night.status, 'good');
  assert.ok(night.planet.score >= 70);
  assert.ok(night.reasons.length >= 3);
  // 20 Ekim 2026: Ay %70 civarı ve akşam gökyüzünde → derin uzay gezegenlerden kötü olmalı.
  assert.ok(night.deepSky.score < night.planet.score);
});

test('Kapalı bir gecede durum kırmızı', () => {
  const cloudy = evaluateNight({ key: '2026-10-20', location: istanbul, timeZone: TZ, weather: fakeWeather({ cloud: 100 }), bortle: 6 });
  assert.equal(cloudy.status, 'bad');
  assert.match(cloudy.headline, /Bulutlar/);
});

test('"En geç 23:00" tercihi değerlendirmeyi kısaltır', () => {
  const early = evaluateNight({ key: '2026-10-20', location: istanbul, timeZone: TZ, weather: fakeWeather(), bortle: 6, untilHour: 23 });
  assert.ok(early.hours.length < night.hours.length);
  assert.ok(early.evalEnd < night.evalEnd);
});

test('Hedef listesi: Satürn ve Ay kolay, M31 görünür, Omega Centauri İstanbul\'dan görünmez', () => {
  const targets = buildTargets(data);
  const results = evaluateTargets({ night, targets, equipment: resolveEquipment('omegon130'), now: new Date('2026-10-20T19:00:00Z') });
  const byId = Object.fromEntries(results.map((r) => [r.target.id, r]));

  assert.equal(byId['planet:Saturn'].level, 'easy');
  assert.ok(byId['planet:Saturn'].photo, 'açık ve sakin gecede Satürn telefonla çekilebilir olmalı');
  assert.equal(byId.moon.level, 'easy');
  assert.notEqual(byId.M31.level, 'invisible');
  assert.equal(byId.NGC5139.level, 'invisible');
  assert.ok(byId['planet:Saturn'].now, 'gece içindeki "şimdi" konumu hesaplanmalı');
  // 2026 sonbaharında Satürn, Balıklar–Balina sınırında (IAU sınırlarına göre Balina).
  assert.ok(['Psc', 'Cet'].includes(byId['planet:Saturn'].constellation));

  const picks = topPicks(results);
  assert.equal(picks.length, 5);
  assert.ok(picks.every((p) => p.rank >= 2));
});

test('Çıplak gözle derin uzay listesi teleskoptan çok daha kısa', () => {
  const targets = buildTargets(data).filter((t) => t.category === 'deepsky');
  const visible = (eqId) => evaluateTargets({ night, targets, equipment: resolveEquipment(eqId) }).filter((r) => r.level !== 'invisible').length;
  const eye = visible('eye');
  const scope = visible('omegon130');
  assert.ok(scope > eye * 2, `göz ${eye}, teleskop ${scope}`);
});

test('Haftalık özet 7 gece döndürür, ileri günlerin güveni düşük', () => {
  const week = evaluateWeek({ startKey: '2026-10-20', days: 7, location: istanbul, timeZone: TZ, weather: fakeWeather(), bortle: 6 });
  assert.equal(week.length, 7);
  assert.equal(week[0].confidence, 'high');
  assert.equal(week[5].confidence, 'low');
});

test('Olaylar: Orionid zirvesi, dolunay ve sıradaki tutulmalar bulunur', () => {
  const events = upcomingEvents({ location: istanbul, timeZone: TZ, startKey: '2026-10-20', meteorShowers: showers });
  const titles = events.map((e) => e.title);
  assert.ok(titles.includes('Orionid meteor yağmuru zirvesi'));
  assert.ok(titles.includes('Dolunay'));
  assert.ok(events.some((e) => e.type === 'eclipse' && /Ay tutulması/.test(e.title)));
  assert.ok(events.some((e) => e.type === 'eclipse' && /Güneş tutulması/.test(e.title)), '2 Ağustos 2027 tutulması İstanbul\'dan görünür');
  for (let i = 1; i < events.length; i++) assert.ok(events[i].time >= events[i - 1].time, 'tarihe göre sıralı');
});
