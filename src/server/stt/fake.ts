import 'server-only'
import type { STTProvider } from './provider'

/** Test double (APP_ENV=test only, enforced in env()). Returns a fixed, clearly marked sentence. */
export const fakeSTT: STTProvider = {
  id: 'fake',
  async transcribe(audio) {
    if (audio.size === 0) return { text: '', model: 'testmodus' }
    return { text: 'Testmodus-Diktat: Die machen ungefähr 30 bis 40 Angebote im Monat.', model: 'testmodus' }
  },
}
