// Bildirim metni ve site bağlantısı.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNight } from '../core/night.js';
import { buildMessage, siteLink } from '../notifier/template.js';

const TZ = 'Europe/Istanbul';
const start = Date.UTC(2026, 9, 19, 0);
const weather = {
  timezone: TZ,
  hours: Array.from({ length: 96 }, (_, i) => ({
    time: new Date(start + i * 3600e3), temp: 10, rh: 50, dew: 0, pop: 0, cloud: 0, low: 0, mid: 0, high: 0,
    visibility: 40000, wind: 4, gust: 6, jet: 40, aod: 0.05, dust: 0,
  })),
};
const sub = { name: 'Test', place: 'Kırsal <yer>', lat: 39.92, lon: 32.85, bortle: 3, threshold: 80 };

test('Site bağlantısı konum ve geceyi taşır', () => {
  const link = siteLink('https://exchangel.github.io/skytonight', sub, '2026-10-20');
  const url = new URL(link);
  assert.equal(url.pathname, '/skytonight/');
  assert.equal(url.searchParams.get('lat'), '39.92');
  assert.equal(url.searchParams.get('name'), 'Kırsal <yer>');
  assert.equal(url.searchParams.get('date'), '2026-10-20');
});

test('Mesaj: başlık, özet satırı ve HTML kaçırma', () => {
  const night = evaluateNight({ key: '2026-10-20', location: sub, timeZone: TZ, weather, bortle: 3 });
  const msg = buildMessage({ sub, night, picks: [], events: [], great: true, link: 'https://x.test/' });
  assert.match(msg.title, /gözlem gecesi/);
  assert.match(msg.text, /Kırsal <yer>/);
  assert.match(msg.text, /En iyi saatler/);
  assert.ok(msg.html.includes('Kırsal &lt;yer&gt;'), 'HTML içinde yer adı kaçırılmalı');
  assert.ok(!msg.subject.startsWith('🔭'));
});
