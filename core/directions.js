/**
 * directions.js — Gökyüzündeki konumu insanın anlayacağı tarife çevirir.
 *
 * Azimut: kuzeyden saat yönünde ölçülen açı (0° Kuzey, 90° Doğu, 180° Güney, 270° Batı).
 * İrtifa (yükseklik): ufuktan yukarı açı (0° ufuk, 90° tam tepe / zenit).
 *
 * Pratik ipucu: Kolunu tam uzatıp yumruğunu yaptığında, yumruğun gökyüzünde yaklaşık
 * 10° kaplar. "35° yukarı" yerine "≈3,5 yumruk" demek sahada çok daha kullanışlı.
 */

import { formatNumber } from './format.js';

/** 8 ana yön. `dative`: "...-e/-a doğru" hâli ("Güneydoğuya dön"). */
const COMPASS_POINTS = [
  { short: 'K', name: 'Kuzey', dative: 'Kuzeye' },
  { short: 'KD', name: 'Kuzeydoğu', dative: 'Kuzeydoğuya' },
  { short: 'D', name: 'Doğu', dative: 'Doğuya' },
  { short: 'GD', name: 'Güneydoğu', dative: 'Güneydoğuya' },
  { short: 'G', name: 'Güney', dative: 'Güneye' },
  { short: 'GB', name: 'Güneybatı', dative: 'Güneybatıya' },
  { short: 'B', name: 'Batı', dative: 'Batıya' },
  { short: 'KB', name: 'Kuzeybatı', dative: 'Kuzeybatıya' },
];

/** Açıyı 0–360 aralığına getirir. */
export function normalizeAzimuth(az) {
  return ((az % 360) + 360) % 360;
}

/**
 * Azimutu en yakın 8 ana yöne yuvarlar (her yön 45°'lik bir dilim).
 * @param {number} azimuth derece
 * @returns {{short:string, name:string, dative:string}}
 */
export function compassPoint(azimuth) {
  const index = Math.round(normalizeAzimuth(azimuth) / 45) % 8;
  return COMPASS_POINTS[index];
}

/** "Güneydoğu (135°)" */
export function describeDirection(azimuth) {
  const p = compassPoint(azimuth);
  return `${p.name} (${Math.round(normalizeAzimuth(azimuth))}°)`;
}

/** Kol boyu yumruk sayısı (1 yumruk ≈ 10°), yarım yumruk hassasiyetinde. */
export function fistsFromAltitude(altitude) {
  return Math.round(Math.max(0, altitude) / 5) / 2;
}

/** İrtifayı sözle anlatır. */
export function altitudeWords(altitude) {
  if (altitude < 0) return 'ufkun altında';
  if (altitude < 10) return 'ufka çok yakın';
  if (altitude < 30) return 'alçakta';
  if (altitude < 60) return 'orta yükseklikte';
  if (altitude < 80) return 'yüksekte';
  return 'neredeyse tam tepede';
}

/**
 * Tam yön tarifi:
 * "Güneydoğuya (135°) dön, ufkun 35° üstüne bak (≈3,5 yumruk)."
 */
export function pointingInstruction(azimuth, altitude) {
  const p = compassPoint(azimuth);
  const az = Math.round(normalizeAzimuth(azimuth));
  const alt = Math.round(altitude);
  if (alt >= 80) {
    return `Neredeyse tam tepende (${alt}°) — başını dik yukarı kaldır, hafifçe ${p.dative.toLowerCase()} doğru bak.`;
  }
  const fists = fistsFromAltitude(altitude);
  return `${p.dative} (${az}°) dön, ufkun ${alt}° üstüne bak (≈${formatNumber(fists, 1)} yumruk).`;
}

/** Kartlarda kısa gösterim: "GD · 35°" */
export function shortPosition(azimuth, altitude) {
  return `${compassPoint(azimuth).short} · ${Math.round(altitude)}°`;
}
