/**
 * app.js — Uygulamanın giriş noktası ve kontrol merkezi.
 *
 * Akış:
 *   açılış → tercihler + veri dosyaları yüklenir → konum belirlenir (URL > kayıtlı > yok)
 *   → hava tahmini çekilir → compute(): gece, hafta, hedefler, olaylar hesaplanır
 *   → render(): ekran çizilir.
 * Kullanıcı bir şey değiştirdiğinde (gece, ekipman, filtre...) yalnızca gereken kısım
 * yeniden hesaplanır ve ekran tekrar çizilir. 5 dakikada bir "şimdi" konumları tazelenir,
 * 30 dakikada bir hava tahmini yeniden çekilir.
 */

import { loadPrefs, savePrefs, makeId } from './state.js';
import { loadData } from './data.js';
import { $, esc, delegate, toast } from './ui/dom.js';
import { ICONS } from './ui/icons.js';
import { renderTonightCard } from './ui/tonight-card.js';
import { renderTimeline } from './ui/timeline.js';
import { renderWeekStrip } from './ui/week-strip.js';
import { renderPicks, renderObjectList, PAGE_SIZE } from './ui/object-list.js';
import { renderObjectDetail } from './ui/object-detail.js';
import { renderEvents } from './ui/events-list.js';
import { openSheet, updateSheet } from './ui/sheet.js';
import { openLocationSheet } from './ui/location-sheet.js';
import { openSettingsSheet } from './ui/settings-sheet.js';
import { fetchWeather } from '../core/weather.js';
import { evaluateWeek, evaluateNight } from '../core/night.js';
import { buildTargets, evaluateTargets } from '../core/objects.js';
import { upcomingEvents } from '../core/events.js';
import { resolveEquipment } from '../core/equipment.js';
import { currentNightKey, addDaysToKey, daysBetweenKeys } from '../core/format.js';

const WEATHER_MAX_AGE = 30 * 60e3;
const TICK_INTERVAL = 5 * 60e3;

const els = {
  banner: $('#banner'),
  tonight: $('#tonight'),
  timeline: $('#timeline'),
  week: $('#week'),
  picks: $('#picks'),
  objects: $('#objects'),
  events: $('#events'),
  locationLabel: $('#location-label'),
};

/** Uygulamanın bütün çalışma durumu tek nesnede. */
const state = {
  prefs: loadPrefs(),
  data: null,
  targets: [],
  location: null, // { id?, name, lat, lon, elevation, bortle, timezone }
  weather: null,
  weatherKey: null,
  weatherAt: 0,
  weatherError: null,
  timeZone: null,
  todayKey: null,
  selectedKey: null,
  week: [],
  night: null,
  equipment: null,
  results: [],
  events: [],
  eventsKey: null,
  listLimit: PAGE_SIZE,
  openObjectId: null,
  detailTab: 'how',
};

// ---------------------------------------------------------------------------
// Tercihler ve konum yönetimi (panellere "app" nesnesi olarak açılır)
// ---------------------------------------------------------------------------

const app = {
  get prefs() { return state.prefs; },
  get location() { return state.location; },

  updatePrefs(patch, { recompute = true } = {}) {
    state.prefs = { ...state.prefs, ...patch };
    savePrefs(state.prefs);
    if ('theme' in patch) applyTheme();
    if (recompute && state.location) {
      computeAll();
      render();
    }
  },

  /** Yeni bir konumu kullan (ve istenirse kaydet). */
  useLocation(loc, { save }) {
    let location = { ...loc };
    if (save) {
      location = { id: makeId(), ...loc };
      state.prefs.locations = [...state.prefs.locations, location];
      state.prefs.activeLocationId = location.id;
      savePrefs(state.prefs);
      toast(`"${loc.name}" kaydedildi.`);
    }
    setLocation(location);
  },

  selectSavedLocation(id) {
    const loc = state.prefs.locations.find((l) => l.id === id);
    if (!loc) return;
    state.prefs.activeLocationId = id;
    savePrefs(state.prefs);
    setLocation(loc);
  },

  updateLocation(id, patch) {
    state.prefs.locations = state.prefs.locations.map((l) => (l.id === id ? { ...l, ...patch } : l));
    savePrefs(state.prefs);
    if (state.location && state.location.id === id) setLocation({ ...state.location, ...patch });
  },

  deleteLocation(id) {
    state.prefs.locations = state.prefs.locations.filter((l) => l.id !== id);
    if (state.prefs.activeLocationId === id) state.prefs.activeLocationId = null;
    savePrefs(state.prefs);
    renderLocationLabel();
  },
};

