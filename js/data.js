/**
 * data.js — Statik veri dosyalarını (katalog, gezegen metinleri, takımyıldızlar,
 * meteor yağmurları) yükler. Service worker bunları önbelleğe aldığı için ikinci
 * açılıştan itibaren çevrimdışı da çalışır.
 */

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} yüklenemedi (HTTP ${res.status})`);
  return res.json();
}

export async function loadData() {
  const [catalog, planets, constellations, meteorShowers] = await Promise.all([
    getJson('data/catalog.json'),
    getJson('data/planets.json'),
    getJson('data/constellations.json'),
    getJson('data/meteor-showers.json'),
  ]);
  return { catalog, planets, constellations, meteorShowers };
}
