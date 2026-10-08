import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { env } from '@/server/env'
import { logger } from '@/server/logger'
import { DomainError } from '@/server/action'
import { modelFor, type AIProvider, type ChatMessage, type ChatRequest, type StructuredRequest } from './provider'

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
        throw failed(model, e)
      }
    },
    async chat(req: ChatRequest) {
      const model = modelFor(req.task)
      try {
        const res = await api.messages.create({
          model,
          max_tokens: 2000,
          system: req.system,
          tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: z.toJSONSchema(t.schema, { target: 'draft-7' }) as Anthropic.Tool.InputSchema })),
          messages: toAnthropic(req.messages),
        })
        const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
        const toolCalls = res.content.flatMap((b) => (b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input }] : []))
        return { text, toolCalls, model }
      } catch (e) {
        throw failed(model, e)
      }
    },
  }
}

function failed(model: string, e: unknown) {
  logger.error('ai.request_failed', { model, error: e instanceof Error ? e : String(e) })
  return new DomainError('unavailable', 'Die AI ist gerade nicht erreichbar. Bitte später erneut versuchen.')
}

function toAnthropic(messages: ChatMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user', content: m.text }
    if (m.role === 'tool') {
      return { role: 'user', content: m.results.map((r) => ({ type: 'tool_result' as const, tool_use_id: r.id, content: r.content })) }
    }
    const content: Anthropic.ContentBlockParam[] = []
    if (m.text) content.push({ type: 'text', text: m.text })
    for (const c of m.toolCalls) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input })
    return { role: 'assistant', content }
  })
}
