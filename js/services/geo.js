/**
 * geo.js — Konum servisleri.
 *
 *  - Otomatik konum: tarayıcının Geolocation API'si (kullanıcı izin vermelidir; iPhone'da
 *    Safari "Konum" izni ister). Koordinat ~100 m hassasiyete yuvarlanır: gökyüzü
 *    hesabı için fazlası gereksiz, gizlilik için de daha iyi.
 *  - Konuma isim: BigDataCloud'un anahtarsız istemci uç noktası (ters geokodlama).
 *  - Şehir arama: Open-Meteo Geocoding API (anahtarsız, Türkçe sonuç).
 */

const round = (x, digits = 3) => Math.round(x * 10 ** digits) / 10 ** digits;

/** @returns {Promise<{lat:number, lon:number, elevation:number|null}>} */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Bu tarayıcı konum bulmayı desteklemiyor.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: round(pos.coords.latitude),
        lon: round(pos.coords.longitude),
        elevation: pos.coords.altitude != null ? Math.round(pos.coords.altitude) : null,
      }),
      (err) => {
        const messages = {
          1: 'Konum izni verilmedi. Tarayıcı ayarlarından izin verebilir ya da şehir arayabilirsin.',
          2: 'Konum bulunamadı. Şehir aramayı dene.',
          3: 'Konum isteği zaman aşımına uğradı. Tekrar dene.',
        };
        reject(new Error(messages[err.code] || 'Konum alınamadı.'));
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

/** Koordinata yer adı bulur; başarısız olursa koordinatları döndürür. */
export async function reverseGeocode(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=tr`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const j = await res.json();
    const name = j.locality || j.city || j.principalSubdivision;
    if (name) return j.city && j.city !== name ? `${name}, ${j.city}` : name;
  } catch {
    // isimsiz devam
  }
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

/**
 * Şehir/yer arar.
 * @returns {Promise<Array<{name:string, detail:string, lat:number, lon:number, elevation:number|null, timezone:string, population:number}>>}
 */
export async function searchPlaces(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=tr&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Arama yapılamadı.');
  const j = await res.json();
  return (j.results || []).map((r) => ({
    name: r.name,
    detail: [r.admin2, r.admin1, r.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i && v !== r.name).join(', '),
    lat: round(r.latitude),
    lon: round(r.longitude),
    elevation: r.elevation ?? null,
    timezone: r.timezone,
    population: r.population || 0,
  }));
}

/**
 * Nüfusa göre kaba bir ışık kirliliği tahmini (kullanıcı sonra düzeltebilir).
 * Büyük şehir merkezleri Bortle 8–9, kasabalar 5–6 civarındadır.
 */
export function guessBortle(population) {
  if (population > 1_000_000) return 8;
  if (population > 200_000) return 7;
  if (population > 30_000) return 6;
  if (population > 3_000) return 5;
  return 4;
}

/** lightpollutionmap.info'da bu koordinatı açan bağlantı (Bortle'ı görmek için). */
export function lightPollutionMapUrl(lat, lon) {
  return `https://www.lightpollutionmap.info/#zoom=10.00&lat=${lat}&lon=${lon}`;
}
