import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// Next lit `.env.local` pour le serveur, mais PAS pour le processus de test :
// `e2e/session.ts` a besoin de BETTER_AUTH_SECRET pour signer un cookie, et
// echouait donc sur un `pnpm test:e2e` nu. On le charge nous-memes.
// En CI le fichier n'existe pas : les variables viennent des secrets du job.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Les parcours ecrivent dans la meme base : ils se suivent.
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    // `build` puis `start` : on teste ce qui sera reellement servi.
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
