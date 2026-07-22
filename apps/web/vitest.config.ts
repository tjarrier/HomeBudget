import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Vitest ne lit pas les `paths` de tsconfig : on recopie ici l'alias
    // `@ -> ./` (miroir de `"@/*": ["./*"]` dans tsconfig.json) pour que les
    // tests resolvent les imports `@/...` du code applicatif comme le fait Next.
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**', 'e2e/**'],
  },
})
