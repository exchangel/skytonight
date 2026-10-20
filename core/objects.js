/**
 * objects.js — "Bu gece neler görebilirim?" listesini üretir.
 *
 * Her hedef (Ay, gezegen, galaksi, küme, çift yıldız, takımyıldız) için gece boyunca
 * 10 dakikada bir konum hesaplanır ve şunlar bulunur:
 *   - en iyi gözlem anı (görünürlük payı en yüksek, bulutsuz ve yüksekte olduğu an)
 *   - o andaki yön/irtifa ve zorluk derecesi (visibility.js)
 *   - doğuş/batış, en yüksek nokta, irtifa eğrisi (detay panelindeki grafik için)
 *   - göz merceği önerisi ve "📷 telefonla çekilebilir" etiketi
 */

import { PLANET_BODIES, bodyPosition, bodyDetails, skyFrame, fixedPosition, sunAltitude, timeSteps, findCrossings, separationAltAz, bodyJ2000, constellationAt } from './astro.js';
import { rateTarget, LEVELS } from './visibility.js';
import { suggestEyepiece } from './equipment.js';
import { averageSeeing } from './night.js';

export const KIND_LABELS = {
  moon: 'Uydu',
  planet: 'Gezegen',
  galaxy: 'Galaksi',
  globular: 'Küresel küme',
  open: 'Açık küme',
  planetary: 'Gezegenimsi bulutsu',
  nebula: 'Bulutsu',
  snr: 'Süpernova kalıntısı',
  asterism: 'Yıldız grubu',
  double: 'Çift yıldız',
  star: 'Yıldız',
  constellation: 'Takımyıldız',
};

export const CATEGORIES = [
  { id: 'all', label: 'Tümü' },
  { id: 'solar', label: 'Ay & Gezegenler' },
  { id: 'deepsky', label: 'Derin uzay' },
  { id: 'double', label: 'Çift yıldız' },
  { id: 'star', label: 'Parlak yıldız' },
  { id: 'constellation', label: 'Takımyıldız' },
];

const DEEP_SKY_KINDS = new Set(['galaxy', 'globular', 'open', 'planetary', 'nebula', 'snr', 'asterism']);

/** Telefonla göz merceğinden (afokal) çekilebilecek parlak cisimler. */
const PHOTO_BODIES = new Set(['Moon', 'Venus', 'Mars', 'Jupiter', 'Saturn']);

/**
 * Veri dosyalarından tek tip hedef listesi kurar.
 * @param {{catalog:object, planets:object, constellations:object}} data
 */
export function buildTargets({ catalog, planets, constellations }) {
  const targets = [];

  targets.push({ id: 'moon', body: 'Moon', kind: 'moon', category: 'solar', featured: true, ...planets.Moon });

  for (const body of PLANET_BODIES) {
    // Uranüs ve Neptün yıldız gibi göründüğü için "öne çıkan" sayılmaz.
    const featured = body !== 'Uranus' && body !== 'Neptune';
    targets.push({ id: `planet:${body}`, body, kind: 'planet', category: 'solar', featured, ...planets[body] });
  }

  for (const obj of catalog.objects) {
    const category = DEEP_SKY_KINDS.has(obj.kind) ? 'deepsky' : obj.kind;
    targets.push({ ...obj, category });
  }

  for (const con of constellations.featured) {
    targets.push({ ...con, kind: 'constellation', category: 'constellation' });
  }

  return targets;
}

/**
 * Bütün hedefleri bu gece için değerlendirir.
 * @param {object} p
 * @param {object} p.night evaluateNight() çıktısı
 * @param {Array<object>} p.targets buildTargets() çıktısı
 * @param {object} p.equipment
 * @param {Date} [p.now]
 * @returns {Array<object>} her hedef için sonuç (sırasız)
 */
