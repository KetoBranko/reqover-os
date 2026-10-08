// Renders the PWA/app icons from the SVG sources in public/icons. Run after changing them: node scripts/dev/make-icons.mjs
import sharp from 'sharp'
const out = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon.svg', 'apple-touch-icon.png', 180],
  ['maskable.svg', 'maskable-512.png', 512],
]
for (const [src, file, size] of out) {
  await sharp(`public/icons/${src}`, { density: 300 }).resize(size, size).png().toFile(`public/icons/${file}`)
  console.log(file)
}
