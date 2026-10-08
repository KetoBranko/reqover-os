// Central locale formatting. All user-visible dates, numbers and money go
// through here so locale/timezone can change in one place.
export const LOCALE = 'de-DE'
export const TIME_ZONE = 'Europe/Berlin'

const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
const longDateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', hour12: false })
const moneyFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' })
const moneyShortFmt = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const numberFmt = new Intl.NumberFormat(LOCALE)

/** A calendar day (YYYY-MM-DD) is shown as 08.10.2026 without timezone shifts. */
export function formatDay(isoDay: string): string {
  const [y, m, d] = isoDay.split('-')
  return `${d}.${m}.${y}`
}

export const formatDate = (d: Date) => dateFmt.format(d)
export const formatDateTime = (d: Date) => dateTimeFmt.format(d)
export const formatTime = (d: Date) => timeFmt.format(d)
export const formatLongDate = (d: Date) => longDateFmt.format(d)
export const formatNumber = (n: number) => numberFmt.format(n)
/** 250000 → "2.500,00 €" */
export const formatMoney = (cents: number) => moneyFmt.format(cents / 100)
/** 250000 → "2.500 €" */
export const formatMoneyShort = (cents: number) => moneyShortFmt.format(cents / 100)

/** Today's calendar day in Berlin as YYYY-MM-DD. */
export const berlinDay = (d: Date = new Date()) => isoDayFmt.format(d)
export const berlinHour = (d: Date = new Date()) => Number(hourFmt.format(d))

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function addDays(isoDay: string, days: number): string {
  const t = Date.parse(`${isoDay}T00:00:00Z`) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** "heute", "morgen", "gestern", "in 3 Tagen", "vor 2 Tagen", or the date. */
export function relativeDay(isoDay: string, today: string): string {
  const diff = daysBetween(today, isoDay)
  if (diff === 0) return 'heute'
  if (diff === 1) return 'morgen'
  if (diff === -1) return 'gestern'
  if (diff > 1 && diff <= 6) return `in ${diff} Tagen`
  if (diff < -1 && diff >= -14) return `vor ${-diff} Tagen`
  return formatDay(isoDay)
}

/** Parses German money input like "2.500", "2.500,50 €", "2500" → cents. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}
