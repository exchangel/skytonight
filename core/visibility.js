/**
 * visibility.js — "Bu cisim, bu ekipmanla, bu gökyüzünde görünür mü? Ne kadar zor?"
 *
 * Görünürlük evet/hayır değildir: Andromeda Galaksisi karanlık bir köyde çıplak gözle
 * görünür, şehirde 130 mm teleskopla bile zorlanırsın. Bu yüzden sonuç bir derecedir:
 * Kolay / Orta / Zor / Görünmez, yanında da nedeni.
 *
 * Model (basitleştirilmiş ama fiziksel temelli):
 *  1) Gökyüzü parlaklığı (mag/arcsec²) = ışık kirliliği + Ay ışığı + alacakaranlık.
 *  2) Çıplak göz limit kadiri (NELM) gökyüzü parlaklığından çıkar.
 *  3) Teleskop, açıklığı oranında daha sönük yıldız gösterir: +5·log10(D/7mm).
 *  4) Noktasal cisimler (yıldız, gezegen) için: kadir < limit mi?
 *  5) Yaygın cisimler (galaksi, bulutsu) için ayrıca YÜZEY PARLAKLIĞI önemlidir:
 *     ışığı geniş alana yayılan sönük bir galaksi, aydınlık gökyüzünde kaybolur.
 *  6) Ufka yakın cisimler daha fazla hava katmanından geçer (sönümlenme), Ay'a yakın
 *     cisimler de Ay'ın parıltısında kaybolur.
 *
 * "Margin" (pay) = kaç kadir fazlamız var. Pay büyükse kolay, sıfırın altındaysa görünmez.
 */

import { limitingMagnitudeGain, resolutionLimitArcsec } from './equipment.js';

const D2R = Math.PI / 180;

/**
 * Bortle ölçeği: nelm = çıplak göz limit kadiri, sqm = tepe noktasında gökyüzü
 * parlaklığı (mag/arcsec², büyük sayı = karanlık).
 */
export const BORTLE_SCALE = [
  { level: 1, nelm: 7.8, sqm: 21.95, name: 'Mükemmel karanlık', hint: 'Samanyolu gölge düşürecek kadar parlak. Türkiye\'de çok nadir.' },
  { level: 2, nelm: 7.3, sqm: 21.7, name: 'Çok karanlık', hint: 'Samanyolu çok ayrıntılı; ufukta hiç şehir ışığı yok.' },
  { level: 3, nelm: 6.8, sqm: 21.4, name: 'Kırsal gökyüzü', hint: 'Samanyolu belirgin; ufukta hafif şehir parıltısı.' },
  { level: 4, nelm: 6.3, sqm: 20.9, name: 'Kırsal / banliyö geçişi', hint: 'Samanyolu görünür ama ayrıntısız; ufukta ışık kubbeleri.' },
  { level: 5, nelm: 5.8, sqm: 20.1, name: 'Banliyö', hint: 'Samanyolu ancak tepede, çok sönük seçilir.' },
  { level: 6, nelm: 5.3, sqm: 19.3, name: 'Parlak banliyö', hint: 'Samanyolu görünmez; gökyüzü grimsi.' },
  { level: 7, nelm: 4.8, sqm: 18.7, name: 'Banliyö / şehir geçişi', hint: 'Gökyüzü gri-turuncu; sadece belirgin takımyıldızlar seçilir.' },
  { level: 8, nelm: 4.3, sqm: 18.2, name: 'Şehir', hint: 'Sadece en parlak yıldızlar ve gezegenler.' },
  { level: 9, nelm: 3.8, sqm: 17.8, name: 'Şehir merkezi', hint: 'Bir avuç yıldız. Ay ve gezegenler yine de harika görünür.' },
];

export function bortleInfo(bortle) {
  const b = Math.min(9, Math.max(1, Math.round(bortle || 5)));
  return BORTLE_SCALE[b - 1];
}

export const LEVELS = {
  easy: { label: 'Kolay', rank: 3 },
  moderate: { label: 'Orta', rank: 2 },
  hard: { label: 'Zor', rank: 1 },
  invisible: { label: 'Görünmez', rank: 0 },
};

const flux = (mag) => Math.pow(10, -0.4 * mag);

/**
 * Gökyüzünün etkin yüzey parlaklığı (mag/arcsec²).
 * Işık kaynakları akı olarak toplanır; sonuç tekrar kadire çevrilir.
 */
