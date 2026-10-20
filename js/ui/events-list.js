/**
 * events-list.js — Yaklaşan gökyüzü olayları listesi.
 */

import { esc } from './dom.js';
import { dateKey, daysBetweenKeys, formatDayMonth, formatTime } from '../../core/format.js';

function relativeDay(days) {
  if (days < 0) return 'geçti';
  if (days === 0) return 'bugün';
  if (days === 1) return 'yarın';
  if (days < 7) return `${days} gün sonra`;
  if (days < 60) return `${Math.round(days / 7)} hafta sonra`;
  return `${Math.round(days / 30)} ay sonra`;
}

export function renderEvents(el, { events, tz, todayKey, limit = 14 }) {
  if (!events.length) {
    el.innerHTML = '';
    return;
  }
  const items = events.slice(0, limit).map((e) => {
    const days = daysBetweenKeys(todayKey, dateKey(e.time, tz));
    const [day, month] = formatDayMonth(e.time, tz).split(' ');
    return `<li class="event imp-${e.importance}${e.visible === false ? ' not-visible' : ''}">
        <div class="event-date"><span class="event-day">${esc(day)}</span><span class="event-month">${esc(month)}</span></div>
        <div class="event-body">
          <h3><span class="event-icon emoji" aria-hidden="true">${e.icon}</span>${esc(e.title)}</h3>
          <p class="event-when">${esc(relativeDay(days))}${e.type !== 'moon' && e.type !== 'opposition' ? ` · ${formatTime(e.time, tz)}` : ''}${e.visible === false ? ' · <span class="tag">buradan görünmez</span>' : ''}</p>
          <p class="event-text">${esc(e.text)}</p>
        </div>
      </li>`;
  }).join('');

  el.innerHTML = `
    <div class="section-head">
      <h2>Yaklaşan olaylar</h2>
      <span class="section-note">tutulma · meteor · karşı konum · kavuşum</span>
    </div>
    <ol class="events">${items}</ol>`;
}
