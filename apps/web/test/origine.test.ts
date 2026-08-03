import { afterEach, describe, expect, it, vi } from 'vitest'
import { origineAuth, originesDeConfiance } from '../lib/origine.js'

const ENV_INITIAL = { ...process.env }

afterEach(() => {
  process.env = { ...ENV_INITIAL }
  vi.resetModules()
})

/**
 * Un environnement Vercel de preview, tel qu'il arrive reellement au runtime :
 * le domaine de production du projet miroir `homebudget-preview`, pose a la
 * main parce que Google n'accepte aucun wildcard, et l'URL unique du
 * deploiement, que Vercel genere seul et qui change a chaque push.
 */
const PREVIEW = {
  VERCEL_ENV: 'preview',
  VERCEL_URL: 'homebudget-preview-a1b2c3-tjarriers-projects.vercel.app',
  BETTER_AUTH_URL: 'https://homebudget-preview.vercel.app',
}

describe('origineAuth', () => {
  it("prend l'URL posee par l'environnement", () => {
    expect(origineAuth(PREVIEW)).toBe('https://homebudget-preview.vercel.app')
  })

  it("ignore l'URL unique du deploiement, qui change a chaque push", () => {
    // Google refuse les wildcards : une origine qui change a chaque
    // deploiement ne peut pas etre pre-enregistree.
    expect(origineAuth(PREVIEW)).not.toContain('a1b2c3')
  })

  it('hors Vercel et sans configuration, retombe sur le port de dev', () => {
    expect(origineAuth({})).toBe('http://localhost:3000')
  })

  it('sur Vercel, refuse de demarrer sans URL plutot que de retomber sur localhost', () => {
    // Le repli localhost serait le pire des cas : cette URI EST enregistree
    // chez Google (c'est le dev local), donc le tour OAuth reussirait et
    // renverrait l'utilisateur sur son propre poste, sans aucune erreur.
    // Mieux vaut un deploiement qui refuse de servir.
    expect(() => origineAuth({ VERCEL_ENV: 'preview' })).toThrow(/BETTER_AUTH_URL est requise/i)
    expect(() => origineAuth({ VERCEL_ENV: 'production' })).toThrow(/BETTER_AUTH_URL est requise/i)
  })

  it('traite une URL vide comme absente', () => {
    // Une variable declaree mais vide est une erreur de configuration, pas une
    // valeur : elle ne doit pas passer le test de presence.
    expect(() => origineAuth({ VERCEL_ENV: 'preview', BETTER_AUTH_URL: '' })).toThrow(
      /BETTER_AUTH_URL est requise/i,
    )
  })
})

describe('originesDeConfiance', () => {
  it("accepte l'URL unique du deploiement", () => {
    // C'est celle que propose le dashboard Vercel. Sans elle, la preview
    // ouverte depuis le dashboard refuse la connexion en mismatch d'origine.
    expect(originesDeConfiance(PREVIEW)).toEqual([
      'https://homebudget-preview-a1b2c3-tjarriers-projects.vercel.app',
    ])
  })

  it('ne fabrique aucune origine hors Vercel', () => {
    // Un `https://undefined` dans la liste serait une origine de confiance
    // fantome : au mieux inutile, au pire acceptee par un intermediaire.
    expect(originesDeConfiance({})).toEqual([])
    expect(originesDeConfiance({ VERCEL_URL: '' })).toEqual([])
  })
})

describe('le branchement sur Better Auth', () => {
  it('annonce le domaine du projet miroir, et fait confiance au deploiement', async () => {
    // Une resolution correcte mais debranchee ne sert a rien : ce test lit la
    // configuration que Better Auth a reellement recue.
    process.env = { ...process.env, ...PREVIEW }
    vi.resetModules()

    const { auth } = await import('../lib/auth.js')

    expect(auth.options.baseURL).toBe('https://homebudget-preview.vercel.app')
    expect(auth.options.trustedOrigins).toEqual([
      'https://homebudget-preview-a1b2c3-tjarriers-projects.vercel.app',
    ])
  })
})