function setLocation(location) {
  const moved = !state.location || state.location.lat !== location.lat || state.location.lon !== location.lon;
  state.location = location;
  if (moved) {
    state.selectedKey = null;
    state.eventsKey = null;
  }
  refresh();
}

/** Bildirim bağlantısı gibi URL'lerden gelen konum: ?lat=..&lon=..&name=..&bortle=..&date=.. */
function locationFromUrl() {
  const q = new URLSearchParams(window.location.search);
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  if (!q.has('lat') || !q.has('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const saved = state.prefs.locations.find((l) => Math.abs(l.lat - lat) < 0.01 && Math.abs(l.lon - lon) < 0.01);
  if (saved) return saved;
  const bortle = Math.min(9, Math.max(1, Number(q.get('bortle')) || 6));
  return { name: (q.get('name') || `${lat.toFixed(2)}, ${lon.toFixed(2)}`).slice(0, 40), lat, lon, elevation: 0, bortle, timezone: null };
}

// ---------------------------------------------------------------------------
// Hesaplama
// ---------------------------------------------------------------------------

async function refresh({ force = false } = {}) {
  if (!state.location) {
    renderWelcome();
    return;
  }
  renderLocationLabel();
  const key = `${state.location.lat},${state.location.lon}`;
  const stale = Date.now() - state.weatherAt > WEATHER_MAX_AGE;
  if (force || state.weatherKey !== key || stale) {
    document.body.classList.add('loading');
    try {
      state.weather = await fetchWeather(state.location.lat, state.location.lon);
      state.weatherKey = key;
      state.weatherAt = Date.now();
      state.weatherError = null;
    } catch (err) {
      console.warn('Hava tahmini alınamadı:', err);
      state.weatherError = err;
      if (state.weatherKey !== key) state.weather = null;
    } finally {
      document.body.classList.remove('loading');
    }
  }
  computeAll();
  render();
}

function computeAll() {
  const loc = state.location;
  const tz = (state.weather && state.weather.timezone) || loc.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  state.timeZone = tz;
  state.todayKey = currentNightKey(new Date(), tz);

  // Seçili gece bugün ile 6 gün sonrası arasında olmalı.
  const lastKey = addDaysToKey(state.todayKey, 6);
  if (!state.selectedKey || daysBetweenKeys(state.todayKey, state.selectedKey) < 0 || daysBetweenKeys(state.selectedKey, lastKey) < 0) {
    state.selectedKey = state.todayKey;
  }

  const common = {
    location: loc,
    timeZone: tz,
    weather: state.weather,
    bortle: loc.bortle,
    untilHour: state.prefs.untilHour,
    todayKey: state.todayKey,
  };
  state.week = evaluateWeek({ startKey: state.todayKey, days: 7, ...common });
  state.night = state.week.find((n) => n.key === state.selectedKey) || evaluateNight({ key: state.selectedKey, ...common });
  computeTargets();

  const eventsKey = `${loc.lat},${loc.lon},${state.todayKey}`;
  if (state.eventsKey !== eventsKey) {
    state.events = upcomingEvents({ location: loc, timeZone: tz, startKey: state.todayKey, meteorShowers: state.data.meteorShowers });
    state.eventsKey = eventsKey;
  }
}

function computeTargets() {
  state.equipment = resolveEquipment(state.prefs.equipmentId, state.prefs.customEquipment);
  state.results = evaluateTargets({ night: state.night, targets: state.targets, equipment: state.equipment, now: new Date() });
}

// ---------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------

const conNames = () => state.data.constellations.names;

function render() {
  document.body.classList.remove('welcome');
  renderBanner();
  renderTonightCard(els.tonight, { night: state.night, isTonight: state.night.key === state.todayKey });
  renderTimeline(els.timeline, state.night);
  renderWeekStrip(els.week, { week: state.week, selectedKey: state.selectedKey, todayKey: state.todayKey });
  renderPicks(els.picks, { results: state.results, tz: state.timeZone, conNames: conNames(), equipmentName: state.equipment.name });
  renderList();
  renderEvents(els.events, { events: state.events, tz: state.timeZone, todayKey: state.todayKey });
  if (state.openObjectId) updateSheet(detailHtml());
}

function renderList() {
  renderObjectList(els.objects, {
    results: state.results,
    filters: state.prefs.list,
    equipmentId: state.prefs.equipmentId,
    limit: state.listLimit,
    tz: state.timeZone,
    conNames: conNames(),
  });
}

function renderLocationLabel() {
  const loc = state.location;
  els.locationLabel.innerHTML = loc
    ? `${ICONS.pin}<span class="loc-name">${esc(loc.name)}</span><span class="loc-bortle">B${loc.bortle}</span>`
    : `${ICONS.pin}<span class="loc-name">Konum seç</span>`;
}

function renderBanner() {
  const parts = [];
  if (state.weatherError) {
    parts.push(`<div class="banner warn">${ICONS.info}<span>Hava tahmini alınamadı (internet bağlantısını kontrol et). Gökyüzü hesapları yine de gösteriliyor.</span>
      <button class="btn btn-ghost small" data-action="retry">Tekrar dene</button></div>`);
  }
  if (state.location && !state.location.id) {
    parts.push(`<div class="banner">${ICONS.pin}<span>"${esc(state.location.name)}" kayıtlı değil.</span>
      <button class="btn btn-ghost small" data-action="save-temp-location">Kaydet</button></div>`);
  }
  els.banner.innerHTML = parts.join('');
}

function renderWelcome() {
  document.body.classList.add('welcome');
  renderLocationLabel();
  els.banner.innerHTML = '';
  for (const key of ['timeline', 'week', 'picks', 'objects', 'events']) els[key].innerHTML = '';
  els.tonight.innerHTML = `
    <article class="card welcome-card">
      <div class="welcome-art" aria-hidden="true">${ICONS.telescope}</div>
      <h1>Bu gece gözlem yapmalı mısın?</h1>
      <p>Bulut, nem, rüzgar, atmosfer titreşimi, Ay ve ışık kirliliğini senin için hesaplar; tek bakışta
         <span class="tone-good">yeşil</span>, <span class="tone-ok">sarı</span> ya da <span class="tone-bad">kırmızı</span> der.
         Sonra ekipmanınla neyi, ne zaman ve hangi yönde göreceğini gösterir.</p>
      <div class="row-actions">
        <button class="btn btn-primary" data-action="open-location">${ICONS.locate}<span>Konum seç</span></button>
      </div>
      <p class="muted small">Konumun yalnızca hesap için kullanılır ve sadece bu tarayıcıda saklanır.</p>
    </article>`;
}

// ---------------------------------------------------------------------------
// Cisim detayı
// ---------------------------------------------------------------------------

function detailHtml() {
  const r = state.results.find((x) => x.target.id === state.openObjectId);
  if (!r) return '<p class="empty">Cisim bulunamadı.</p>';
  return renderObjectDetail(r, {
    night: state.night,
    equipment: state.equipment,
    conNames: conNames(),
    moonResult: state.results.find((x) => x.target.id === 'moon'),
    tab: state.detailTab,
    now: new Date(),
  });
}

function openObject(id) {
  state.openObjectId = id;
  state.detailTab = 'how';
  openSheet(detailHtml(), { className: 'detail-sheet', onClose: () => { state.openObjectId = null; } });
}

// ---------------------------------------------------------------------------
// Olaylar (tıklama / değişiklik)
// ---------------------------------------------------------------------------

function bindHandlers() {
  delegate(document.body, 'click', {
    'open-location': () => openLocationSheet(app),
    'open-settings': () => openSettingsSheet(app),
    'toggle-red': () => app.updatePrefs({ theme: state.prefs.theme === 'red' ? 'dark' : 'red' }, { recompute: false }),
    'select-night': (el) => {
      state.selectedKey = el.dataset.key;
      state.night = state.week.find((n) => n.key === state.selectedKey);
      computeTargets();
      render();
    },
    'open-object': (el) => openObject(el.dataset.id),
    'detail-tab': (el) => {
      state.detailTab = el.dataset.tab;
      updateSheet(detailHtml());
    },
    'filter-category': (el) => {
      state.prefs.list = { ...state.prefs.list, category: el.dataset.category };
      state.listLimit = PAGE_SIZE;
      savePrefs(state.prefs);
      renderList();
    },
    'show-more': () => {
      state.listLimit += PAGE_SIZE;
      renderList();
    },
    retry: () => refresh({ force: true }),
    'save-temp-location': () => {
      const { name, lat, lon, elevation, bortle, timezone } = state.location;
      app.useLocation({ name, lat, lon, elevation, bortle, timezone }, { save: true });
    },
  });

  delegate(document.body, 'change', {
    'set-equipment': (el) => {
      state.prefs.equipmentId = el.value;
      savePrefs(state.prefs);
      computeTargets();
      render();
    },
    'set-sort': (el) => {
      state.prefs.list = { ...state.prefs.list, sort: el.value };
      savePrefs(state.prefs);
      renderList();
    },
    'toggle-visible': (el) => {
      state.prefs.list = { ...state.prefs.list, onlyVisible: el.checked };
      savePrefs(state.prefs);
      renderList();
    },
  });

  // Sayfa uzun süre arka planda kaldıysa geri gelince tazele.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.location) tick();
  });
}

