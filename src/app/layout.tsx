import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'ReQover OS', template: '%s · ReQover OS' },
  description: 'Das Betriebssystem für Sales Recovery.',
  applicationName: 'ReQover OS',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#0d0f13',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="de" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <Toaster
          theme="dark"
          position="top-center"
          toastOptions={{ className: '!bg-surface-2 !border-line-strong !text-fg' }}
        />
      </body>
    </html>
  )
}
