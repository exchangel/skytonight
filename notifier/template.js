/**
 * template.js — Bildirim metinlerini (ntfy düz metni + e-posta HTML'i) üretir.
 */

import { BODY_NAMES_TR } from '../core/astro.js';
import { compassPoint } from '../core/directions.js';
import { formatDate, formatTime, formatPercent } from '../core/format.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STATUS_COLOR = { good: '#3ee39a', ok: '#ffca52', bad: '#ff6b6b', none: '#7d879f' };

function targetName(r) {
  return r.target.name || (r.target.body ? BODY_NAMES_TR[r.target.body] : r.target.code);
}

function targetLine(r, tz) {
  const where = `${compassPoint(r.best.az).name.toLowerCase()} ${Math.round(r.best.alt)}°`;
  return `${targetName(r)} — ${formatTime(r.best.time, tz)}, ${where}${r.photo ? ' 📷' : ''}`;
}

/** Siteye derin bağlantı: bildirime dokununca site doğrudan o konum ve geceyle açılır. */
export function siteLink(siteUrl, sub, key) {
  const q = new URLSearchParams({ lat: sub.lat, lon: sub.lon, name: sub.place || sub.name || '', bortle: sub.bortle ?? 6, date: key });
  return `${siteUrl.replace(/\/?$/, '/')}?${q}`;
}

/**
 * @param {object} p
 * @param {object} p.sub abone kaydı
 * @param {object} p.night evaluateNight() çıktısı
 * @param {Array<object>} p.picks topPicks() çıktısı
 * @param {Array<object>} p.events bu geceki önemli olaylar
 * @param {boolean} p.great skor eşiği aştı mı
 * @param {string} p.link
 * @returns {{title:string, text:string, html:string, subject:string}}
 */
export function buildMessage({ sub, night, picks, events, great, link }) {
  const tz = night.timeZone;
  const score = night.overall ? night.overall.score : 0;
  const s = night.summary;
  const w = night.window;

  const title = great
    ? `🔭 Bu gece gözlem gecesi! (${score}/100)`
    : `✨ Bu gece: ${events[0] ? events[0].title : 'gözlem fırsatı'} (${score}/100)`;

  const conditions = s
    ? `${s.cloudText} · ${Math.round(s.temp)}°C · Rüzgar ${Math.round(s.wind)} km/s · Ay ${formatPercent(night.moon.illumination)}`
    : '';
  const best = night.overall
    ? `En iyi saatler ${formatTime(night.overall.start, tz)}–${formatTime(night.overall.end > w.sunrise ? w.sunrise : night.overall.end, tz)} · tam karanlık ${formatTime(w.darkStart, tz)}–${formatTime(w.darkEnd, tz)}`
    : '';

  const lines = [
    `${sub.place || 'Konumun'} · ${formatDate(w.sunset, tz)}`,
    night.headline,
    conditions,
    best,
  ].filter(Boolean);
  if (picks.length) {
    lines.push('', 'Bu gece bak:');
    for (const r of picks) lines.push(`• ${targetLine(r, tz)}`);
  }
  if (events.length) {
    lines.push('');
    for (const e of events) lines.push(`★ ${e.title}`);
  }
  const text = lines.join('\n');

  const color = STATUS_COLOR[night.status];
  const html = `<!doctype html><html lang="tr"><body style="margin:0;background:#070a14;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#eaeef9">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#10162a;border:1px solid #26304f;border-radius:18px;padding:22px">
      <div style="font-size:13px;color:#a5aeca;letter-spacing:.06em;text-transform:uppercase">${esc(sub.place || '')} · ${esc(formatDate(w.sunset, tz))}</div>
      <table role="presentation" style="margin:12px 0;border-collapse:collapse"><tr>
        <td style="width:64px;height:64px;border-radius:50%;border:5px solid ${color};font-size:24px;font-weight:700;text-align:center;vertical-align:middle">${score}</td>
        <td style="padding-left:14px">
          <div style="font-size:22px;font-weight:700;color:${color}">${great ? 'Gözlem gecesi' : 'Bu gece fırsat var'}</div>
          <div style="font-size:15px">${esc(night.headline)}</div>
        </td>
      </tr></table>
      <p style="color:#a5aeca;font-size:14px;margin:0 0 6px">${esc(conditions)}</p>
      <p style="color:#a5aeca;font-size:14px;margin:0 0 16px">${esc(best)}</p>
      ${picks.length ? `<h3 style="font-size:15px;margin:16px 0 8px">Bu gece bak</h3>
      <ul style="padding-left:18px;margin:0;font-size:14px;line-height:1.7">${picks.map((r) => `<li>${esc(targetLine(r, tz))}</li>`).join('')}</ul>` : ''}
      ${events.length ? `<h3 style="font-size:15px;margin:16px 0 8px">Olaylar</h3>
      <ul style="padding-left:18px;margin:0;font-size:14px;line-height:1.7">${events.map((e) => `<li><strong>${esc(e.title)}</strong> — ${esc(e.text)}</li>`).join('')}</ul>` : ''}
      <p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#6f82f7;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Ayrıntılar ve yön tarifleri</a></p>
    </div>
    <p style="color:#6e799a;font-size:12px;text-align:center;margin-top:14px">SkyTonight · eşik ${sub.threshold ?? 80}/100 · bu e-postayı GitHub Secret'taki NOTIFY_SUBSCRIBERS listesinden çıkararak durdurabilirsin.</p>
  </div></body></html>`;

  return { title, text, html, subject: title.replace(/^[^\p{L}\p{N}]+/u, '') };
}
