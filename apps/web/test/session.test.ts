import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CODE_COMPTE_INCOMPLET } from '../lib/codes-connexion.js'

// `exigerSession` appelle `headers()` (next/headers) et `redirect()`
// (next/navigation), tous deux inutilisables hors d'une vraie requete Next.
// On les remplace par des doubles : `headers` renvoie un objet vide (son
// contenu ne compte pas ici, seul `auth.api.getSession` est exercice), et
// `redirect` DOIT throw — comme la vraie fonction, qui a un type de retour
// `never`. Sans ce throw, `exigerSession` continuerait apres l'appel a
// `redirect` et le test passerait pour la mauvaise raison : il faut que
// l'execution s'arrete la, pas seulement que `redirect` ait ete appelee.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}))

const getSessionMock = vi.fn()
vi.mock('../lib/auth.js', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionMock(...args) } },
}))

beforeEach(() => {
  redirectMock.mockClear()
  getSessionMock.mockReset()
})

describe('exigerSession', () => {
  it("redirige vers /login quand il n'y a pas de session", async () => {
    getSessionMock.mockResolvedValue(null)
    const { exigerSession } = await import('../lib/session.js')

    // Le throw du stub `redirect` doit remonter jusqu'ici : si `exigerSession`
    // continuait apres l'appel a `redirect` (comme le ferait un stub qui se
    // contente d'enregistrer l'appel), cette assertion sur le rejet echouerait.
    await expect(exigerSession()).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(redirectMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['absente', undefined],
    ['null', null],
    ['une chaine invalide', 'personne-inconnue'],
  ])(
    'redirige vers /login?error=compte_incomplet quand `personne` est %s',
    async (_cas, personne) => {
      // Un compte sans `personne` valide n'aurait pas du exister : le hook
      // d'allowlist la pose a la creation (voir allowlist.test.ts). Mais la
      // colonne reste nullable et rien ne la met a jour apres coup — une
      // ligne creee hors du hook garde `personne = NULL` pour toujours. Ce
      // garde-fou est donc bien atteignable, pas hypothetique.
      getSessionMock.mockResolvedValue({
        user: { id: 'u1', name: 'Compte incomplet', personne },
      })
      const { exigerSession } = await import('../lib/session.js')

      await expect(exigerSession()).rejects.toThrow(
        `REDIRECT:/login?error=${CODE_COMPTE_INCOMPLET}`,
      )
      expect(redirectMock).toHaveBeenCalledWith(`/login?error=${CODE_COMPTE_INCOMPLET}`)
      expect(redirectMock).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    ['thomas', 'thomas'],
    ['liz', 'liz'],
  ])('renvoie la session active pour %s', async (_cas, personne) => {
    getSessionMock.mockResolvedValue({
      user: { id: `id-${personne}`, name: `Nom ${personne}`, personne },
    })
    const { exigerSession } = await import('../lib/session.js')

    const resultat = await exigerSession()

    expect(resultat).toEqual({ userId: `id-${personne}`, personne, nom: `Nom ${personne}` })
    expect(redirectMock).not.toHaveBeenCalled()
  })
})