export function skyBrightness({ bortle, sunAlt = -90, moonAlt = -90, moonIllum = 0 }) {
  let total = flux(bortleInfo(bortle).sqm);
  if (moonAlt > 0 && moonIllum > 0.02) {
    // Yüksekteki dolunay ≈ 18,3 mag/arcsec²; hilal ve alçak Ay çok daha zayıf.
    const moonSqm = 18.3 - 2.5 * Math.log10(Math.pow(moonIllum, 1.5) * Math.max(0.1, Math.sin(moonAlt * D2R)));
    total += flux(moonSqm);
  }
  if (sunAlt > -18) {
    // Alacakaranlık: Güneş −18°'de ihmal edilebilir, −12°'de ~18, −6°'de ~12 mag/arcsec².
    total += flux(24 - (sunAlt + 18));
  }
  return -2.5 * Math.log10(total);
}

/** Etkin çıplak göz limit kadiri: gökyüzü ne kadar aydınlanırsa o kadar düşer. */
export function nakedEyeLimit(bortle, skySqm) {
  const base = bortleInfo(bortle);
  return base.nelm - 0.8 * Math.max(0, base.sqm - skySqm);
}

/** Hava kütlesi (Kasten & Young 1989): tepe noktasında 1, ufukta ~38. */
export function airmass(altitude) {
  const h = Math.max(0.5, altitude);
  return 1 / (Math.sin(h * D2R) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
}

/** Atmosferik sönümlenme (kadir): görsel bantta ~0,28 kadir/hava kütlesi. */
export function extinction(altitude) {
  return 0.28 * (airmass(altitude) - 1);
}

/**
 * Ortalama yüzey parlaklığı (mag/arcsec²) = toplam kadir + ışığın yayıldığı alan.
 * @param {number} mag
 * @param {number[]} size [büyük eksen, küçük eksen] yay dakikası
 */
export function surfaceBrightness(mag, size) {
  const a = size[0];
  const b = size[1] || a;
  const areaArcsec2 = (Math.PI / 4) * a * b * 3600;
  return mag + 2.5 * Math.log10(areaArcsec2);
}

/**
 * Galaksilerin çekirdeği ortalamadan çok daha parlaktır; gözün ilk gördüğü yer orasıdır.
 * Büyük galaksilerde (M31 gibi) ortalama, sönük dış kollar yüzünden yanıltıcı düşük kalır.
 */
function coreBoost(kind, majorAxis) {
  switch (kind) {
    case 'galaxy': return 1.0 + 0.5 * Math.log2(Math.max(1, majorAxis / 10));
    case 'globular': return 1.5;
    case 'nebula': return 0.5;
    case 'planetary':
    case 'snr': return 0.3;
    default: return 0;
  }
}

function levelFromMargin(margin, thresholds = [2.0, 1.0, 0]) {
  if (margin >= thresholds[0]) return 'easy';
  if (margin >= thresholds[1]) return 'moderate';
  if (margin >= thresholds[2]) return 'hard';
  return 'invisible';
}

const EXTENDED_KINDS = new Set(['galaxy', 'globular', 'planetary', 'nebula', 'snr']);
const CLUSTER_KINDS = new Set(['open', 'asterism']);

/**
 * Bir cismin görünürlüğünü derecelendirir.
 *
 * @param {object} target katalog kaydı: { kind, mag, size?, sep?, magB?, patternMag? }
 * @param {object} ctx
 * @param {object} ctx.equipment equipment.js'deki ekipman
 * @param {number} ctx.bortle
 * @param {number} ctx.alt cismin irtifası (derece)
 * @param {number} ctx.sunAlt
 * @param {number} ctx.moonAlt
 * @param {number} ctx.moonIllum 0–1
 * @param {number} [ctx.moonSep] cismin Ay'a açısal uzaklığı (derece)
 * @param {number} [ctx.seeing] 0–1 (scoring.js seeing çarpanı); çift yıldızlar için
 * @returns {{level:string, label:string, margin:number, reasons:string[]}}
 */
export function rateTarget(target, ctx) {
  const reasons = [];
  const result = (level, margin) => ({ level, label: LEVELS[level].label, margin, reasons });

  if (ctx.alt <= 0) {
    reasons.push('Bu saatte ufkun altında.');
    return result('invisible', -99);
  }

  const { equipment: eq, bortle } = ctx;
  const sky = skyBrightness(ctx);
  const nelm = nakedEyeLimit(bortle, sky);
  const limit = nelm + limitingMagnitudeGain(eq);
  const ext = extinction(ctx.alt);
  const magEff = (target.mag ?? 99) + ext;

  // --- Ay: her koşulda kolay -------------------------------------------------
  if (target.kind === 'moon') {
    reasons.push('Gökyüzünün en kolay hedefi; ayrıntılar için en iyi bölge gölge sınırı (terminatör).');
    return result('easy', 10);
  }

  // --- Takımyıldız: çıplak gözle desenini seçebilir misin? ---------------------
  if (target.kind === 'constellation') {
    const margin = nelm - ext - (target.patternMag ?? 4);
    if (margin < 0.5) reasons.push('Desenin sönük yıldızları bu gökyüzünde kayboluyor.');
    return result(levelFromMargin(margin, [1.5, 0.5, 0]), margin);
  }

  // --- Çift yıldız: ayırma gücü + eşin parlaklığı ------------------------------
  if (target.kind === 'double') {
    const seeingLimit = eq.kind === 'eye' ? 0 : 1.0 + 2.5 * (1 - (ctx.seeing ?? 0.7));
    const resLimit = Math.max(resolutionLimitArcsec(eq), seeingLimit);
    const companion = (target.magB ?? target.mag) + ext;
    if (companion > limit) {
      reasons.push('Eş yıldız bu koşullarda fazla sönük.');
      return result('invisible', limit - companion);
    }
    const dm = Math.max(0, (target.magB ?? target.mag) - target.mag);
    const glare = dm > 2 && target.sep < 10 ? 1 + (dm - 2) * 0.4 : 1; // parlak yıldızın parıltısı
    const ratio = target.sep / resLimit / glare;
    if (ratio < 1) {
      reasons.push(eq.kind === 'eye'
        ? 'Çıplak gözle ayrılamayacak kadar yakın; teleskop gerekli.'
        : `Yıldızlar çok yakın (${target.sep}"): bu ekipman/atmosferle ayrılamaz.`);
      return result('invisible', ratio - 1);
    }
    if (ratio < 1.8) reasons.push('Sakin bir anı bekle ve en yüksek büyütmeyi kullan.');
    return result(levelFromMargin(ratio, [3, 1.8, 1]), ratio);
  }

  // --- Gezegenler ve parlak yıldızlar (noktasal) --------------------------------
  let margin;
  if (target.kind === 'planet' || target.kind === 'star') {
    margin = limit - magEff;
    if (ctx.sunAlt > -4 && (target.mag ?? 0) > -2) {
      margin = Math.min(margin, 0.5);
      reasons.push('Gökyüzü hâlâ aydınlık; biraz daha kararmasını bekle.');
    }
    if (target.kind === 'planet' && target.mag > 5) {
      // Uranüs/Neptün: görmek kolay, ama yıldızlardan ayırt edip BULMAK zor.
      margin = Math.min(margin, 1.9);
      reasons.push('Yıldız gibi küçük görünür; yerini bulmak için yıldız haritası gerekir.');
    }
  } else if (CLUSTER_KINDS.has(target.kind)) {
    // Açık küme: ayrı ayrı yıldızlar; toplam parlaklık ve en parlak üyeler belirleyici.
    margin = limit - 1.0 - magEff;
  } else if (EXTENDED_KINDS.has(target.kind)) {
    const size = target.size && target.size[0] ? target.size : [1, 1];
    const sbEff = surfaceBrightness(target.mag, size) - coreBoost(target.kind, size[0]) + ext;
    const apertureBonus = eq.kind === 'eye' ? 0 : 0.5 * Math.log10(eq.aperture / 7);
    const magMargin = limit - 1.0 - magEff;
    const sbMargin = sky + 1.0 + apertureBonus - sbEff;
    margin = Math.min(magMargin, sbMargin);
    if (sbMargin < magMargin && sbMargin < 1) {
      reasons.push(ctx.moonAlt > 0 && ctx.moonIllum > 0.3
        ? 'Işığı geniş alana yayılmış; Ay ışığı kontrastı düşürüyor.'
        : 'Işığı geniş alana yayılmış; ışık kirliliği kontrastı düşürüyor.');
    } else if (magMargin < 1) {
      reasons.push('Bu ekipman için sönük.');
    }
  } else {
    margin = limit - magEff;
  }

  // Ay'a çok yakın sönük cisimler parıltıda kaybolur.
  if (ctx.moonSep != null && ctx.moonAlt > 0 && ctx.moonIllum > 0.3 && ctx.moonSep < 20 && target.kind !== 'planet') {
    margin -= ((20 - ctx.moonSep) / 10) * ctx.moonIllum;
    reasons.push(`Ay'a çok yakın (${Math.round(ctx.moonSep)}°).`);
  }

  // Ufka çok yakın: binalar, ağaçlar ve kalın hava tabakası.
  if (ctx.alt < 10) {
    margin -= 0.7;
    reasons.push('Ufka çok yakın: önünün açık olması gerekir, görüntü titrek olur.');
  }

  if (margin < 0 && !reasons.length) reasons.push('Bu ekipman ve gökyüzü için fazla sönük.');
  return result(levelFromMargin(margin), margin);
}
