/**
 * scoring.js — Hava + gökyüzü koşullarından 0–100 arası gözlem skoru üretir.
 *
 * İKİ ayrı skor var, çünkü bir gece gezegenler için mükemmel, galaksiler için berbat olabilir:
 *
 *  • Gezegen & Ay skoru: bulut, yağış, "seeing" (atmosfer titreşimi), rüzgar, çiğ.
 *    Ay ışığı ve ışık kirliliği gezegenleri neredeyse hiç etkilemez.
 *
 *  • Derin uzay skoru (galaksi, bulutsu, küme): bulut, yağış, gökyüzü karanlığı,
 *    Ay ışığı, şeffaflık (nem, toz, ince bulut), ışık kirliliği.
 *
 * Her faktör 0 (berbat) ile 1 (kusursuz) arasında bir çarpana dönüşür. Bulut ve yağış
 * "kapı" görevindedir: kapalı gökyüzünde diğer her şey mükemmel olsa da skor sıfırlanır.
 *
 * Eşik değerleri amatör gözlemcilerin pratik deneyimine göre seçildi; hepsi bu dosyada,
 * tek yerde duruyor. İstersen kendi deneyimine göre ayarla.
 */

export const STATUS_THRESHOLDS = { good: 70, ok: 40 };

export const STATUS_INFO = {
  good: { label: 'Gözlem gecesi', emoji: '🟢', short: 'İyi' },
  ok: { label: 'İdare eder', emoji: '🟡', short: 'Orta' },
  bad: { label: 'Bugün dinlen', emoji: '🔴', short: 'Kötü' },
  none: { label: 'Tahmin yok', emoji: '⚪', short: '—' },
};

