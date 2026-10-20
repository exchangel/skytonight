/**
 * charts.js — Detay panelindeki SVG çizimler (kütüphanesiz).
 *
 *  - skyDome(): Yukarıdan bakılmış gökyüzü kubbesi. Merkez = tam tepe (zenit), kenar = ufuk.
 *    Yukarı = Kuzey, sağ = Doğu (harita gibi, "hangi yöne döneceğim" sorusu için).
 *  - altitudeChart(): Cismin gece boyunca ufuktan yüksekliği; karanlık saatler koyu,
 *    en iyi an işaretli, "şimdi" çizgisi ve (varsa) Ay'ın eğrisi.
 */

import { esc } from './dom.js';
import { formatTime } from '../../core/format.js';
import { compassPoint } from '../../core/directions.js';

const D2R = Math.PI / 180;

/** Kubbe üzerinde bir (azimut, irtifa) noktasının SVG koordinatı. */
function domePoint(cx, cy, radius, az, alt) {
  const r = radius * (90 - Math.max(0, alt)) / 90;
  return [cx + r * Math.sin(az * D2R), cy - r * Math.cos(az * D2R)];
}

/**
 * @param {{az:number, alt:number}} position
 * @param {object} [options]
 * @param {{az:number, alt:number}|null} [options.moon] aynı anda Ay'ın konumu
 */
export function skyDome(position, { moon = null, label = '' } = {}) {
  const size = 220;
  const c = size / 2;
  const R = 92;
  const rings = [30, 60].map((alt) => `<circle cx="${c}" cy="${c}" r="${(R * (90 - alt)) / 90}" class="dome-ring"/>`).join('');
  const spokes = [0, 45, 90, 135, 180, 225, 270, 315].map((az) => {
    const [x, y] = domePoint(c, c, R, az, 0);
    return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" class="dome-spoke"/>`;
  }).join('');
  const labels = [['K', 0], ['D', 90], ['G', 180], ['B', 270]].map(([t, az]) => {
    const [x, y] = domePoint(c, c, R + 13, az, 0);
    return `<text x="${x}" y="${y}" class="dome-label${t === 'K' ? ' north' : ''}" text-anchor="middle" dominant-baseline="central">${t}</text>`;
  }).join('');

  let target = '';
  if (position && position.alt > 0) {
    const [x, y] = domePoint(c, c, R, position.az, position.alt);
    const [hx, hy] = domePoint(c, c, R, position.az, 0);
    target = `
      <line x1="${c}" y1="${c}" x2="${hx}" y2="${hy}" class="dome-bearing"/>
      <circle cx="${x}" cy="${y}" r="9" class="dome-target-glow"/>
      <circle cx="${x}" cy="${y}" r="5" class="dome-target"/>`;
  }
  let moonMark = '';
  if (moon && moon.alt > 0) {
    const [x, y] = domePoint(c, c, R, moon.az, moon.alt);
    moonMark = `<circle cx="${x}" cy="${y}" r="5" class="dome-moon"/><text x="${x + 9}" y="${y + 4}" class="dome-moon-label">Ay</text>`;
  }

  return `<svg class="dome" viewBox="-12 -12 ${size + 24} ${size + 24}" role="img" aria-label="${esc(label)}">
    <circle cx="${c}" cy="${c}" r="${R}" class="dome-horizon"/>
    ${rings}${spokes}${labels}${moonMark}${target}
    <circle cx="${c}" cy="${c}" r="1.8" class="dome-zenith"/>
  </svg>`;
}

/**
 * Gece boyunca irtifa eğrisi.
 * @param {Array<{t:Date, alt:number}>} curve
 * @param {object} night evaluateNight() çıktısı
 * @param {object} [options]
 * @param {Date|null} [options.best]
 * @param {Array<{t:Date, alt:number}>|null} [options.moonCurve]
 * @param {Date} [options.now]
 */
