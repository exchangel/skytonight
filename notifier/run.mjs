#!/usr/bin/env node
/**
 * run.mjs — Günlük bildirim betiği. GitHub Actions her gün ~16:00'da (TR) çalıştırır.
 *
 * Her abone için: hava tahminini çeker → sitedeki hesapların AYNISINI (core/) yapar →
 * bu gece skor eşiği aşıyorsa ya da önemli bir gökyüzü olayı varsa ntfy ve/veya
 * e-posta gönderir.
 *
 * Ortam değişkenleri (GitHub → Settings → Secrets and variables → Actions):
 *   NOTIFY_SUBSCRIBERS  Abone listesi (JSON dizi, zorunlu). Örnek:
 *     [{"name":"Levent","place":"Ev","lat":41.01,"lon":28.97,"bortle":7,
 *       "equipment":"omegon130","threshold":80,"until":2,
 *       "ntfy":"skytonight-levent-x8k2q","email":"ornek@gmail.com"}]
 *   SMTP_USER, SMTP_PASS  Gmail adresi ve uygulama şifresi (yalnızca e-posta için)
 *   SITE_URL            Bildirimdeki bağlantı (yoksa GitHub Pages adresi tahmin edilir)
 *   NTFY_SERVER         Varsayılan https://ntfy.sh
 *
 * Bayraklar:
 *   --dry-run (ya da DRY_RUN=true)  hiçbir şey göndermez, mesajları ekrana yazar
 *   --force   (ya da FORCE=true)    eşiği yok sayar, herkese gönderir (kurulum testi için)
 */

import { readFile } from 'node:fs/promises';
import { fetchWeather } from '../core/weather.js';
import { evaluateNight } from '../core/night.js';
import { buildTargets, evaluateTargets, topPicks } from '../core/objects.js';
import { upcomingEvents } from '../core/events.js';
import { resolveEquipment } from '../core/equipment.js';
import { currentNightKey } from '../core/format.js';
import { buildMessage, siteLink } from './template.js';
import { sendNtfy, createMailer } from './senders.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || process.env.DRY_RUN === 'true';
const FORCE = args.has('--force') || process.env.FORCE === 'true';

/** Önemli olay varsa ve hava "idare eder" seviyesindeyse de haber ver. */
const EVENT_MIN_SCORE = 50;

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

function defaultSiteUrl() {
  const repo = process.env.GITHUB_REPOSITORY; // "kullanici/repo"
  if (!repo) return 'http://localhost:8000/';
  const [owner, name] = repo.split('/');
  return `https://${owner.toLowerCase()}.github.io/${name}/`;
}

/** Abone listesini okur ve doğrular; hatalı kayıtlar atlanır ama loglanır. */
function parseSubscribers(raw) {
  if (!raw || !raw.trim()) throw new Error('NOTIFY_SUBSCRIBERS boş. README\'deki "Bildirim kurulumu" bölümüne bak.');
  let list;
  try {
    list = JSON.parse(raw);
  } catch (err) {
    throw new Error(`NOTIFY_SUBSCRIBERS geçerli JSON değil: ${err.message}`);
  }
  if (!Array.isArray(list)) list = [list];
  return list.filter((s, i) => {
    const label = s.name || `#${i + 1}`;
    const ok = Number.isFinite(s.lat) && Number.isFinite(s.lon) && (s.ntfy || s.email);
    if (!ok) console.warn(`⚠️  ${label}: lat/lon ve en az bir kanal (ntfy ya da email) gerekli — atlandı.`);
    return ok;
  });
}

/** Olay bu gecenin içinde mi (gün batımından 6 sa önce ile gün doğumu arası)? */
function isTonight(event, window) {
  return event.time >= new Date(window.sunset.getTime() - 6 * 3600e3) && event.time <= window.sunrise;
}

