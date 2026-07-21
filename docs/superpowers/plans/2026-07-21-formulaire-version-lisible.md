# B4 — Formulaire de version lisible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avant de valider la création d'une version, montrer quelle version sera clôturée, à quelle date exacte, et ce qui change — via un aperçu de clôture vivant.

**Architecture :** Une fonction pure `apercuCloture()` dans `apps/web/lib/`, testée seule, calcule la date de clôture (`veilleDe`) et le diff des moteurs de répartition (part Thomas, salaires, charges communes) en réutilisant les fonctions du domaine. Le composant `FormulaireVersion` passe en champs contrôlés ceux qui alimentent l'aperçu, appelle le helper à chaque rendu et se contente d'afficher le résultat.

**Tech Stack :** Next.js (App Router, `'use client'`), React `useState`, TypeScript, Vitest, Playwright, `@homebudget/domain` (pur), Tailwind + tokens sémantiques.

## Global Constraints

- **L'argent est un entier de centimes.** Aucun flottant dans le domaine ni la base ; le formatage euro n'existe qu'à l'affichage, via `<Montant>`.
- **Aucun recalcul de règle hors du domaine.** Le composant ne calcule aucune répartition : il route des nombres déjà calculés par `apercuCloture()` (qui appelle `ratioThomas`, `totalChargesCommunes`, `veilleDe`).
- **`apps/web` est UI seulement.** Aucun import de `@homebudget/db` ; seuls `@homebudget/domain` et `@/lib/*` sont autorisés (verrou `architecture.test.ts`).
- **Achromatique, deux accents seulement.** Aucune classe de palette Tailwind en dur (`bg-white`, `text-red-700`, `bg-slate-100`…) dans `app/` ni `components/` : uniquement des tokens sémantiques (`text-strong`, `text-muted-foreground`, `text-faint`, `border-subtle`, `bg-muted`). Verrou `theme.test.ts`.
- **Une seule fonte (Inter).** Aucun `--font-heading`.
- **Dates : chaînes ISO `YYYY-MM-DD`.** Jamais d'objet `Date` exposé. La date de clôture affichée est **exactement** `veilleDe(dateDebut)`.
- **Le canari du solde ne bouge pas.** L'e2e crée une version (`2026-09-01`, salaires `4000/1000`) et vérifie `31/08/2026` puis l'invariance du solde. On ne change ni les `name` des champs, ni l'ordre de soumission ; on n'ajoute que des assertions *avant* le clic.

---

### Task 1: Helper pur `apercuCloture()` + tests unitaires

**Files:**
- Create: `apps/web/lib/apercu-cloture.ts`
- Test: `apps/web/test/apercu-cloture.test.ts`

**Interfaces:**
- Consumes (du domaine, déjà exportés par `@homebudget/domain`) :
  `parserEurosSaisis(s: string): Cents` (lève si illisible),
  `ratioThomas(v: VersionConfig): number` (lève si somme des salaires ≤ 0),
  `totalChargesCommunes(v: VersionConfig): Cents`,
  `veilleDe(iso: string): string` (lève si date calendairement invalide),
  types `Cents`, `VersionConfig`. Et `parserCharges(brut: string): Charge[]` de `@/lib/charges` (lève si une ligne est illisible).
- Produces (consommés par la Task 2) :
  ```ts
  export interface SaisieBruteVersion {
    dateDebut: string
    salaireNetThomas: string
    salaireNetLiz: string
    chargesCommunes: string
  }
  export interface LigneCloture {
    libelle: string
    unite: 'euros' | 'pourcent'
    avant: number // centimes si 'euros', ratio 0–1 si 'pourcent'
    apres: number
  }
  export interface ApercuCloture {
    dateCloture: string | null // ISO ; null tant qu'aucune date valide ET postérieure
    dateTropTot: boolean        // date saisie mais <= courante.dateDebut
    lignes: LigneCloture[]      // uniquement les moteurs qui changent réellement
  }
  export function apercuCloture(
    courante: VersionConfig,
    saisie: SaisieBruteVersion,
  ): ApercuCloture
  ```

