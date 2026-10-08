import 'server-only'
import { sql } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { rawDb } from './client'
import type * as schema from './schema'
import { domainEvents } from './schema'
import type { DomainEventType } from '@/domain/events'

export type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>

export type Actor = 'human' | 'ai' | 'system'

/** Who is acting, in which tenant. Built only from a verified session. */
export interface RequestContext {
  userId: string
  organizationId: string
  claims: Record<string, unknown>
}

export interface TxOptions {
  actor?: Actor
  proposalId?: string
}

/**
 * Runs fn in a transaction as the signed-in user: role "authenticated" and the
 * user's JWT claims are set with SET LOCAL semantics, so every query is subject
 * to RLS and nothing leaks into the next request on a pooled connection.
 * app.actor / app.proposal_id feed the audit trigger.
 */
export async function withUserTx<T>(ctx: RequestContext, fn: (tx: Tx) => Promise<T>, opts: TxOptions = {}): Promise<T> {
  return rawDb().transaction(async (tx) => {
    await tx.execute(sql`select
      set_config('request.jwt.claims', ${JSON.stringify(ctx.claims)}, true),
      set_config('role', 'authenticated', true),
      set_config('app.actor', ${opts.actor ?? 'human'}, true),
      set_config('app.proposal_id', ${opts.proposalId ?? ''}, true)`)
    return fn(tx)
  })
}

/** Appends a domain event in the caller's transaction (outbox pattern). */
export async function emitEvent(
  tx: Tx,
  ctx: RequestContext,
  type: DomainEventType,
  payload: Record<string, unknown>,
  opts: TxOptions = {},
): Promise<void> {
  await tx.insert(domainEvents).values({
    organizationId: ctx.organizationId,
    type,
    payload,
    actor: opts.actor ?? 'human',
    actorId: ctx.userId,
    proposalId: opts.proposalId ?? null,
  })
}

/** Transaction with only the user's claims (no tenant yet), e.g. for onboarding. */
export async function withClaimsTx<T>(claims: Record<string, unknown>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return rawDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true),
      set_config('role', 'authenticated', true), set_config('app.actor', 'human', true)`)
    return fn(tx)
  })
}
