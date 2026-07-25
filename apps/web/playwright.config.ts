import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// Next lit `.env.local` pour le serveur, mais PAS pour le processus de test :
// `e2e/session.ts` a besoin de BETTER_AUTH_SECRET pour signer un cookie, et
// echouait donc sur un `pnpm test:e2e` nu. On le charge nous-memes.
// En CI le fichier n'existe pas : les variables viennent des secrets du job.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

// Le port par defaut reste 3000 : la CI et `task test:e2e` ne changent pas. Mais
// plusieurs worktrees tournent en parallele sur le poste, et un serveur de dev
// d'un autre projet tient volontiers le 3000 pendant des heures. `PORT=3100 task
// test:e2e:frais` suffit alors, sans toucher a ce fichier.
const PORT = process.env.PORT ?? '3000'
const ORIGINE = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Les parcours ecrivent dans la meme base : ils se suivent.
  workers: 1,
  reporter: 'list',
  use: { baseURL: ORIGINE },
  webServer: {
    // `start` seul : on teste ce qui sera reellement servi, mais le build est un
    // prerequis, pas une etape d'ici. La CI et `task test:e2e` construisent avant ;
    // le refaire ici ferait payer deux builds de production a chaque passage.
    command: `pnpm start --port ${PORT}`,
    url: `${ORIGINE}/login`,
    // Better Auth refuse toute requete dont l'origine ne correspond pas a sa
    // baseURL. Sans cette ligne, servir les parcours sur un autre port que 3000
    // fait echouer signOut() en silence. Next n'ecrase jamais une variable deja
    // presente dans process.env : celle-ci gagne donc sur `.env.local`.
    env: { BETTER_AUTH_URL: ORIGINE },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