/** Skoru renk durumuna çevirir: 'good' | 'ok' | 'bad' | 'none' */
export function statusFromScore(score) {
  if (score == null || !Number.isFinite(score)) return 'none';
  if (score >= STATUS_THRESHOLDS.good) return 'good';
  if (score >= STATUS_THRESHOLDS.ok) return 'ok';
  return 'bad';
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Değer küçüldükçe iyi olan ölçüler için (bulut, rüzgar...):
 * value ≤ good → 1, value ≥ bad → floor, arası doğrusal.
 */
function lowerIsBetter(value, good, bad, floor = 0) {
  if (value == null || !Number.isFinite(value)) return 1;
  if (value <= good) return 1;
  if (value >= bad) return floor;
  return 1 - (1 - floor) * ((value - good) / (bad - good));
}

/** Değer büyüdükçe iyi olan ölçüler için (çiy farkı, görüş mesafesi...). */
function higherIsBetter(value, bad, good, floor = 0) {
  if (value == null || !Number.isFinite(value)) return 1;
  if (value >= good) return 1;
  if (value <= bad) return floor;
  return floor + (1 - floor) * ((value - bad) / (good - bad));
}

/**
 * Gözlemi engelleyen "etkin" bulut oranı (%).
 * Katmanlar birbirinden bağımsız kabul edilir; açık gökyüzü olasılıkları çarpılır.
 * Yüksek bulut (sirrus) ince olduğu için yarım ağırlıkla sayılır.
 */
export function effectiveCloud(h) {
  const clear = (1 - h.low / 100) * (1 - h.mid / 100) * (1 - (0.5 * h.high) / 100);
  return Math.round(100 * (1 - clear));
}

/** Şeffaflık: havanın ne kadar "berrak" olduğu (nem, toz, ince bulut, görüş). */
function transparencyFactor(h) {
  const humidity = lowerIsBetter(h.rh, 65, 98, 0.45);
  const cirrus = 1 - 0.5 * (h.high / 100);
  const aerosol = h.aod == null ? 1 : lowerIsBetter(h.aod, 0.12, 0.6, 0.35);
  const visibility = h.visibility == null ? 1 : higherIsBetter(h.visibility, 5000, 20000, 0.5);
  return clamp01(humidity * cirrus * aerosol * visibility);
}

/**
 * Bir saatlik hava kaydını 0–1 çarpanlara çevirir.
 * @param {object} h weather.js'deki saatlik kayıt
 */
export function hourFactors(h) {
  const cloudPct = effectiveCloud(h);
  const dewSpread = h.temp - h.dew; // sıcaklık − çiy noktası; küçükse mercek/ayna buğulanır
  const windEff = Math.max(h.wind, (h.gust ?? h.wind) * 0.7); // ani hamleler de titretir
  return {
    cloudPct,
    dewSpread,
    windEff,
    cloud: lowerIsBetter(cloudPct, 10, 70), // %10'a kadar kusursuz, %70'te gözlem biter
    precip: lowerIsBetter(h.pop, 20, 70),
    seeing: lowerIsBetter(h.jet, 60, 160, 0.25), // jet akımı (km/s): >100 titrek görüntü
    wind: lowerIsBetter(windEff, 12, 35, 0.2), // EQ-2 hafif kundak: 12 km/s üstü titretir
    windPhoto: lowerIsBetter(windEff, 8, 22, 0), // fotoğrafta tolerans daha düşük
    dew: higherIsBetter(dewSpread, 0.5, 4, 0.5),
    transparency: transparencyFactor(h),
  };
}

/** Güneş irtifasına göre karanlık: derin uzay için −18°'de tam, −10°'de sıfır. */
export function darknessForDeepSky(sunAlt) {
  return higherIsBetter(-sunAlt, 10, 18);
}

/** Gezegenler parlak: Güneş −8°'nin altına inince tamamen uygun. */
export function darknessForPlanets(sunAlt) {
  return higherIsBetter(-sunAlt, 2, 8);
}

/**
 * Ay ışığının derin uzaya etkisi. Ufkun altındaysa ya da hilalse sorun yok;
 * yüksekteki dolunay gökyüzünü ~3 kadir aydınlatır ve galaksileri yok eder.
 */
export function moonFactor(moonAlt, moonIllum) {
  if (moonAlt <= 0 || moonIllum < 0.03) return 1;
  const height = Math.min(1, 0.4 + moonAlt / 40);
  return clamp01(1 - 0.92 * Math.pow(moonIllum, 0.8) * height);
}

/** Işık kirliliği (Bortle 1–9) derin uzay skoruna çarpan olarak etki eder. */
const BORTLE_FACTOR = [1.0, 1.0, 0.97, 0.92, 0.85, 0.77, 0.68, 0.58, 0.5];

export function bortleFactor(bortle) {
  const b = Math.min(9, Math.max(1, Math.round(bortle || 5)));
  return BORTLE_FACTOR[b - 1];
}

/**
 * Tek bir saatin skorları.
 * @param {{weather:object|null, sunAlt:number, moonAlt:number, moonIllum:number,
 *          bortle:number, brightTargetUp:boolean}} input
 *        brightTargetUp: Ay veya parlak bir gezegen 10°'nin üstünde mi? Değilse
 *        gezegen skoru anlamsızdır (bakılacak bir şey yok) → null.
 * @returns {{planet:number|null, deepSky:number, photo:number|null, factors:object}|null}
 */
export function hourScores({ weather, sunAlt, moonAlt, moonIllum, bortle, brightTargetUp }) {
  if (!weather) return null;
  const f = hourFactors(weather);
  const sky = f.cloud * f.precip;

  const moon = moonFactor(moonAlt, moonIllum);
  const deepSkyQuality = 0.65 * f.transparency + 0.2 * f.wind + 0.15 * f.dew;
  const deepSky = 100 * sky * darknessForDeepSky(sunAlt) * Math.pow(moon, 0.7) * bortleFactor(bortle) * deepSkyQuality;

  let planet = null;
  let photo = null;
  if (brightTargetUp) {
    const dark = darknessForPlanets(sunAlt);
    planet = 100 * sky * dark * (0.5 * f.seeing + 0.3 * f.wind + 0.2 * f.dew);
    photo = 100 * sky * dark * Math.pow(f.seeing, 1.3) * (0.3 + 0.7 * f.windPhoto);
  }

  return { planet, deepSky, photo, factors: f, moon };
}

/**
 * Saatlik skor dizisinde en iyi ardışık bloğu bulur (varsayılan 3 saat).
 * Gece için tek sayı: "en iyi 3 saatin ortalaması". Böylece sabaha karşı birkaç
 * bulutlu saat, akşamki harika pencereyi gölgelemez.
 *
 * @param {Array<{time:Date, scores:object|null}>} hours
 * @param {'planet'|'deepSky'|'photo'} kind
 * @returns {{score:number, start:Date, end:Date}|null}
 */
export function bestBlock(hours, kind, blockLength = 3) {
  // null değerler (veri yok / hedef yok) bloğu böler.
  const segments = [];
  let current = [];
  for (const h of hours) {
    const v = h.scores ? h.scores[kind] : null;
    if (v == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push({ time: h.time, value: v });
    }
  }
  if (current.length) segments.push(current);

  let best = null;
  for (const seg of segments) {
    const len = Math.min(blockLength, seg.length);
    for (let i = 0; i + len <= seg.length; i++) {
      const slice = seg.slice(i, i + len);
      const mean = slice.reduce((s, x) => s + x.value, 0) / len;
      if (!best || mean > best.mean) best = { mean, seg, from: i, to: i + len - 1 };
    }
  }
  if (!best) return null;

  // Bloğu, skoru hâlâ iyi olan komşu saatlere doğru genişlet → "En iyi saatler 21:00–01:00".
  const keep = Math.min(STATUS_THRESHOLDS.good, best.mean * 0.85);
  let { from, to } = best;
  while (from > 0 && best.seg[from - 1].value >= keep) from--;
  while (to < best.seg.length - 1 && best.seg[to + 1].value >= keep) to++;

  return {
    score: Math.round(best.mean),
    start: best.seg[from].time,
    end: new Date(best.seg[to].time.getTime() + 3600e3),
  };
}

// ---------------------------------------------------------------------------
// Gece özeti ve açıklamalar
// ---------------------------------------------------------------------------

const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);