export function altitudeChart(curve, night, { best = null, moonCurve = null, now = new Date() } = {}) {
  const W = 640;
  const H = 210;
  const pad = { l: 34, r: 12, t: 12, b: 28 };
  const t0 = night.window.sunset.getTime();
  const t1 = night.window.sunrise.getTime();
  const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (alt) => pad.t + (1 - Math.max(0, Math.min(90, alt)) / 90) * (H - pad.t - pad.b);
  const tz = night.timeZone;

  // Karanlık bölge (astronomik ya da nautik) koyu bant.
  const darkBand = `<rect x="${x(night.window.darkStart)}" y="${pad.t}" width="${x(night.window.darkEnd) - x(night.window.darkStart)}" height="${H - pad.t - pad.b}" class="chart-dark"/>`;

  // "En geç" tercihinden sonrası soluk.
  const late = night.evalEnd < night.window.sunrise
    ? `<rect x="${x(night.evalEnd)}" y="${pad.t}" width="${x(night.window.sunrise) - x(night.evalEnd)}" height="${H - pad.t - pad.b}" class="chart-late"/>`
    : '';

  const grid = [0, 30, 60, 90].map((a) => `
    <line x1="${pad.l}" x2="${W - pad.r}" y1="${y(a)}" y2="${y(a)}" class="chart-grid${a === 0 ? ' horizon' : ''}"/>
    <text x="${pad.l - 6}" y="${y(a)}" class="chart-axis" text-anchor="end" dominant-baseline="central">${a}°</text>`).join('');

  // İki saatte bir saat etiketi (tam saatlere hizalı).
  const ticks = [];
  for (let t = Math.ceil(t0 / 3600e3) * 3600e3; t <= t1; t += 3600e3) {
    const d = new Date(t);
    if (Math.round((t - Math.ceil(t0 / 3600e3) * 3600e3) / 3600e3) % 2 !== 0) continue;
    ticks.push(`<text x="${x(t)}" y="${H - 8}" class="chart-axis" text-anchor="middle">${formatTime(d, tz)}</text>`);
  }

  const path = (points, cls) => {
    // Ufkun altındaki kısımlar çizilmez; çizgi oralarda bölünür.
    let d = '';
    let pen = false;
    for (const p of points) {
      if (p.alt < 0) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x(p.t.getTime()).toFixed(1)},${y(p.alt).toFixed(1)}`;
      pen = true;
    }
    return d ? `<path d="${d}" class="${cls}"/>` : '';
  };

  const area = (() => {
    const pts = curve.filter((p) => p.alt >= 0);
    if (pts.length < 2) return '';
    let d = '';
    let segment = [];
    const flush = () => {
      if (segment.length > 1) {
        d += `M${x(segment[0].t.getTime())},${y(0)}`;
        for (const p of segment) d += `L${x(p.t.getTime()).toFixed(1)},${y(p.alt).toFixed(1)}`;
        d += `L${x(segment[segment.length - 1].t.getTime())},${y(0)}Z`;
      }
      segment = [];
    };
    for (const p of curve) {
      if (p.alt < 0) flush(); else segment.push(p);
    }
    flush();
    return `<path d="${d}" class="chart-area"/>`;
  })();

  let bestMark = '';
  if (best) {
    bestMark = `<line x1="${x(best.time.getTime())}" x2="${x(best.time.getTime())}" y1="${y(best.alt)}" y2="${y(0)}" class="chart-best-line"/>
      <circle cx="${x(best.time.getTime())}" cy="${y(best.alt)}" r="5" class="chart-best"/>
      <text x="${x(best.time.getTime())}" y="${y(best.alt) - 10}" class="chart-best-label" text-anchor="middle">${formatTime(best.time, tz)}</text>`;
  }

  let nowLine = '';
  if (now.getTime() > t0 && now.getTime() < t1) {
    nowLine = `<line x1="${x(now.getTime())}" x2="${x(now.getTime())}" y1="${pad.t}" y2="${y(0)}" class="chart-now"/>
      <text x="${x(now.getTime()) + 4}" y="${pad.t + 10}" class="chart-now-label">şimdi</text>`;
  }

  return `<svg class="alt-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gece boyunca ufuktan yükseklik grafiği">
    ${darkBand}${late}${grid}${ticks.join('')}
    ${moonCurve ? path(moonCurve, 'chart-moon') : ''}
    ${area}${path(curve, 'chart-line')}
    ${bestMark}${nowLine}
  </svg>`;
}

/** Kartlardaki küçük yön oku: azimuta göre döndürülmüş ok + kısa yön adı. */
export function miniCompass(az) {
  return `<span class="mini-compass" title="${esc(compassPoint(az).name)}"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5"/><path d="M10 3.5 13 12 10 10.5 7 12z" transform="rotate(${Math.round(az)} 10 10)"/></svg></span>`;
}
