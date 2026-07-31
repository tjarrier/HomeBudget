import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { ouvrirSession } from './session'
import { TELEPHONE } from './telephone'

/**
 * Issue C2 — « a 360px de large, aucune page ne doit scroller horizontalement ».
 *
 * Un debordement horizontal ne se voit pas a la lecture du markup : il nait de
 * la RENCONTRE d'un texte insecable, d'un padding et d'une largeur de conteneur.
 * On mesure donc le document rendu, ecran par ecran, a la largeur plancher du
 * projet.
 *
 * La liste des ecrans est LUE SUR LE DISQUE, pas ecrite ici : toute page ajoutee
 * demain sous `app/` entre d'elle-meme dans le filet, sans que personne ait a
 * penser a l'inscrire quelque part. C'est la moitie « verrouille pour les pages
 * futures » de l'issue ; les tests d'etat plus bas couvrent ce qu'une visite au
 * repos ne montre pas (details deplies, feuille de compte ouverte).
 *
 * Ce que ce test NE couvre pas : un contenu autre que celui du seed. Une
 * description de depense d'un seul mot de 40 caracteres deborderait sans que
 * rien ici ne le voie — c'est `truncate` sur la ligne de depense qui l'en
 * empeche, pas ce filet.
 */

// 360px et `isMobile` : le pourquoi des deux est dans `e2e/telephone.ts`, qui les
// definit pour toute la suite. C'est la mesure de `clientWidth` de ce fichier qui
// exige `isMobile` — sans lui, une barre de defilement classique en amputerait 15px.
test.use(TELEPHONE)

const APP = fileURLToPath(new URL('../app', import.meta.url))

/**
 * Les routes servies par `app/`, deduites de l'arborescence des `page.tsx` :
 * les dossiers entre parentheses sont des groupes de route (invisibles dans
 * l'URL), `api` ne rend pas d'ecran.
 */
function routesDuDisque(): string[] {
  const trouvees: string[] = []

  const parcourir = (dossier: string, url: string) => {
    for (const entree of readdirSync(dossier)) {
      const complet = join(dossier, entree)
      if (statSync(complet).isDirectory()) {
        if (entree === 'api') continue
        parcourir(complet, /^\(.*\)$/.test(entree) ? url : `${url}/${entree}`)
      } else if (entree === 'page.tsx') {
        trouvees.push(url === '' ? '/' : url)
      }
    }
  }

  parcourir(APP, '')
  return trouvees.sort()
}

const TOUTES = routesDuDisque()
// Une route dynamique ne se visite pas sans exemple de parametre. Il n'y en a
// aucune aujourd'hui ; le jour ou il y en aura, le test juste en dessous le dira
// plutot que de la sauter en silence.
const DYNAMIQUES = TOUTES.filter((r) => r.includes('['))
const ROUTES = TOUTES.filter((r) => !r.includes('['))

/**
 * Ce qui fait deborder la page, sous une forme lisible en cas d'echec :
 * `div.grid.grid-cols-2 « Total dépensé » depasse de 12px`. Une liste vide est
 * le succes.
 *
 * Le verdict, c'est `scrollWidth > clientWidth` — la definition meme de « la
 * page scrolle horizontalement ». Le reste n'est que le diagnostic : les
 * elements qui depassent le bord droit sans qu'aucun ancetre ne les coupe. Un
 * depassement absorbe par un `overflow` n'est pas un bug, c'est du design.
 */
async function debordements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const racine = document.documentElement
    const dispo = racine.clientWidth
    if (racine.scrollWidth <= dispo) return []

    const decrire = (element: Element): string => {
      const classes = (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3)
      const texte = element.textContent?.trim().slice(0, 30) ?? ''
      return `${element.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join('')} « ${texte} »`
    }

    const coupables: string[] = []
    for (const element of racine.querySelectorAll('*')) {
      const boite = element.getBoundingClientRect()
      // 1px de tolerance : les sous-pixels d'un layout en pourcentages ne sont
      // pas un debordement.
      if (boite.width === 0 || boite.right <= dispo + 1) continue

      let coupe = false
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible') {
          coupe = true
          break
        }
      }
      if (coupe) continue

      coupables.push(`${decrire(element)} depasse de ${Math.round(boite.right - dispo)}px`)
    }

    // Le document deborde : on ne rend JAMAIS une liste vide, meme sans coupable
    // nomme — un debordement sans responsable identifie reste un debordement.
    return [`document ${racine.scrollWidth}px > ${dispo}px`, ...coupables]
  })
}

