import { defineConfig } from '@playwright/test'

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
