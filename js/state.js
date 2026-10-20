/**
 * state.js — Kullanıcı tercihlerini tarayıcıda (localStorage) saklar.
 *
 * Hesap/sunucu yok: kayıtlı konumlar, ekipman ve görünüm tercihleri yalnızca bu
 * tarayıcıda durur. Arkadaşların siteyi açınca kendi tercihlerini kendi cihazlarında tutar.
 * Gizli sekme gibi durumlarda localStorage kullanılamayabilir; o zaman uygulama
 * varsayılanlarla yine çalışır, sadece tercihler hatırlanmaz.
 */

import { DEFAULT_EQUIPMENT_ID } from '../core/equipment.js';

const STORAGE_KEY = 'skytonight:prefs:v1';

export const DEFAULT_PREFS = {
  locations: [], // [{ id, name, lat, lon, elevation, bortle, timezone }]
  activeLocationId: null,
  equipmentId: DEFAULT_EQUIPMENT_ID,
  customEquipment: { aperture: 150, focalLength: 750, eyepieces: [25, 10] },
  untilHour: null, // null = sabaha kadar
  theme: 'dark', // 'dark' | 'red'
  list: { category: 'all', onlyVisible: true, sort: 'best' },
  notify: { name: '', ntfy: '', email: '', threshold: 80 },
};

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_PREFS);
    const saved = JSON.parse(raw);
    // Yeni sürümlerde eklenen alanlar eksik kalmasın diye varsayılanlarla birleştir.
    return {
      ...structuredClone(DEFAULT_PREFS),
      ...saved,
      list: { ...DEFAULT_PREFS.list, ...(saved.list || {}) },
      notify: { ...DEFAULT_PREFS.notify, ...(saved.notify || {}) },
      customEquipment: { ...DEFAULT_PREFS.customEquipment, ...(saved.customEquipment || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_PREFS);
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Depolama kapalı ya da dolu: sessizce devam et.
  }
}

/** Kısa, benzersiz kimlik (konumlar için). */
export function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Tahmin edilmesi zor bir ntfy kanal adı üretir. ntfy kanalları herkese açıktır:
 * adı bilen herkes bildirimleri okuyabilir, bu yüzden rastgele bir ek şart.
 */
export function randomTopic(name) {
  const slug = (name || 'gozlem')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 16) || 'gozlem';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8);
  return `skytonight-${slug}-${suffix}`;
}