export function evaluateTargets({ night, targets, equipment, now = new Date(), stepMinutes = 10 }) {
  const { observer, window, bortle } = night;
  const times = timeSteps(window.sunset, window.sunrise, stepMinutes);
  const moonIllum = night.moon.illumination;
  const seeing = averageSeeing(night);

  // Her örnek an için ortak hesaplar (Güneş, Ay, dönüşüm matrisi, bulut çarpanı).
  const samples = times.map((t) => {
    const hour = nearestHour(night.hours, t);
    return {
      t,
      frame: skyFrame(t, observer),
      sunAlt: sunAltitude(t, observer),
      moon: bodyPosition('Moon', t, observer),
      cloud: hour && hour.scores ? hour.scores.factors.cloud * hour.scores.factors.precip : 1,
      // Kullanıcının "en geç" saatinden sonrası en iyi an seçiminde dikkate alınmaz.
      inEval: t <= night.evalEnd,
    };
  });

  const bodyTracks = { Moon: samples.map((s) => s.moon) };
  for (const body of PLANET_BODIES) bodyTracks[body] = samples.map((s) => bodyPosition(body, s.t, observer));

  const nightPhoto = night.photo ? night.photo.score : 0;
  const nowInNight = now >= window.sunset && now <= window.sunrise;

  return targets.map((target) => {
    const track = target.body
      ? bodyTracks[target.body]
      : samples.map((s) => fixedPosition(s.frame, target.ra, target.dec));

    // Gezegenlerin parlaklığı/boyutu geceden geceye değişir: gece ortası değerleri.
    const details = target.body ? bodyDetails(target.body, samples[Math.floor(samples.length / 2)].t) : null;
    const rated = details ? { ...target, mag: details.mag, size: details.angularDiameter ? [details.angularDiameter / 60] : target.size } : target;

    const rateAt = (i) => rateTarget(rated, {
      equipment,
      bortle,
      alt: track[i].alt,
      sunAlt: samples[i].sunAlt,
      moonAlt: samples[i].moon.alt,
      moonIllum,
      moonSep: target.body === 'Moon' ? null : separationAltAz(track[i], samples[i].moon),
      seeing,
    });

    // En iyi an: görünürlük payı + küçük irtifa bonusu − bulut cezası.
    let bestIndex = -1;
    let bestObjective = -Infinity;
    const margins = new Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      if (track[i].alt <= 0) { margins[i] = -99; continue; }
      const r = rateAt(i);
      margins[i] = r.margin;
      if (!samples[i].inEval) continue;
      const objective = Math.min(r.margin, 10) + 0.02 * track[i].alt - 3 * (1 - samples[i].cloud);
      if (objective > bestObjective) { bestObjective = objective; bestIndex = i; }
    }

    let rating;
    let best = null;
    if (bestIndex < 0) {
      rating = { level: 'invisible', label: LEVELS.invisible.label, margin: -99, reasons: ['Bu gece (gözlem saatlerinde) ufkun üstüne çıkmıyor.'] };
    } else {
      rating = rateAt(bestIndex);
      best = { time: samples[bestIndex].t, alt: track[bestIndex].alt, az: track[bestIndex].az };
      if (best.alt < 3) {
        rating = { ...rating, level: 'invisible', label: LEVELS.invisible.label, reasons: ['Ufkun hemen üstünde kalıyor; pratikte görülemez.'] };
      }
    }

    // Görülebilir zaman aralığı: en iyi anın çevresinde payın ≥ 0 olduğu ardışık örnekler.
    let visibleWindow = null;
    if (best && rating.level !== 'invisible') {
      let a = bestIndex;
      let b = bestIndex;
      while (a > 0 && margins[a - 1] >= 0) a--;
      while (b < samples.length - 1 && margins[b + 1] >= 0) b++;
      visibleWindow = { start: samples[a].t, end: samples[b].t };
    }

    const alts = track.map((p) => p.alt);
    const { rise, set } = findCrossings(times, alts);
    let peak = 0;
    for (let i = 1; i < alts.length; i++) if (alts[i] > alts[peak]) peak = i;

    let current = null;
    if (nowInNight) {
      current = target.body
        ? bodyPosition(target.body, now, observer)
        : fixedPosition(skyFrame(now, observer), target.ra, target.dec);
    }

    const photo = Boolean(
      target.body && PHOTO_BODIES.has(target.body)
      && equipment.kind !== 'eye'
      && (equipment.kind !== 'binocular' || target.body === 'Moon')
      && rating.level === 'easy' && best && best.alt >= 20 && nightPhoto >= 60,
    );

    return {
      target: rated,
      details,
      constellation: target.con || (target.body ? constellationOfBody(target.body, best ? best.time : times[0], observer) : null),
      level: rating.level,
      levelLabel: rating.label,
      rank: LEVELS[rating.level].rank,
      margin: rating.margin,
      reasons: rating.reasons,
      best,
      visibleWindow,
      rise,
      set,
      upAtStart: alts[0] > 0,
      upAtEnd: alts[alts.length - 1] > 0,
      transit: { time: times[peak], alt: alts[peak], az: track[peak].az },
      now: current,
      curve: times.map((t, i) => ({ t, alt: alts[i] })),
      eyepiece: suggestEyepiece(equipment, rated),
      photo,
    };
  });
}

function nearestHour(hours, t) {
  let best = null;
  let bestDiff = Infinity;
  for (const h of hours) {
    const d = Math.abs(h.time - t);
    if (d < bestDiff) { bestDiff = d; best = h; }
  }
  return bestDiff <= 45 * 60000 ? best : null;
}

function constellationOfBody(body, date, observer) {
  const eq = bodyJ2000(body, date, observer);
  return constellationAt(eq.ra, eq.dec);
}

/**
 * Sıralama: önce görünürlük derecesi, sonra (öne çıkan cisim) ve irtifa.
 * @param {'best'|'time'|'mag'} mode
 */
export function sortResults(results, mode = 'best') {
  const copy = [...results];
  if (mode === 'time') {
    return copy.sort((a, b) => (a.best ? a.best.time : Infinity) - (b.best ? b.best.time : Infinity));
  }
  if (mode === 'mag') {
    return copy.sort((a, b) => (a.target.mag ?? 99) - (b.target.mag ?? 99));
  }
  return copy.sort((a, b) => pickScore(b) - pickScore(a));
}

function pickScore(r) {
  const featured = r.target.featured ? 1 : 0;
  const solar = r.target.category === 'solar' && r.target.featured ? 1 : 0;
  const alt = r.best ? r.best.alt : 0;
  return r.rank * 100 + featured * 25 + solar * 15 + alt * 0.3 + Math.min(r.margin, 5);
}

/**
 * Bu gecenin en iyi hedefleri (ana sayfadaki "Bu gece bak" ve bildirimler için).
 * Takımyıldızlar hariç; en az "Orta" zorlukta olanlar.
 */
export function topPicks(results, count = 5) {
  return sortResults(results.filter((r) => r.rank >= 2 && r.target.category !== 'constellation' && r.target.category !== 'star'), 'best')
    .slice(0, count);
}
