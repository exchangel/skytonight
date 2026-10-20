/**
 * equipment.js — Gözlem ekipmanı ön ayarları ve optik hesaplar.
 *
 * Temel formüller:
 *  - Büyütme            = teleskop odak uzunluğu / göz merceği odak uzunluğu
 *  - Gerçek görüş alanı = mercek görünür alanı (AFOV) / büyütme
 *  - Çıkış göz bebeği   = açıklık / büyütme (mm)
 *  - Dawes limiti       = 116 / açıklık(mm)  [yay saniyesi] → ayırabileceği en yakın çift yıldız
 *  - Maks. faydalı büyütme ≈ 2 × açıklık(mm)  (pratikte atmosfer çoğu gece 150×'i sınırlar)
 *  - Limit kadir kazancı ≈ 5·log10(D / 7mm)  (göz bebeği ~7 mm'ye göre topladığı ışık)
 */

/** Hazır ekipmanlar. `omegon130` kullanıcının kendi teleskobu ve varsayılandır. */
export const EQUIPMENT_PRESETS = [
  {
    id: 'eye',
    name: 'Çıplak göz',
    short: 'Göz',
    kind: 'eye',
    aperture: 7,
  },
  {
    id: 'bino10x50',
    name: 'Dürbün 10×50',
    short: '10×50',
    kind: 'binocular',
    aperture: 50,
    magnification: 10,
    fov: 6.5,
  },
  {
    id: 'refractor80',
    name: '80 mm refraktör (80/600)',
    short: '80 mm',
    kind: 'refractor',
    aperture: 80,
    focalLength: 600,
    eyepieces: [25, 10],
  },
  {
    id: 'omegon130',
    name: 'Omegon N 130/920 EQ-2',
    short: '130/920',
    kind: 'newton',
    aperture: 130,
    focalLength: 920,
    eyepieces: [25, 10],
    mount: 'eq-manual',
  },
  {
    id: 'dob200',
    name: '200 mm Dobson (200/1200)',
    short: '200 mm',
    kind: 'dobson',
    aperture: 200,
    focalLength: 1200,
    eyepieces: [25, 10],
  },
];

export const DEFAULT_EQUIPMENT_ID = 'omegon130';

/** Set merceklerinin çoğu Plössl/Kellner türüdür: görünür alan ~52°. */
export const EYEPIECE_AFOV = 52;

/**
 * Kimliğe göre ekipmanı bulur. 'custom' için kullanıcı ayarlarındaki değerler kullanılır.
 * @param {string} id
 * @param {{aperture:number, focalLength:number, eyepieces:number[]}} [custom]
 */
export function resolveEquipment(id, custom) {
  if (id === 'custom' && custom && custom.aperture > 0) {
    return {
      id: 'custom',
      name: `Özel teleskop (${custom.aperture}/${custom.focalLength || '?'})`,
      short: `${custom.aperture} mm`,
      kind: 'telescope',
      aperture: Number(custom.aperture),
      focalLength: Number(custom.focalLength) || Number(custom.aperture) * 7,
      eyepieces: (custom.eyepieces && custom.eyepieces.length ? custom.eyepieces : [25, 10]).map(Number),
    };
  }
  return EQUIPMENT_PRESETS.find((e) => e.id === id) || EQUIPMENT_PRESETS.find((e) => e.id === DEFAULT_EQUIPMENT_ID);
}

export function isTelescope(eq) {
  return eq.kind !== 'eye' && eq.kind !== 'binocular';
}

/**
 * Çıplak göze göre kaç kadir daha sönük yıldız gösterebilir?
 * Ayna/mercek kayıpları ve Newton'daki ikincil ayna gölgesi için küçük bir düşüş uygulanır.
 */
export function limitingMagnitudeGain(eq) {
  if (eq.kind === 'eye') return 0;
  const loss = eq.kind === 'binocular' ? 0.3 : 0.5;
  return 5 * Math.log10(eq.aperture / 7) - loss;
}

/**
 * Ayırma gücü (yay saniyesi). Çıplak göz için ~60" (keskin göz). Dürbünde büyütme düşük
 * olduğundan pratik sınır göz/büyütme ile belirlenir.
 */
export function resolutionLimitArcsec(eq) {
  if (eq.kind === 'eye') return 60;
  if (eq.kind === 'binocular') return Math.max(116 / eq.aperture, 60 / (eq.magnification || 10));
  return 116 / eq.aperture;
}

export function maxUsefulMagnification(eq) {
  return isTelescope(eq) ? 2 * eq.aperture : (eq.magnification || 1);
}

/**
 * Teleskobun her göz merceğiyle verdiği görüntü.
 * @returns {Array<{eyepiece:number, magnification:number, fovDeg:number, exitPupil:number}>}
 *          düşük büyütmeden yükseğe sıralı
 */
export function eyepieceViews(eq) {
  if (!isTelescope(eq)) return [];
  return eq.eyepieces
    .map((ep) => {
      const magnification = eq.focalLength / ep;
      return {
        eyepiece: ep,
        magnification,
        fovDeg: EYEPIECE_AFOV / magnification,
        exitPupil: eq.aperture / magnification,
      };
    })
    .sort((a, b) => a.magnification - b.magnification);
}

const HIGH_POWER_KINDS = new Set(['planet', 'moon', 'double', 'planetary']);

/**
 * Cisim için göz merceği önerisi metni üretir.
 * @param {object} eq ekipman
 * @param {{kind:string, size?:number[]}} target  size: [büyük eksen, küçük eksen] yay dakikası
 * @returns {{text:string, fits:boolean}|null}
 */
export function suggestEyepiece(eq, target) {
  if (eq.kind === 'eye') return null;
  const sizeDeg = target.size && target.size[0] ? target.size[0] / 60 : 0;

  if (eq.kind === 'binocular') {
    const fits = sizeDeg < eq.fov * 0.9;
    return {
      fits,
      text: fits
        ? `${eq.magnification}× büyütme, ${eq.fov}° görüş alanı. Dürbünü bir yere dayayarak titremeyi azalt.`
        : `Cisim dürbünün ${eq.fov}° alanından bile büyük; çıplak gözle bütününe, dürbünle parçalarına bak.`,
    };
  }

  const views = eyepieceViews(eq);
  if (!views.length) return null;
  const low = views[0];
  const high = views[views.length - 1];
  const fmt = (v) => `${v.eyepiece} mm (${Math.round(v.magnification)}×)`;

  if (sizeDeg > low.fovDeg * 0.9) {
    return {
      fits: false,
      text: `Cisim ${sizeDeg.toFixed(1)}°, en geniş alan ise ${low.fovDeg.toFixed(1)}°: görüş alanına sığmaz. `
        + `${fmt(low)} ile gezin; bütününü görmek için dürbün daha iyi.`,
    };
  }

  if (HIGH_POWER_KINDS.has(target.kind) || (sizeDeg > 0 && sizeDeg < 4 / 60)) {
    const limit = maxUsefulMagnification(eq);
    const barlow = high.magnification * 2 <= limit
      ? ` 2× Barlow varsa ${Math.round(high.magnification * 2)}× denenebilir (yalnızca çok sakin havada).`
      : '';
    return {
      fits: true,
      text: `Önce ${fmt(low)} ile bul ve ortala, sonra ${fmt(high)} merceğe geç.${barlow}`,
    };
  }

  return {
    fits: true,
    text: `${fmt(low)} en iyisi: geniş alan ve parlak görüntü. Küçük ayrıntı için ${fmt(high)} dene.`,
  };
}
