/**
 * astro.js — astronomy-engine kütüphanesinin üstünde ince bir katman.
 *
 * astronomy-engine (MIT, Don Cross) NASA JPL verileriyle doğrulanmış, ±1 yay dakikası
 * hassasiyetinde konum hesaplayan bir kütüphanedir. Bu dosya onu uygulamanın ihtiyaç
 * duyduğu sade fonksiyonlara çevirir: "şu anda Satürn nerede?", "bu gece ne zaman
 * karanlık olacak?", "Ay yüzde kaç dolu?" gibi.
 *
 * Koordinat notları:
 *  - RA (sağ açıklık) SAAT cinsindendir (0–24), Dec (dik açıklık) DERECE (−90…+90).
 *  - Katalog koordinatları J2000 dönemindedir; ufuk dönüşümü presesyonu da hesaba katar.
 *  - İrtifalara atmosferik kırılma ("normal") eklenir: ufka yakın cisimler gerçekte
 *    olduğundan ~0,5° yüksek görünür, insan gözü de onları öyle görür.
 */

import * as Astronomy from 'astronomy-engine';
import { nightNoon } from './format.js';

/** Gezegenler (Plüton hariç: 14,4 kadirle küçük teleskoplar için pratik değil). */
export const PLANET_BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

/** Gök cisimlerinin Türkçe adları. */
export const BODY_NAMES_TR = {
  Sun: 'Güneş',
  Moon: 'Ay',
  Mercury: 'Merkür',
  Venus: 'Venüs',
  Mars: 'Mars',
  Jupiter: 'Jüpiter',
  Saturn: 'Satürn',
  Uranus: 'Uranüs',
  Neptune: 'Neptün',
};

/** Ekvator çapları (km) — açısal çap hesabı için. */
const BODY_DIAMETERS_KM = {
  Moon: 3474.8,
  Mercury: 4879,
  Venus: 12104,
  Mars: 6779,
  Jupiter: 139820,
  Saturn: 116460, // halkalar hariç gövde
  Uranus: 50724,
  Neptune: 49244,
};

const AU_KM = 149597870.7;
const RAD_TO_ARCSEC = 206264.806;
const SYNODIC_MONTH_DAYS = 29.530588;

/** @returns {Astronomy.Observer} */
export function makeObserver({ lat, lon, elevation = 0 }) {
  return new Astronomy.Observer(lat, lon, elevation || 0);
}

/** AstroTime | null → Date | null */
const toDate = (t) => (t ? t.date : null);

/**
 * Güneş, Ay veya bir gezegenin o andaki konumu.
 * @param {string} body 'Sun' | 'Moon' | 'Jupiter' ...
 * @returns {{alt:number, az:number, ra:number, dec:number}} ra saat, diğerleri derece
 */
export function bodyPosition(body, date, observer) {
  const eq = Astronomy.Equator(body, date, observer, true, true);
  const hor = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return { alt: hor.altitude, az: hor.azimuth, ra: eq.ra, dec: eq.dec };
}

/** Takımyıldız tespiti için J2000 koordinatları (gezegenler gökyüzünde gezindiği için). */
export function bodyJ2000(body, date, observer) {
  const eq = Astronomy.Equator(body, date, observer, false, true);
  return { ra: eq.ra, dec: eq.dec };
}

export function sunAltitude(date, observer) {
  return bodyPosition('Sun', date, observer).alt;
}

/**
 * Sabit cisimler (yıldız, galaksi, küme...) için "gökyüzü çerçevesi".
 * Dönüşüm matrisi bir kez hesaplanır, sonra yüzlerce cisme hızlıca uygulanır.
 */
export function skyFrame(date, observer) {
  const time = Astronomy.MakeTime(date);
  return { time, rot: Astronomy.Rotation_EQJ_HOR(time, observer) };
}

/**
 * J2000 RA/Dec → o anki ufuk koordinatı.
 * @param {{time:any, rot:any}} frame skyFrame() çıktısı
 * @param {number} raHours
 * @param {number} decDeg
 * @returns {{alt:number, az:number}}
 */
