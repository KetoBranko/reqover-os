import { z } from 'zod'

// Organization settings live in organizations.settings (jsonb), versioned and
// validated here. Unknown/invalid content falls back to safe defaults.
export const pilotOfferSchema = z.object({
  maxCases: z.number().int().min(1).max(100_000),
  durationWeeks: z.number().int().min(1).max(104),
  priceMinCents: z.number().int().min(0),
  priceMaxCents: z.number().int().min(0),
})

export const organizationSettingsSchema = z.object({
  version: z.literal(1),
  aiLevel: z.number().int().min(0).max(4),
  pilotOffer: pilotOfferSchema,
})

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>
export type PilotOffer = z.infer<typeof pilotOfferSchema>

export const DEFAULT_SETTINGS: OrganizationSettings = {
  version: 1,
  aiLevel: 2,
  pilotOffer: { maxCases: 100, durationWeeks: 6, priceMinCents: 250_000, priceMaxCents: 300_000 },
}

/** V1 never lets AI act without confirmation, whatever is stored. */
export const MAX_AI_LEVEL_V1 = 3

export function parseOrganizationSettings(raw: unknown): OrganizationSettings {
  const parsed = organizationSettingsSchema.safeParse(raw)
  if (!parsed.success) return DEFAULT_SETTINGS
  return { ...parsed.data, aiLevel: Math.min(parsed.data.aiLevel, MAX_AI_LEVEL_V1) }
}

/** Reads a stored pilot-offer snapshot; null when absent or malformed. */
export function parsePilotOffer(raw: unknown): PilotOffer | null {
  const parsed = pilotOfferSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
