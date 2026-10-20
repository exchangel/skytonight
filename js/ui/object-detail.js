/**
 * object-detail.js — Bir cisme dokununca açılan panel.
 *   1) Nasıl gözlemlerim: ne zaman, hangi yöne, ne kadar yukarı; pusula/kubbe, irtifa grafiği,
 *      göz merceği, bulma tarifi, kundak ve fotoğraf ipuçları.
 *   2) Bilgi: ne olduğu, uzaklığı, boyutu ve (gezegenlerde) bu geceki canlı değerleri.
 */

import { esc } from './dom.js';
import { KIND_ICONS } from './icons.js';
import { skyDome, altitudeChart } from './charts.js';
import { displayName, preferNow } from './object-list.js';
import { KIND_LABELS } from '../../core/objects.js';
import { bodyPosition } from '../../core/astro.js';
import { pointingInstruction, altitudeWords } from '../../core/directions.js';
import { formatTime, formatTimeAt, formatNumber, formatLightYears, formatPercent } from '../../core/format.js';

/** Kendi açıklaması olmayan cisimler için tür açıklaması. */
const KIND_INFO = {
  galaxy: 'Milyarlarca yıldızdan oluşan, Samanyolu\'na benzer ayrı bir "yıldız adası". Işığı milyonlarca yıl yol alarak bize ulaşır; teleskopta genellikle soluk, oval bir ışık lekesi olarak görünür.',
  globular: 'Yüz binlerce yaşlı yıldızın kütle çekimiyle top şeklinde bir arada durduğu küme. Samanyolu\'nun çevresinde ~150 tane var ve çoğu 10 milyar yıldan yaşlı.',
  open: 'Aynı gaz bulutundan birlikte doğmuş, gevşekçe bağlı genç yıldızlardan oluşan küme. Zamanla dağılıp giderler.',
  planetary: 'Güneş benzeri bir yıldızın ömrünün sonunda dış katmanlarını uzaya üflemesiyle oluşan parlak gaz kabuğu. Adı, eski teleskoplarda gezegen diskine benzemesinden gelir; gezegenlerle ilgisi yoktur.',
  nebula: 'Yıldızlararası gaz ve toz bulutu. Çoğu yeni yıldızların doğduğu yerlerdir; içlerindeki sıcak yıldızların ışığıyla parlarlar.',
  snr: 'Büyük kütleli bir yıldızın süpernova olarak patlamasından geriye kalan, hâlâ genişleyen gaz bulutu.',
  asterism: 'Resmî bir takımyıldız ya da gerçek bir küme olmayan, göze çarpan bir yıldız dizilimi.',
  double: 'Gökyüzünde birbirine çok yakın görünen iki (ya da daha fazla) yıldız. Çoğu, gerçekten birbirinin etrafında dönen yıldız sistemleridir.',
  star: 'Kendi ışığını üreten dev bir gaz küresi; Güneş de bir yıldızdır.',
  constellation: 'Gökyüzünün 88 resmî bölgesinden biri ve oradaki yıldızların oluşturduğu desen.',
};

const PHONE_PHOTO_TIP = 'Telefonla çekim (afokal): 25 mm mercekle cismi ortala, telefon kamerasını merceğin tam üstüne yasla '
  + '(ucuz bir telefon adaptörü işi çok kolaylaştırır). Ekrana dokunup pozlamayı düşür, 2× dijital yakınlaştırmayı dene. '
  + 'Gezegenlerde kısa bir video çekip en net kareyi seçmek de işe yarar.';

function sizeText(target) {
  if (!target.size || !target.size[0]) return null;
  const [a, b] = target.size;
  const fmt = (v) => (v < 1 ? `${Math.round(v * 60)}″` : `${formatNumber(v, 1)}′`);
  const moonRatio = a / 31;
  const compare = moonRatio >= 0.3 ? ` (dolunayın ~${formatNumber(moonRatio, 1)} katı)` : '';
  return `${fmt(a)}${b ? ` × ${fmt(b)}` : ''}${compare}`;
}