export function fixedPosition(frame, raHours, decDeg) {
  const vec = Astronomy.VectorFromSphere(new Astronomy.Spherical(decDeg, raHours * 15, 1), frame.time);
  const hor = Astronomy.HorizonFromVector(Astronomy.RotateVector(frame.rot, vec), 'normal');
  return { alt: hor.lat, az: hor.lon };
}

/**
 * Gecenin önemli anları. Arama, gece anahtarının yerel öğle saatinden başlar.
 *
 *  Güneş irtifası   Ad
 *   0°  (−0,83°)    gün batımı / doğumu
 *  −6°              sivil alacakaranlık: parlak gezegenler ve Ay rahat görülür
 *  −12°             nautik alacakaranlık: parlak yıldızlar, gökyüzü hâlâ mavimsi
 *  −18°             astronomik karanlık: sönük galaksi/bulutsu için gerçek karanlık
 *
 * Yaz aylarında yüksek enlemlerde −18°'ye hiç inilmeyebilir (astroDusk = null).
 */
export function nightWindow(key, observer, timeZone) {
  const noon = nightNoon(key, timeZone);
  const search = (dir, start, altitude) => toDate(Astronomy.SearchAltitude('Sun', observer, dir, start, 1, altitude));

  let sunset = toDate(Astronomy.SearchRiseSet('Sun', observer, -1, noon, 1));
  const civilDusk = search(-1, noon, -6);
  const nauticalDusk = search(-1, noon, -12);
  const astroDusk = search(-1, noon, -18);

  // Kutup bölgesi gibi uç durumlar için güvenli varsayılan (Türkiye'de oluşmaz).
  if (!sunset) sunset = new Date(noon.getTime() + 6 * 3600e3);

  let sunrise = toDate(Astronomy.SearchRiseSet('Sun', observer, +1, sunset, 1));
  if (!sunrise) sunrise = new Date(noon.getTime() + 18 * 3600e3);

  // Sabah olayları, ancak akşam karşılığı varsa anlamlıdır.
  const civilDawn = civilDusk ? search(+1, sunset, -6) : null;
  const nauticalDawn = nauticalDusk ? search(+1, sunset, -12) : null;
  const astroDawn = astroDusk ? search(+1, sunset, -18) : null;

  const darkStart = astroDusk || nauticalDusk || civilDusk || sunset;
  const darkEnd = astroDawn || nauticalDawn || civilDawn || sunrise;

  return {
    key,
    sunset, civilDusk, nauticalDusk, astroDusk,
    astroDawn, nauticalDawn, civilDawn, sunrise,
    darkStart, darkEnd,
    hasAstroDark: Boolean(astroDusk && astroDawn),
    darkMinutes: Math.max(0, (darkEnd - darkStart) / 60000),
  };
}

/**
 * Ay evresi açısına göre Türkçe ad.
 * MoonPhase(): 0° yeni ay, 90° ilk dördün, 180° dolunay, 270° son dördün.
 */
export function moonPhaseName(angle) {
  const a = ((angle % 360) + 360) % 360;
  if (a < 7 || a >= 353) return 'Yeni ay';
  if (a < 83) return 'Büyüyen hilal';
  if (a < 97) return 'İlk dördün';
  if (a < 173) return 'Büyüyen şişkin ay';
  if (a < 187) return 'Dolunay';
  if (a < 263) return 'Küçülen şişkin ay';
  if (a < 277) return 'Son dördün';
  return 'Küçülen hilal';
}

/** Kuzey yarımkürede görünüşe uygun Ay emojisi. */
export function moonPhaseEmoji(angle) {
  const icons = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  const a = ((angle % 360) + 360) % 360;
  return icons[Math.round(a / 45) % 8];
}

/**
 * Ay'ın evresi ve aydınlık oranı.
 * @returns {{phaseAngle:number, illumination:number, phaseName:string, emoji:string, waxing:boolean, ageDays:number}}
 */
