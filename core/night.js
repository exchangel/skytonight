/**
 * night.js — Bir gecenin bütün değerlendirmesini tek yerde toplar (orkestra şefi).
 *
 *   konum + tarih + hava tahmini
 *        │
 *        ├─ nightWindow(): gün batımı, alacakaranlıklar, şafak
 *        ├─ saat saat: Güneş/Ay irtifası, parlak gezegen var mı, hava → hourScores()
 *        └─ summarizeNight(): iki alt skor, genel renk, özet, gerekçeler
 *
 * Hem tarayıcı (js/app.js) hem bildirim betiği (notifier/run.mjs) bu dosyayı kullanır;
 * böylece sitede gördüğün skorla telefonuna gelen bildirimdeki skor hep aynıdır.
 */

import { Astronomy, makeObserver, nightWindow, moonInfo, bodyPosition, sunAltitude } from './astro.js';
import { weatherAt } from './weather.js';
import { hourScores, summarizeNight } from './scoring.js';
import { addDaysToKey, daysBetweenKeys, parseDateKey, zonedTimeToUtc } from './format.js';

/** Gezegen skorunu "anlamlı" kılan parlak hedefler (Merkür hep alçakta, hariç). */
const BRIGHT_PLANETS = ['Venus', 'Mars', 'Jupiter', 'Saturn'];

const HOUR = 3600e3;

/**
 * Kullanıcının "en geç saat kaçta yatarım" tercihini ana çevirir.
 * untilHour: 0–11 → ertesi gün o saat, 12–23 → aynı akşam, null → sabaha kadar.
 */
export function untilCutoff(key, untilHour, timeZone) {
  if (untilHour == null || untilHour === '') return null;
  const h = Number(untilHour);
  const day = h < 12 ? addDaysToKey(key, 1) : key;
  return zonedTimeToUtc({ ...parseDateKey(day), hour: h }, timeZone);
}

/**
 * Bir geceyi değerlendirir.
 * @param {object} p
 * @param {string} p.key gece anahtarı "2026-10-20"
 * @param {{lat:number, lon:number, elevation?:number}} p.location
 * @param {string} p.timeZone
 * @param {object|null} p.weather fetchWeather() çıktısı
 * @param {number} p.bortle
 * @param {number|null} [p.untilHour]
 * @param {string} [p.todayKey] bugünün gece anahtarı (tahmin güveni için)
 */
export function evaluateNight({ key, location, timeZone, weather, bortle, untilHour = null, todayKey = null }) {
  const observer = makeObserver(location);
  const window = nightWindow(key, observer, timeZone);

  // Değerlendirme gün batımından başlar; "en geç saat" ya da gün doğumunda biter.
  const cutoff = untilCutoff(key, untilHour, timeZone);
  const minEnd = new Date(window.darkStart.getTime() + HOUR);
  const evalEnd = cutoff && cutoff < window.sunrise ? new Date(Math.max(cutoff, minEnd)) : window.sunrise;

  const midDark = new Date((window.darkStart.getTime() + window.darkEnd.getTime()) / 2);
  const moon = moonInfo(midDark);

  // Saat başı örnekler (hava tahmini saat başlarında verildiği için).
  const hours = [];
  for (let t = Math.ceil(window.sunset.getTime() / HOUR) * HOUR; t <= evalEnd.getTime(); t += HOUR) {
    const time = new Date(t);
    const sunAlt = sunAltitude(time, observer);
    const moonAlt = bodyPosition('Moon', time, observer).alt;
    const brightTargetUp = moonAlt > 10 || BRIGHT_PLANETS.some((b) => bodyPosition(b, time, observer).alt > 10);
    const w = weatherAt(weather, time);
    const scores = hourScores({ weather: w, sunAlt, moonAlt, moonIllum: moon.illumination, bortle, brightTargetUp });
    hours.push({ time, sunAlt, moonAlt, brightTargetUp, weather: w, scores });
  }

  const summary = summarizeNight(hours, { bortle, moonIllum: moon.illumination, hasAstroDark: window.hasAstroDark });

  // Ay bu gece ne zaman doğuyor/batıyor?
  const nightDays = (window.sunrise - window.sunset) / 86400e3;
  const moonUpAtSunset = bodyPosition('Moon', window.sunset, observer).alt > 0;
  const moonRise = Astronomy.SearchRiseSet('Moon', observer, +1, window.sunset, nightDays);
  const moonSet = Astronomy.SearchRiseSet('Moon', observer, -1, window.sunset, nightDays);

  const daysAhead = todayKey ? daysBetweenKeys(todayKey, key) : 0;

  return {
    key,
    timeZone,
    location,
    observer,
    bortle,
    window,
    cutoff,
    evalEnd,
    moon: {
      ...moon,
      upAtSunset: moonUpAtSunset,
      rise: moonRise ? moonRise.date : null,
      set: moonSet ? moonSet.date : null,
    },
    hours,
    hasWeather: hours.some((h) => h.weather),
    confidence: daysAhead >= 3 ? 'low' : daysAhead >= 1 ? 'medium' : 'high',
    ...summary,
  };
}

/** Gece boyunca ortalama seeing çarpanı (çift yıldız değerlendirmesi için). */
export function averageSeeing(night) {
  const values = night.hours.filter((h) => h.scores && h.sunAlt < -6).map((h) => h.scores.factors.seeing);
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0.7;
}

/**
 * Önümüzdeki günlerin kısa özeti ("7 gecelik şerit").
 * @returns {Array<ReturnType<typeof evaluateNight>>}
 */
export function evaluateWeek({ startKey, days = 7, ...rest }) {
  const out = [];
  for (let i = 0; i < days; i++) {
    out.push(evaluateNight({ ...rest, key: addDaysToKey(startKey, i), todayKey: rest.todayKey ?? startKey }));
  }
  return out;
}