export function cloudText(pct) {
  if (pct == null) return 'Bulut verisi yok';
  if (pct < 10) return 'Açık';
  if (pct < 30) return 'Az bulutlu';
  if (pct < 60) return 'Parçalı bulutlu';
  if (pct < 85) return 'Çok bulutlu';
  return 'Kapalı';
}

export function seeingText(jet) {
  if (jet == null) return '—';
  if (jet < 60) return 'iyi';
  if (jet < 110) return 'orta';
  return 'zayıf';
}

export function dewRiskText(spread) {
  if (spread == null) return '—';
  if (spread < 2) return 'yüksek';
  if (spread < 4) return 'orta';
  return 'düşük';
}

/**
 * Bütün gecenin özeti: iki alt skor, genel durum, kısa özet ve "neden" listesi.
 *
 * @param {Array<{time:Date, weather:object|null, scores:object|null, sunAlt:number,
 *                moonAlt:number}>} hours  gün batımından şafağa saatlik
 * @param {{bortle:number, moonIllum:number, hasAstroDark:boolean}} ctx
 */
export function summarizeNight(hours, ctx) {
  const planet = bestBlock(hours, 'planet');
  const deepSky = bestBlock(hours, 'deepSky');
  const photo = bestBlock(hours, 'photo');

  // Genel durum = iki skordan iyi olanı. Hangi tür için iyi olduğunu da sakla.
  let overall = null;
  if (planet && (!deepSky || planet.score > deepSky.score)) overall = { ...planet, kind: 'planet' };
  else if (deepSky) overall = { ...deepSky, kind: 'deepSky' };

  const status = statusFromScore(overall ? overall.score : null);

  // Özet ve gerekçeler için "karanlık" saatlere (Güneş < −6°) bakılır.
  const darkHours = hours.filter((h) => h.sunAlt < -6 && h.weather);
  const focus = overall
    ? darkHours.filter((h) => h.time >= overall.start && h.time < overall.end)
    : darkHours;
  const sample = focus.length ? focus : darkHours;

  const factors = sample.map((h) => h.scores.factors);
  const summary = sample.length
    ? {
      cloudPct: Math.round(mean(factors.map((f) => f.cloudPct))),
      temp: mean(sample.map((h) => h.weather.temp)),
      wind: mean(factors.map((f) => f.windEff)),
      jet: mean(sample.map((h) => h.weather.jet)),
      dewSpread: Math.min(...factors.map((f) => f.dewSpread)),
      rh: mean(sample.map((h) => h.weather.rh)),
      pop: Math.max(...sample.map((h) => h.weather.pop)),
      transparency: mean(factors.map((f) => f.transparency)),
      aod: mean(sample.map((h) => h.weather.aod).filter((v) => v != null)),
      dust: Math.max(0, ...sample.map((h) => h.weather.dust ?? 0)),
      moonIllum: ctx.moonIllum,
    }
    : null;

  if (summary) summary.cloudText = cloudText(summary.cloudPct);

  return {
    planet,
    deepSky,
    photo,
    overall,
    status,
    summary,
    headline: buildHeadline(status, planet, deepSky, summary),
    reasons: summary ? buildReasons(summary, darkHours, ctx) : [{ tone: 'info', text: 'Bu gece için hava tahmini henüz yok (en fazla ~8 gün ilerisi tahmin edilebiliyor).' }],
  };
}

