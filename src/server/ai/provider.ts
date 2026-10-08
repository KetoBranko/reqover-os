import 'server-only'
import type { z } from 'zod'
import { env } from '@/server/env'
import { DomainError } from '@/server/action'

/** What the AI is used for; each task maps to a model via configuration. */
export type AITask = 'discovery_extraction' | 'assistant'

export interface StructuredRequest<T> {
  task: AITask
  system: string
  /** User-supplied material (notes, dictation). Always passed as data, never as instructions. */
  input: string
  schema: z.ZodType<T>
  /** Short name for the structured result, e.g. "gespraechsauswertung". */
  name: string
}

export interface StructuredResult<T> {
  data: T
  model: string
}

export interface ToolDefinition {
  name: string
  description: string
  schema: z.ZodType
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

/** Provider-neutral chat history. Tool results are plain text (compact JSON). */
export type ChatMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool'; results: { id: string; name: string; content: string }[] }

export interface ChatRequest {
  task: AITask
  system: string
  messages: ChatMessage[]
  tools: ToolDefinition[]
}

export interface ChatTurn {
  text: string
  toolCalls: ToolCall[]
  model: string
}

export interface AIProvider {
  readonly id: 'anthropic' | 'fake'
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>
  chat(req: ChatRequest): Promise<ChatTurn>
}

export type AIStatus = { available: true; provider: AIProvider['id'] } | { available: false; reason: string }

/** Whether AI can run at all; the UI shows the reason instead of a dead button. */
export function aiStatus(aiLevel: number): AIStatus {
  if (aiLevel < 2) return { available: false, reason: 'AI-Vorschläge sind in den Einstellungen deaktiviert.' }
  const e = env()
  if (e.AI_PROVIDER === 'fake') return { available: true, provider: 'fake' }
  if (e.AI_PROVIDER === 'anthropic' && e.ANTHROPIC_API_KEY) return { available: true, provider: 'anthropic' }
  return { available: false, reason: 'AI ist noch nicht eingerichtet. Dafür wird ein API-Schlüssel benötigt; alle Funktionen bleiben manuell nutzbar.' }
}

export async function getProvider(aiLevel: number): Promise<AIProvider> {
  const status = aiStatus(aiLevel)
  if (!status.available) throw new DomainError('unavailable', status.reason)
  if (status.provider === 'fake') return (await import('./fake')).fakeProvider
  return (await import('./anthropic')).anthropicProvider()
}

export function modelFor(task: AITask): string {
  const e = env()
  return task === 'assistant' ? e.AI_MODEL_ASSISTANT : e.AI_MODEL_EXTRACTION
}
