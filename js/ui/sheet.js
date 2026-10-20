/**
 * sheet.js — Alttan açılan panel (mobilde "bottom sheet", masaüstünde ortada pencere).
 * Aynı anda tek panel açık olur. Escape tuşu ve arka plana dokunmak paneli kapatır.
 */

import { ICONS } from './icons.js';

let current = null;

function root() {
  return document.getElementById('sheet-root');
}

function onKey(event) {
  if (event.key === 'Escape') closeSheet();
}

/**
 * Paneli açar ve içerik kapsayıcısını döndürür (olay dinleyicileri buna bağlanır).
 * @param {string} html
 * @param {{className?:string, onClose?:() => void}} [options]
 * @returns {HTMLElement} .sheet-body öğesi
 */
export function openSheet(html, { className = '', onClose = null } = {}) {
  // Önceki panel kapanırken onClose'u da çalışır (ör. açık cisim detayının durumu temizlenir).
  closeSheet({ restoreFocus: false });
  const r = root();
  r.innerHTML = `
    <div class="sheet-backdrop" data-sheet-close></div>
    <div class="sheet ${className}" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <div class="sheet-grip" aria-hidden="true"></div>
      <button class="icon-btn sheet-close" data-sheet-close aria-label="Kapat">${ICONS.close}</button>
      <div class="sheet-body">${html}</div>
    </div>`;
  r.classList.add('open');
  document.body.classList.add('sheet-open');
  current = { onClose, lastFocus: document.activeElement };
  r.querySelectorAll('[data-sheet-close]').forEach((el) => el.addEventListener('click', () => closeSheet()));
  document.addEventListener('keydown', onKey);
  r.querySelector('.sheet').focus({ preventScroll: true });
  return r.querySelector('.sheet-body');
}

/** Açık panelin içeriğini değiştirir (kaydırma konumunu korur). */
export function updateSheet(html) {
  const body = root().querySelector('.sheet-body');
  if (body) body.innerHTML = html;
}

export function isSheetOpen() {
  return current !== null;
}

export function closeSheet({ restoreFocus = true } = {}) {
  if (!current) return;
  const { onClose, lastFocus } = current;
  current = null;
  const r = root();
  r.classList.remove('open');
  r.innerHTML = '';
  document.body.classList.remove('sheet-open');
  document.removeEventListener('keydown', onKey);
  if (restoreFocus && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  if (onClose) onClose();
}
