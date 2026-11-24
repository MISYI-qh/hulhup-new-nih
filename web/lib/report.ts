import { API } from './api';
/** Kirim ringkasan error ke server (tanpa data pribadi) supaya penyebab crash bisa dilacak. */
export function reportErr(e: unknown) {
  try {
    const er = e as { message?: string; stack?: string }; const body = JSON.stringify({ m: er?.message ?? String(e), s: er?.stack ?? '', u: location.pathname, ua: navigator.userAgent, b: process.env.NEXT_PUBLIC_BUILD ?? '' });
    if (navigator.sendBeacon) navigator.sendBeacon(API + '/clientlog', new Blob([body], { type: 'text/plain' }));
    else fetch(API + '/clientlog', { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {}
}