function liveFacts(details, target) {
  if (!details) return [];
  const facts = [
    ['Bu gece parlaklık', `${formatNumber(details.mag, 1)} kadir`],
    ['Dünya\'ya uzaklık', target.body === 'Moon'
      ? `${formatNumber(details.distanceKm, 0)} km`
      : `${formatNumber(details.distanceKm / 1e6, 0)} milyon km`],
  ];
  if (details.angularDiameter) {
    facts.push(['Görünür çap', details.angularDiameter > 120
      ? `${formatNumber(details.angularDiameter / 60, 1)}′`
      : `${formatNumber(details.angularDiameter, 1)}″`]);
  }
  if (target.body !== 'Moon' && details.phaseFraction < 0.97) facts.push(['Aydınlık kısım (evre)', formatPercent(details.phaseFraction)]);
  if (details.ringTilt != null) facts.push(['Halka eğimi', `${formatNumber(Math.abs(details.ringTilt), 1)}°`]);
  return facts;
}

/**
 * @param {object} r evaluateTargets() sonucu
 * @param {object} ctx
 * @param {object} ctx.night
 * @param {object} ctx.equipment
 * @param {Record<string,string>} ctx.conNames
 * @param {object|null} ctx.moonResult Ay'ın sonucu (eğrisi grafikte gösterilir)
 * @param {'how'|'info'} ctx.tab
 * @param {Date} ctx.now
 */
