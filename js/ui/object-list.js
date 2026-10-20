/**
 * object-list.js — "Bu gece neler görebilirim?" bölümü.
 *  - Üstte "Bu gece bak" önerileri (en iyi 6 hedef)
 *  - Altta filtrelenebilir tam liste: kategori, ekipman, sadece görünenler, sıralama
 */

import { esc } from './dom.js';
import { KIND_ICONS } from './icons.js';
import { miniCompass } from './charts.js';
import { KIND_LABELS, CATEGORIES, sortResults, topPicks } from '../../core/objects.js';
import { EQUIPMENT_PRESETS } from '../../core/equipment.js';
import { shortPosition } from '../../core/directions.js';
import { formatTime, formatNumber } from '../../core/format.js';

const PAGE_SIZE = 40;

export function displayName(target) {
  return target.name || target.code || target.id;
}

/**
 * "Şimdi"yi mi yoksa "en iyi an"ı mı gösterelim? Cisim şu an ufkun üstündeyse şimdiki
 * konum daha kullanışlıdır; ama yeni doğmuş ve ileride çok daha yükseğe çıkacaksa
 * (ör. şimdi 2°, gece 60°'ye çıkacak) en iyi anı önermek daha doğrudur.
 */
export function preferNow(r) {
  if (!r.now || r.now.alt <= 0) return false;
  if (r.now.alt >= 15) return true;
  return !r.best || r.best.alt - r.now.alt < 10;
}

/** Kartlardaki konum satırı: gece sürüyorsa "şimdi", değilse "en iyi an". */
function positionLine(r, tz) {
  if (preferNow(r)) {
    return `${miniCompass(r.now.az)}<span>Şimdi ${esc(shortPosition(r.now.az, r.now.alt))}</span>`;
  }
  if (r.best && r.level !== 'invisible') {
    return `${miniCompass(r.best.az)}<span>En iyi <time>${formatTime(r.best.time, tz)}</time> · ${esc(shortPosition(r.best.az, r.best.alt))}</span>`;
  }
  return `<span class="muted">${esc(r.reasons[0] || 'Bu gece görünmüyor')}</span>`;
}

function metaLine(r, conNames) {
  const t = r.target;
  const parts = [];
  if (t.name && t.code) parts.push(t.code);
  parts.push(KIND_LABELS[t.kind]);
  if (r.constellation && conNames[r.constellation] && t.kind !== 'constellation') parts.push(conNames[r.constellation]);
  if (t.mag != null && t.kind !== 'constellation') parts.push(`${formatNumber(t.mag, 1)} kadir`);
  return parts.map(esc).join(' · ');
}

function card(r, ctx, variant = '') {
  const t = r.target;
  return `<button class="obj-card ${variant} level-${r.level}" data-action="open-object" data-id="${esc(t.id)}">
      <span class="obj-icon kind-${t.kind}">${KIND_ICONS[t.kind] || ''}</span>
      <span class="obj-main">
        <span class="obj-name">${esc(displayName(t))}</span>
        <span class="obj-meta">${metaLine(r, ctx.conNames)}</span>
        <span class="obj-pos">${positionLine(r, ctx.tz)}</span>
      </span>
      <span class="obj-side">
        <span class="level level-${r.level}">${esc(r.levelLabel)}</span>
        ${r.photo ? '<span class="photo-badge emoji" title="Telefonla göz merceğinden çekilebilir">📷</span>' : ''}
      </span>
    </button>`;
}

/** "Bu gece bak" önerileri. */
export function renderPicks(el, { results, tz, conNames, equipmentName }) {
  const picks = topPicks(results, 6);
  if (!picks.length) {
    el.innerHTML = `<div class="section-head"><h2>Bu gece bak</h2></div>
      <p class="empty">Bu gece ${esc(equipmentName)} ile öne çıkan bir hedef yok. Ekipmanı ya da geceyi değiştirmeyi dene.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="section-head">
      <h2>Bu gece bak</h2>
      <span class="section-note">${esc(equipmentName)} için en iyi hedefler</span>
    </div>
    <div class="picks">${picks.map((r) => card(r, { tz, conNames }, 'pick')).join('')}</div>`;
}

/**
 * Tam liste.
 * @param {object} p
 * @param {Array<object>} p.results evaluateTargets() çıktısı
 * @param {{category:string, onlyVisible:boolean, sort:string}} p.filters
 * @param {string} p.equipmentId
 * @param {number} p.limit kaç kart gösterilecek (sayfalama)
 */
export function renderObjectList(el, { results, filters, equipmentId, limit = PAGE_SIZE, tz, conNames }) {
  const inCategory = results.filter((r) => filters.category === 'all' || r.target.category === filters.category);
  const visible = filters.onlyVisible ? inCategory.filter((r) => r.level !== 'invisible') : inCategory;
  const sorted = sortResults(visible, filters.sort);
  const shown = sorted.slice(0, limit);

  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  for (const r of results) {
    if (filters.onlyVisible && r.level === 'invisible') continue;
    counts.all++;
    counts[r.target.category] = (counts[r.target.category] || 0) + 1;
  }

  const chips = CATEGORIES.map((c) => `<button class="chip${filters.category === c.id ? ' active' : ''}" data-action="filter-category" data-category="${c.id}" aria-pressed="${filters.category === c.id}">
      ${esc(c.label)} <span class="chip-count">${counts[c.id] || 0}</span></button>`).join('');

  const equipmentOptions = [...EQUIPMENT_PRESETS, { id: 'custom', name: 'Özel teleskop (ayarlardan)' }]
    .map((e) => `<option value="${e.id}"${e.id === equipmentId ? ' selected' : ''}>${esc(e.name)}</option>`).join('');

  el.innerHTML = `
    <div class="section-head">
      <h2>Görülebilecekler</h2>
      <span class="section-note">${visible.length} cisim</span>
    </div>
    <div class="list-controls">
      <label class="field">
        <span>Ekipman</span>
        <select data-action="set-equipment">${equipmentOptions}</select>
      </label>
      <label class="field">
        <span>Sırala</span>
        <select data-action="set-sort">
          <option value="best"${filters.sort === 'best' ? ' selected' : ''}>En iyi önce</option>
          <option value="time"${filters.sort === 'time' ? ' selected' : ''}>Saate göre</option>
          <option value="mag"${filters.sort === 'mag' ? ' selected' : ''}>Parlaklığa göre</option>
        </select>
      </label>
      <label class="toggle">
        <input type="checkbox" data-action="toggle-visible"${filters.onlyVisible ? ' checked' : ''}>
        <span>Sadece görünenler</span>
      </label>
    </div>
    <div class="chips" role="group" aria-label="Kategori">${chips}</div>
    ${shown.length ? `<div class="obj-grid">${shown.map((r) => card(r, { tz, conNames })).join('')}</div>` : '<p class="empty">Bu filtrelerle görünen bir cisim yok.</p>'}
    ${sorted.length > limit ? `<button class="btn btn-ghost more" data-action="show-more">Daha fazla göster (${sorted.length - limit})</button>` : ''}`;
}

export { PAGE_SIZE };
