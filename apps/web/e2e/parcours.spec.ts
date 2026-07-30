import { expect, test } from '@playwright/test'
import { ouvrirSession } from './session'

test('un visiteur sans session est renvoye vers /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /Se connecter avec Google/ })).toBeVisible()
})

test("l'ecran de connexion nu identifie l'app sans afficher d'erreur", async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'HomeBudget' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Se connecter avec Google/ })).toBeVisible()
  // On cible l'encart par son testid, pas par role="alert" : Next injecte son
  // propre annonceur de route (#__next-route-announcer__, role="alert", vide),
  // qui ferait échouer un getByRole('alert') generique.
  await expect(page.getByTestId('message-connexion')).toHaveCount(0)
})

test('une adresse refusee recoit un message comprehensible, pas une erreur brute', async ({
  page,
}) => {
  // On simule le retour de Better Auth apres un refus d'allowlist : le callback
  // OAuth redirige vers /login?error=acces_refuse. Pas besoin de credential
  // Google — l'ecran rend l'encart a partir du seul parametre d'URL.
  await page.goto('/login?error=acces_refuse')
  await expect(page.getByTestId('message-connexion')).toContainText(/n'est pas autorisée/i)
})

test.describe('parcours authentifies', () => {
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

  test('le solde de reference du seed est a l ecran', async ({ page }) => {
    // LE CANARI, jusque dans l'UI. S'il tombe, une des quatre regles du
    // CLAUDE.md a ete violee — ne l'ajuste pas, trouve ce qui a casse.
    await page.goto('/')
    // Si cette assertion echoue avec une URL /login, le cookie est mal forme :
    // verifier BETTER_AUTH_SECRET et la signature dans e2e/session.ts.
    await expect(page).toHaveURL('/')
    // LE CANARI, jusque dans l'UI. Le bandeau enchasse le montant AU MILIEU de
    // la phrase (« Liz doit 1 145,80 € à Thomas ») : le sens se verifie donc par
    // motif, la valeur reste epinglee au nœud <data>. Le solde reste 114 580.
    await expect(page.getByTestId('phrase-synthese')).toContainText(/Liz doit .+ à Thomas/)
    await expect(page.getByTestId('phrase-synthese').locator('data')).toHaveText('1 145,80 €')
  })

  test('ajouter une depense fait bouger le solde', async ({ page }) => {
    await page.goto('/depenses')

    // La promesse de B3 : les champs a defaut correct sont replies.
    await expect(page.getByLabel('Date')).toBeHidden()
    await expect(page.getByText(/Aujourd'hui · payé par/)).toBeVisible()
    await page.getByRole('button', { name: 'Modifier' }).click()

    await page.fill('input[name="date"]', '2026-07-10')
    await page.fill('input[name="description"]', 'Courses du samedi')
    await page.fill('input[name="montant"]', '50,00')
    await page.selectOption('select[name="payePar"]', 'liz')
    await page.selectOption('select[name="type"]', 'courante')

    // L'apercu en direct, avant validation : moitie-moitie sur 50 €.
    await expect(page.getByTestId('apercu-thomas')).toHaveText('25,00 €')
    await expect(page.getByTestId('apercu-liz')).toHaveText('25,00 €')

    await page.getByRole('button', { name: 'Ajouter la dépense' }).click()
    await expect(page.getByTestId('liste-depenses')).toContainText('Courses du samedi')

    await page.goto('/')
    // Liz a paye 50 € dont 25 € pour Thomas : la dette de Liz baisse de 25 €.
    await expect(page.getByTestId('phrase-synthese')).toContainText(/Liz doit .+ à Thomas/)
    await expect(page.getByTestId('phrase-synthese').locator('data')).toHaveText('1 120,80 €')
  })

  test.describe('borne haute de la date de depense (issue #29)', () => {
    // Calculee INDEPENDAMMENT de `dateMaxDepense` (le domaine) : ce test doit
    // rester capable de detecter une divergence entre les deux, pas la
    // confirmer par construction en important la meme fonction.
    function dansUnAn(iso: string): string {
      const [a, m, j] = iso.split('-').map(Number) as [number, number, number]
      const max = new Date(Date.UTC(a + 1, m - 1, j))
      if (max.getUTCMonth() !== m - 1) max.setUTCDate(0)
      return max.toISOString().slice(0, 10)
    }

    test('le champ date porte un max a un an, et le serveur refuse une date au-dela', async ({
      page,
    }) => {
      await page.goto('/depenses')
      await page.getByRole('button', { name: 'Modifier' }).click()

      const champDate = page.locator('input[name="date"]')
      const aujourdhui = new Date().toISOString().slice(0, 10)
      await expect(champDate).toHaveAttribute('max', dansUnAn(aujourdhui))

      // Date aberrante (le piege reel du Sheet d'origine : 2029-09-29 pour une
      // depense de 2025-09-29). Le selecteur natif la marque hors borne.
      await champDate.fill('2029-09-29')
      const rangeOverflow = await champDate.evaluate(
        (input: HTMLInputElement) => input.validity.rangeOverflow,
      )
      expect(rangeOverflow).toBe(true)

      await page.fill('input[name="montant"]', '50,00')
      await page.fill('input[name="description"]', 'Coquille d annee')

      const messageErreur = page.getByTestId('message-erreur-apercu')
      await expect(messageErreur).toContainText('trop lointaine')
      await expect(messageErreur).toContainText('figées définitivement')
      await expect(page.getByTestId('apercu-parts')).toHaveCount(0)
    })

    test('une date a +30 jours reste acceptee, aucune ecriture', async ({ page }) => {
      await page.goto('/depenses')
      await page.getByRole('button', { name: 'Modifier' }).click()

      const dansUnMois = new Date()
      dansUnMois.setUTCDate(dansUnMois.getUTCDate() + 30)

      await page.fill('input[name="date"]', dansUnMois.toISOString().slice(0, 10))
      await page.fill('input[name="montant"]', '50,00')
      await page.fill('input[name="description"]', 'Prelevement annonce')

      // Le pendant : previsualise, jamais soumis — la depense ne doit pas
      // s'ecrire, sous peine de casser le canari des tests suivants.
      await expect(page.getByTestId('apercu-parts')).toBeVisible()
      await expect(page.getByTestId('message-erreur-apercu')).toHaveCount(0)
    })

    test('replier() ne masque pas un champ date hors borne (sinon soumission bloquee sans message)', async ({
      page,
    }) => {
      await page.goto('/depenses')
      await page.getByRole('button', { name: 'Modifier' }).click()

      await page.fill('input[name="date"]', '2029-09-29')
      await page.getByRole('button', { name: 'Replier' }).click()

      // Un champ `hidden` mais invalide (rangeOverflow) rendrait le bouton
      // "Ajouter la depense" inerte : le navigateur refuse la soumission sans
      // rien afficher, faute de pouvoir focaliser un champ masque.
      await expect(page.getByLabel('Date')).toBeVisible()
    })
  })

  test('creer une version ne change aucune depense passee', async ({ page }) => {
    await page.goto('/')
    const soldeAvant = await page.getByTestId('phrase-synthese').textContent()

    await page.goto('/depenses')
    const partsAvant = await page.getByTestId('liste-depenses').textContent()

    await page.goto('/config')
    await page.fill('input[name="libelle"]', 'Révision de loyer 2026')
    await page.fill('input[name="dateDebut"]', '2026-09-01')
    await page.fill('input[name="salaireNetThomas"]', '4000,00')
    await page.fill('input[name="salaireNetLiz"]', '1000,00')

    // B4 : avant de valider, l'apercu montre ce qu'on ferme, quand, et ce qui
    // change. La date de cloture est la VEILLE de la prise d'effet.
    const apercu = page.getByTestId('apercu-cloture')
    await expect(apercu).toContainText('31/08/2026')
    await expect(apercu).toContainText('Ce qui change')
    // Le nouveau salaire Thomas (400 000 centimes) est une ligne modifiee.
    await expect(apercu).toContainText('4 000,00')

    await page.getByRole('button', { name: 'Créer la version' }).click()

    // La precedente est close LA VEILLE, pas le jour meme.
    await expect(page.getByTestId('timeline-versions')).toContainText('31/08/2026')

    await page.goto('/')
    await expect(page.getByTestId('phrase-synthese')).toHaveText(soldeAvant ?? '')

    await page.goto('/depenses')
    expect(await page.getByTestId('liste-depenses').textContent()).toBe(partsAvant)
  })

  // Le viewport par defaut de Chromium (1280x720) affiche le rail lateral : les
  // deux defauts de l'issue #13 n'y existent tout simplement pas. On descend a
  // la taille d'un telephone courant pour les rendre observables.
  test.describe('sur un telephone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('la navigation est ancree au bord inferieur de l ecran', async ({ page }) => {
      await page.goto('/')
      const barre = page.getByRole('navigation', { name: 'Navigation principale' })
      await expect(barre).toBeVisible()
      const boite = await barre.boundingBox()
      // Le fait a verrouiller n'est pas « dans la moitie basse » mais « ancree
      // au bord inferieur » : le bas de la barre doit atteindre le bas du
      // viewport (844px), a 8px pres. Un seuil de simple moitie passerait
      // encore vert si la barre cessait d'etre fixed et se retrouvait poussee
      // en bas d'une page longue.
      expect((boite?.y ?? 0) + (boite?.height ?? 0)).toBeGreaterThan(844 - 8)
    })

    test('un signOut qui echoue ne fait pas croire a la sortie', async ({ page }) => {
      await page.goto('/')
      await page.route('**/api/auth/sign-out', (route) =>
        route.fulfill({ status: 500, body: '{}' }),
      )
      await page.getByRole('button', { name: 'Compte' }).click()
      await page.getByRole('button', { name: 'Se déconnecter' }).click()

      // On RESTE sur place, et on le dit. Naviguer vers /login pendant que la
      // session survit ferait croire a l'utilisateur qu'il est sorti. On cible
      // le message par son texte plutot que par role('alert') : Next pose son
      // propre annonceur de route (#__next-route-announcer__, role="alert",
      // vide) des le premier goto(), ce qui rendrait le role seul ambigu.
      const message = page.getByText('La déconnexion a échoué. Vérifie ta connexion et réessaie.')
      await expect(message).toBeVisible()
      await expect(page).toHaveURL('/')

      // Verrouille le bug voisin : le message ne doit pas survivre a une
      // fermeture par « Annuler ». Sans remise a zero a la reouverture (et non
      // a la fermeture, qui ne couvre pas la sortie par Escape), il resterait
      // arme et s'afficherait ici alors qu'aucune nouvelle tentative n'a eu lieu.
      await page.getByRole('button', { name: 'Annuler' }).click()
      await page.getByRole('button', { name: 'Compte' }).click()
      await expect(message).not.toBeVisible()
    })

    test('on peut se deconnecter depuis un telephone', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Compte' }).click()
      await page.getByRole('button', { name: 'Se déconnecter' }).click()
      await expect(page).toHaveURL(/\/login/)

      // La redirection ci-dessus prouve seulement qu'un clic a declenche une
      // navigation : le client Better Auth ne leve pas d'exception si signOut()
      // echoue cote serveur, et router.replace('/login') s'execute quand meme.
      // La seule preuve que le cookie de session a reellement ete invalide est
      // que le middleware, qui ne verifie que sa presence, nous renvoie encore
      // vers /login sur un acces suivant. Ne pas retirer cette assertion en la
      // croyant redondante avec celle du dessus.
      await page.goto('/')
      await expect(page).toHaveURL(/\/login/)
    })
  })
})
