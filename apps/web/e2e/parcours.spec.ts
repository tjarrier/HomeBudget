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
