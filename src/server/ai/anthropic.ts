import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { env } from '@/server/env'
import { logger } from '@/server/logger'
import { DomainError } from '@/server/action'
import { modelFor, type AIProvider, type StructuredRequest } from './provider'

let client: Anthropic | undefined

/** Anthropic adapter: structured output via a forced tool call, validated with Zod. */
export function anthropicProvider(): AIProvider {
  client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 })
  const api = client
  return {
    id: 'anthropic',
    async generateStructured<T>(req: StructuredRequest<T>) {
      const model = modelFor(req.task)
      const inputSchema = z.toJSONSchema(req.schema, { target: 'draft-7' }) as Anthropic.Tool.InputSchema
      try {
        const res = await api.messages.create({
          model,
          max_tokens: 8000,
          system: req.system,
          tools: [{ name: req.name, description: 'Gibt das strukturierte Ergebnis zurück.', input_schema: inputSchema }],
          tool_choice: { type: 'tool', name: req.name },
          messages: [{ role: 'user', content: `<material>\n${req.input}\n</material>` }],
        })
        const block = res.content.find((b) => b.type === 'tool_use')
        if (!block || block.type !== 'tool_use') throw new Error('no tool_use block')
        const parsed = req.schema.safeParse(block.input)
        if (!parsed.success) {
          logger.warn('ai.structured_invalid', { model, issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')) })
          throw new DomainError('unavailable', 'Die AI-Antwort hatte ein ungültiges Format. Bitte erneut versuchen.')
        }
        return { data: parsed.data, model }
      } catch (e) {
        if (e instanceof DomainError) throw e
        logger.error('ai.request_failed', { model, error: e instanceof Error ? e : String(e) })
        throw new DomainError('unavailable', 'Die AI ist gerade nicht erreichbar. Bitte später erneut versuchen.')
      }
    },
  }
}