- [ ] **Step 1 : Écrire le fichier de test qui échoue**

Créer `apps/web/test/apercu-cloture.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import type { VersionConfig } from '@homebudget/domain'
import { apercuCloture } from '@/lib/apercu-cloture'

// Version courante de référence : salaires 3 300 / 1 800 (part Thomas ≈ 65 %),
// charges communes = 79 100 + 12 000 = 91 100 centimes.
const COURANTE: VersionConfig = {
  id: 'v-test',
  libelle: 'Loyer 2026',
  dateDebut: '2026-07-01',
  dateFin: null,
  salaireNetThomas: 330000,
  salaireNetLiz: 180000,
  chargesCommunes: [
    { libelle: 'Loyer', montant: 79100 },
    { libelle: 'Élec', montant: 12000 },
  ],
  chargesPersoThomas: [],
  chargesPersoLiz: [],
}

// Une saisie qui recopie exactement la version courante (aucun changement).
const SAISIE_IDENTIQUE = {
  dateDebut: '',
  salaireNetThomas: '3 300,00',
  salaireNetLiz: '1 800,00',
  chargesCommunes: 'Loyer=791,00\nÉlec=120,00',
}

describe('apercuCloture', () => {
  it('clôture à la veille quand la date est postérieure au début courant', () => {
    const a = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '2026-09-01' })
    expect(a.dateCloture).toBe('2026-08-31')
    expect(a.dateTropTot).toBe(false)
  })

  it('refuse une date antérieure ou égale au début courant', () => {
    const egale = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '2026-07-01' })
    expect(egale.dateCloture).toBeNull()
    expect(egale.dateTropTot).toBe(true)

    const avant = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '2026-06-01' })
    expect(avant.dateCloture).toBeNull()
    expect(avant.dateTropTot).toBe(true)
  })

  it('sans date : aucune clôture, pas de « trop tôt »', () => {
    const a = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '' })
    expect(a.dateCloture).toBeNull()
    expect(a.dateTropTot).toBe(false)
  })

  it('config identique : aucune ligne de diff', () => {
    const a = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '2026-09-01' })
    expect(a.lignes).toEqual([])
  })

  it('salaire Thomas modifié : ligne salaire + recalcul de la part', () => {
    const a = apercuCloture(COURANTE, {
      ...SAISIE_IDENTIQUE,
      dateDebut: '2026-09-01',
      salaireNetThomas: '4 000,00',
    })
    const libelles = a.lignes.map((l) => l.libelle)
    expect(libelles).toEqual(['Part Thomas', 'Salaire Thomas'])

    const salaire = a.lignes.find((l) => l.libelle === 'Salaire Thomas')
    expect(salaire).toMatchObject({ unite: 'euros', avant: 330000, apres: 400000 })

    const part = a.lignes.find((l) => l.libelle === 'Part Thomas')
    expect(part?.unite).toBe('pourcent')
    // 3 300 / 5 100 ≈ 0,647 → 65 % ; 4 000 / 5 800 ≈ 0,690 → 69 %
    expect(Math.round((part?.avant ?? 0) * 100)).toBe(65)
    expect(Math.round((part?.apres ?? 0) * 100)).toBe(69)
  })

  it('champ salaire en cours de frappe : ligne omise, pas d’exception', () => {
    const a = apercuCloture(COURANTE, {
      ...SAISIE_IDENTIQUE,
      dateDebut: '2026-09-01',
      salaireNetThomas: '4 000,', // illisible (virgule sans décimales)
      salaireNetLiz: '1 000,00', // lisible et modifié
    })
    // Salaire Thomas illisible → pas de ligne salaire Thomas, et Part Thomas
    // indéfinie (un des deux salaires manque) → pas de ligne part non plus.
    expect(a.lignes.map((l) => l.libelle)).toEqual(['Salaire Liz'])
  })

  it('charges communes modifiées : ligne charges avec le nouveau total', () => {
    const a = apercuCloture(COURANTE, {
      ...SAISIE_IDENTIQUE,
      dateDebut: '2026-09-01',
      chargesCommunes: 'Loyer=791,00\nÉlec=120,00\nEau=30,00',
    })
    const charges = a.lignes.find((l) => l.libelle === 'Charges communes')
    expect(charges).toMatchObject({ unite: 'euros', avant: 91100, apres: 94100 })
  })
})
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @homebudget/web exec vitest run test/apercu-cloture.test.ts`
Expected : FAIL — `Cannot find module '@/lib/apercu-cloture'` (le fichier n'existe pas encore).

- [ ] **Step 3 : Écrire le helper**

Créer `apps/web/lib/apercu-cloture.ts` :

```ts
import { parserCharges } from '@/lib/charges'
import {
  type Cents,
  type VersionConfig,
  parserEurosSaisis,
  ratioThomas,
  totalChargesCommunes,
  veilleDe,
} from '@homebudget/domain'

export interface SaisieBruteVersion {
  dateDebut: string
  salaireNetThomas: string
  salaireNetLiz: string
  chargesCommunes: string
}

export interface LigneCloture {
  libelle: string
  unite: 'euros' | 'pourcent'
  /** centimes si `unite === 'euros'`, ratio 0–1 si `'pourcent'`. */
  avant: number
  apres: number
}

export interface ApercuCloture {
  /** ISO `YYYY-MM-DD`. `null` tant qu'aucune date valide ET postérieure au début courant. */
  dateCloture: string | null
  /** Date saisie mais antérieure ou égale au début de la version courante. */
  dateTropTot: boolean
  /** Uniquement les moteurs de répartition qui changent réellement. */
  lignes: LigneCloture[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Les euros saisis, ou `null` si la chaîne est encore illisible (frappe en cours). */
function centsOuNull(brut: string): Cents | null {
  try {
    return parserEurosSaisis(brut)
  } catch {
    return null
  }
}

/** Le total des charges saisies, ou `null` si une ligne est illisible. */
function totalChargesOuNull(brut: string): Cents | null {
  try {
    return parserCharges(brut).reduce((somme, c) => somme + c.montant, 0)
  } catch {
    return null
  }
}

/** La part Thomas, ou `null` si la répartition est indéfinie (somme des salaires ≤ 0). */
function ratioOuNull(v: VersionConfig): number | null {
  try {
    return ratioThomas(v)
  } catch {
    return null
  }
}

function calculerDateCloture(
  courante: VersionConfig,
  dateDebut: string,
): { dateCloture: string | null; dateTropTot: boolean } {
  if (!ISO.test(dateDebut)) return { dateCloture: null, dateTropTot: false }
  // Le versioning est append-only : une prise d'effet <= au début courant serait
  // rejetée par `cloturerEtAjouter`. On n'affiche pas une « veille » absurde.
  if (dateDebut <= courante.dateDebut) return { dateCloture: null, dateTropTot: true }
  try {
    return { dateCloture: veilleDe(dateDebut), dateTropTot: false }
  } catch {
    // Bien formée mais calendairement invalide (30 février) : <input type="date">
    // n'en produit pas, mais on ne fait pas confiance à la saisie.
    return { dateCloture: null, dateTropTot: false }
  }
}

/**
 * Ce que la création d'une version va fermer, et ce qu'elle change.
 *
 * Fonction PURE : elle ne calcule aucune règle elle-même, elle réutilise le
 * domaine (`veilleDe`, `ratioThomas`, `totalChargesCommunes`). La date de clôture
 * qu'elle renvoie est exactement celle qu'écrira `cloturerEtAjouter`.
 */
export function apercuCloture(
  courante: VersionConfig,
  saisie: SaisieBruteVersion,
): ApercuCloture {
  const lignes: LigneCloture[] = []

  const salaireThomasApres = centsOuNull(saisie.salaireNetThomas)
  const salaireLizApres = centsOuNull(saisie.salaireNetLiz)

  // Part Thomas en tête, mais elle exige les DEUX salaires « après ».
  const ratioAvant = ratioOuNull(courante)
  const ratioApres =
    salaireThomasApres !== null && salaireLizApres !== null
      ? ratioOuNull({
          ...courante,
          salaireNetThomas: salaireThomasApres,
          salaireNetLiz: salaireLizApres,
        })
      : null
  if (
    ratioAvant !== null &&
    ratioApres !== null &&
    Math.round(ratioAvant * 100) !== Math.round(ratioApres * 100)
  ) {
    lignes.push({ libelle: 'Part Thomas', unite: 'pourcent', avant: ratioAvant, apres: ratioApres })
  }

  if (salaireThomasApres !== null && salaireThomasApres !== courante.salaireNetThomas) {
    lignes.push({
      libelle: 'Salaire Thomas',
      unite: 'euros',
      avant: courante.salaireNetThomas,
      apres: salaireThomasApres,
    })
  }
  if (salaireLizApres !== null && salaireLizApres !== courante.salaireNetLiz) {
    lignes.push({
      libelle: 'Salaire Liz',
      unite: 'euros',
      avant: courante.salaireNetLiz,
      apres: salaireLizApres,
    })
  }

  const chargesApres = totalChargesOuNull(saisie.chargesCommunes)
  const chargesAvant = totalChargesCommunes(courante)
  if (chargesApres !== null && chargesApres !== chargesAvant) {
    lignes.push({
      libelle: 'Charges communes',
      unite: 'euros',
      avant: chargesAvant,
      apres: chargesApres,
    })
  }

  const { dateCloture, dateTropTot } = calculerDateCloture(courante, saisie.dateDebut)
  return { dateCloture, dateTropTot, lignes }
}
```

- [ ] **Step 4 : Lancer les tests, vérifier qu'ils passent**

Run: `pnpm --filter @homebudget/web exec vitest run test/apercu-cloture.test.ts`
Expected : PASS (7 tests).

- [ ] **Step 5 : Lint + typecheck**

Run: `task lint && task typecheck`
Expected : aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add apps/web/lib/apercu-cloture.ts apps/web/test/apercu-cloture.test.ts
git commit -m "feat(web): calculer l apercu de cloture d une version (pur, teste)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Brancher l'aperçu dans `FormulaireVersion`

**Files:**
- Modify: `apps/web/app/(app)/config/formulaire-version.tsx` (remplacement complet du fichier)

**Interfaces:**
- Consumes : `apercuCloture`, types `ApercuCloture`, `LigneCloture` de `@/lib/apercu-cloture` (Task 1) ; `Montant` de `@/components/montant` ; `formaterDate` de `@/lib/format`.
- Produces : le bloc d'aperçu porte `data-testid="apercu-cloture"` (consommé par la Task 3).

- [ ] **Step 1 : Remplacer le fichier**

Remplacer **tout** le contenu de `apps/web/app/(app)/config/formulaire-version.tsx` par :

```tsx
'use client'

import { creerVersionAction } from '@/actions/config'
import { Carte } from '@/components/carte'
import { Montant } from '@/components/montant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { type ApercuCloture, type LigneCloture, apercuCloture } from '@/lib/apercu-cloture'
import { formaterDate } from '@/lib/format'
import type { Charge, VersionConfig } from '@homebudget/domain'
import { useActionState, useState } from 'react'

/** L'inverse de `parserCharges` de l'action : une ligne « Libellé=791,00 ». */
function enLignes(charges: Charge[]): string {
  return charges
    .map((c) => `${c.libelle}=${(c.montant / 100).toFixed(2).replace('.', ',')}`)
    .join('\n')
}

function enEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

export function FormulaireVersion({ courante }: { courante: VersionConfig | null }) {
  const [etat, action, enCours] = useActionState(creerVersionAction, null)

  // Ces quatre champs pilotent l'apercu de cloture : ils sont CONTROLES pour se
  // recalculer a chaque frappe. Ils sont pre-remplis d'apres la version courante,
  // exactement comme les `defaultValue` d'avant. Les deux textareas perso restent
  // non controles : ils n'entrent pas dans l'apercu.
  const [dateDebut, setDateDebut] = useState('')
  const [salaireNetThomas, setSalaireNetThomas] = useState(
    courante ? enEuros(courante.salaireNetThomas) : '',
  )
  const [salaireNetLiz, setSalaireNetLiz] = useState(courante ? enEuros(courante.salaireNetLiz) : '')
  const [chargesCommunes, setChargesCommunes] = useState(
    courante ? enLignes(courante.chargesCommunes) : '',
  )

  return (
    <Carte titre="Nouvelle version">
      <form action={action} className="flex flex-col gap-3.5">
        {/* La raison d'etre du projet, dite a l'utilisateur au moment ou il en
            doute. C'est l'un des deux seuls accents chromatiques du systeme.
            Le detail « quelle version, quelle date » a quitte ce bandeau statique
            pour vivre dans l'apercu de cloture, ou il devient precis et vivant. */}
        <p className="rounded-md bg-positive-surface px-3.5 py-3 text-[0.8125rem] leading-relaxed text-positive">
          Créer une version ne touche <strong>aucune</strong> dépense passée : leurs parts ont été
          figées le jour de leur saisie.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="libelle">Libellé</Label>
          <Input id="libelle" name="libelle" required placeholder="Révision loyer 2027" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateDebut">Prise d'effet</Label>
          <Input
            id="dateDebut"
            name="dateDebut"
            type="date"
            required
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
          />
        </div>

        {/* Un salaire depasse toujours 999 € : c'est le seul champ du projet ou le
            separateur de milliers se pose des la premiere saisie. Le parseur accepte
            l'espace (« 3 300,00 ») et la virgule decimale, mais REFUSE le point
            (« 3.300,00 »). Ce choix strict se defend — il ne peut pas confondre un
            separateur de milliers avec un separateur decimal ; l'absence
            d'indication, elle, ne se defendait pas. */}
        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="salaireNetThomas">Salaire Thomas (€)</Label>
            <Input
              id="salaireNetThomas"
              name="salaireNetThomas"
              required
              inputMode="decimal"
              placeholder="3 300,00"
              value={salaireNetThomas}
              onChange={(e) => setSalaireNetThomas(e.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="salaireNetLiz">Salaire Liz (€)</Label>
            <Input
              id="salaireNetLiz"
              name="salaireNetLiz"
              required
              inputMode="decimal"
              placeholder="2 100,00"
              value={salaireNetLiz}
              onChange={(e) => setSalaireNetLiz(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Format : <code className="font-mono">3 300,00</code> — virgule décimale, espace pour les
          milliers. Le point n’est pas accepté comme séparateur de milliers.
        </p>

        {/* Charges communes : CONTROLE, car son total alimente l'apercu de cloture. */}
        <div className="flex flex-col gap-1.5">
          {/* `flex-wrap` : a 360px, ce libelle long suivi de son exemple en <code>
              se chevauchent sinon (issue #6). */}
          <Label htmlFor="chargesCommunes" className="flex-wrap">
            Charges communes — une par ligne, au format{' '}
            <code className="font-mono">Libellé=791,00</code>
          </Label>
          <Textarea
            id="chargesCommunes"
            name="chargesCommunes"
            rows={4}
            value={chargesCommunes}
            onChange={(e) => setChargesCommunes(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        {/* Perso Thomas/Liz : hors apercu, non controles (defaultValue). */}
        {(
          [
            ['chargesPersoThomas', 'Charges perso Thomas', courante?.chargesPersoThomas ?? []],
            ['chargesPersoLiz', 'Charges perso Liz', courante?.chargesPersoLiz ?? []],
          ] as const
        ).map(([nom, libelle, charges]) => (
          <div key={nom} className="flex flex-col gap-1.5">
            <Label htmlFor={nom} className="flex-wrap">
              {libelle} — une par ligne, au format <code className="font-mono">Libellé=791,00</code>
            </Label>
            {/* `font-mono text-xs` seulement : la forme du controle vient de `Textarea`. */}
            <Textarea
              id={nom}
              name={nom}
              rows={4}
              defaultValue={enLignes(charges as Charge[])}
              className="font-mono text-xs"
            />
          </div>
        ))}

        {/* L'apercu de cloture : le dernier point de lecture avant de valider.
            Absent tant qu'il n'y a rien a fermer (premiere version). */}
        {courante ? (
          <ApercuClotureVue
            courante={courante}
            apercu={apercuCloture(courante, {
              dateDebut,
              salaireNetThomas,
              salaireNetLiz,
              chargesCommunes,
            })}
          />
        ) : null}

        {etat && !etat.ok && (
          <p data-testid="message-erreur" className="text-sm text-destructive">
            {etat.message}
          </p>
        )}

        <Button type="submit" disabled={enCours} className="w-full">
          {enCours ? 'Création…' : 'Créer la version'}
        </Button>
      </form>
    </Carte>
  )
}

/** Ce que la creation ferme, et ce qu'elle change. Aucun calcul ici : tout vient
    du helper `apercuCloture`. */
function ApercuClotureVue({
  courante,
  apercu,
}: {
  courante: VersionConfig
  apercu: ApercuCloture
}) {
  return (
    <div
      data-testid="apercu-cloture"
      className="rounded-lg border border-subtle bg-muted px-3.5 py-3"
    >
      {apercu.dateCloture ? (
        <>
          <p className="text-[0.8125rem] text-body">
            Clôture de « {courante.libelle} » au{' '}
            <strong className="text-strong">{formaterDate(apercu.dateCloture)}</strong>
          </p>
          {apercu.lignes.length > 0 ? (
            <>
              <h4 className="mt-2.5 mb-1.5 text-[0.6875rem] tracking-[0.05em] text-faint uppercase">
                Ce qui change
              </h4>
              <ul className="flex flex-col gap-1">
                {apercu.lignes.map((l) => (
                  <li
                    key={l.libelle}
                    className="flex items-center justify-between gap-2.5 text-xs"
                  >
                    <span className="text-muted-foreground">{l.libelle}</span>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <ValeurCloture ligne={l} bord="avant" />
                      <span aria-hidden="true" className="text-faint">
                        →
                      </span>
                      <ValeurCloture ligne={l} bord="apres" />
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1.5 text-xs text-faint">
              Aucun chiffre ne change — seule la période bascule.
            </p>
          )}
        </>
      ) : apercu.dateTropTot ? (
        <p className="text-xs text-faint">
          La prise d'effet doit être postérieure au {formaterDate(courante.dateDebut)} de la version
          en cours.
        </p>
      ) : (
        <p className="text-xs text-faint">
          Choisissez une prise d'effet pour voir ce que la clôture ferme.
        </p>
      )}
    </div>
  )
}

/** Une valeur avant/apres : ancien en attenue, nouveau en accentue. Achromatique. */
function ValeurCloture({ ligne, bord }: { ligne: LigneCloture; bord: 'avant' | 'apres' }) {
  const valeur = bord === 'avant' ? ligne.avant : ligne.apres
  const fort = bord === 'apres'
  if (ligne.unite === 'pourcent') {
    return (
      <span
        className={
          fort ? 'font-semibold tabular-nums text-strong' : 'tabular-nums text-muted-foreground'
        }
      >
        {Math.round(valeur * 100)} %
      </span>
    )
  }
  return (
    <Montant
      cents={valeur}
      niveau={fort ? 'courant' : 'discret'}
      className={fort ? 'text-xs text-strong' : 'text-xs'}
    />
  )
}
```

- [ ] **Step 2 : Typecheck + lint**

Run: `task typecheck && task lint`
Expected : aucune erreur. (Vérifie notamment que `value` contrôlé + `onChange` typent correctement, et que les tokens sémantiques passent `theme.test.ts`.)

- [ ] **Step 3 : Lancer les tests unitaires web (verrous statiques)**

Run: `pnpm --filter @homebudget/web exec vitest run test/theme.test.ts test/architecture.test.ts`
Expected : PASS — aucune couleur en dur, aucun import hors façade.

- [ ] **Step 4 : Commit**

```bash
git add "apps/web/app/(app)/config/formulaire-version.tsx"
git commit -m "feat(web): afficher un apercu de cloture avant de creer une version

Montre quelle version se ferme, a quelle date exacte (la veille), et le diff
des moteurs de repartition. Recentre le bandeau de reassurance sur son invariant.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Verrouiller l'aperçu dans le parcours e2e

**Files:**
- Modify: `apps/web/e2e/parcours.spec.ts` (test « creer une version ne change aucune depense passee », vers la ligne 65–86)

**Interfaces:**
- Consumes : `data-testid="apercu-cloture"` (Task 2), le champ `input[name="dateDebut"]` déjà rempli à `2026-09-01`, salaires `4000,00` / `1000,00`.

- [ ] **Step 1 : Ajouter les assertions AVANT le clic**

Dans `apps/web/e2e/parcours.spec.ts`, dans le test `creer une version ne change aucune depense passee`, entre le remplissage des champs et le clic sur « Créer la version », insérer :

```ts
    // B4 : avant de valider, l'apercu montre ce qu'on ferme, quand, et ce qui
    // change. La date de cloture est la VEILLE de la prise d'effet.
    const apercu = page.getByTestId('apercu-cloture')
    await expect(apercu).toContainText('31/08/2026')
    await expect(apercu).toContainText('Ce qui change')
    // Le nouveau salaire Thomas (400 000 centimes) est une ligne modifiee.
    await expect(apercu).toContainText('4 000,00')
```

Le bloc existant à modifier (le clic reste inchangé, juste précédé des assertions) :

```ts
    await page.goto('/config')
    await page.fill('input[name="libelle"]', 'Révision de loyer 2026')
    await page.fill('input[name="dateDebut"]', '2026-09-01')
    await page.fill('input[name="salaireNetThomas"]', '4000,00')
    await page.fill('input[name="salaireNetLiz"]', '1000,00')

    // ← insérer ici les assertions de l'apercu (bloc ci-dessus)

    await page.getByRole('button', { name: 'Créer la version' }).click()
```

- [ ] **Step 2 : Lancer l'e2e sur base fraîche**

Run: `task test:e2e:frais`
Expected : PASS — les trois parcours passent, dont « creer une version » avec les nouvelles assertions ; le canari du solde reste vérifié (`31/08/2026` dans la timeline, invariance du solde).

- [ ] **Step 3 : Commit**

```bash
git add apps/web/e2e/parcours.spec.ts
git commit -m "test(web): verrouiller l apercu de cloture dans le parcours de version

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Vérification finale

**Files:** aucun (porte de sortie).

- [ ] **Step 1 : Rejouer la porte avant commit**

Run: `task verif`
Expected : lint + typecheck + tous les tests unitaires au vert (dont `apercu-cloture.test.ts`, `theme.test.ts`, `architecture.test.ts`).

- [ ] **Step 2 : Vérifier visuellement (optionnel mais recommandé)**

Run: `task db:reset && task dev` puis ouvrir `http://localhost:3000/config`.
Vérifier à la main : sans date → invite ; date `2026-09-01` + salaires modifiés → « Clôture de « Révision loyer » au 31/08/2026 » + lignes de diff ; date `2026-01-01` (avant le début courant) → message « doit être postérieure ».

---

## Notes d'implémentation

- **Pourquoi contrôler seulement quatre champs.** `libelle` et les charges perso n'entrent pas dans l'aperçu ; les laisser non contrôlés évite du state inutile. Tous les champs gardent leur `name`, donc la soumission FormData est identique.
- **Pas de reset après création.** Le composant ne réinitialise pas ses champs après un envoi réussi — comportement identique à l'existant (les `defaultValue` ne se ré-appliquaient pas non plus). Hors périmètre.
- **Divergence impossible.** L'aperçu et l'écriture réelle passent par les mêmes fonctions du domaine ; la date de clôture affichée est `veilleDe(dateDebut)`, celle qu'écrira `cloturerEtAjouter`.
