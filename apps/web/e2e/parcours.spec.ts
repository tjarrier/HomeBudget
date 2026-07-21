import { expect, test } from '@playwright/test'
import { ouvrirSession } from './session'

test('un visiteur sans session est renvoye vers /login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /Se connecter avec Google/ })).toBeVisible()
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
    await expect(page).toHaveURL('http://localhost:3000/')
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
    await page.getByRole('button', { name: 'Créer la version' }).click()

    // La precedente est close LA VEILLE, pas le jour meme.
    await expect(page.getByTestId('timeline-versions')).toContainText('31/08/2026')

    await page.goto('/')
    await expect(page.getByTestId('phrase-synthese')).toHaveText(soldeAvant ?? '')

    await page.goto('/depenses')
    expect(await page.getByTestId('liste-depenses').textContent()).toBe(partsAvant)
  })
})
