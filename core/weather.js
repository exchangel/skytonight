/**
 * weather.js — Open-Meteo'dan saatlik hava tahmini çeker ve tek tipe dönüştürür.
 *
 * Neden Open-Meteo? Ücretsiz, API anahtarı istemiyor, tarayıcıdan doğrudan çağrılabiliyor
 * (CORS açık) ve astronomi için kritik olan bulut KATMANLARINI ayrı veriyor:
 *   - alçak bulut (< 2 km): gökyüzünü tamamen kapatır
 *   - orta bulut (2–6 km): yine kapatır
 *   - yüksek bulut (sirrus, > 6 km): ince bir tül gibi; parlak cisimler görünür ama
 *     sönük galaksiler kaybolur
 * Ayrıca 250 hPa (~10 km) rüzgarı = jet akımı. Jet akımı güçlüyse atmosfer çalkantılı
 * olur, yıldızlar titrer ("seeing" kötüleşir) ve gezegen ayrıntısı kaybolur.
 *
 * Hava kalitesi API'sinden aerosol optik derinliği ve toz da alınır (Sahra tozu
 * Türkiye'de şeffaflığı ciddi düşürür). Bu ikinci istek başarısız olursa sorun değil.
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const FORECAST_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'precipitation_probability',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'visibility',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_speed_250hPa',
];

const AIR_VARS = ['aerosol_optical_depth', 'dust'];

/** Tahmin kaç gün ileri (bugün dahil). 7 gece + yarın sabah için 9 gün yeterli. */
export const FORECAST_DAYS = 9;

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

/**
 * Konum için saatlik tahmini getirir.
 * @param {number} lat
 * @param {number} lon
 * @param {{fetchImpl?: typeof fetch}} [options] testlerde sahte fetch vermek için
 * @returns {Promise<{timezone:string, utcOffsetSeconds:number, elevation:number,
 *                    fetchedAt:Date, hours:Array<object>}>}
 */
export async function fetchWeather(lat, lon, { fetchImpl = fetch } = {}) {
  const common = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&timezone=auto&timeformat=unixtime`;
  const forecastUrl = `${FORECAST_URL}?${common}&hourly=${FORECAST_VARS.join(',')}&forecast_days=${FORECAST_DAYS}`;
  const airUrl = `${AIR_QUALITY_URL}?${common}&hourly=${AIR_VARS.join(',')}&forecast_days=5`;

  // Hava kalitesi isteği opsiyonel: allSettled ile ana tahmini bekletmeden/bozmadan alınır.
  const [forecast, air] = await Promise.allSettled([getJson(forecastUrl, fetchImpl), getJson(airUrl, fetchImpl)]);
  if (forecast.status === 'rejected') throw forecast.reason;

  return normalizeWeather(forecast.value, air.status === 'fulfilled' ? air.value : null);
}

/**
 * Ham API yanıtlarını saatlik kayıt listesine çevirir. (Ayrı fonksiyon: test edilebilir.)
 * Her kayıt: { time: Date, temp, rh, dew, pop, cloud, low, mid, high, visibility, wind, gust, jet, aod, dust }
 */
export function normalizeWeather(forecast, air) {
  const h = forecast.hourly;
  const airByTime = new Map();
  if (air && air.hourly) {
    air.hourly.time.forEach((t, i) => {
      airByTime.set(t, { aod: air.hourly.aerosol_optical_depth[i], dust: air.hourly.dust[i] });
    });
  }

  const hours = h.time.map((t, i) => {
    const aq = airByTime.get(t) || {};
    return {
      time: new Date(t * 1000),
      temp: h.temperature_2m[i],
      rh: h.relative_humidity_2m[i],
      dew: h.dew_point_2m[i],
      pop: h.precipitation_probability[i] ?? 0,
      cloud: h.cloud_cover[i],
      low: h.cloud_cover_low[i],
      mid: h.cloud_cover_mid[i],
      high: h.cloud_cover_high[i],
      visibility: h.visibility[i],
      wind: h.wind_speed_10m[i],
      gust: h.wind_gusts_10m[i],
      jet: h.wind_speed_250hPa[i],
      aod: aq.aod ?? null,
      dust: aq.dust ?? null,
    };
  }).filter((r) => r.cloud != null);

  return {
    timezone: forecast.timezone,
    utcOffsetSeconds: forecast.utc_offset_seconds,
    elevation: forecast.elevation,
    fetchedAt: new Date(),
    hours,
  };
}

/**
 * Verilen ana en yakın saatlik kaydı döndürür (en fazla 90 dk uzaklıkta).
 * Tahmin aralığının dışındaysa null — o saat için "veri yok" demektir.
 */
export function weatherAt(weather, date) {
  if (!weather || !weather.hours.length) return null;
  const t = date.getTime();
  const first = weather.hours[0].time.getTime();
  const index = Math.round((t - first) / 3600e3);
  const rec = weather.hours[index];
  if (!rec || Math.abs(rec.time.getTime() - t) > 90 * 60000) return null;
  return rec;
}
