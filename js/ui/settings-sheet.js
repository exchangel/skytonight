/**
 * settings-sheet.js — Ayarlar: kayıtlı konumlar, ekipman, gözlem saatleri, bildirim kurulumu.
 *
 * Bildirimler hakkında: Site bir sunucu kullanmadığı için bildirim ayarları tarayıcıda
 * değil, GitHub deposundaki gizli bir değişkende (Secret) tutulur. Bu panel o değişkene
 * yapıştırılacak satırı senin için hazırlar.
 */

import { esc, delegate, toast } from './dom.js';
import { ICONS } from './icons.js';
import { openSheet, updateSheet } from './sheet.js';
import { bortleOptions } from './location-sheet.js';
import { EQUIPMENT_PRESETS } from '../../core/equipment.js';
import { randomTopic } from '../state.js';

const UNTIL_OPTIONS = [
  [null, 'Sabaha kadar'],
  [22, '22:00'], [23, '23:00'], [0, '00:00'], [1, '01:00'], [2, '02:00'], [3, '03:00'], [4, '04:00'],
];

function subscriberEntry(app) {
  const p = app.prefs;
  const loc = app.location;
  const n = p.notify;
  const entry = {
    name: n.name || 'Ben',
    place: loc ? loc.name : 'Konum seç',
    lat: loc ? loc.lat : 0,
    lon: loc ? loc.lon : 0,
    bortle: loc ? loc.bortle : 5,
    equipment: p.equipmentId === 'custom' ? 'omegon130' : p.equipmentId,
    threshold: Number(n.threshold),
    until: p.untilHour,
  };
  if (n.ntfy) entry.ntfy = n.ntfy;
  if (n.email) entry.email = n.email;
  return JSON.stringify(entry);
}

function view(app) {
  const p = app.prefs;
  const c = p.customEquipment;

  const locations = p.locations.length
    ? p.locations.map((l) => `
      <li class="setting-location">
        <div><strong>${esc(l.name)}</strong><small>${l.lat.toFixed(3)}, ${l.lon.toFixed(3)}</small></div>
        <select data-input="loc-bortle" data-id="${esc(l.id)}" aria-label="${esc(l.name)} ışık kirliliği">${bortleOptions(l.bortle)}</select>
        <button class="icon-btn" data-action="delete-location" data-id="${esc(l.id)}" aria-label="${esc(l.name)} konumunu sil">${ICONS.trash}</button>
      </li>`).join('')
    : '<li class="empty small">Kayıtlı konum yok. Üstteki konum düğmesinden ekleyebilirsin.</li>';

  const equipment = [...EQUIPMENT_PRESETS, { id: 'custom', name: 'Özel teleskop' }]
    .map((e) => `<option value="${e.id}"${e.id === p.equipmentId ? ' selected' : ''}>${esc(e.name)}</option>`).join('');

  const until = UNTIL_OPTIONS.map(([v, label]) => `<option value="${v ?? ''}"${v === p.untilHour ? ' selected' : ''}>${label}</option>`).join('');

  return `
    <h2 id="sheet-title">Ayarlar</h2>

    <section class="setting">
      <h3>Kayıtlı konumlar</h3>
      <ul class="setting-locations">${locations}</ul>
    </section>

    <section class="setting">
      <h3>Ekipman</h3>
      <label class="field block"><span>Varsayılan ekipman</span><select data-input="equipment">${equipment}</select></label>
      <div class="custom-eq${p.equipmentId === 'custom' ? '' : ' hidden'}">
        <label class="field"><span>Açıklık (mm)</span><input type="number" min="20" max="600" data-input="custom-aperture" value="${c.aperture}"></label>
        <label class="field"><span>Odak uzunluğu (mm)</span><input type="number" min="100" max="5000" data-input="custom-focal" value="${c.focalLength}"></label>
        <label class="field"><span>Mercekler (mm, virgülle)</span><input type="text" data-input="custom-eyepieces" value="${esc(c.eyepieces.join(', '))}"></label>
      </div>
    </section>

    <section class="setting">
      <h3>Gözlem saatlerim</h3>
      <label class="field block"><span>En geç saat kaça kadar gözlem yaparsın?</span><select data-input="until">${until}</select></label>
      <p class="hint">Skor ve "en iyi saat" bu saate kadar hesaplanır; sabah 5'teki harika bir pencere seni uyandırmasın.</p>
    </section>

    <section class="setting">
      <h3>${ICONS.bell} Çok iyi gecelerde bildirim</h3>
      <ol class="steps">
        <li>iPhone'a App Store'dan ücretsiz <strong>ntfy</strong> uygulamasını kur.</li>
        <li>Aşağıda bir kanal adı oluştur, ntfy'da <em>+ Subscribe to topic</em> ile aynı adı ekle.</li>
        <li>Oluşan satırı kopyala ve GitHub deposunda <em>Settings → Secrets and variables → Actions</em> altındaki
            <code>NOTIFY_SUBSCRIBERS</code> değişkenine ekle (README'de adım adım anlatılıyor).</li>
      </ol>
      <label class="field block"><span>Adın</span><input type="text" data-input="notify-name" value="${esc(p.notify.name)}" maxlength="30"></label>
      <label class="field block"><span>ntfy kanal adı</span>
        <span class="input-row"><input type="text" data-input="notify-ntfy" value="${esc(p.notify.ntfy)}" spellcheck="false">
        <button class="btn btn-ghost" data-action="random-topic">Rastgele oluştur</button></span></label>
      <label class="field block"><span>E-posta (isteğe bağlı)</span><input type="email" data-input="notify-email" value="${esc(p.notify.email)}"></label>
      <label class="field block"><span>Bildirim eşiği: <strong data-threshold-label>${p.notify.threshold}</strong> / 100</span>
        <input type="range" min="50" max="95" step="5" data-input="notify-threshold" value="${p.notify.threshold}"></label>
      <p class="hint">Kanal adını bilen herkes bildirimleri görebilir; tahmin edilemez bir ad kullan. Konum olarak şu an seçili konum kullanılır.</p>
      <pre class="code" data-subscriber>${esc(subscriberEntry(app))}</pre>
      <button class="btn btn-primary" data-action="copy-subscriber">${ICONS.copy}<span>Satırı kopyala</span></button>
    </section>

    <section class="setting about">
      <h3>Hakkında</h3>
      <p>Hava: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> ·
         Gökyüzü hesabı: <a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener">Astronomy Engine</a> ·
         Katalog: <a href="https://github.com/mattiaverga/OpenNGC" target="_blank" rel="noopener">OpenNGC</a> (CC-BY-SA 4.0) ·
         Konum adları: BigDataCloud, Open-Meteo Geocoding.</p>
      <p class="muted small">Tercihlerin yalnızca bu tarayıcıda saklanır.</p>
    </section>`;
}

