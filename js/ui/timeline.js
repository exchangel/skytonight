/**
 * timeline.js — Gün batımından şafağa saat saat şerit.
 * Her hücre: saat, o saatin skoru (renkli), bulut yüzdesi ve Ay gökyüzündeyse küçük işaret.
 */

import { esc } from './dom.js';
import { statusFromScore } from '../../core/scoring.js';
import { formatTime } from '../../core/format.js';

export function renderTimeline(el, night) {
  const tz = night.timeZone;
  if (!night.hours.length) {
    el.innerHTML = '';
    return;
  }

  const cells = night.hours.map((h) => {
    const sc = h.scores;
    const values = sc ? [sc.planet, sc.deepSky].filter((v) => v != null) : [];
    const score = values.length ? Math.round(Math.max(...values)) : null;
    const status = statusFromScore(score);
    const cloud = sc ? sc.factors.cloudPct : null;
    const twilight = h.sunAlt > -12;
    const title = sc
      ? `${formatTime(h.time, tz)} — skor ${score}, bulut %${cloud}, ${Math.round(h.weather.temp)}°C, rüzgar ${Math.round(h.weather.wind)} km/s`
      : `${formatTime(h.time, tz)} — tahmin yok`;
    return `<li class="hour tone-bg-soft-${status}${twilight ? ' twilight' : ''}" title="${esc(title)}">
        <span class="hour-time">${formatTime(h.time, tz)}</span>
        <span class="hour-score tone-${status}">${score ?? '—'}</span>
        <span class="hour-cloud">${cloud == null ? '' : `☁ ${cloud}%`}</span>
        <span class="hour-moon">${h.moonAlt > 0 ? '☾' : ''}</span>
      </li>`;
  }).join('');

  el.innerHTML = `
    <div class="section-head">
      <h2>Saat saat</h2>
      <span class="legend"><span class="dot tone-bg-good"></span>iyi <span class="dot tone-bg-ok"></span>orta <span class="dot tone-bg-bad"></span>kötü · ☾ Ay gökyüzünde</span>
    </div>
    <ol class="hours" aria-label="Saatlik gözlem koşulları">${cells}</ol>`;
}
