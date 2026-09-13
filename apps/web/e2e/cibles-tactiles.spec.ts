import { type Locator, type Page, expect, test } from '@playwright/test'
import { ouvrirSession } from './session'
import { TELEPHONE } from './telephone'

/**
 * Issue C1 — « aucun bouton, lien ou champ de `apps/web` ne passe sous le
 * seuil » de 44px.
 *
 * C'est une propriete du RENDU, pas de la source : une classe `min-h-11` ne
 * garantit rien si un parent la contraint, et un controle ajoute demain sans
 * aucune classe passerait sous un test qui ne fait que grepper le markup. On
 * mesure donc les boites reelles, ecran par ecran, a la largeur plancher du
 * projet (360px). Tout controle visible entre dans le filet : rien a inscrire
 * quelque part pour qu'un nouveau bouton soit couvert.
 *
 * `apps/web/test/cibles-tactiles.test.ts` verrouille la meme regle a la source,
 * sans Docker ni navigateur, pour que `task verif` l'attrape avant la CI.
 */
const PLANCHER = 44

// Le telephone de la suite, defini dans `e2e/telephone.ts` : 360px, la largeur
// plancher du projet (voir `components/nav-principale.tsx`).
test.use(TELEPHONE)

// `input[type=hidden]` n'est pas une cible : il porte le `mode` d'un transfert,
// qui ne monte aucun radio de repartition (voir `components/formulaire-depense.tsx`).
// Tout le reste est touche au pouce.
const CONTROLES = 'a[href], button, input:not([type="hidden"]), select, textarea'

/** De quoi retrouver le fautif dans le markup sans lire un dump de HTML. */
async function decrire(controle: Locator): Promise<string> {
  return controle.evaluate((element) => {
    const balise = element.tagName.toLowerCase()
    const identite =
      element.getAttribute('name') ??
      element.getAttribute('id') ??
      element.getAttribute('aria-label') ??
      element.textContent?.trim().slice(0, 30) ??
      ''
    return `${balise}[${identite}]`
  })
}

/**
 * Rend la liste des controles visibles trop petits, sous une forme lisible en
 * cas d'echec : `button[Voir tout →] 61x16`. Une liste vide est le succes.
 */
async function trouverCiblesTropPetites(page: Page): Promise<string[]> {
  const fautifs: string[] = []
  for (const controle of await page.locator(CONTROLES).all()) {
    if (!(await controle.isVisible())) continue
    const boite = await controle.boundingBox()
    if (!boite) continue
    if (boite.height >= PLANCHER && boite.width >= PLANCHER) continue
    fautifs.push(
      `${await decrire(controle)} ${Math.round(boite.width)}x${Math.round(boite.height)}`,
    )
  }
  return fautifs
}

test("l'ecran de connexion ne pose aucune cible sous 44px", async ({ page }) => {
  await page.goto('/login')
  expect(await trouverCiblesTropPetites(page)).toEqual([])
})

test.describe('ecrans authentifies', () => {
  test.beforeEach(async ({ context }) => {
    const valeur = await ouvrirSession('thomas')
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: valeur,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
      },
    ])
  })

  test("l'accueil ne pose aucune cible sous 44px", async ({ page }) => {
    await page.goto('/')
    // Le lien « Voir tout → » de la carte des depenses recentes est le seul
    // controle de l'app qui ne soit ni un bouton ni un champ : c'est celui que
    // sa taille de texte (12px) rendait intouchable.
    await expect(page.getByRole('link', { name: /Voir tout/ })).toBeVisible()
    expect(await trouverCiblesTropPetites(page)).toEqual([])
  })

  test('le tableau de bord ne pose aucune cible sous 44px', async ({ page }) => {
    await page.goto('/tableau-de-bord')
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    // La fleche de retour est le seul controle de l'ecran : une icone de 22px,
    // dont la cible doit pourtant tenir 44px.
    await expect(page.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible()
    expect(await trouverCiblesTropPetites(page)).toEqual([])
  })

  test('la feuille de saisie ne pose aucune cible sous 44px, details deplies', async ({ page }) => {
    await page.goto('/?saisie=1')
    const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
    // Replies, les details sont `hidden` : ils ne seraient pas mesures. On
    // deplie, on montre le champ date et les deux champs de parts — sinon cinq
    // controles de la feuille echappent au filet.
    await feuille.getByRole('button', { name: 'Modifier' }).click()
    await feuille.getByRole('radio', { name: 'Autre date' }).check()
    await feuille.getByRole('radio', { name: 'Personnalisée' }).check()
    await expect(page.getByLabel('Part Thomas (€)')).toBeVisible()
    expect(await trouverCiblesTropPetites(page)).toEqual([])
  })

  test('la configuration ne pose aucune cible sous 44px', async ({ page }) => {
    await page.goto('/config')
    // `exact` : les trois textareas de charges portent « Libellé=791,00 » dans
    // leur propre intitule, et un getByLabel non exact les attrape aussi.
    await expect(page.getByLabel('Libellé', { exact: true })).toBeVisible()
    expect(await trouverCiblesTropPetites(page)).toEqual([])
  })

  test('la feuille de compte ne pose aucune cible sous 44px', async ({ page }) => {
    await page.goto('/')
    // Feuille fermee, le <dialog> est `display: none` : ses deux boutons ne
    // sont pas mesurables. C'est pourtant la seule paire d'actions adjacentes
    // du produit — celle ou un appui imprecis change de sens.
    await page.getByRole('button', { name: 'Compte' }).click()
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
    expect(await trouverCiblesTropPetites(page)).toEqual([])

    // L'espacement, pas seulement la taille : deux actions contigues de sens
    // oppose demandent un intervalle qu'un pouce ne franchit pas par accident.
    const deconnexion = await page.getByRole('button', { name: 'Se déconnecter' }).boundingBox()
    const annuler = await page.getByRole('button', { name: 'Annuler' }).boundingBox()
    const intervalle = (annuler?.y ?? 0) - ((deconnexion?.y ?? 0) + (deconnexion?.height ?? 0))
    expect(intervalle).toBeGreaterThanOrEqual(12)
  })
})
