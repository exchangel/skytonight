// Saat dilimi ve biçimlendirme yardımcıları.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedTimeToUtc, tzOffsetMinutes, currentNightKey, addDaysToKey, daysBetweenKeys, formatDuration, formatPercent, dateKey } from '../core/format.js';
import { describeDirection, pointingInstruction, compassPoint, fistsFromAltitude, shortPosition } from '../core/directions.js';

test('İstanbul öğlen 12:00 = 09:00 UTC (UTC+3, yaz saati yok)', () => {
  const d = zonedTimeToUtc({ year: 2026, month: 10, day: 20, hour: 12 }, 'Europe/Istanbul');
  assert.equal(d.toISOString(), '2026-10-20T09:00:00.000Z');
  assert.equal(tzOffsetMinutes('Europe/Istanbul', d), 180);
});

test('Yaz saati olan saat dilimlerinde ofset tarihe göre değişir', () => {
  const winter = zonedTimeToUtc({ year: 2026, month: 1, day: 15, hour: 12 }, 'Europe/Berlin');
  const summer = zonedTimeToUtc({ year: 2026, month: 7, day: 15, hour: 12 }, 'Europe/Berlin');
  assert.equal(winter.toISOString(), '2026-01-15T11:00:00.000Z');
  assert.equal(summer.toISOString(), '2026-07-15T10:00:00.000Z');
});

test('Gece yarısından sonra hâlâ önceki akşamın gecesindeyiz', () => {
  const tz = 'Europe/Istanbul';
  assert.equal(currentNightKey(new Date('2026-10-20T23:30:00Z'), tz), '2026-10-20'); // 02:30 yerel, 21 Ekim
  assert.equal(currentNightKey(new Date('2026-10-20T16:00:00Z'), tz), '2026-10-20'); // 19:00 yerel
  assert.equal(currentNightKey(new Date('2026-10-20T07:00:00Z'), tz), '2026-10-19'); // 10:00 yerel
  assert.equal(dateKey(new Date('2026-10-20T23:30:00Z'), tz), '2026-10-21');
});

test('Tarih anahtarı aritmetiği ay/yıl sınırlarını geçer', () => {
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysToKey('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetweenKeys('2026-10-20', '2026-10-27'), 7);
});

test('Süre ve yüzde biçimleri', () => {
  assert.equal(formatDuration(320), '5 sa 20 dk');
  assert.equal(formatDuration(45), '45 dk');
  assert.equal(formatDuration(120), '2 sa');
  assert.equal(formatPercent(0.42), '%42');
});

test('Yön tarifleri', () => {
  assert.equal(compassPoint(0).name, 'Kuzey');
  assert.equal(compassPoint(350).name, 'Kuzey');
  assert.equal(compassPoint(135).name, 'Güneydoğu');
  assert.equal(compassPoint(247).name, 'Güneybatı');
  assert.equal(describeDirection(135.4), 'Güneydoğu (135°)');
  assert.equal(fistsFromAltitude(35), 3.5);
  assert.equal(pointingInstruction(135, 35), 'Güneydoğuya (135°) dön, ufkun 35° üstüne bak (≈3,5 yumruk).');
  assert.equal(shortPosition(90, 12.6), 'D · 13°');
});