export function renderObjectDetail(r, { night, equipment, conNames, moonResult, tab = 'how', now = new Date() }) {
  const t = r.target;
  const tz = night.timeZone;

  // Pusula için kullanılacak an: gece sürüyorsa ve cisim ufkun üstündeyse "şimdi", yoksa en iyi an.
  const useNow = preferNow(r);
  const moment = useNow ? { time: now, ...r.now } : r.best ? { ...r.best } : null;
  const moonThen = moment && t.body !== 'Moon' ? bodyPosition('Moon', moment.time, night.observer) : null;

  let how = '';
  if (moment && r.level !== 'invisible') {
    const when = useNow ? 'Şu anda' : formatTimeAt(moment.time, tz);
    how = `<p class="instruction"><strong>${esc(when)}</strong> ${esc(pointingInstruction(moment.az, moment.alt))}</p>
      <p class="instruction-sub">${esc(displayName(t))} ${esc(altitudeWords(moment.alt))}.</p>`;
  } else {
    how = `<p class="instruction muted">${esc(r.reasons[0] || 'Bu gece görülemiyor.')}</p>`;
  }

  const times = [];
  if (r.upAtStart) times.push(['Gün batımında', 'zaten gökyüzünde']);
  if (r.rise) times.push(['Doğuş', formatTime(r.rise, tz)]);
  times.push(['En yüksek', `${formatTime(r.transit.time, tz)} · ${Math.round(r.transit.alt)}°`]);
  if (r.set) times.push(['Batış', formatTime(r.set, tz)]);
  if (r.upAtEnd && !r.set) times.push(['Şafakta', 'hâlâ gökyüzünde']);
  if (r.visibleWindow) times.push(['Görülebilir', `${formatTime(r.visibleWindow.start, tz)}–${formatTime(r.visibleWindow.end, tz)}`]);

  const tips = [];
  if (r.eyepiece) tips.push(['🔭', 'Göz merceği', r.eyepiece.text]);
  if (t.tip) tips.push(t.body ? ['💡', 'İpucu', t.tip] : ['🧭', 'Nasıl bulunur', t.tip]);
  if (r.reasons.length && r.level !== 'easy' && r.level !== 'invisible') tips.push(['⚠️', 'Dikkat', r.reasons.join(' ')]);
  if (t.see) tips.push(['👀', 'Neler görülür', t.see]);
  if (equipment.mount === 'eq-manual' && r.level !== 'invisible' && t.kind !== 'constellation') {
    tips.push(['⚙️', 'EQ-2 kundak', `Kurulumda kutup eksenini Kutup Yıldızı'na doğrult ve enlem ölçeğini ${Math.round(night.location.lat)}°'ye ayarla. `
      + 'Cismi bulup ortaladıktan sonra yalnızca sağ açıklık (RA) yavaş hareket düğmesini çevirerek görüş alanında tutabilirsin.']);
  }
  if (r.photo) tips.push(['📷', 'Fotoğraf', PHONE_PHOTO_TIP]);

  const howTab = `
    ${how}
    <div class="detail-visuals">
      <figure class="dome-wrap">
        ${skyDome(moment && r.level !== 'invisible' ? moment : null, { moon: moonThen, label: `${displayName(t)} gökyüzü konumu` })}
        <figcaption>${useNow ? 'Şu anki konum' : 'En iyi andaki konum'} · merkez = tam tepe, kenar = ufuk</figcaption>
      </figure>
      <figure class="chart-wrap">
        ${altitudeChart(r.curve, night, { best: r.best, moonCurve: t.body !== 'Moon' && moonResult ? moonResult.curve : null, now })}
        <figcaption>Gece boyunca ufuktan yükseklik · koyu bölge: tam karanlık · kesikli çizgi: Ay</figcaption>
      </figure>
    </div>
    <dl class="facts compact">${times.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    ${tips.map(([icon, title, text]) => `<div class="tip"><h4><span class="emoji" aria-hidden="true">${icon}</span> ${esc(title)}</h4><p>${esc(text)}</p></div>`).join('')}`;

  const facts = [
    ['Tür', KIND_LABELS[t.kind]],
    r.constellation && conNames[r.constellation] ? ['Takımyıldız', conNames[r.constellation]] : null,
    t.mag != null && t.kind !== 'constellation' && !r.details ? ['Parlaklık', `${formatNumber(t.mag, 1)} kadir`] : null,
    t.kind === 'double' ? ['Bileşenler', `${formatNumber(t.mag, 1)} ve ${formatNumber(t.magB, 1)} kadir, ${formatNumber(t.sep, 1)}″ ayrık`] : null,
    sizeText(t) && !r.details ? ['Görünür boyut', sizeText(t)] : null,
    t.distanceLy ? ['Uzaklık', formatLightYears(t.distanceLy)] : null,
    t.code && t.name ? ['Katalog', [t.code, t.altCode].filter(Boolean).join(' · ')] : null,
    ...liveFacts(r.details, t),
  ].filter(Boolean);

  const infoTab = `
    <p class="info-text">${esc(t.info || KIND_INFO[t.kind])}</p>
    ${t.info && KIND_INFO[t.kind] && t.kind !== 'planet' && t.kind !== 'moon' ? `<p class="info-text muted">${esc(KIND_INFO[t.kind])}</p>` : ''}
    <dl class="facts compact">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <p class="fineprint">Kadir (parlaklık): sayı küçüldükçe cisim parlaklaşır. Çıplak gözle şehirde ~4, karanlıkta ~6,5 kadire kadar görülür.</p>`;

  return `
    <header class="detail-head">
      <span class="obj-icon big kind-${t.kind}">${KIND_ICONS[t.kind] || ''}</span>
      <div>
        <h2 id="sheet-title">${esc(displayName(t))}</h2>
        <p class="obj-meta">${esc([t.name ? t.code : null, KIND_LABELS[t.kind]].filter(Boolean).join(' · '))}</p>
      </div>
      <span class="level level-${r.level}">${esc(r.levelLabel)}</span>
    </header>
    <div class="tabs" role="tablist">
      <button role="tab" class="tab${tab === 'how' ? ' active' : ''}" aria-selected="${tab === 'how'}" data-action="detail-tab" data-tab="how">Nasıl gözlemlerim</button>
      <button role="tab" class="tab${tab === 'info' ? ' active' : ''}" aria-selected="${tab === 'info'}" data-action="detail-tab" data-tab="info">Bilgi</button>
    </div>
    <div class="tab-body">${tab === 'how' ? howTab : infoTab}</div>`;
}
