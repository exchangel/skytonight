/**
 * events.js — Yaklaşan gökyüzü olayları.
 *
 *  • Ay evreleri (yeni ay, ilk dördün, dolunay)
 *  • Meteor yağmurlarının zirve geceleri (+ o gece Ay ne kadar rahatsız edecek?)
 *  • Ay ve Güneş tutulmaları (senin konumundan görünüp görünmeyeceği dahil)
 *  • Gezegenlerin karşı konumu (yılın en parlak/en büyük hâli)
 *  • Merkür ve Venüs'ün en büyük uzanımı (Güneş'ten en uzak, görmesi en kolay an)
 *  • Kavuşumlar: Ay ile gezegenlerin ya da gezegenlerin birbirine yaklaşması
 *
 * Hepsi astronomy-engine ile hesaplanır; internet gerektirmez.
 */

import { Astronomy, BODY_NAMES_TR, makeObserver, bodyPosition, moonInfo, skyFrame, fixedPosition, bodySeparation } from './astro.js';
import { compassPoint } from './directions.js';
import { addDaysToKey, formatTime, nightNoon, parseDateKey, zonedTimeToUtc, formatNumber } from './format.js';

const DAY = 86400e3;

/**
 * @typedef {object} SkyEvent
 * @property {string} id
 * @property {string} type 'moon' | 'meteor' | 'eclipse' | 'opposition' | 'elongation' | 'conjunction'
 * @property {Date} time
 * @property {string} title
 * @property {string} text
 * @property {1|2|3} importance 3 = kaçırma!
 * @property {string} icon
 * @property {boolean|null} visible senin konumundan görülebilir mi (bilinmiyorsa null)
 */

/**
 * @param {object} p
 * @param {{lat:number, lon:number, elevation?:number}} p.location
 * @param {string} p.timeZone
 * @param {string} p.startKey bugünün gece anahtarı
 * @param {number} [p.days=60] ayrıntılı olaylar için ufuk (gün)
 * @param {number} [p.horizonDays=400] tutulma/karşı konum gibi büyük olaylar için ufuk
 * @param {Array<object>} p.meteorShowers data/meteor-showers.json
 * @returns {SkyEvent[]} tarihe göre sıralı
 */
export function upcomingEvents({ location, timeZone, startKey, days = 60, horizonDays = 400, meteorShowers = [] }) {
  const observer = makeObserver(location);
  const start = nightNoon(startKey, timeZone);
  const end = new Date(start.getTime() + days * DAY);
  const horizon = new Date(start.getTime() + horizonDays * DAY);
  const ctx = { observer, timeZone, start, end, horizon, startKey, days };

  const events = [
    ...moonPhaseEvents(ctx),
    ...meteorEvents(ctx, meteorShowers),
    ...eclipseEvents(ctx),
    ...oppositionEvents(ctx),
    ...elongationEvents(ctx),
    ...conjunctionEvents(ctx),
  ];
  return events.sort((a, b) => a.time - b.time);
}

function moonPhaseEvents({ start, end }) {
  const out = [];
  const info = {
    0: { title: 'Yeni ay', icon: '🌑', text: 'Ay ışığı yok: galaksi ve bulutsular için ayın en karanlık geceleri başlıyor.' },
    1: { title: 'İlk dördün', icon: '🌓', text: 'Ay\'ın yarısı aydınlık: gölge sınırındaki kraterler ve dağlar teleskopta en etkileyici hâlinde.' },
    2: { title: 'Dolunay', icon: '🌕', text: 'Ay en parlak hâlinde: sönük cisimler için kötü dönem. Ay\'ın kendisi düz ve parlak görünür (göz yorar, Ay filtresi işe yarar).' },
  };
  let mq = Astronomy.SearchMoonQuarter(start);
  while (mq.time.date < end) {
    const i = info[mq.quarter];
    if (i) {
      out.push({
        id: `moon-${mq.quarter}-${mq.time.date.toISOString().slice(0, 10)}`,
        type: 'moon', time: mq.time.date, importance: 1, visible: null, ...i,
      });
    }
    mq = Astronomy.NextMoonQuarter(mq);
  }
  return out;
}