async function evaluateSubscriber(sub, { targets, meteorShowers }) {
  const weather = await fetchWeather(sub.lat, sub.lon);
  const tz = weather.timezone;
  const key = currentNightKey(new Date(), tz);
  const location = { lat: sub.lat, lon: sub.lon, elevation: weather.elevation || 0 };
  const night = evaluateNight({
    key, location, timeZone: tz, weather, bortle: sub.bortle ?? 6, untilHour: sub.until ?? null, todayKey: key,
  });
  const equipment = resolveEquipment(sub.equipment || 'omegon130');
  // "Şimdi" olarak gün batımı verilir: bildirim akşam okunacak, öğleden sonraki konum anlamsız.
  const results = evaluateTargets({ night, targets, equipment, now: night.window.sunset });
  const events = upcomingEvents({ location, timeZone: tz, startKey: key, days: 2, horizonDays: 2, meteorShowers })
    .filter((e) => isTonight(e, night.window) && e.importance >= 2 && e.visible !== false);
  return { night, picks: topPicks(results, 5), events, key };
}

async function main() {
  const subscribers = parseSubscribers(process.env.NOTIFY_SUBSCRIBERS);
  const [catalog, planets, constellations, meteorShowers] = await Promise.all([
    readJson('data/catalog.json'), readJson('data/planets.json'), readJson('data/constellations.json'), readJson('data/meteor-showers.json'),
  ]);
  const targets = buildTargets({ catalog, planets, constellations });
  const siteUrl = process.env.SITE_URL || defaultSiteUrl();
  const needsMail = subscribers.some((s) => s.email);
  const mailer = !DRY_RUN && needsMail && process.env.SMTP_USER && process.env.SMTP_PASS
    ? createMailer({ user: process.env.SMTP_USER, pass: process.env.SMTP_PASS })
    : null;
  if (needsMail && !mailer && !DRY_RUN) console.warn('⚠️  E-posta adresi olan abone var ama SMTP_USER/SMTP_PASS tanımlı değil; e-postalar atlanacak.');

  console.log(`${subscribers.length} abone · ${DRY_RUN ? 'DENEME (gönderim yok)' : 'gerçek gönderim'}${FORCE ? ' · eşik yok sayılıyor' : ''}`);
  let failures = 0;

  for (const sub of subscribers) {
    const label = sub.name || sub.place || `${sub.lat},${sub.lon}`;
    try {
      const { night, picks, events, key } = await evaluateSubscriber(sub, { targets, meteorShowers });
      const score = night.overall ? night.overall.score : 0;
      const threshold = sub.threshold ?? 80;
      const great = score >= threshold;
      const eventWorthy = events.length > 0 && score >= EVENT_MIN_SCORE;

      console.log(`\n— ${label}: skor ${score} (eşik ${threshold}), ${night.headline}${events.length ? ` · olaylar: ${events.map((e) => e.title).join(', ')}` : ''}`);
      if (!FORCE && !great && !eventWorthy) {
        console.log('  Bildirim yok.');
        continue;
      }

      const link = siteLink(siteUrl, sub, key);
      const msg = buildMessage({ sub, night, picks, events, great, link });
      if (DRY_RUN) {
        console.log(`  [ntfy:${sub.ntfy || '-'}] [email:${sub.email ? 'var' : '-'}]\n  ${msg.title}\n  ${msg.text.split('\n').join('\n  ')}\n  ${link}`);
        continue;
      }
      if (sub.ntfy) {
        await sendNtfy({ server: process.env.NTFY_SERVER, topic: sub.ntfy, title: msg.title, message: msg.text, click: link });
        console.log('  ✓ ntfy gönderildi');
      }
      if (sub.email && mailer) {
        await mailer.send({ to: sub.email, subject: msg.subject, text: `${msg.text}\n\n${link}`, html: msg.html });
        console.log('  ✓ e-posta gönderildi');
      }
    } catch (err) {
      failures++;
      console.error(`  ✕ ${label}: ${err.message}`);
    }
  }

  if (mailer) mailer.close();
  // Hata varsa iş "başarısız" görünsün: GitHub bu durumda repo sahibine e-posta atar.
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
