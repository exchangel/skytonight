/**
 * week-strip.js — Önümüzdeki 7 gece. Bir geceye dokununca sayfa o geceyi gösterir.
 */

import { esc } from './dom.js';
import { formatWeekdayShort, formatDayMonth, nightNoon } from '../../core/format.js';

export function renderWeekStrip(el, { week, selectedKey, todayKey }) {
  if (!week.length) {
    el.innerHTML = '';
    return;
  }
  const tz = week[0].timeZone;

  // En iyi gece (yalnızca hava tahmini olanlar arasından).
  const scored = week.filter((n) => n.overall);
  const best = scored.length ? scored.reduce((a, b) => (b.overall.score > a.overall.score ? b : a)) : null;

  const days = week.map((n) => {
    const noon = nightNoon(n.key, tz);
    const label = n.key === todayKey ? 'Bu gece' : formatWeekdayShort(noon, tz);
    const score = n.overall ? n.overall.score : null;
    return `<button class="night tone-border-${n.status}${n.key === selectedKey ? ' selected' : ''}${n.confidence === 'low' ? ' low-confidence' : ''}"
        data-action="select-night" data-key="${n.key}" aria-pressed="${n.key === selectedKey}">
        <span class="night-day">${esc(label)}</span>
        <span class="night-date">${esc(formatDayMonth(noon, tz))}</span>
        <span class="night-score tone-${n.status}">${score ?? '—'}</span>
        <span class="night-moon emoji" title="Ay %${Math.round(n.moon.illumination * 100)}">${n.moon.emoji}</span>
      </button>`;
  }).join('');

  const bestText = best && best.overall.score >= 40
    ? `En iyi gece: <strong>${best.key === todayKey ? 'bu gece' : esc(formatWeekdayShort(nightNoon(best.key, tz), tz))}</strong> (${best.overall.score})`
    : 'Önümüzdeki günlerde belirgin iyi bir gece görünmüyor.';

  el.innerHTML = `
    <div class="section-head">
      <h2>Önümüzdeki geceler</h2>
      <span class="section-note">${bestText}</span>
    </div>
    <div class="nights" role="group" aria-label="Gece seç">${days}</div>
    <p class="fineprint">Soluk kartlar 3+ gün sonrası: tahmin güveni düşük.</p>`;
}
