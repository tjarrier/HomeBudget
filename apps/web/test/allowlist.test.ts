import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { avantCreationUtilisateur, resoudrePersonne } from '../lib/allowlist.js'

const ENV_INITIAL = { ...process.env }

beforeEach(() => {
  // Les adresses viennent de l'environnement, jamais du code en dur : c'est ce
  // qui permet a ce test de tourner sans credential Google et sans exposer les
  // vraies adresses dans le depot.
  process.env.ALLOWLIST_THOMAS = 'thomas@exemple.fr'
  process.env.ALLOWLIST_LIZ = 'liz@exemple.fr'
})

afterEach(() => {
  process.env = { ...ENV_INITIAL }
})

describe('resoudrePersonne', () => {
  it('rattache chaque adresse autorisee a sa personne', () => {
    expect(resoudrePersonne('thomas@exemple.fr')).toBe('thomas')
    expect(resoudrePersonne('liz@exemple.fr')).toBe('liz')
  })

  it('ignore la casse — Google peut renvoyer une adresse capitalisee', () => {
    expect(resoudrePersonne('Thomas@Exemple.FR')).toBe('thomas')
  })

  it('refuse une troisieme adresse', () => {
    expect(() => resoudrePersonne('intrus@exemple.fr')).toThrow(/pas autorisee/i)
  })

  it('refuse une adresse vide', () => {
    expect(() => resoudrePersonne('')).toThrow(/pas autorisee/i)
  })

  it("refuse tout le monde si l'allowlist n'est pas configuree", () => {
    // Un environnement mal configure doit fermer la porte, jamais l'ouvrir.
    process.env.ALLOWLIST_THOMAS = ''
    process.env.ALLOWLIST_LIZ = ''
    expect(() => resoudrePersonne('thomas@exemple.fr')).toThrow(/pas autorisee/i)
    expect(() => resoudrePersonne('')).toThrow(/pas autorisee/i)
  })
})

describe('avantCreationUtilisateur — le hook Better Auth', () => {
  it('cree le user avec sa personne pour une adresse autorisee', async () => {
    const resultat = await avantCreationUtilisateur({ email: 'liz@exemple.fr' })
    expect(resultat.data.personne).toBe('liz')
    expect(resultat.data.email).toBe('liz@exemple.fr')
  })

  it('rejette la creation pour une troisieme adresse', async () => {
    await expect(avantCreationUtilisateur({ email: 'intrus@exemple.fr' })).rejects.toThrow(
      /pas autorisee/i,
    )
  })
})

describe('le hook est reellement branche sur Better Auth', () => {
  it('est la fonction `before` de databaseHooks.user.create', async () => {
    // Un hook parfait mais debranche ne protege rien. Ce test verrouille le
    // cablage, pas seulement la logique.
    const { auth } = await import('../lib/auth.js')
    expect(auth.options.databaseHooks?.user?.create?.before).toBe(avantCreationUtilisateur)
  })

  it("n'autorise aucune inscription par e-mail/mot de passe", async () => {
    // Il n'y a pas d'inscription : deux personnes, point. Un provider
    // email/password ouvert contournerait entierement l'allowlist Google.
    const { auth } = await import('../lib/auth.js')
    expect(auth.options.emailAndPassword?.enabled).not.toBe(true)
  })
})