function meteorEvents({ observer, timeZone, start, end }, showers) {
  const out = [];
  const years = new Set([start.getUTCFullYear(), end.getUTCFullYear()]);
  for (const shower of showers) {
    for (const year of years) {
      const [month, day] = shower.peakNight.split('-').map(Number);
      // Zirve gecesi saat 22:00 (yerel) — olay listesinde bu ana yerleştirilir.
      const time = zonedTimeToUtc({ year, month, day, hour: 22 }, timeZone);
      if (time < start || time > end) continue;

      // Meteorlar en çok sabaha karşı görülür (radyant yükselir, Dünya'nın "ön yüzü").
      const dawnish = zonedTimeToUtc({ ...parseDateKey(addDaysToKey(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, 1)), hour: 4 }, timeZone);
      const radiant = fixedPosition(skyFrame(dawnish, observer), shower.ra, shower.dec);
      const moon = moonInfo(time);
      const moonText = moon.illumination < 0.3
        ? `Ay ışığı az (%${Math.round(moon.illumination * 100)}): koşullar iyi.`
        : moon.illumination < 0.7
          ? `Ay %${Math.round(moon.illumination * 100)} dolu: sönük meteorların bir kısmını bastırır.`
          : `Parlak Ay (%${Math.round(moon.illumination * 100)}) sönük meteorların çoğunu bastıracak.`;

      out.push({
        id: `meteor-${shower.id}-${year}`,
        type: 'meteor',
        time,
        icon: '☄️',
        importance: shower.zhr >= 50 ? 3 : shower.zhr >= 15 ? 2 : 1,
        visible: radiant.alt > 10,
        title: `${shower.name} meteor yağmuru zirvesi`,
        text: `İdeal karanlıkta saatte ~${shower.zhr} meteor (şehirde çok daha az). ${moonText} `
          + `En iyi saatler gece yarısından sonra; radyant (meteorların çıktığı nokta) sabaha karşı ${compassPoint(radiant.az).name.toLowerCase()} yönünde. `
          + 'Teleskop gerekmez: uzan, gökyüzünün geniş bir bölümüne bak, gözünün karanlığa alışması için 20 dk ver.',
      });
    }
  }
  return out;
}

function eclipseEvents({ observer, timeZone, start }) {
  const out = [];

  // Ay tutulması: Ay ufkun üstündeyse herkes görür, filtre gerekmez.
  const lunar = Astronomy.SearchLunarEclipse(start);
  if (lunar.peak.date - start < 400 * DAY) {
    const alt = bodyPosition('Moon', lunar.peak.date, observer).alt;
    const kindTr = { penumbral: 'Yarı gölge Ay tutulması', partial: 'Parçalı Ay tutulması', total: 'Tam Ay tutulması' }[lunar.kind];
    const totalMin = Math.round(lunar.sd_total * 2);
    out.push({
      id: `lunar-${lunar.peak.date.toISOString().slice(0, 10)}`,
      type: 'eclipse',
      time: lunar.peak.date,
      icon: '🌘',
      importance: lunar.kind === 'total' ? 3 : lunar.kind === 'partial' ? 2 : 1,
      visible: alt > 0,
      title: kindTr,
      text: `Zirve ${formatTime(lunar.peak.date, timeZone)}. `
        + (alt > 0 ? 'Senin konumundan görülebilir. ' : 'Bu sırada Ay ufkun altında: buradan görülemez. ')
        + (lunar.kind === 'total' ? `Tam evre ~${totalMin} dk sürer; Ay bakır kırmızısına döner. ` : '')
        + (lunar.kind === 'penumbral' ? 'Yarı gölge tutulmaları çok hafif bir kararma olarak fark edilir. ' : '')
        + 'Ay tutulmasına çıplak gözle güvenle bakılabilir.',
    });
  }

  // Güneş tutulması: yalnızca bu konumdan görülebilecek olanlar aranır.
  const solar = Astronomy.SearchLocalSolarEclipse(start, observer);
  if (solar.peak.time.date - start < 3 * 365 * DAY) {
    const kindTr = { partial: 'Parçalı Güneş tutulması', annular: 'Halkalı Güneş tutulması', total: 'Tam Güneş tutulması' }[solar.kind];
    out.push({
      id: `solar-${solar.peak.time.date.toISOString().slice(0, 10)}`,
      type: 'eclipse',
      time: solar.peak.time.date,
      icon: '🌒',
      importance: solar.obscuration > 0.3 ? 3 : 2,
      visible: solar.peak.altitude > 0,
      title: `${kindTr} (buradan görünür)`,
      text: `Güneş'in ~%${Math.round(solar.obscuration * 100)} kadarı örtülecek. `
        + `Başlangıç ${formatTime(solar.partial_begin.time.date, timeZone)}, zirve ${formatTime(solar.peak.time.date, timeZone)}, bitiş ${formatTime(solar.partial_end.time.date, timeZone)}. `
        + '⚠️ Güneş\'e ASLA filtresiz teleskop, dürbün ya da çıplak gözle bakma: kalıcı göz hasarı yapar. '
        + 'Yalnızca ISO 12312-2 sertifikalı tutulma gözlüğü veya teleskobun ÖNÜNE takılan sertifikalı güneş filtresi kullan.',
    });
  }
  return out;
}

