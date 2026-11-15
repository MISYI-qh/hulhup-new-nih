/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  async rewrites() { return [{ source: '/@:username', destination: '/u/:username' }, { source: '/@:username/:path*', destination: '/u/:username/:path*' }]; },
  async redirects() { return [{ source: '/u/:username/:path*', destination: '/@:username/:path*', permanent: true }]; },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    ] }];
  },
};
