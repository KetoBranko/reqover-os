import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { companies, contacts } from '@/server/db/schema'
import { rawDb } from '@/server/db/client'
import { withUserTx, type RequestContext, type TxOptions } from '@/server/db/context'
import { companyInput, contactInput, taskInput, type WebsiteInquiryInput } from '@/domain/schemas'
import { berlinDay } from '@/lib/format'
import { createCompany } from './companies'
import { createContact } from './contacts'
import { createTask } from './tasks'
import { recordActivity } from './activities'

export const INQUIRY_SOURCE = 'Website-Anfrage'

/**
 * The organization that receives landing-page inquiries (LEAD_ORGANIZATION_ID,
 * or the only organization there is) and its owner, resolved by
 * private.inquiry_target without a user session. The inquiry is then written as
 * that owner, so every write goes through RLS like any other request.
 */
async function inquiryContext(): Promise<RequestContext | null> {
  const target = process.env.LEAD_ORGANIZATION_ID || null
  const rows = await rawDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', '{}', true), set_config('role', 'authenticated', true)`)
    return tx.execute<{ organization_id: string; owner_id: string }>(
      sql`select organization_id, owner_id from private.inquiry_target(${target}::uuid)`,
    )
  })
  const row = rows[0]
  if (!row) return null
  return { userId: row.owner_id, organizationId: row.organization_id, claims: { sub: row.owner_id, role: 'authenticated' } }
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: '', lastName: parts[0]! }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1)! }
}

/**
 * Files a contact-form inquiry in the CRM: finds or creates the company and the
 * contact, logs the message on the timeline and creates a high-priority task due
 * today. Returns false when no receiving organization is configured.
 */
export async function receiveWebsiteInquiry(input: WebsiteInquiryInput): Promise<boolean> {
  const ctx = await inquiryContext()
  if (!ctx) return false
  const opts: TxOptions = { actor: 'system' }

  await withUserTx(
    ctx,
    async (tx) => {
      const [existingCompany] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.organizationId, ctx.organizationId), sql`lower(${companies.name}) = lower(${input.company})`))
        .limit(1)
      const companyId =
        existingCompany?.id ?? (await createCompany(tx, ctx, companyInput.parse({ name: input.company, source: INQUIRY_SOURCE }), opts)).id

      const [existingContact] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.organizationId, ctx.organizationId), sql`lower(${contacts.email}) = lower(${input.email})`))
        .limit(1)
      const contactId =
        existingContact?.id ??
        (
          await createContact(
            tx,
            ctx,
            contactInput.parse({ companyId, ...splitName(input.name), email: input.email, phone: input.phone, notes: `Quelle: ${INQUIRY_SOURCE}` }),
            opts,
          )
        ).id

      const lines = [
        `Name: ${input.name}`,
        `Unternehmen: ${input.company}`,
        `E-Mail: ${input.email}`,
        input.phone && `Telefon: ${input.phone}`,
        input.topic && `Thema: ${input.topic}`,
        input.message && `\nNachricht:\n${input.message}`,
        input.calculator && `\nAngaben aus dem Rechner:\n${input.calculator}`,
      ].filter(Boolean)
      const body = lines.join('\n')

      await recordActivity(
        tx,
        ctx,
        {
          type: 'email',
          title: 'Anfrage über die Website',
          body,
          companyId,
          contactId,
          metadata: { source: 'website_inquiry', page: input.source ?? null, topic: input.topic ?? null },
        },
        opts,
      )
      await createTask(
        tx,
        ctx,
        taskInput.parse({
          title: `Website-Anfrage beantworten: ${input.name} (${input.company})`.slice(0, 300),
          description: body.slice(0, 5000),
          dueDate: berlinDay(),
          priority: 'high',
          companyId,
          contactId,
        }),
        opts,
      )
    },
    opts,
  )
  return true
}
