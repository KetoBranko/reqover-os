const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}