test.beforeEach(async ({ context }) => {
  // `/login` s'ouvre tres bien avec un cookie de session — il n'est pas garde et
  // ne redirige pas. Un seul beforeEach couvre donc les deux groupes.
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

test('la liste des ecrans est bien lue sur le disque', () => {
  // Sans ce garde-fou, un dossier renomme rendrait `ROUTES` vide : la boucle
  // ci-dessous ne creerait plus AUCUN test, et la suite passerait au vert en
  // n'ayant rien verifie.
  expect(ROUTES).toContain('/')
  expect(ROUTES).toContain('/login')
  expect(ROUTES.length).toBeGreaterThanOrEqual(4)
  // Le jour ou une route dynamique apparait : ajoute-lui une visite explicite
  // avec un parametre d'exemple, plutot que de la laisser hors du filet.
  expect(DYNAMIQUES).toEqual([])
})

for (const route of ROUTES) {
  test(`${route} ne scrolle pas horizontalement a 360px`, async ({ page }) => {
    await page.goto(route)
    // Le <h1> atteste que l'ecran est rendu : mesurer un document vide rendrait
    // toujours vert.
    await expect(page.locator('h1')).toBeVisible()
    expect(await debordements(page)).toEqual([])
  })
}

test('le formulaire de depense ne deborde pas, details deplies', async ({ page }) => {
  await page.goto('/depenses')
  // Replies, la moitie des champs est `hidden` : elle ne serait pas mesuree. On
  // deplie, et on choisit le mode qui monte les deux champs de parts cote a cote
  // — la seule rangee a deux colonnes du formulaire.
  await page.getByRole('button', { name: 'Modifier' }).click()
  await page.selectOption('select[name="mode"]', 'personnalise')
  await expect(page.getByLabel('Part Thomas (€)')).toBeVisible()
  expect(await debordements(page)).toEqual([])
})

test("l'apercu des parts ne deborde pas", async ({ page }) => {
  await page.goto('/depenses')
  // L'apercu n'existe qu'une fois montant ET description saisis (250ms de
  // debounce, puis un aller-retour serveur). C'est le bloc le plus dense de
  // l'ecran : deux montants, un libelle de version et un total de charges.
  await page.getByLabel('Montant (€)').fill('1 110,58')
  await page.getByLabel('Description').fill('Loyer + charges juillet')
  await expect(page.getByTestId('apercu-parts')).toBeVisible()
  expect(await debordements(page)).toEqual([])
})

test("l'apercu de cloture ne deborde pas", async ({ page }) => {
  await page.goto('/config')
  // Meme raison : les lignes « avant → apres » n'apparaissent qu'une fois une
  // prise d'effet choisie, et elles portent deux montants sur une seule ligne.
  await page.getByLabel("Prise d'effet").fill('2027-01-01')
  await page.getByLabel('Salaire Thomas (€)').fill('4 000,00')
  await expect(page.getByTestId('apercu-cloture')).toContainText('Ce qui change')
  expect(await debordements(page)).toEqual([])
})

test('la feuille de compte ne deborde pas', async ({ page }) => {
  await page.goto('/')
  // Feuille fermee, le <dialog> est `display: none` : il ne mesure rien. Ouvert,
  // il est pleine largeur et ancre au bord bas.
  await page.getByRole('button', { name: 'Compte' }).click()
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  expect(await debordements(page)).toEqual([])
})

test("le message d'erreur de connexion ne deborde pas", async ({ page }) => {
  // Le plus long des messages de `login/messages.ts`, et le seul contenu de cet
  // ecran qui ne soit pas dimensionne par la maquette.
  await page.goto('/login?error=acces_refuse')
  await expect(page.getByTestId('message-connexion')).toBeVisible()
  expect(await debordements(page)).toEqual([])
})
