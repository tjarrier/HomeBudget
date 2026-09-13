import { type Page, expect, test } from '@playwright/test'
import { ouvrirSession } from './session'
import { TELEPHONE } from './telephone'

/**
 * Les deux tailles d'ecran ou le cœur du projet doit passer.
 *
 * L'usage reel est un telephone : un canari qui ne se verifie qu'en 1280px ne
 * dit rien de ce qui est reellement utilise (issue C3). Le rail lateral et la
 * barre au pouce sont deux mises en page differentes — deux occasions distinctes
 * de perdre le solde de vue ou de casser la saisie.
 */
const TAILLES = [
  { nom: 'ordinateur', options: {} },
  { nom: 'telephone', options: TELEPHONE },
] as const

/**
 * Le solde en centimes, lu sur l'attribut `value` du `<data>` — la valeur
 * exacte, jamais l'euro formate.
 *
 * La saisie se joue une fois par taille d'ecran et chaque passage baisse la
 * dette de Liz : c'est l'ECART qui est verifie, pas un montant grave dans le
 * test, qui serait faux au second passage.
 */
async function soldeEnCentimes(page: Page): Promise<number> {
  const valeur = await page.getByTestId('phrase-synthese').locator('data').getAttribute('value')
  // `Number(null)` vaut 0, pas NaN : sans ce garde-fou, un `<data>` prive de son
  // attribut se lirait comme un solde nul au lieu de faire echouer le test.
  expect(valeur).toMatch(/^-?\d+$/)
  return Number(valeur)
}

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

  // L'ORDRE COMPTE, et il est le seul possible : le canari lit le seed intact,
  // la saisie l'ecrit. Les deux tailles rejouent donc le canari AVANT que la
  // moindre saisie n'ait eu lieu. Playwright execute les tests dans l'ordre de
  // declaration et `workers: 1` (playwright.config.ts) leur interdit de se
  // croiser. Regrouper les quatre tests par taille d'ecran plutot que par
  // parcours ferait lire au canari du telephone le solde deja modifie par la
  // saisie de l'ordinateur : ne reorganise pas ces deux boucles en une seule.
  for (const { nom, options } of TAILLES) {
    test.describe(`sur un ${nom}`, () => {
      test.use(options)

      test('le solde de reference du seed est a l ecran', async ({ page }) => {
        // LE CANARI, jusque dans l'UI. S'il tombe, une des quatre regles du
        // CLAUDE.md a ete violee — ne l'ajuste pas, trouve ce qui a casse.
        await page.goto('/')
        // Si cette assertion echoue avec une URL /login, le cookie est mal forme :
        // verifier BETTER_AUTH_SECRET et la signature dans e2e/session.ts.
        await expect(page).toHaveURL('/')
        // Le bandeau enchasse le montant AU MILIEU de la phrase (« Liz doit
        // 1 145,80 € à Thomas ») : le sens se verifie donc par motif, la valeur
        // reste epinglee au nœud <data>.
        await expect(page.getByTestId('phrase-synthese')).toContainText(/Liz doit .+ à Thomas/)
        const solde = page.getByTestId('phrase-synthese').locator('data')
        await expect(solde).toHaveText('1 145,80 €')
        // Le texte dit l'euro, l'attribut dit les centimes. C'est en centimes que
        // le canari est ecrit partout ailleurs (114 580) : on le verifie ici sous
        // la meme forme, a l'abri des espaces insecables du formatage francais.
        await expect(solde).toHaveAttribute('value', '114580')

        // Le tableau de bord lit le MEME agregat : il doit dire le meme solde, et
        // les deux soldes signes doivent etre le meme fait vu des deux bouts —
        // jamais deux valeurs positives, jamais un signe inverse.
        await page.goto('/tableau-de-bord')
        await expect(page.getByTestId('solde-tableau-de-bord')).toHaveAttribute('value', '114580')
        await expect(page.getByTestId('solde-thomas')).toHaveAttribute('value', '114580')
        await expect(page.getByTestId('solde-liz')).toHaveAttribute('value', '-114580')
      })
    })
  }

  for (const { nom, options } of TAILLES) {
    test.describe(`sur un ${nom}`, () => {
      test.use(options)

      test('ajouter une depense fait bouger le solde', async ({ page }) => {
        await page.goto('/')
        const soldeAvant = await soldeEnCentimes(page)

        await page.goto('/?saisie=1')
        const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
        await expect(feuille).toBeVisible()
        // Le montant recoit le focus a l'ouverture, pas le bouton « Fermer ».
        await expect(page.getByLabel('Montant (€)')).toBeFocused()

        // La promesse de B3 : les champs a defaut correct sont replies.
        await expect(page.locator('input[name="date"]')).toBeHidden()
        await expect(feuille.getByText("Aujourd'hui · courante, moitié-moitié")).toBeVisible()
        await feuille.getByRole('button', { name: 'Modifier' }).click()

        // La description porte la taille d'ecran : les deux passages ecrivent
        // dans la meme base, et une ligne anonyme ne dirait pas lequel des deux
        // a echoue.
        const description = `Courses du samedi (${nom})`
        await feuille.getByRole('radio', { name: 'Autre date' }).check()
        await page.fill('input[name="date"]', '2026-07-10')
        await page.fill('input[name="description"]', description)
        await page.fill('input[name="montant"]', '50,00')
        await feuille.getByRole('radio', { name: 'Liz' }).check()
        await feuille.getByRole('radio', { name: 'Courante' }).check()

        // L'apercu en direct, avant validation : moitie-moitie sur 50 €.
        await expect(page.getByTestId('apercu-thomas')).toHaveText('25,00 €')
        await expect(page.getByTestId('apercu-liz')).toHaveText('25,00 €')

        await feuille.getByRole('button', { name: 'Ajouter la dépense' }).click()
        // La feuille se ferme apres l'ecriture : c'est ce qui desarme un second
        // clic, qui redoublerait une depense aux parts figees pour toujours.
        await expect(feuille).toBeHidden()
        await expect(page).toHaveURL('/')

        await page.goto('/depenses')
        await expect(page.getByTestId('liste-depenses')).toContainText(description)

        await page.goto('/')
        // Liz a paye 50 € dont 25 € pour Thomas : sa dette baisse de 25 €.
        expect(await soldeEnCentimes(page)).toBe(soldeAvant - 2500)
      })
    })
  }

  /**
   * La generation mensuelle, de bout en bout. Un seul passage, pas un par
   * taille d'ecran : le second trouverait le mois deja genere et l'assertion
   * « Charge générée » tomberait a juste titre.
   *
   * Place APRES les deux canaris et le parcours de saisie, comme toute ecriture.
   */
  test('generer la charge du mois, deux fois, ne l ecrit qu une fois', async ({ page }) => {
    await page.goto('/')
    const soldeAvant = await soldeEnCentimes(page)

    await page.goto('/depenses')
    await page.fill('input[name="mois"]', '2026-08')
    await page.selectOption('#payeParGeneration', 'thomas')
    await page.getByRole('button', { name: 'Générer la charge' }).click()

    const resultat = page.getByTestId('resultat-generation')
    await expect(resultat).toContainText('Charge générée')
    // Le total des charges communes de la version en vigueur, et rien d'autre.
    await expect(resultat).toContainText('1 073,59 €')

    // Dans la liste, elle se distingue d'une saisie a la main (issue #24).
    const liste = page.getByTestId('liste-depenses')
    await expect(liste).toContainText('Loyer + charges août 2026')
    await expect(liste).toContainText('générée')

    await page.goto('/')
    const soldeApres = await soldeEnCentimes(page)
    expect(soldeApres).not.toBe(soldeAvant)

    // Le second declenchement : l'ecran le DIT, et le solde ne bouge pas d'un
    // centime. C'est le critere de l'issue #23, verifie a l'ecran.
    await page.goto('/depenses')
    await page.fill('input[name="mois"]', '2026-08')
    await page.getByRole('button', { name: 'Générer la charge' }).click()
    await expect(page.getByTestId('resultat-generation')).toContainText('déjà généré')

    await page.goto('/')
    expect(await soldeEnCentimes(page)).toBe(soldeApres)
  })

  test.describe('suppression d une depense (issue #40)', () => {
    test.use(TELEPHONE)

    /**
     * L'issue #40, a l'ecran : saisir, supprimer, et retrouver le solde AU
     * CENTIME. Un seul passage, sur le telephone — c'est l'ecran qui sert, et
     * deux passages laisseraient la premiere depense derriere eux.
     *
     * `avant` est LU a l'execution, jamais la constante 114580 : les parcours
     * qui precedent ont deja fait bouger le solde du seed. Meme motif que le
     * test « regler les comptes » plus bas.
     */
    test('supprimer une depense rend au solde sa valeur exacte', async ({ page }) => {
      await page.goto('/')
      const avant = await soldeEnCentimes(page)

      await page.goto('/?saisie=1')
      const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
      await feuille.getByRole('button', { name: 'Modifier' }).click()
      const description = 'Coquille a supprimer'
      await feuille.getByRole('radio', { name: 'Autre date' }).check()
      await page.fill('input[name="date"]', '2026-07-11')
      await page.fill('input[name="description"]', description)
      await page.fill('input[name="montant"]', '40,00')
      await feuille.getByRole('radio', { name: 'Thomas' }).check()
      await feuille.getByRole('radio', { name: 'Courante' }).check()
      await feuille.getByRole('button', { name: 'Ajouter la dépense' }).click()
      await expect(feuille).toBeHidden()

      await page.goto('/depenses')
      await expect(page.getByTestId('liste-depenses')).toContainText(description)

      // Thomas a paye 40 € dont 20 € pour Liz : la dette de Liz monte de 20 €.
      await page.goto('/')
      expect(await soldeEnCentimes(page)).toBe(avant + 2000)

      // Le `confirm()` natif : Playwright REJETTE les dialogues par defaut, donc
      // sans ce handler le clic ne supprimerait rien et le test tomberait sur la
      // derniere assertion, en accusant le serveur a tort.
      await page.goto('/depenses')
      page.once('dialog', (dialogue) => dialogue.accept())
      await page.getByRole('button', { name: `Supprimer « ${description} »` }).click()
      await expect(page.getByTestId('liste-depenses')).not.toContainText(description)

      await page.goto('/')
      expect(await soldeEnCentimes(page)).toBe(avant)
    })
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
      await page.goto('/?saisie=1')
      const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
      await feuille.getByRole('button', { name: 'Modifier' }).click()
      await feuille.getByRole('radio', { name: 'Autre date' }).check()

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
      await page.goto('/?saisie=1')
      const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
      await feuille.getByRole('button', { name: 'Modifier' }).click()
      await feuille.getByRole('radio', { name: 'Autre date' }).check()

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
      await page.goto('/?saisie=1')
      const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
      await feuille.getByRole('button', { name: 'Modifier' }).click()
      await feuille.getByRole('radio', { name: 'Autre date' }).check()

      await page.fill('input[name="date"]', '2029-09-29')
      await feuille.getByRole('button', { name: 'Replier' }).click()

      // Un champ `hidden` mais invalide (rangeOverflow) rendrait le bouton
      // "Ajouter la depense" inerte : le navigateur refuse la soumission sans
      // rien afficher, faute de pouvoir focaliser un champ masque.
      await expect(page.locator('input[name="date"]')).toBeVisible()
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

  /**
   * Le pre-remplissage seul, SANS ecrire (issue #26).
   *
   * Il lit le solde affiche, puis verifie que le formulaire propose EXACTEMENT
   * ce montant-la. Aucun chiffre n'est grave dans le test : les ecritures des
   * parcours precedents ont deja fait bouger le solde du seed.
   */
  test('regler les comptes pre-remplit un transfert du solde exact', async ({ page }) => {
    await page.goto('/')
    const solde = await soldeEnCentimes(page)
    // Sans dette, il n'y a rien a pre-remplir et le test ne verifie rien.
    expect(solde).toBeGreaterThan(0)

    await page.goto('/?saisie=regler')
    const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })

    // Les centimes sont recomposes A LA MAIN plutot qu'en important
    // `parserEurosSaisis` : ce test doit pouvoir DETECTER une divergence de
    // format, pas la confirmer par construction en rejouant la meme fonction.
    const saisi = await page.locator('input[name="montant"]').inputValue()
    // `\s` seul suffit : `formaterMontant` a deja remplace les espaces
    // insecables d'Intl par des espaces ordinaires.
    const [euros, centimes] = saisi.replace(/\s/g, '').split(',')
    expect(Number(euros) * 100 + Number(centimes)).toBe(solde)

    // Le payeur est le DEBITEUR — le piege documente de CLAUDE.md. Le seed part
    // de « Liz doit 1 145,80 € a Thomas » et aucun parcours precedent n'inverse
    // ce sens : Liz reste debitrice. Le payeur est visible sans deplier ; la
    // ligne de resume dit le type.
    await expect(feuille.getByRole('radio', { name: 'Liz' })).toBeChecked()
    await expect(feuille.getByText("Aujourd'hui · transfert")).toBeVisible()

    // La preuve du sens, avant toute ecriture, en CENTIMES : `<data value>` porte
    // la valeur exacte, jamais l'euro formate. La totalite va au credit de Thomas.
    await expect(page.getByTestId('apercu-liz')).toHaveAttribute('value', '0')
    await expect(page.getByTestId('apercu-thomas')).toHaveAttribute('value', String(solde))

    // La description est posee, sinon l'apercu ne se declencherait pas (il exige
    // montant ET description) et le champ `required` bloquerait la validation.
    await expect(page.locator('input[name="description"]')).toHaveValue('Règlement des comptes')
  })

  /**
   * Issue #28 — filtrer en UN geste, depuis un telephone.
   *
   * Place ICI, et pas plus bas : le second test lit le solde a regler, que le
   * reglement qui suit met a zero. Aucun des deux n'ecrit quoi que ce soit.
   */
  test.describe('filtrer l historique, sur un telephone', () => {
    test.use(TELEPHONE)

    test('un choix dans un selecteur suffit, sans bouton a valider', async ({ page }) => {
      // `?n=40` : le premier palier qui couvre tout le seed. Ce test parle du
      // FILTRE, pas de la borne — la borne a son propre parcours plus bas.
      await page.goto('/depenses?n=40')
      const lignes = page.getByTestId('liste-depenses').getByRole('listitem')
      const total = await lignes.count()
      expect(total).toBeGreaterThan(1)

      // Le seul geste est le choix : aucun clic sur « Appliquer » entre les deux
      // assertions. C'est le critere de l'issue.
      await page.selectOption('#filtrePayePar', 'liz')
      // `n` survit au changement de filtre : `appliquer()` repart de
      // `new URLSearchParams(params)`, et il arrive en tete puisqu'il y etait
      // deja. Replier la liste au changement de filtre serait le mauvais
      // comportement.
      await expect(page).toHaveURL('/depenses?n=40&payePar=liz')
      // Assertion qui REESSAIE : la navigation est douce, la liste revient du
      // serveur. Une ligne restante hors filtre la ferait echouer.
      await expect(lignes.filter({ hasNotText: 'payé par Liz' })).toHaveCount(0)
      expect(await lignes.count()).toBeLessThan(total)

      // Le mois S'AJOUTE au payeur, il ne le remplace pas.
      await page.selectOption('#filtreMois', '2026-07')
      await expect(page).toHaveURL('/depenses?n=40&payePar=liz&mois=2026-07')
      await expect(lignes.filter({ hasNotText: 'payé par Liz' })).toHaveCount(0)
      await expect(lignes.filter({ hasNotText: '/07/2026' })).toHaveCount(0)
      expect(await lignes.count()).toBeGreaterThan(0)
    })

    test('un filtre ne change pas le montant du reglement', async ({ page }) => {
      await page.goto('/')
      const solde = await soldeEnCentimes(page)
      expect(solde).toBeGreaterThan(0)

      // Le solde se calcule sur TOUTES les depenses, jamais sur le sous-ensemble
      // affiche : un reglement partiel pre-rempli comme s'il soldait tout se
      // virerait sans que rien a l'ecran ne le dise.
      await page.goto('/depenses?mois=2026-08&saisie=regler')
      const saisi = await page.locator('input[name="montant"]').inputValue()
      const [euros, centimes] = saisi.replace(/\s/g, '').split(',')
      expect(Number(euros) * 100 + Number(centimes)).toBe(solde)
    })
  })

  /**
   * LE critere de l'issue #26 : « apres validation, le solde tombe a zero ».
   *
   * DERNIERE ECRITURE DU FICHIER, et ce n'est pas negociable : ce test solde la
   * dette. Tout test place apres lui qui lirait le solde lirait zero, et le
   * canari du seed ne serait plus lisible nulle part. Les parcours telephone qui
   * suivent ne touchent ni au solde ni aux depenses.
   *
   * Ca ne tient que par coincidence de nommage : Playwright ordonne les
   * fichiers alphabetiquement (workers: 1), et `parcours.spec.ts` est
   * justement le dernier fichier de la suite dans cet ordre. Un futur fichier
   * trie apres lui (ex. `solde.spec.ts`, `regressions.spec.ts`) lirait un
   * solde nul des son premier test.
   */
  test('regler les comptes met le solde a zero', async ({ page }) => {
    await page.goto('/')
    const solde = await soldeEnCentimes(page)
    expect(solde).toBeGreaterThan(0)

    await page.getByRole('link', { name: 'Régler les comptes' }).click()
    await expect(page).toHaveURL('/?saisie=regler')

    // Le sens du transfert, a l'ecran et en centimes, AVANT l'ecriture : la
    // totalite au credit de Thomas, rien pour Liz qui verse. C'est cet apercu
    // qui tient lieu de confirmation — il est calcule par la meme fonction que
    // l'ecriture, donc il ne peut pas diverger d'elle.
    await expect(page.getByTestId('apercu-liz')).toHaveAttribute('value', '0')
    await expect(page.getByTestId('apercu-thomas')).toHaveAttribute('value', String(solde))

    const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
    await feuille.getByRole('button', { name: 'Ajouter la dépense' }).click()

    // La feuille se ferme apres l'ecriture, et le formulaire est demonte avec
    // elle : c'est ce qui empeche un second clic. Un reglement redouble serait
    // irreversible sans passer par la suppression (#40) — les parts sont figees
    // pour toujours (snapshot on write).
    await expect(feuille).toBeHidden()
    await expect(page).toHaveURL('/')

    await page.goto('/depenses')
    await expect(page.getByTestId('liste-depenses')).toContainText('Règlement des comptes')

    await page.goto('/')
    // NE PAS utiliser soldeEnCentimes() ici : a zero, le bandeau n'a plus de
    // <data>. Cette phrase EST l'assertion exacte — `synthese()` ne rend
    // 'a-jour' que si soldeThomas vaut exactement 0.
    await expect(page.getByTestId('phrase-synthese')).toHaveText('Vous êtes à jour')

    // Plus rien a regler : le bouton n'existe plus. Un bouton qui ne fait rien
    // inviterait a creer un transfert de zero.
    await expect(page.getByRole('link', { name: 'Régler les comptes' })).toHaveCount(0)
  })

  // Le viewport par defaut de Chromium (1280x720) affiche le rail lateral : les
  // deux defauts de l'issue #13 n'y existent tout simplement pas. Ces trois
  // parcours-la n'ont donc de sens qu'a la taille d'un telephone.
  test.describe('sur un telephone', () => {
    test.use(TELEPHONE)

    test('la navigation est ancree au bord inferieur de l ecran', async ({ page }) => {
      await page.goto('/')
      const barre = page.getByRole('navigation', { name: 'Navigation principale' })
      await expect(barre).toBeVisible()
      const boite = await barre.boundingBox()
      // Le fait a verrouiller n'est pas « dans la moitie basse » mais « ancree
      // au bord inferieur » : le bas de la barre doit atteindre le bas du
      // viewport, a 8px pres. Un seuil de simple moitie passerait encore vert si
      // la barre cessait d'etre fixed et se retrouvait poussee en bas d'une page
      // longue. La hauteur est lue sur TELEPHONE : un viewport change ailleurs
      // ne doit pas laisser une constante perimee valider n'importe quoi.
      const bas = TELEPHONE.viewport.height
      expect((boite?.y ?? 0) + (boite?.height ?? 0)).toBeGreaterThan(bas - 8)
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

  /**
   * Issue #41 — la liste est bornee, la suite reste atteignable, et le formulaire
   * est joignable sans traverser l'historique.
   *
   * Sur le telephone de reference : c'est l'ecran qui a motive l'issue.
   *
   * Place EN DERNIER : il n'ecrit rien, mais il lit des comptes que les
   * ecritures precedentes deplacent.
   */
  test.describe('borner l historique, sur un telephone', () => {
    test.use(TELEPHONE)

    test('la liste s arrete a 20, et « Voir plus » la prolonge', async ({ page }) => {
      await page.goto('/depenses')
      const lignes = page.getByTestId('liste-depenses').getByRole('listitem')

      await expect(lignes).toHaveCount(20)

      const voirPlus = page.getByTestId('voir-plus')
      await expect(voirPlus).toBeVisible()
      await voirPlus.click()

      await expect(page).toHaveURL('/depenses?n=40')
      // Strictement plus qu'avant. Pas d'assertion sur la DISPARITION du bouton
      // ici : les parcours qui precedent ont ajoute des lignes, et 34 + leurs
      // saisies peut depasser 40. C'est le test du palier plus bas qui la verifie,
      // sur une borne assez large pour tout couvrir a coup sur.
      expect(await lignes.count()).toBeGreaterThan(20)
    })

    test('la borne se laisse pousser, mais pas deborner', async ({ page }) => {
      // 100 est un multiple du palier, donc une borne legitime, et il couvre tout
      // le seed : tout s'affiche, et il ne reste rien a voir.
      await page.goto('/depenses?n=100')
      await expect(page.getByTestId('voir-plus')).toHaveCount(0)
      expect(
        await page.getByTestId('liste-depenses').getByRole('listitem').count(),
      ).toBeGreaterThan(20)

      // `?n=999999` n'est aucune des valeurs auxquelles « Voir plus » a pu mener :
      // ce n'est pas une borne, c'est une URL bricolee. L'ecran retombe au palier.
      await page.goto('/depenses?n=999999')
      await expect(page.getByTestId('liste-depenses').getByRole('listitem')).toHaveCount(20)
    })
  })
})
