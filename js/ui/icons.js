/**
 * icons.js — Satır içi SVG ikonlar (harici ikon kütüphanesi yok, çevrimdışı çalışır).
 * Hepsi 24×24, `currentColor` ile çizilir; böylece kırmızı gece modunda otomatik kırmızılaşır.
 */

const svg = (body, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  locate: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>'),
  eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  redEye: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>'),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  telescope: svg('<path d="m3 14 13-6 2 4-13 6z"/><path d="m16 8 3-1.5 1.5 3L18 11"/><path d="M9 15.5 7 21M11 14.5l3 6.5"/>'),
  refresh: svg('<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.5L20 16"/><path d="M20 20v-4h-4"/>'),
  sunset: svg('<path d="M4 18h16M7 14a5 5 0 0 1 10 0"/><path d="M12 3v4m0 0-2-2m2 2 2-2"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
};

/** Gök cismi türlerine özel küçük simgeler. */
export const KIND_ICONS = {
  moon: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
  planet: svg('<circle cx="12" cy="12" r="5"/><path d="M3 15.5c3 2 15-3 18-7.5" />'),
  galaxy: svg('<ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-25 12 12)"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>'),
  globular: svg('<circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="4.5" stroke-dasharray="1.5 2.2"/><circle cx="12" cy="12" r="8" stroke-dasharray="1 3.2"/>'),
  open: svg('<circle cx="6" cy="8" r="1.3" fill="currentColor"/><circle cx="13" cy="5.5" r="1" fill="currentColor"/><circle cx="17.5" cy="10" r="1.4" fill="currentColor"/><circle cx="10" cy="12.5" r="1.1" fill="currentColor"/><circle cx="7" cy="17.5" r="1" fill="currentColor"/><circle cx="15" cy="17" r="1.3" fill="currentColor"/>'),
  planetary: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>'),
  nebula: svg('<path d="M7 17.5a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6-1.4A4.5 4.5 0 0 1 17 17.5z"/>'),
  snr: svg('<circle cx="12" cy="12" r="2"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>'),
  asterism: svg('<circle cx="4" cy="14" r="1.2" fill="currentColor"/><circle cx="9" cy="11" r="1.2" fill="currentColor"/><circle cx="14" cy="12.5" r="1.2" fill="currentColor"/><circle cx="20" cy="10" r="1.2" fill="currentColor"/><path d="M4 14l5-3 5 1.5 6-2.5" stroke-width="1" stroke-dasharray="1 2"/>'),
  double: svg('<circle cx="8.5" cy="12" r="3.2" fill="currentColor"/><circle cx="17" cy="12" r="2" fill="currentColor"/>'),
  star: svg('<path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z" fill="currentColor" stroke="none"/>'),
  constellation: svg('<circle cx="5" cy="17" r="1.4" fill="currentColor"/><circle cx="9.5" cy="9" r="1.4" fill="currentColor"/><circle cx="15" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="5" r="1.4" fill="currentColor"/><path d="M5 17l4.5-8L15 12l4-7" stroke-width="1.2"/>'),
};
