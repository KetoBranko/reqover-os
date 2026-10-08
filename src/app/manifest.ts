import type { MetadataRoute } from 'next'

// Installable app (home screen / dock). No service worker: ReQover needs the
// server for every view, so there is no pretend offline mode.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ReQover OS',
    short_name: 'ReQover',
    description: 'Das Betriebssystem für Sales Recovery.',
    lang: 'de-DE',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0d0f13',
    theme_color: '#0d0f13',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Heute', url: '/', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Aufgaben', url: '/aufgaben', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'ReQover Assistent', url: '/assistent', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Discovery starten', url: '/discovery?neu=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
