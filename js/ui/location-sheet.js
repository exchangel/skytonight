/**
 * location-sheet.js — Konum seçme paneli.
 *   1) Liste görünümü: şehir arama, "Konumumu bul", kayıtlı konumlar
 *   2) Onay görünümü: seçilen yere ad ver, ışık kirliliğini (Bortle) seç, kaydet/kullan
 */

import { esc, delegate } from './dom.js';
import { ICONS } from './icons.js';
import { openSheet, updateSheet, closeSheet } from './sheet.js';
import { BORTLE_SCALE } from '../../core/visibility.js';
import { searchPlaces, getCurrentPosition, reverseGeocode, guessBortle, lightPollutionMapUrl } from '../services/geo.js';

export function bortleOptions(selected) {
  return BORTLE_SCALE.map((b) => `<option value="${b.level}"${b.level === selected ? ' selected' : ''}>${b.level} — ${esc(b.name)}</option>`).join('');
}

function savedList(prefs) {
  if (!prefs.locations.length) return '<p class="empty small">Henüz kayıtlı konum yok.</p>';
  return `<ul class="saved-locations">${prefs.locations.map((l) => `
      <li><button class="saved-location${l.id === prefs.activeLocationId ? ' active' : ''}" data-action="pick-saved" data-id="${esc(l.id)}">
        ${ICONS.pin}<span><strong>${esc(l.name)}</strong><small>Bortle ${l.bortle} · ${l.lat.toFixed(2)}, ${l.lon.toFixed(2)}</small></span>
      </button></li>`).join('')}</ul>`;
}

function listView(prefs, status = '') {
  return `
    <h2 id="sheet-title">Konum seç</h2>
    <button class="btn btn-primary wide" data-action="locate">${ICONS.locate}<span>Konumumu otomatik bul</span></button>
    <p class="status-line" aria-live="polite">${esc(status)}</p>
    <label class="search">
      ${ICONS.search}
      <input type="search" data-input="search" placeholder="Şehir ya da yer ara (ör. Eskişehir)" autocomplete="off" enterkeyhint="search">
    </label>
    <ul class="search-results" data-results></ul>
    <h3 class="sub-title">Kayıtlı konumlar</h3>
    ${savedList(prefs)}`;
}

function confirmView(p) {
  const b = BORTLE_SCALE[p.bortle - 1];
  return `
    <h2 id="sheet-title">Konumu onayla</h2>
    <p class="muted small">${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}${p.detail ? ` · ${esc(p.detail)}` : ''}</p>
    <label class="field block">
      <span>Konum adı</span>
      <input type="text" data-input="name" value="${esc(p.name)}" maxlength="40">
    </label>
    <label class="field block">
      <span>Işık kirliliği (Bortle ölçeği)</span>
      <select data-input="bortle">${bortleOptions(p.bortle)}</select>
    </label>
    <p class="hint" data-bortle-hint>${esc(b.hint)}</p>
    <p class="hint">Emin değil misin? <a href="${lightPollutionMapUrl(p.lat, p.lon)}" target="_blank" rel="noopener">Işık kirliliği haritasında bu noktaya bak</a>: renk sarı/turuncu ise 5–6, kırmızı/beyaz ise 7–9, yeşil/mavi ise 3–4 civarıdır.</p>
    <label class="toggle">
      <input type="checkbox" data-input="save" checked>
      <span>Bu konumu kaydet</span>
    </label>
    <div class="row-actions">
      <button class="btn btn-ghost" data-action="back">Geri</button>
      <button class="btn btn-primary" data-action="confirm">Bu konumu kullan</button>
    </div>`;
}

/**
 * @param {object} app app.js'in dışa açtığı kontrol nesnesi
 *   { prefs, useLocation(loc, {save}), selectSavedLocation(id) }
 */
export function openLocationSheet(app) {
  let pending = null;
  let searchTimer = null;
  let lastResults = [];

  const body = openSheet(listView(app.prefs), { className: 'location-sheet' });
  const sheet = body.parentElement;

  const showList = (status = '') => { pending = null; updateSheet(listView(app.prefs, status)); };
  const showConfirm = (p) => { pending = p; updateSheet(confirmView(p)); };

  delegate(sheet, 'click', {
    'pick-saved': (el) => {
      app.selectSavedLocation(el.dataset.id);
      closeSheet();
    },
    'pick-result': (el) => {
      const r = lastResults[Number(el.dataset.index)];
      showConfirm({ ...r, bortle: guessBortle(r.population) });
    },
    locate: async () => {
      updateSheet(listView(app.prefs, 'Konum alınıyor…'));
      try {
        const pos = await getCurrentPosition();
        const name = await reverseGeocode(pos.lat, pos.lon);
        showConfirm({ ...pos, name, detail: '', bortle: 6, timezone: null });
      } catch (err) {
        showList(err.message);
      }
    },
    back: () => showList(),
    confirm: () => {
      const name = sheet.querySelector('[data-input="name"]').value.trim() || pending.name;
      const bortle = Number(sheet.querySelector('[data-input="bortle"]').value);
      const save = sheet.querySelector('[data-input="save"]').checked;
      app.useLocation({ name, lat: pending.lat, lon: pending.lon, elevation: pending.elevation ?? 0, bortle, timezone: pending.timezone || null }, { save });
      closeSheet();
    },
  });

  // Arama: yazmayı bırakınca (350 ms) sorgula; giriş kutusu yeniden çizilmez, odak kaybolmaz.
  sheet.addEventListener('input', (event) => {
    if (event.target.dataset.input !== 'search') return;
    clearTimeout(searchTimer);
    const query = event.target.value;
    searchTimer = setTimeout(async () => {
      const list = sheet.querySelector('[data-results]');
      if (!list) return;
      if (query.trim().length < 2) { list.innerHTML = ''; return; }
      list.innerHTML = '<li class="muted small">Aranıyor…</li>';
      try {
        lastResults = await searchPlaces(query);
        list.innerHTML = lastResults.length
          ? lastResults.map((r, i) => `<li><button class="search-result" data-action="pick-result" data-index="${i}">
              <strong>${esc(r.name)}</strong><small>${esc(r.detail)}</small></button></li>`).join('')
          : '<li class="muted small">Sonuç bulunamadı.</li>';
      } catch (err) {
        list.innerHTML = `<li class="muted small">${esc(err.message)}</li>`;
      }
    }, 350);
  });

  // Bortle seçimi değişince açıklamayı güncelle.
  sheet.addEventListener('change', (event) => {
    if (event.target.dataset.input !== 'bortle') return;
    const hint = sheet.querySelector('[data-bortle-hint]');
    if (hint) hint.textContent = BORTLE_SCALE[Number(event.target.value) - 1].hint;
  });
}
