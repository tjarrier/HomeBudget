import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**', 'e2e/**'],
  },
})