export function moonInfo(date) {
  const phaseAngle = Astronomy.MoonPhase(date);
  const illum = Astronomy.Illumination('Moon', date);
  return {
    phaseAngle,
    illumination: illum.phase_fraction,
    phaseName: moonPhaseName(phaseAngle),
    emoji: moonPhaseEmoji(phaseAngle),
    waxing: phaseAngle < 180,
    ageDays: (phaseAngle / 360) * SYNODIC_MONTH_DAYS,
  };
}

/**
 * Gezegen/Ay için o geceye özel fiziksel bilgiler.
 * @returns {{mag:number, phaseFraction:number, distanceAu:number, distanceKm:number,
 *            angularDiameter:number, ringTilt:number|null, elongation:number}}
 *          angularDiameter yay saniyesi; elongation Güneş'ten açısal uzaklık (derece)
 */
export function bodyDetails(body, date) {
  const illum = Astronomy.Illumination(body, date);
  const distanceKm = illum.geo_dist * AU_KM;
  const diameter = BODY_DIAMETERS_KM[body];
  return {
    mag: illum.mag,
    phaseFraction: illum.phase_fraction,
    distanceAu: illum.geo_dist,
    distanceKm,
    angularDiameter: diameter ? 2 * Math.atan(diameter / 2 / distanceKm) * RAD_TO_ARCSEC : null,
    ringTilt: illum.ring_tilt ?? null,
    elongation: Astronomy.AngleFromSun(body, date),
  };
}

/** J2000 koordinatının içinde bulunduğu takımyıldızın kısaltması ("UMa", "Ori"...). */
export function constellationAt(raHours, decDeg) {
  return Astronomy.Constellation(raHours, decDeg).symbol;
}

/**
 * Ufuk koordinatlarında iki nokta arasındaki açı (derece).
 * Ay'ın bir cisme ne kadar yakın olduğunu bulmak için kullanılır.
 */
export function separationAltAz(a, b) {
  const d2r = Math.PI / 180;
  const cos = Math.sin(a.alt * d2r) * Math.sin(b.alt * d2r)
    + Math.cos(a.alt * d2r) * Math.cos(b.alt * d2r) * Math.cos((a.az - b.az) * d2r);
  return Math.acos(Math.min(1, Math.max(-1, cos))) / d2r;
}

/** Yer merkezli iki gök cismi arasındaki açısal uzaklık (derece). Kavuşum tespiti için. */
export function bodySeparation(bodyA, bodyB, date) {
  const time = Astronomy.MakeTime(date);
  return Astronomy.AngleBetween(Astronomy.GeoVector(bodyA, time, true), Astronomy.GeoVector(bodyB, time, true));
}

/** [start, end] aralığını `stepMinutes` aralıklarla örnekler (iki uç dahil). */
export function timeSteps(start, end, stepMinutes) {
  const out = [];
  const step = stepMinutes * 60000;
  for (let t = start.getTime(); t < end.getTime(); t += step) out.push(new Date(t));
  out.push(new Date(end.getTime()));
  return out;
}

/**
 * Örneklenmiş irtifa dizisinde ufuk geçişlerini (doğuş/batış) bulur.
 * İki örnek arasında doğrusal ara değerleme yapılır (10 dk adımda ±1 dk hata).
 * @param {Date[]} times
 * @param {number[]} alts
 * @param {number} [threshold=0] derece
 * @returns {{rise:Date|null, set:Date|null}} pencere içindeki İLK doğuş ve İLK batış
 */
export function findCrossings(times, alts, threshold = 0) {
  let rise = null;
  let set = null;
  for (let i = 1; i < alts.length; i++) {
    const a0 = alts[i - 1] - threshold;
    const a1 = alts[i] - threshold;
    if ((a0 < 0) === (a1 < 0)) continue;
    const frac = a0 / (a0 - a1);
    const t = new Date(times[i - 1].getTime() + frac * (times[i] - times[i - 1]));
    if (a1 > a0 && !rise) rise = t;
    if (a1 < a0 && !set) set = t;
  }
  return { rise, set };
}

export { Astronomy };
