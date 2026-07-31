import { afterEach, describe, expect, it, vi } from 'vitest'
import { origineAuth, originesDeConfiance } from '../lib/origine.js'

const ENV_INITIAL = { ...process.env }

afterEach(() => {
  process.env = { ...ENV_INITIAL }
  vi.resetModules()
})

/** Un environnement Vercel de preview, tel qu'il arrive reellement au runtime. */
const PREVIEW = {
  VERCEL_ENV: 'preview',
  VERCEL_URL: 'homebudget-a1b2c3-thomas.vercel.app',
  VERCEL_BRANCH_URL: 'homebudget-git-preview-thomas.vercel.app',
  VERCEL_PROJECT_PRODUCTION_URL: 'budget.exemple.fr',
}

describe('origineAuth', () => {
  it('prefere une URL explicite — le local et la CI la posent', () => {
    expect(origineAuth({ ...PREVIEW, BETTER_AUTH_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000',
    )
  })

  it('en production, prend le domaine de production', () => {
    expect(origineAuth({ ...PREVIEW, VERCEL_ENV: 'production' })).toBe('https://budget.exemple.fr')
  })

  it("en preview, prend l'URL de BRANCHE et jamais celle du deploiement", () => {
    // C'est toute la raison d'etre de ce module. Google refuse les wildcards
    // dans ses redirect URIs : l'origine annoncee doit etre pre-enregistrable,
    // donc stable. VERCEL_URL change a chaque deploiement — la choisir donne un
    // `redirect_uri_mismatch` a chaque push, VERCEL_BRANCH_URL ne change pas.
    const origine = origineAuth(PREVIEW)
    expect(origine).toBe('https://homebudget-git-preview-thomas.vercel.app')
    expect(origine).not.toContain('a1b2c3')
  })

  it("en preview, ignore le domaine de production meme s'il est defini", () => {
    // VERCEL_PROJECT_PRODUCTION_URL est pose sur TOUS les deploiements, preview
    // comprise. Le tester avant VERCEL_ENV enverrait les previews poser leur
    // cookie de session sur le domaine de prod.
    expect(origineAuth(PREVIEW)).not.toContain('budget.exemple.fr')
  })

  it('hors Vercel et sans configuration, retombe sur le port de dev', () => {
    expect(origineAuth({})).toBe('http://localhost:3000')
  })
})

describe('originesDeConfiance', () => {
  it("accepte l'URL unique du deploiement, en plus des URLs stables", () => {
    // Sans elle, ouvrir l'URL unique d'un deploiement puis poster vers
    // /api/auth/* est rejete en mismatch d'origine : la preview est
    // consultable mais la connexion y est impossible.
    expect(originesDeConfiance(PREVIEW)).toEqual([
      'https://homebudget-a1b2c3-thomas.vercel.app',
      'https://homebudget-git-preview-thomas.vercel.app',
      'https://budget.exemple.fr',
    ])
  })

  it('ne fabrique aucune origine a partir des variables absentes', () => {
    // Un `https://undefined` dans la liste serait une origine de confiance
    // fantome : au mieux inutile, au pire acceptee par un intermediaire.
    expect(originesDeConfiance({})).toEqual([])
    expect(originesDeConfiance({ VERCEL_URL: '' })).toEqual([])
  })
})

describe('le branchement sur Better Auth', () => {
  it("annonce a Google l'URL de branche, et fait confiance au deploiement", async () => {
    // Une resolution correcte mais debranchee ne sert a rien : ce test lit la
    // configuration que Better Auth a reellement recue. La CI pose
    // BETTER_AUTH_URL : il faut donc l'OMETTRE pour simuler une preview.
    //
    // Ni `delete` (interdit par Biome) ni l'affectation d'`undefined` qu'il
    // propose : process.env coerce toute valeur en chaine, donc
    // `BETTER_AUTH_URL = undefined` y stocke la chaine "undefined", truthy —
    // le test passerait alors pour la mauvaise raison.
    const environnement = Object.entries(process.env).filter(([nom]) => nom !== 'BETTER_AUTH_URL')
    process.env = { ...Object.fromEntries(environnement), ...PREVIEW }
    vi.resetModules()

    const { auth } = await import('../lib/auth.js')

    expect(auth.options.baseURL).toBe('https://homebudget-git-preview-thomas.vercel.app')
    expect(auth.options.trustedOrigins).toContain('https://homebudget-a1b2c3-thomas.vercel.app')
  })
})
