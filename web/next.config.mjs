const API = process.env.NEXT_PUBLIC_API_URL || 'https://hulhup-api.vercel.app';
// CSP: skrip hanya dari situs sendiri (inline dibutuhkan Next untuk hidrasi); gambar lewat proxy API; media tautan boleh https.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${API}`,
  "media-src 'self' blob: data: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${API}`,
  "frame-src https://www.youtube-nocookie.com https://www.instagram.com https://www.tiktok.com https://player.vimeo.com https://open.spotify.com https://w.soundcloud.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

// satu ID untuk tiap build: dipakai klien untuk tahu ada versi baru lalu menyegarkan diri
process.env.HH_BUILD ||= process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || String(Date.now());

/** @type {import('next').NextConfig} */
export default {
  generateBuildId: async () => process.env.HH_BUILD,
  env: { NEXT_PUBLIC_BUILD: process.env.HH_BUILD },
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  async rewrites() { return [
    { source: '/hulhup.apk', destination: '/api/dl?f=hulhup.apk' },
    { source: '/hulhup-32.apk', destination: '/api/dl?f=hulhup.apk' },
    { source: '/version.json', destination: '/api/dl?f=version.json' },
    { source: '/@:username', destination: '/u/:username' }, { source: '/@:username/:path*', destination: '/u/:username/:path*' }]; },
  async redirects() { return [{ source: '/u/:username/:path*', destination: '/@:username/:path*', permanent: true }]; },
  async headers() {
    return [
      { source: '/_f/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }, { key: 'Cache-Control', value: 'no-store' }] },
      { source: '/_f/:path*.apk', headers: [{ key: 'Content-Type', value: 'application/vnd.android.package-archive' }, { key: 'Content-Disposition', value: 'attachment; filename=hulhup.apk' }] },
      { source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'Content-Security-Policy', value: CSP },
    ] }];
  },
};