/** Periyodik tazeleme: hava eskidiyse yeniden çek, değilse sadece "şimdi"ye göre yeniden hesapla. */
function tick() {
  if (!state.location || !state.data) return;
  if (Date.now() - state.weatherAt > WEATHER_MAX_AGE) {
    refresh();
  } else {
    computeAll();
    render();
  }
}

function applyTheme() {
  const red = state.prefs.theme === 'red';
  document.documentElement.dataset.theme = red ? 'red' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = red ? '#000000' : '#070a14';
  const toggle = $('[data-action="toggle-red"]');
  if (toggle) toggle.setAttribute('aria-pressed', String(red));
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker kaydedilemedi:', err));
  }
}

// ---------------------------------------------------------------------------
// Başlangıç
// ---------------------------------------------------------------------------

async function init() {
  applyTheme();
  bindHandlers();
  registerServiceWorker();
  renderLocationLabel();

  try {
    state.data = await loadData();
  } catch (err) {
    els.tonight.innerHTML = `<article class="card"><h1>Veriler yüklenemedi</h1><p>${esc(err.message)}</p></article>`;
    return;
  }
  state.targets = buildTargets(state.data);

  const fromUrl = locationFromUrl();
  const saved = state.prefs.locations.find((l) => l.id === state.prefs.activeLocationId);
  state.location = fromUrl || saved || null;
  const urlDate = new URLSearchParams(window.location.search).get('date');
  if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) state.selectedKey = urlDate;

  await refresh();
  setInterval(tick, TICK_INTERVAL);
}

init();