export function openSettingsSheet(app) {
  const body = openSheet(view(app), { className: 'settings-sheet' });
  const sheet = body.parentElement;
  const rerender = () => updateSheet(view(app));
  const refreshSubscriber = () => {
    const pre = sheet.querySelector('[data-subscriber]');
    if (pre) pre.textContent = subscriberEntry(app);
  };

  delegate(sheet, 'click', {
    'delete-location': (el) => {
      const loc = app.prefs.locations.find((l) => l.id === el.dataset.id);
      if (loc && confirm(`"${loc.name}" silinsin mi?`)) {
        app.deleteLocation(loc.id);
        rerender();
      }
    },
    'random-topic': () => {
      app.updatePrefs({ notify: { ...app.prefs.notify, ntfy: randomTopic(app.prefs.notify.name) } });
      const input = sheet.querySelector('[data-input="notify-ntfy"]');
      if (input) input.value = app.prefs.notify.ntfy;
      refreshSubscriber();
    },
    'copy-subscriber': async () => {
      try {
        await navigator.clipboard.writeText(subscriberEntry(app));
        toast('Kopyalandı — GitHub Secret\'a yapıştır.');
      } catch {
        toast('Kopyalanamadı; metni elle seç.');
      }
    },
  });

  sheet.addEventListener('change', (event) => {
    const input = event.target.dataset.input;
    const value = event.target.value;
    if (input === 'loc-bortle') app.updateLocation(event.target.dataset.id, { bortle: Number(value) });
    if (input === 'equipment') {
      app.updatePrefs({ equipmentId: value });
      sheet.querySelector('.custom-eq').classList.toggle('hidden', value !== 'custom');
    }
    if (input === 'until') app.updatePrefs({ untilHour: value === '' ? null : Number(value) });
    if (input?.startsWith('custom-')) {
      const eyepieces = sheet.querySelector('[data-input="custom-eyepieces"]').value
        .split(/[,;\s]+/).map(Number).filter((v) => v > 0);
      app.updatePrefs({
        customEquipment: {
          aperture: Number(sheet.querySelector('[data-input="custom-aperture"]').value) || 150,
          focalLength: Number(sheet.querySelector('[data-input="custom-focal"]').value) || 750,
          eyepieces: eyepieces.length ? eyepieces : [25, 10],
        },
      });
    }
    refreshSubscriber();
  });

  sheet.addEventListener('input', (event) => {
    const input = event.target.dataset.input;
    if (!input || !input.startsWith('notify-')) return;
    const notify = { ...app.prefs.notify };
    if (input === 'notify-name') notify.name = event.target.value;
    if (input === 'notify-ntfy') notify.ntfy = event.target.value.trim();
    if (input === 'notify-email') notify.email = event.target.value.trim();
    if (input === 'notify-threshold') {
      notify.threshold = Number(event.target.value);
      sheet.querySelector('[data-threshold-label]').textContent = notify.threshold;
    }
    app.updatePrefs({ notify }, { recompute: false });
    refreshSubscriber();
  });
}
