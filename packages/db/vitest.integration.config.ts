import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    // Tous les fichiers d'integration partagent la meme base Postgres et font
    // chacun `truncate` en `beforeEach` : en parallele, un fichier tronque les
    // tables pendant qu'un autre est en train d'y ecrire. Sequentiel, donc.
    // Si tu retires cette ligne, les tests ne deviennent pas rouges : ils
    // deviennent flaky. Symptome observe en parallele :
    // "conflicting key value violates exclusion constraint" (une insertion d'un
    // fichier percute le truncate/insert d'un autre sur versions_sans_chevauchement).
    fileParallelism: false,
  },
})
