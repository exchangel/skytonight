/**
 * tonight-card.js — Sayfanın kalbi: "Bu gece gözlem yapmalı mıyım?" kartı.
 * Büyük renkli durum, tek satırlık özet, karanlık penceresi, alt skorlar ve gerekçeler.
 */

import { esc, STATUS_SYMBOL } from './dom.js';
import { ICONS } from './icons.js';
import { STATUS_INFO, statusFromScore } from '../../core/scoring.js';
import { formatTime, formatNightKey, formatPercent, formatDuration } from '../../core/format.js';

const CONFIDENCE_TEXT = {
  medium: 'Tahmin 1–2 gün sonrası için: büyük ölçüde güvenilir.',
  low: 'Tahmin 3+ gün sonrası için: bulut tahmini değişebilir, yaklaşınca tekrar bak.',
};

function scoreBar(label, block, hint) {
  const value = block ? block.score : null;
  const status = statusFromScore(value);
  return `<div class="subscore">
      <div class="subscore-head"><span>${esc(label)}</span><strong class="tone-${status}">${value == null ? '—' : value}</strong></div>
      <div class="bar"><span class="bar-fill tone-bg-${status}" style="width:${value ?? 0}%"></span></div>
      <div class="subscore-hint">${esc(hint)}</div>
    </div>`;
}

/**
 * @param {HTMLElement} el
 * @param {object} p
 * @param {object} p.night evaluateNight() çıktısı
 * @param {boolean} p.isTonight seçili gece bu gece mi
 */
export function renderTonightCard(el, { night, isTonight }) {
  const tz = night.timeZone;
  const status = night.status;
  const info = STATUS_INFO[status];
  const score = night.overall ? night.overall.score : null;
  const s = night.summary;
  const w = night.window;
  const moon = night.moon;

  const summaryLine = s
    ? [s.cloudText, `${Math.round(s.temp)}°C`, `Rüzgar ${Math.round(s.wind)} km/s`, `Ay ${formatPercent(moon.illumination)}`].join(' · ')
    : 'Hava tahmini yok — yine de gökyüzü hesapları aşağıda.';

  const moonTimes = [];
  if (moon.upAtSunset) moonTimes.push('akşam gökyüzünde');
  if (moon.rise) moonTimes.push(`doğuş ${formatTime(moon.rise, tz)}`);
  if (moon.set) moonTimes.push(`batış ${formatTime(moon.set, tz)}`);
  if (!moon.upAtSunset && !moon.rise) moonTimes.push('bu gece ufkun altında');

  const best = night.overall
    ? `${formatTime(night.overall.start, tz)}–${formatTime(night.overall.end > w.sunrise ? w.sunrise : night.overall.end, tz)}`
    : '—';

  const reasons = night.reasons.map((r) => `<li class="reason tone-${r.tone === 'good' ? 'good' : r.tone === 'bad' ? 'bad' : 'info'}">
      <span class="reason-mark">${r.tone === 'good' ? '✓' : r.tone === 'bad' ? '✕' : '•'}</span>${esc(r.text)}</li>`).join('');

  el.innerHTML = `
    <article class="tonight card tone-border-${status}">
      <div class="tonight-top">
        <div class="orb tone-${status}" style="--score:${score ?? 0}" role="img" aria-label="Gözlem skoru ${score ?? 'yok'} / 100">
          <span class="orb-score">${score ?? '—'}</span>
          <span class="orb-symbol">${STATUS_SYMBOL[status]}</span>
        </div>
        <div class="tonight-headline">
          <div class="eyebrow">${isTonight ? 'Bu gece' : esc(formatNightKey(night.key, tz)) + ' gecesi'}</div>
          <h1 class="status-title tone-${status}">${esc(info.label)}</h1>
          <p class="status-sub">${esc(night.headline)}</p>
          <p class="status-summary">${esc(summaryLine)}</p>
        </div>
      </div>

      ${night.confidence !== 'high' && night.hasWeather ? `<div class="notice">${ICONS.info}<span>${esc(CONFIDENCE_TEXT[night.confidence])}</span></div>` : ''}

      <dl class="facts">
        <div><dt>Gün batımı</dt><dd>${formatTime(w.sunset, tz)}</dd></div>
        <div><dt>${w.hasAstroDark ? 'Tam karanlık' : 'Karanlık (nautik)'}</dt><dd>${formatTime(w.darkStart, tz)}–${formatTime(w.darkEnd, tz)}</dd></div>
        <div><dt>En iyi saatler</dt><dd>${best}</dd></div>
        <div><dt>Ay <span class="emoji">${moon.emoji}</span></dt><dd>${esc(moon.phaseName)} ${formatPercent(moon.illumination)} <small>${esc(moonTimes.join(', '))}</small></dd></div>
      </dl>

      <div class="subscores">
        ${scoreBar('Ay & Gezegenler', night.planet, 'bulut, atmosfer titreşimi, rüzgar')}
        ${scoreBar('Derin uzay', night.deepSky, 'bulut, Ay ışığı, şeffaflık, ışık kirliliği')}
        ${scoreBar('Telefonla foto', night.photo, 'Ay/gezegen afokal çekim')}
      </div>

      <ul class="reasons">${reasons}</ul>
      <p class="dark-total">Toplam ${w.hasAstroDark ? 'astronomik' : 'nautik'} karanlık: ${formatDuration(w.darkMinutes)}</p>
    </article>`;
}