function oppositionEvents({ start, horizon }) {
  const out = [];
  const importance = { Mars: 3, Jupiter: 2, Saturn: 2, Uranus: 1, Neptune: 1 };
  for (const body of Object.keys(importance)) {
    // 30 gün geriden başla: yeni geçmiş bir karşı konum hâlâ "en iyi dönem" demektir.
    const t = Astronomy.SearchRelativeLongitude(body, 0, new Date(start.getTime() - 30 * DAY)).date;
    if (t > horizon) continue;
    const name = BODY_NAMES_TR[body];
    const past = t < start;
    if (past && importance[body] < 2) continue; // Uranüs/Neptün için geçmiş karşı konum listeyi kalabalıklaştırmasın
    out.push({
      id: `opp-${body}-${t.toISOString().slice(0, 10)}`,
      type: 'opposition',
      time: t,
      icon: '🪐',
      importance: importance[body],
      visible: true,
      title: past ? `${name} yakın zamanda karşı konumdaydı` : `${name} karşı konumda`,
      text: `${name} Güneş'in tam karşısında: bütün gece gökyüzünde, yılın en parlak ve en büyük hâlinde. `
        + (past ? 'Önümüzdeki haftalar hâlâ en iyi gözlem dönemi.' : 'Bu tarihin ±1 ay çevresi gözlem için en iyi dönem.'),
    });
  }
  return out;
}

function elongationEvents({ start, end, horizon }) {
  const out = [];
  for (const body of ['Mercury', 'Venus']) {
    const limit = body === 'Venus' ? horizon : end;
    let e = Astronomy.SearchMaxElongation(body, start);
    while (e.time.date < limit) {
      const name = BODY_NAMES_TR[body];
      const evening = e.visibility === 'evening';
      out.push({
        id: `elong-${body}-${e.time.date.toISOString().slice(0, 10)}`,
        type: 'elongation',
        time: e.time.date,
        icon: evening ? '🌆' : '🌅',
        importance: body === 'Venus' ? 2 : 1,
        visible: true,
        title: `${name} en büyük ${evening ? 'akşam' : 'sabah'} uzanımında`,
        text: `${name} Güneş'ten en uzak konumunda (${Math.round(e.elongation)}°): `
          + (evening ? 'gün batımından sonra batı ufkunun üstünde' : 'gün doğumundan önce doğu ufkunun üstünde')
          + ' görmek için en iyi zaman.'
          + (body === 'Venus' ? ' Teleskopla bakınca Ay gibi evre (yarım Venüs) görülür.' : ' Ufka yakın olduğu için önü açık bir yer seç.'),
      });
      if (body === 'Venus') break; // Venüs için yalnızca sıradaki yeterli
      e = Astronomy.SearchMaxElongation(body, new Date(e.time.date.getTime() + DAY));
    }
  }
  return out;
}