function buildHeadline(status, planet, deepSky, summary) {
  if (status === 'none') return 'Bu gece için hava tahmini yok.';
  const p = planet ? planet.score : 0;
  const d = deepSky ? deepSky.score : 0;
  if (summary && summary.cloudPct >= 70) return 'Bulutlar gökyüzünü kapatıyor.';
  if (status === 'good') {
    if (p >= 70 && d >= 70) return 'Hem gezegenler hem derin uzay için iyi bir gece.';
    if (p >= 70) {
      const quality = p >= 85 ? 'harika' : 'iyi';
      return d < 40 ? `Ay ve gezegenler için ${quality}; galaksiler için gökyüzü fazla parlak.` : `Ay ve gezegenler için ${quality} bir gece.`;
    }
    return 'Derin uzay (galaksi, bulutsu, küme) için iyi bir gece.';
  }
  if (status === 'ok') return 'Gözlem yapılabilir ama koşullar ideal değil.';
  return 'Koşullar gözlem için elverişsiz.';
}

/** Kullanıcıya "neden bu renk?" sorusunun cevabını veren kısa maddeler. */
function buildReasons(s, darkHours, ctx) {
  const out = [];
  const add = (tone, text) => out.push({ tone, text });

  // Bulut
  if (s.cloudPct < 15) add('good', 'Gökyüzü açık görünüyor.');
  else if (s.cloudPct < 40) add('info', `Parçalı bulut (%${s.cloudPct}): bulut aralarından gözlem yapılabilir.`);
  else add('bad', `Bulutlu (%${s.cloudPct}).`);

  if (s.pop >= 40) add('bad', `Yağış ihtimali %${Math.round(s.pop)} — teleskobu dışarıda bırakma.`);

  // Ay
  const moonUpShare = darkHours.length ? darkHours.filter((h) => h.moonAlt > 5).length / darkHours.length : 0;
  if (ctx.moonIllum >= 0.5 && moonUpShare >= 0.5) {
    add('bad', `Parlak Ay (%${Math.round(ctx.moonIllum * 100)}) gecenin çoğunda gökyüzünde: sönük galaksiler zor; Ay'ın kendisi ve gezegenler için sorun yok.`);
  } else if (ctx.moonIllum < 0.25 || moonUpShare < 0.25) {
    add('good', 'Ay ışığı az — derin uzay için ideal karanlık.');
  } else {
    add('info', `Ay (%${Math.round(ctx.moonIllum * 100)}) gecenin bir kısmında gökyüzünde; Ay batınca galaksilere geç.`);
  }

  // Seeing (jet akımı)
  if (s.jet != null) {
    if (s.jet < 60) add('good', 'Atmosfer sakin: gezegen ayrıntıları için iyi (tahmini seeing).');
    else if (s.jet >= 110) add('bad', `Jet akımı güçlü (${Math.round(s.jet)} km/s): yıldızlar titrer, yüksek büyütme bulanık olur.`);
  }

  // Rüzgar
  if (s.wind >= 20) add('bad', `Rüzgar ~${Math.round(s.wind)} km/s: EQ-2 kundak titreyebilir; rüzgarı kesen bir köşe seç.`);
  else if (s.wind < 10) add('good', 'Rüzgar hafif.');

  // Çiğ
  if (s.dewSpread < 2) add('bad', 'Çiğ riski yüksek: kullanmadığında merceklerin kapağını kapalı tut, bulucu dürbünü buğulanabilir.');
  else if (s.dewSpread < 4) add('info', 'Gece ilerledikçe çiğ oluşabilir.');

  // Şeffaflık
  if (s.dust > 50 || (s.aod != null && s.aod > 0.35)) add('bad', 'Havada toz/aerosol yüksek: şeffaflık düşük, sönük cisimler kaybolur.');
  else if (s.rh > 88) add('info', `Nem yüksek (%${Math.round(s.rh)}): gökyüzü sütlü görünebilir.`);
  else if (s.transparency > 0.85) add('good', 'Hava berrak (şeffaflık iyi).');

  // Karanlık ve ışık kirliliği
  if (!ctx.hasAstroDark) add('info', 'Bu gece tam astronomik karanlık oluşmuyor.');
  if (ctx.bortle >= 7) add('info', `Işık kirliliği yüksek (Bortle ${ctx.bortle}): Ay, gezegen, çift yıldız ve parlak kümelere odaklan.`);

  if (s.temp != null && s.temp < 5) add('info', `Soğuk (${Math.round(s.temp)}°C): sıkı giyin; teleskobu 30 dk önceden dışarı çıkar ki ısısı dengelensin.`);

  const order = { bad: 0, good: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
