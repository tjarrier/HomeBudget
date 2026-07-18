import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    // Tous les fichiers d'integration partagent la meme base Postgres et font
    // chacun `truncate` en `beforeEach` : en parallele, un fichier tronque les
    // tables pendant qu'un autre est en train d'y ecrire. Sequentiel, donc.
    fileParallelism: false,
  },
})
