/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['10.0.0.206'],

  // Alias Capacitor-only plugins to stubs for web/Vercel builds.
  // The real plugins only run inside native Capacitor iOS/Android apps.
  experimental: {
    turbo: {
      resolveAlias: {
        '@capacitor-community/contacts': './src/lib/stubs/contacts.ts',
      },
    },
  },
  webpack(config) {
    config.resolve.alias['@capacitor-community/contacts'] =
      new URL('./src/lib/stubs/contacts.ts', import.meta.url).pathname
    return config
  },

  images: {
    unoptimized: true,
  },

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig