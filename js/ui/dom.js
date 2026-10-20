/**
 * dom.js — Arayüz için küçük yardımcılar.
 *
 * Arayüz, çerçeve (React vb.) kullanmadan şablon metinleriyle çizilir. Dışarıdan gelen
 * her metin (şehir adları, kullanıcı girdileri) `esc()` ile kaçırılır; böylece bir şehir
 * adına gizlenmiş HTML/JS sayfada çalışamaz (XSS koruması).
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML'e güvenli metin. */
export function esc(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** document.querySelector kısayolu. */
export const $ = (selector, root = document) => root.querySelector(selector);

/** Bir kapsayıcının içeriğini HTML metniyle değiştirir. */
export function setHtml(el, html) {
  if (el) el.innerHTML = html;
}

/**
 * data-action="..." öznitelikli öğelere tıklamaları tek yerden dinler (olay delegasyonu).
 * @param {HTMLElement} root
 * @param {Record<string, (el:HTMLElement, event:Event) => void>} handlers
 */
export function delegate(root, eventName, handlers) {
  root.addEventListener(eventName, (event) => {
    const el = event.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const handler = handlers[el.dataset.action];
    if (handler) handler(el, event);
  });
}

/** Durum (good/ok/bad/none) → CSS sınıfı ve kısa sembol (renk körü dostu). */
export const STATUS_SYMBOL = { good: '✓', ok: '~', bad: '✕', none: '?' };

/** Basit "tost" bildirimi (ör. "Kopyalandı"). */
export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2600);
}
