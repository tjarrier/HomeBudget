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

  it('refuse de resoudre quand les deux adresses configurees sont identiques', () => {
    // Sinon `map.set` ecrase silencieusement Thomas par Liz : la personne
    // entre, mais sous la mauvaise identite — ce qui fausse tous les
    // "paye par" et les parts enregistrees ensuite.
    process.env.ALLOWLIST_THOMAS = 'meme@exemple.fr'
    process.env.ALLOWLIST_LIZ = 'meme@exemple.fr'
    expect(() => resoudrePersonne('meme@exemple.fr')).toThrow(/mal configuree/i)
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

  it('rejette reellement une adresse non autorisee, appelee via le cablage Better Auth', async () => {
    // Contrairement au test precedent (une simple identite `toBe`), celui-ci
    // n'importe pas `avantCreationUtilisateur` pour l'appeler : il passe par
    // `auth.options.databaseHooks...before`, exactement comme le ferait Better
    // Auth. Si le cablage se rompt un jour (mauvaise cle, hook remplace), ce
    // test echoue meme si `avantCreationUtilisateur` reste correcte — les deux
    // garanties (cablage + refus) sont ainsi verifiees ensemble, composees,
    // et non chacune isolement.
    const { auth } = await import('../lib/auth.js')
    const before = auth.options.databaseHooks?.user?.create?.before
    await expect(before?.({ email: 'intrus@exemple.fr' })).rejects.toThrow(/pas autorisee/i)
  })

  it("n'autorise aucune inscription par e-mail/mot de passe", async () => {
    // Il n'y a pas d'inscription : deux personnes, point. Un provider
    // email/password ouvert contournerait entierement l'allowlist Google.
    //
    // Une simple assertion sur la config declaree (`enabled === true`)
    // laisserait passer une valeur "truthy" non stricte (`enabled: 'true'`
    // venant d'une env var, par ex.) que Better Auth traite pourtant comme
    // active : ce test appelle donc la vraie route de creation par
    // e-mail/mot de passe et verifie qu'elle refuse, exactement comme le fait
    // le garde-fou interne de la librairie (`!options.emailAndPassword?.enabled`).
    //
    // Cet appel ne touche jamais la base : avec `drizzleAdapter` configure
    // sans `transaction: true` (notre cas), Better Auth n'ouvre pas de vraie
    // transaction SQL pour ce chemin — il execute le callback directement
    // (`createAsIsTransaction`), et le refus arrive avant tout acces reel aux
    // donnees. Verifie manuellement en pointant `DATABASE_URL` vers un hote
    // injoignable : le refus est identique, aucune connexion n'est tentee.
    const { auth } = await import('../lib/auth.js')
    await expect(
      auth.api.signUpEmail({
        body: { email: 'intrus@exemple.fr', password: 'peu-importe-1234', name: 'intrus' },
      }),
    ).rejects.toThrow(/email and password sign up is not enabled/i)
  })
})
