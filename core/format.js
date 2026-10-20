/**
 * format.js — Türkçe tarih/saat/sayı biçimlendirme ve saat dilimi yardımcıları.
 *
 * Kural: Program içinde bütün anlar UTC tabanlı `Date` nesneleri olarak dolaşır.
 * Ekrana yazarken her zaman GÖZLEM KONUMUNUN saat dilimine (ör. "Europe/Istanbul")
 * çevrilir. Böylece başka şehirde/ülkede olan bir arkadaş da kendi yerel saatini görür,
 * bildirim betiği de (GitHub sunucusu UTC'de çalışsa bile) doğru saati yazar.
 *
 * "Gece anahtarı" (nightKey): "2026-10-20" biçiminde, gecenin BAŞLADIĞI akşamın
 * yerel tarihi. 21 Ekim 02:00'deki gözlem, "2026-10-20" gecesine aittir.
 */

const LOCALE = 'tr-TR';

/** Intl nesneleri pahalıdır; aynı ayarları tekrar tekrar oluşturmamak için önbellek. */
const formatterCache = new Map();

function getFormatter(locale, timeZone, options) {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone, ...options });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Bir anın verilen saat dilimindeki takvim parçalarını döndürür.
 * @param {Date} date
 * @param {string} timeZone IANA adı, ör. "Europe/Istanbul"
 * @returns {{year:number, month:number, day:number, hour:number, minute:number, second:number}}
 */
export function localParts(date, timeZone) {
  const parts = getFormatter('en-US', timeZone, {
    hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(date);
  const out = {};
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year, month: out.month, day: out.day,
    hour: out.hour, minute: out.minute, second: out.second,
  };
}

/**
 * Saat diliminin o andaki UTC farkı (dakika). İstanbul için +180.
 * Yaz/kış saati geçişlerini de doğru verir, çünkü tarihe göre hesaplanır.
 */
export function tzOffsetMinutes(timeZone, date) {
  const p = localParts(date, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUtc - date.getTime()) / 60000);
}

/**
 * Yerel "duvar saati"ni (ör. 2026-10-20 12:00, Europe/Istanbul) gerçek UTC ana çevirir.
 * Yaz saati geçiş günlerinde ofset değişebileceği için iki kez düzeltme yapılır.
 * @returns {Date}
 */
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const offset1 = tzOffsetMinutes(timeZone, new Date(guess));
  let utc = guess - offset1 * 60000;
  const offset2 = tzOffsetMinutes(timeZone, new Date(utc));
  if (offset2 !== offset1) utc = guess - offset2 * 60000;
  return new Date(utc);
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Bir anın yerel tarih anahtarı: "2026-10-20". */
export function dateKey(date, timeZone) {
  const p = localParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** "2026-10-20" → {year, month, day} */
export function parseDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** Tarih anahtarına gün ekler (takvim aritmetiği, saat diliminden bağımsız). */
export function addDaysToKey(key, days) {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** İki tarih anahtarı arasındaki gün farkı (b - a). */
export function daysBetweenKeys(a, b) {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86400000);
}

/**
 * Şu an hangi gecenin içindeyiz? Yerel saat öğleden önceyse gece hâlâ
 * dünkü akşam başlayan gecedir (ör. 02:00 → dünün anahtarı).
 */
export function currentNightKey(now, timeZone) {
  const p = localParts(now, timeZone);
  const today = `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  return p.hour < 12 ? addDaysToKey(today, -1) : today;
}

/** Gece anahtarının yerel öğle saati (12:00); bütün gece aramaları buradan başlar. */
export function nightNoon(key, timeZone) {
  return zonedTimeToUtc({ ...parseDateKey(key), hour: 12 }, timeZone);
}

// ---------------------------------------------------------------------------
// Ekrana yazdırma
// ---------------------------------------------------------------------------

/** "22:30" */
export function formatTime(date, timeZone) {
  if (!date) return '—';
  return getFormatter(LOCALE, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

/** "21 Ekim Çarşamba" */
export function formatDate(date, timeZone) {
  return getFormatter(LOCALE, timeZone, { day: 'numeric', month: 'long', weekday: 'long' }).format(date);
}

/** "21 Ekim 2027" */
export function formatDateLong(date, timeZone) {
  return getFormatter(LOCALE, timeZone, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** "21 Eki" */
export function formatDayMonth(date, timeZone) {
  return getFormatter(LOCALE, timeZone, { day: 'numeric', month: 'short' }).format(date);
}

/** "Çar" */
export function formatWeekdayShort(date, timeZone) {
  return getFormatter(LOCALE, timeZone, { weekday: 'short' }).format(date);
}

/** Gece anahtarını okunur yapar: "20 Ekim Salı gecesi" gibi metinler için. */
export function formatNightKey(key, timeZone) {
  return formatDate(nightNoon(key, timeZone), timeZone);
}

/** 320 → "5 sa 20 dk" */
export function formatDuration(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} dk`;
  if (rest === 0) return `${h} sa`;
  return `${h} sa ${rest} dk`;
}

/** Türkçe ondalık virgülüyle sayı: 3.5 → "3,5" */
export function formatNumber(value, maximumFractionDigits = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

/** Yüzde: 0.42 → "%42" (Türkçede yüzde işareti başa gelir). */
export function formatPercent(fraction) {
  if (fraction == null || !Number.isFinite(fraction)) return '—';
  return `%${Math.round(fraction * 100)}`;
}

/** Işık yılı mesafesini okunur yazar: 2500000 → "2,5 milyon ışık yılı" */
export function formatLightYears(ly) {
  if (!ly) return null;
  if (ly >= 1e9) return `${formatNumber(ly / 1e9, 1)} milyar ışık yılı`;
  if (ly >= 1e6) return `${formatNumber(ly / 1e6, 1)} milyon ışık yılı`;
  return `${formatNumber(ly, 0)} ışık yılı`;
}
