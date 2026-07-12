import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Les tests d'integration exigent Docker : ils ne doivent pas bloquer
    // la suite unitaire, qui doit rester executable partout, en une seconde.
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
  },
})