/**
 * Kavuşumlar: her akşam (gün batımı +1 sa) ve sabah (gün doğumu −1 sa) bakılır;
 * iki cisim de ufkun 5° üstündeyse ve yeterince yakınsa aday olur. Ardışık günlerdeki
 * adaylardan en yakın olanı olay olarak raporlanır.
 */
function conjunctionEvents({ observer, timeZone, startKey, days }) {
  const MOON_PAIRS = ['Venus', 'Mars', 'Jupiter', 'Saturn'].map((p) => ['Moon', p, 5]);
  const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const PLANET_PAIRS = [];
  for (let i = 0; i < PLANETS.length; i++) {
    for (let j = i + 1; j < PLANETS.length; j++) PLANET_PAIRS.push([PLANETS[i], PLANETS[j], 3]);
  }
  const pairs = [...MOON_PAIRS, ...PLANET_PAIRS];
  const candidates = new Map();

  for (let d = 0; d < days; d++) {
    const key = addDaysToKey(startKey, d);
    const noon = nightNoon(key, timeZone);
    const sunset = Astronomy.SearchRiseSet('Sun', observer, -1, noon, 1);
    if (!sunset) continue;
    const sunrise = Astronomy.SearchRiseSet('Sun', observer, +1, sunset, 1);
    const moments = [{ time: new Date(sunset.date.getTime() + 3600e3), evening: true }];
    if (sunrise) moments.push({ time: new Date(sunrise.date.getTime() - 3600e3), evening: false });

    for (const { time, evening } of moments) {
      const pos = {};
      const at = (b) => (pos[b] ??= bodyPosition(b, time, observer));
      for (const [a, b, limit] of pairs) {
        if (at(a).alt < 5 || at(b).alt < 5) continue;
        const sep = bodySeparation(a, b, time);
        if (sep > limit) continue;
        const k = `${a}-${b}`;
        if (!candidates.has(k)) candidates.set(k, []);
        candidates.get(k).push({ a, b, time, sep, evening, az: (at(a).az + at(b).az) / 2 });
      }
    }
  }

  const out = [];
  for (const list of candidates.values()) {
    // Birbirine 3 günden yakın adayları grupla, her gruptan en yakın anı al.
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const best = group.reduce((m, c) => (c.sep < m.sep ? c : m));
      out.push(conjunctionEvent(best, timeZone));
      group = [];
    };
    for (const c of list) {
      if (group.length && c.time - group[group.length - 1].time > 3 * DAY) flush();
      group.push(c);
    }
    flush();
  }
  return out;
}

function conjunctionEvent(c, timeZone) {
  const a = BODY_NAMES_TR[c.a];
  const b = BODY_NAMES_TR[c.b];
  const close = c.sep < 1;
  return {
    id: `conj-${c.a}-${c.b}-${c.time.toISOString().slice(0, 10)}`,
    type: 'conjunction',
    time: c.time,
    icon: c.a === 'Moon' ? '🌙' : '✨',
    importance: close ? 3 : c.sep < 2 ? 2 : 1,
    visible: true,
    title: `${a} ve ${b} yan yana`,
    text: `Aralarında ${formatNumber(c.sep, 1)}° (kol boyu serçe parmak ≈ 1°). `
      + `${c.evening ? 'Akşam' : 'Sabaha karşı'} ${formatTime(c.time, timeZone)} civarı ${compassPoint(c.az).name.toLowerCase()} yönünde. `
      + (close && c.a !== 'Moon' ? 'Teleskobun düşük büyütmesinde ikisi aynı görüş alanına sığabilir!' : 'Çıplak gözle ve dürbünle güzel bir manzara.'),
  };
}
