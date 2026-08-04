# Bouton « Régler les comptes » — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Depuis le tableau de bord, un bouton mène au formulaire de dépense pré-rempli d'un transfert du montant exact du solde ; après validation, le solde tombe à zéro.

**Architecture:** Aucune règle de domaine n'est ajoutée — `synthese()` rend déjà `{ debiteur, crediteur, montant }` avec un montant positif, et régler consiste à lire ces deux champs. Le tableau de bord ne porte qu'un lien vers `/depenses?regler=1` ; c'est la page `/depenses`, qui charge déjà les dépenses, qui recalcule la synthèse et pré-remplit le formulaire existant. Le montant ne transite jamais par l'URL.

**Tech Stack:** Next.js 15 (App Router, Server Components), React 19 (`useState`, `useActionState`), Vitest, Playwright, Tailwind + `class-variance-authority`.

**Spec :** `docs/superpowers/specs/2026-08-04-bouton-regler-les-comptes-design.md`
**Issue :** [#26](https://github.com/tjarrier/HomeBudget/issues/26)

## Global Constraints

- **L'argent est un entier de centimes.** Aucun flottant, nulle part. Le seul endroit du diff où de l'argent traverse une chaîne est `montantPourSaisie()` (tâche 1), et c'est pour cela qu'il porte un test d'aller-retour.
- **Le sens du transfert ne se négocie pas.** C'est le **débiteur** qui verse : `payePar = s.debiteur`. Un transfert de 400 € payé par Liz fige `part_liz = 0`, `part_thomas = 400`, donc `solde_liz = +400` — la dette de Liz **baisse**. Voir « Le piège qui coûte de l'argent » dans `CLAUDE.md`. Ne jamais l'inverser « pour que ça ait l'air logique ».
- **`apps/web` est UI seulement.** Aucun import de `drizzle-orm`, `pg` ou `client.ts` ; `apps/web/test/architecture.test.ts` verrouille par liste blanche les noms importés de `@homebudget/db`. **Ce plan n'ajoute aucun import de `@homebudget/db`** — seulement `resumer` et `synthese` depuis `@homebudget/domain`, qui n'est pas borné.
- **`exactOptionalPropertyTypes` est activé.** Un prop déclaré `x?: T` **refuse** qu'on lui passe explicitement `undefined`. Tout prop optionnel auquel on passe une variable possiblement `undefined` doit être déclaré `x?: T | undefined`.
- **Les dates sont des chaînes ISO `YYYY-MM-DD`**, jamais des objets `Date`.
- **`type` et `mode` ne sont pas indépendants.** `normaliser()` (`apps/web/lib/saisie.ts:62`) refuse toute combinaison où l'un vaut `transfert` sans l'autre. Le pré-remplissage doit poser **les deux**.
- **Plancher tactile : 44px** (`min-h-11`). Il vient gratuitement avec `buttonVariants` ; `e2e/cibles-tactiles.spec.ts` mesure tout `a[href]` visible et attrapera le nouveau lien.
- **Textes en français, accentués.** `Règlement des comptes`, `Régler les comptes`.
- **Commandes :** `task verif` (lint + typecheck + test) avant tout commit ; `task test:e2e:frais` pour les parcours Playwright (base neuve puis Playwright — **destructif**).

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
| --- | --- | --- |
| `apps/web/lib/format.ts` | **Modifier** — ajoute `montantPourSaisie()`, la seule conversion centimes → chaîne de champ du diff. | 1 |
| `apps/web/test/format.test.ts` | **Modifier** — verrouille l'aller-retour `parserEurosSaisis(montantPourSaisie(c)) === c`. | 1 |
| `apps/web/app/(app)/depenses/page.tsx` | **Modifier** — lit `?regler`, recalcule la synthèse sur les dépenses déjà chargées, passe `reglement` au formulaire. | 2 |
| `apps/web/app/(app)/depenses/formulaire-depense.tsx` | **Modifier** — prop optionnel `reglement`, consommé par les initialiseurs `useState` existants. | 2 |
| `apps/web/app/(app)/page.tsx` | **Modifier** — le lien « Régler les comptes » sous le bandeau, conditionné à `s.etat === 'dette'`. | 3 |
| `apps/web/e2e/parcours.spec.ts` | **Modifier** — un test de pré-remplissage (sans écriture, tâche 2), puis le test du critère « le solde tombe à zéro » (avec écriture, tâche 3, **en dernier**). | 2 et 3 |

---

### Task 1: `montantPourSaisie()` — centimes vers champ de saisie

`formaterMontant(114580)` rend `1 145,80 €`. Un champ étiqueté « Montant (€) » ne veut pas du symbole, et son `placeholder` existant (`1 110,58`) fixe la forme attendue. Le risque réel n'est pas l'esthétique : c'est qu'une chaîne mal formée ne se reparse pas et qu'un règlement s'écrive au mauvais montant. D'où le test d'aller-retour.

**Files:**
- Modify: `apps/web/lib/format.ts` (ajout en fin de fichier)
- Test: `apps/web/test/format.test.ts` (ajout d'un `describe`)

**Interfaces:**
- Consumes: `formaterMontant(c: Cents): string` et `type Cents`, déjà présents en tête de `lib/format.ts`.
- Produces: `montantPourSaisie(c: Cents): string` — consommé par la tâche 2.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `apps/web/test/format.test.ts`, ajouter ce `describe` **juste après** le `describe('formaterMontant', …)` existant. `parserEurosSaisis` est déjà importé en tête du fichier ; ajouter `montantPourSaisie` à l'import existant depuis `'../lib/format.js'` (liste alphabétique : après `formaterMontantSigne`).

```ts
describe('montantPourSaisie', () => {
  it('rend le montant sans le symbole, a la forme du placeholder du formulaire', () => {
    // Le placeholder du champ montant est « 1 110,58 » : c'est cette forme-la
    // que le pre-remplissage doit prendre, pas « 1 145,80 € ».
    expect(montantPourSaisie(114580)).toBe('1 145,80')
    expect(montantPourSaisie(0)).toBe('0,00')
    expect(montantPourSaisie(1)).toBe('0,01')
  })

  // LE test qui compte. Le montant pre-rempli repart au serveur par le meme
  // chemin qu'une saisie a la main : s'il ne se reparse pas au centime pres,
  // le reglement s'ecrit au mauvais montant et le solde ne tombe pas a zero.
  it.each([0, 1, 50, 107359, 114580, 100000000])(
    'fait l aller-retour par parserEurosSaisis sans perdre un centime (%i)',
    (cents) => {
      expect(parserEurosSaisis(montantPourSaisie(cents))).toBe(cents)
    },
  )
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter @homebudget/web test format
```

Attendu : ÉCHEC. Le typecheck de vitest ne bloque pas, mais `montantPourSaisie is not a function` (ou une erreur d'import) fait tomber les deux `it`.

- [ ] **Step 3: Écrire l'implémentation minimale**

À la fin de `apps/web/lib/format.ts` :

```ts
/**
 * Un montant pret a etre pose dans un champ de saisie : `1 145,80`, sans le
 * symbole — la forme exacte du `placeholder` du formulaire (`1 110,58`).
 *
 * `formaterMontant` a deja normalise les espaces insecables d'Intl, donc `\s`
 * suffit a attraper celui qui precede l'euro. L'aller-retour par
 * `parserEurosSaisis` est verrouille par un test : ce montant repart au serveur
 * par le meme chemin qu'une saisie a la main.
 */
export function montantPourSaisie(c: Cents): string {
  return formaterMontant(c).replace(/\s€$/, '')
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm --filter @homebudget/web test format
```

Attendu : PASS, 8 assertions (3 de forme + 6 d'aller-retour, dans deux `it`).

- [ ] **Step 5: Vérifier lint et types, puis committer**

```bash
task verif
git add apps/web/lib/format.ts apps/web/test/format.test.ts
git commit -m "feat(web): montantPourSaisie, des centimes vers un champ de saisie

Le montant pre-rempli repart au serveur par le meme chemin qu'une saisie
a la main : un aller-retour par parserEurosSaisis est verrouille par test,
sans quoi un reglement pourrait s'ecrire au mauvais montant.

Refs #26"
```

---

### Task 2: Le pré-remplissage — `?regler=1` et le prop `reglement`

La page `/depenses` appelle **déjà** `listerDepenses()`. Elle rejoue `resumer()` + `synthese()` pour zéro requête supplémentaire, et passe au formulaire le montant et le débiteur. Le formulaire les consomme dans ses initialiseurs `useState` : pas d'`useEffect`, pas de synchronisation, donc rien qui puisse réécrire une frappe de l'utilisateur.

À la fin de cette tâche, `/depenses?regler=1` pré-remplit le formulaire — mais **aucun bouton n'y mène encore** (tâche 3).

**Files:**
- Modify: `apps/web/app/(app)/depenses/page.tsx`
- Modify: `apps/web/app/(app)/depenses/formulaire-depense.tsx`
- Test: `apps/web/e2e/parcours.spec.ts`

**Interfaces:**
- Consumes: `montantPourSaisie(c: Cents): string` (tâche 1) ; `synthese(r: Resume): Synthese` et `resumer(d: Depense[]): Resume` de `@homebudget/domain` ; `modeParDefaut(t: TypeDepense): ModeRepartition`, déjà importé par le formulaire.
- Produces: le prop `reglement?: { montant: Cents; payePar: Personne } | undefined` de `FormulaireDepense`, et la route `/depenses?regler=1`. La tâche 3 y renvoie par un lien.

- [ ] **Step 1: Écrire le test e2e qui échoue**

Dans `apps/web/e2e/parcours.spec.ts`, insérer ce test **juste après** le test `'creer une version ne change aucune depense passee'` (qui se termine ligne ~288) et **avant** le `test.describe('sur un telephone', …)`.

Ce test **n'écrit rien** : il lit le solde, ouvre le formulaire pré-rempli, et s'arrête avant la validation. Il doit donc courir tant que la dette existe encore — c'est-à-dire avant le test de la tâche 3.

```ts
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

  await page.goto('/depenses?regler=1')

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
  // ce sens : Liz reste debitrice. La ligne de resume du formulaire replie dit
  // le payeur et le type sans qu'on ait a deplier.
  await expect(page.getByText(/payé par Liz · transfert/)).toBeVisible()

  // La preuve du sens, avant toute ecriture, en CENTIMES : `<data value>` porte
  // la valeur exacte, jamais l'euro formate. La totalite va au credit de Thomas.
  await expect(page.getByTestId('apercu-liz')).toHaveAttribute('value', '0')
  await expect(page.getByTestId('apercu-thomas')).toHaveAttribute('value', String(solde))

  // La description est posee, sinon l'apercu ne se declencherait pas (il exige
  // montant ET description) et le champ `required` bloquerait la validation.
  await expect(page.locator('input[name="description"]')).toHaveValue('Règlement des comptes')
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
task test:e2e:frais
```

**Destructif** : réinitialise la base locale au seed avant de lancer Playwright. Attendu : ÉCHEC sur le nouveau test — le champ montant est vide, donc `saisi` vaut `''`, `Number('') * 100 + Number(undefined)` vaut `NaN` et l'assertion tombe. Les autres tests du fichier restent verts.

- [ ] **Step 3: Ajouter le prop `reglement` au formulaire**

Dans `apps/web/app/(app)/depenses/formulaire-depense.tsx` :

**3a.** Ajouter `montantPourSaisie` à l'import existant depuis `'@/lib/format'` (ordre alphabétique) :

```ts
import { aujourdhuiLocal, formaterDate, montantPourSaisie } from '@/lib/format'
```

**3b.** Ajouter `type Cents` à l'import existant depuis `'@homebudget/domain'` :

```ts
import {
  type Cents,
  type Personne,
  type TypeDepense,
  dateMaxDepense,
  modeParDefaut,
} from '@homebudget/domain'
```

**3c.** Remplacer la signature du composant et les cinq initialiseurs `useState` concernés (lignes ~33 à ~44). Le `reglement` est déclaré `| undefined` **explicitement** : `exactOptionalPropertyTypes` interdit sinon de lui passer une variable qui peut valoir `undefined`.

```tsx
export function FormulaireDepense({
  personne,
  reglement,
}: {
  personne: Personne
  /**
   * Pose par « Régler les comptes » (issue #26) : le solde courant et la
   * personne qui le DOIT. `| undefined` explicite — `exactOptionalPropertyTypes`
   * refuse qu'on passe `undefined` a un prop simplement optionnel.
   */
  reglement?: { montant: Cents; payePar: Personne } | undefined
}) {
  const [etat, action, enCours] = useActionState(ajouterDepenseAction, null)

  // Un reglement est un TRANSFERT : `type` et `mode` valent tous deux
  // `transfert`, et `normaliser()` refuse toute combinaison croisee. La
  // constante evite de repeter le ternaire sur les deux etats.
  const typeInitial: TypeDepense = reglement ? 'transfert' : 'courante'

  const [date, setDate] = useState(aujourdhuiLocal)
  const [description, setDescription] = useState(reglement ? 'Règlement des comptes' : '')
  const [montant, setMontant] = useState(reglement ? montantPourSaisie(reglement.montant) : '')
  // Pre-rempli avec la personne connectee : dans neuf cas sur dix, on saisit
  // ce qu'on vient de payer soi-meme. Le champ reste modifiable. Un reglement
  // impose le DEBITEUR : c'est lui qui verse, et l'inverser doublerait la
  // dette au lieu de l'annuler (CLAUDE.md, « Le piege qui coute de l'argent »).
  const [payePar, setPayePar] = useState<string>(reglement?.payePar ?? personne)
  const [type, setType] = useState<TypeDepense>(typeInitial)
  // Le mode est PRE-SELECTIONNE d'apres le type, et reste modifiable.
  const [mode, setMode] = useState<string>(modeParDefaut(typeInitial))
```

Le reste du composant est inchangé. **Ne pas ajouter d'`useEffect` de synchronisation** : un initialiseur `useState` ne court qu'au montage, et le lien de la tâche 3 vient d'une autre route, donc le composant se monte. Toute frappe suivante appartient à l'utilisateur.

- [ ] **Step 4: Lire le drapeau dans la page des dépenses**

Dans `apps/web/app/(app)/depenses/page.tsx` :

**4a.** Ajouter l'import du domaine, après l'import de `@homebudget/db` :

```ts
import { resumer, synthese } from '@homebudget/domain'
```

**4b.** Remplacer la signature et le début du composant (lignes 11 à 15) :

```tsx
export default async function Depenses({
  searchParams,
}: {
  searchParams: Promise<{ regler?: string | string[] }>
}) {
  // La personne de la session pre-remplit « paye par » : c'est la raison d'etre
  // de la colonne `user.personne`, posee par le hook d'allowlist.
  const session = await exigerSession()
  const depenses = await listerDepenses()

  // `?regler=1` (issue #26) ne porte qu'un DRAPEAU, jamais le montant. La
  // synthese est rejouee ICI, sur les depenses deja chargees : zero requete de
  // plus, et le chiffre ne quitte jamais le serveur. Un montant passe par l'URL
  // serait fige au rendu du tableau de bord — donc perime des la depense
  // suivante — et serait une saisie utilisateur a valider.
  const { regler } = await searchParams
  const s = synthese(resumer(depenses))
  // Solde nul : rien a regler. Une URL gardee en favori ne pre-remplit donc
  // jamais rien de faux, elle rend le formulaire ordinaire.
  const reglement =
    regler && s.etat === 'dette' ? { montant: s.montant, payePar: s.debiteur } : undefined
```

**4c.** Passer le prop au formulaire (ligne ~46) :

```tsx
<FormulaireDepense personne={session.personne} reglement={reglement} />
```

- [ ] **Step 5: Vérifier lint, types et unitaires**

```bash
task verif
```

Attendu : PASS. En particulier `apps/web/test/architecture.test.ts` reste vert — aucun nom nouveau n'est importé de `@homebudget/db`.

- [ ] **Step 6: Relancer le test e2e pour vérifier qu'il passe**

```bash
task test:e2e:frais
```

Attendu : PASS, y compris `'regler les comptes pre-remplit un transfert du solde exact'`.

Si `payé par Liz · transfert` est introuvable, vérifier que le `type` initial vaut bien `'transfert'` : la ligne de résumé n'affiche `transfert` qu'une fois quand type et mode valent tous deux `transfert` (`construireResume()`).

- [ ] **Step 7: Committer**

```bash
git add "apps/web/app/(app)/depenses/page.tsx" \
        "apps/web/app/(app)/depenses/formulaire-depense.tsx" \
        apps/web/e2e/parcours.spec.ts
git commit -m "feat(web): /depenses?regler=1 pre-remplit un transfert du solde

L'URL ne porte qu'un drapeau : /depenses charge deja les depenses, donc
elle rejoue synthese() pour zero requete de plus. Un montant passe par
l'URL serait fige au rendu du tableau de bord, donc perime des la depense
suivante, et serait une saisie utilisateur a valider.

Le payeur pre-rempli est le DEBITEUR : c'est lui qui verse. Le test e2e
verrouille le sens sur l'attribut value de l'apercu, en centimes.

Refs #26"
```

---

### Task 3: Le bouton du tableau de bord, et le critère « le solde tombe à zéro »

**Files:**
- Modify: `apps/web/app/(app)/page.tsx`
- Test: `apps/web/e2e/parcours.spec.ts`

**Interfaces:**
- Consumes: la route `/depenses?regler=1` (tâche 2) ; `buttonVariants` exporté par `apps/web/components/ui/button.tsx` ; `Link` de `next/link` et la variable `s` (`Synthese`), tous deux déjà présents dans `page.tsx`.
- Produces: rien que d'autres tâches consomment. C'est le dernier maillon.

- [ ] **Step 1: Écrire le test e2e qui échoue**

Dans `apps/web/e2e/parcours.spec.ts`, insérer ce test **juste après** celui de la tâche 2, et **avant** le `test.describe('sur un telephone', …)`.

**Piège à ne pas reproduire : ne pas appeler `soldeEnCentimes()` après le règlement.** Quand le solde vaut zéro, `synthese()` rend `{ etat: 'a-jour' }` et le bandeau n'affiche plus aucun `<data>` — il affiche « Vous êtes à jour ». `soldeEnCentimes()` échouerait sur un locator introuvable, et pour la mauvaise raison. La phrase **est** l'assertion exacte : `synthese()` ne rend `'a-jour'` que si `soldeThomas === 0`.

```ts
/**
 * LE critere de l'issue #26 : « apres validation, le solde tombe a zero ».
 *
 * DERNIERE ECRITURE DU FICHIER, et ce n'est pas negociable : ce test solde la
 * dette. Tout test place apres lui qui lirait le solde lirait zero, et le
 * canari du seed ne serait plus lisible nulle part. Les parcours telephone qui
 * suivent ne touchent ni au solde ni aux depenses.
 */
test('regler les comptes met le solde a zero', async ({ page }) => {
  await page.goto('/')
  const solde = await soldeEnCentimes(page)
  expect(solde).toBeGreaterThan(0)

  await page.getByRole('link', { name: 'Régler les comptes' }).click()
  await expect(page).toHaveURL('/depenses?regler=1')

  // Le sens du transfert, a l'ecran et en centimes, AVANT l'ecriture : la
  // totalite au credit de Thomas, rien pour Liz qui verse. C'est cet apercu
  // qui tient lieu de confirmation — il est calcule par la meme fonction que
  // l'ecriture, donc il ne peut pas diverger d'elle.
  await expect(page.getByTestId('apercu-liz')).toHaveAttribute('value', '0')
  await expect(page.getByTestId('apercu-thomas')).toHaveAttribute('value', String(solde))

  await page.getByRole('button', { name: 'Ajouter la dépense' }).click()
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
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
task test:e2e:frais
```

Attendu : ÉCHEC sur le nouveau test — `getByRole('link', { name: 'Régler les comptes' })` ne trouve rien et le clic expire. Les autres tests du fichier restent verts, y compris celui de la tâche 2.

- [ ] **Step 3: Ajouter le bouton au tableau de bord**

Dans `apps/web/app/(app)/page.tsx` :

**3a.** Ajouter l'import, après celui de `@/components/carte` (ordre alphabétique des chemins : `components/ui/button` vient après `components/montant`) :

```ts
import { buttonVariants } from '@/components/ui/button'
```

**3b.** Insérer le bloc **entre** la fermeture `</section>` du bandeau (ligne ~90) et le `<div className="mt-5 grid grid-cols-2 …">` des quatre chiffres (ligne ~92) :

```tsx
{/* Sous le bandeau, jamais dedans : `bg-emphasis` est le SEUL aplat sombre
    du systeme et il est ecrit pour ne porter qu'une chose (DESIGN.md).
    Aucune des deux variantes de Button n'y tient — `primaire` serait
    slate-900 sur slate-900 — et DESIGN.md dit « deux variantes, pas plus ».
    Ici, `discret` fonctionne tel quel et `min-h-11` vient avec.

    Rien a regler, pas de bouton : un bouton inerte inviterait a creer un
    transfert de zero. */}
{s.etat === 'dette' && (
  <Link
    href="/depenses?regler=1"
    className={buttonVariants({ variant: 'discret', className: 'mt-5' })}
  >
    Régler les comptes
  </Link>
)}
```

`buttonVariants` accepte `className` et le fusionne (c'est ce que fait déjà le composant `Button`). `s` est la `Synthese` calculée ligne 33 ; TypeScript restreint l'union, donc `s.etat === 'dette'` suffit — aucun accès à `s.montant` n'est nécessaire ici, le montant est recalculé par `/depenses`.

- [ ] **Step 4: Vérifier lint, types et unitaires**

```bash
task verif
```

Attendu : PASS.

- [ ] **Step 5: Relancer les parcours e2e complets**

```bash
task test:e2e:frais
```

Attendu : PASS sur tout le fichier, dans l'ordre. Vérifier en particulier que **le canari du seed reste vert** — « Liz doit 1 145,80 € à Thomas », `value="114580"` — dans les deux tailles d'écran. S'il tombe, une des quatre règles de `CLAUDE.md` a été violée : ne pas ajuster le canari, trouver ce qui a cassé.

`e2e/cibles-tactiles.spec.ts` couvre le nouveau lien sans qu'on ait rien à y inscrire (il mesure tout `a[href]` visible à 360px) et tourne **avant** `parcours.spec.ts` dans l'ordre alphabétique des fichiers, donc pendant que la dette existe encore et que le bouton est affiché.

- [ ] **Step 6: Committer**

```bash
git add "apps/web/app/(app)/page.tsx" apps/web/e2e/parcours.spec.ts
git commit -m "feat(web): bouton Regler les comptes sur le tableau de bord

Sous le bandeau et non dedans : bg-emphasis est le seul aplat sombre du
systeme, et aucune des deux variantes de Button n'y tient. Absent quand
le solde est nul — un bouton inerte inviterait a creer un transfert de
zero.

Le parcours e2e verrouille le critere de l'issue : apres validation, le
bandeau dit « Vous etes a jour », ce que synthese() ne rend que si le
solde vaut exactement zero.

Closes #26"
```

---

## Auto-revue du plan

**Couverture de la spec.** Les cinq décisions sont implémentées : pré-remplir plutôt qu'écrire (tâche 2, le formulaire existant est réutilisé tel quel), drapeau plutôt que montant dans l'URL (tâche 2, step 4b), bouton sous le bandeau (tâche 3, step 3b), absence à solde nul (tâche 3, step 3b et son assertion `toHaveCount(0)`), montant modifiable (rien ne le verrouille — le champ reste un `Input` contrôlé ordinaire). Les deux vérifications annoncées existent : l'aller-retour unitaire (tâche 1) et le critère e2e (tâche 3). Le tableau des états pré-remplis de la spec est repris intégralement au step 3c de la tâche 2.

**Placeholders.** Aucun `TBD`, aucun « ajouter la gestion d'erreur », aucun « comme la tâche N ». Chaque step de code porte son code.

**Cohérence des types.** `montantPourSaisie(c: Cents): string` est défini en tâche 1 et appelé sous ce nom en tâche 2. `reglement?: { montant: Cents; payePar: Personne } | undefined` est déclaré en tâche 2 step 3c et construit sous cette forme exacte au step 4b (`{ montant: s.montant, payePar: s.debiteur }` — `Synthese` en variante `'dette'` porte bien `montant: Cents` et `debiteur: Personne`). `buttonVariants` est le nom réellement exporté par `components/ui/button.tsx`.

**Un écart assumé au TDD strict.** La tâche 2 écrit son test e2e avant l'implémentation, mais ce test ne tourne qu'avec Docker et un navigateur (`task test:e2e:frais`, destructif). C'est le seul niveau où le pré-remplissage est observable : il n'existe aucun test unitaire de composant React dans ce dépôt, et en introduire un pour ce diff ajouterait une dépendance et un pattern que rien d'autre ne suit.
