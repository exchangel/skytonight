/**
 * senders.js — Bildirim kanalları: ntfy (telefon push) ve e-posta (Gmail SMTP).
 */

import nodemailer from 'nodemailer';

/**
 * ntfy.sh'a JSON ile bildirim gönderir. iPhone'daki ntfy uygulaması bu kanala abone
 * olduğunda bildirim anında gelir. JSON gövdesi kullanılır çünkü HTTP başlıkları Türkçe
 * karakter ve emoji taşıyamaz.
 * @see https://docs.ntfy.sh/publish/#publish-as-json
 */
export async function sendNtfy({ server = 'https://ntfy.sh', topic, title, message, click, priority = 4 }) {
  const res = await fetch(server.replace(/\/$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title, message, click, priority, tags: ['telescope'] }),
  });
  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}: ${await res.text()}`);
}

/**
 * Gmail üzerinden e-posta göndericisi. Normal Gmail şifresi değil, "uygulama şifresi"
 * gerekir (Google hesabında 2 adımlı doğrulama açıkken oluşturulur; README'ye bak).
 */
export function createMailer({ user, pass }) {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  return {
    send: ({ to, subject, text, html }) => transport.sendMail({ from: `SkyTonight <${user}>`, to, subject, text, html }),
    close: () => transport.close(),
  };
}
