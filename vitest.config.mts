import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  // server-only throws outside React Server Components; tests run server code directly.
  'server-only': fileURLToPath(new URL('./tests/support/empty.ts', import.meta.url)),
}

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { name: 'unit', include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'], environment: 'node' } },
      {
        resolve: { alias },
        test: {
          name: 'ai',
          include: ['tests/ai/**/*.test.ts'],
          environment: 'node',
          // Real model; the key comes from the environment, everything else is a placeholder.
          env: {
            AI_PROVIDER: 'anthropic',
            DATABASE_URL: 'postgres://unused@127.0.0.1:1/unused',
            NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'ai-test-anon-key-not-used',
          },
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          env: {
            APP_ENV: 'test',
            AI_PROVIDER: 'fake',
            DATABASE_URL: 'postgres://app_server:local-app-server@127.0.0.1:54322/reqover_test',
            TEST_ADMIN_DATABASE_URL: 'postgres://postgres@127.0.0.1:54322/reqover_test',
            NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-not-used-in-db-tests',
          },
        },
      },
    ],
  },
})
