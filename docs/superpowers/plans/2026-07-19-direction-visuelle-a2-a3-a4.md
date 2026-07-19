# Direction visuelle A2 → A3 → A4 — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appliquer la direction visuelle validée en A1 à `apps/web` — tokens réels, primitives retouchées, composant `Montant` unique — de sorte que changer un token se répercute sur toute l'application.

**Architecture:** Trois couches, dans cet ordre. (1) `globals.css` porte les valeurs et `app/layout.tsx` cesse de les court-circuiter. (2) Quatre contrôles retouchés (`button`, `input`, `label`, `select`) plus deux composants projet (`Section`, `Ligne`) remplacent `card.tsx` et `table.tsx`. (3) `Montant` centralise l'affichage de l'argent, adossé à une fonction pure testable, et le domaine expose `synthese()` pour que le tableau de bord compose son solde au lieu de recevoir une phrase toute faite.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4 (CSS-first, aucun `tailwind.config`), `@base-ui/react`, Vitest 2.1, Playwright 1.61, Biome 1.9, pnpm workspaces.

**Spec :** `docs/superpowers/specs/2026-07-19-direction-visuelle-design.md`
**Issues :** #5 (A2), #6 (A3), #7 (A4)
**Branche de départ :** `design/a1-direction-visuelle`

## Global Constraints

- **L'argent est un entier de centimes.** Aucun flottant. Le formatage n'existe qu'à l'affichage.
- **`Montant` ne calcule jamais un signe.** Il affiche celui de la valeur reçue. Ne jamais écrire `-valeur` ni `Math.abs()` dans un `page.tsx` pour « corriger » un affichage.
- **Le solde canari vaut exactement 114 580 centimes** (`Liz doit 1 145,80 € à Thomas`). Si un test le contredit, chercher la régression — ne pas ajuster le test.
- **`drizzle-kit push` est interdit.** Ce plan ne touche pas la base ; aucune migration n'est attendue.
- **Aucune couleur ne code un sens.** Pas de rouge/vert sur un solde. `--destructive` est réservé aux erreurs de formulaire.
- **La serif ne touche jamais un montant qui a un voisin au-dessus ou en dessous** (chiffres proportionnels).
- **Cibles tactiles : 44px minimum** sur tout contrôle interactif.
- **Dates : chaînes ISO `YYYY-MM-DD`.** Jamais de `new Date()` pour formater une date.
- **`apps/web` n'importe de `@homebudget/db` que la façade** (`test/architecture.test.ts`, liste blanche). Ce plan n'y ajoute rien.
- **Pièges de `test/architecture.test.ts`** — il scanne `app`, `actions`, `lib`, `components` récursivement :
  - le motif `/\bpool\b/` est testé sur le **fichier entier** : ne jamais écrire le mot « pool », même en commentaire ;
  - le motif `select…from` est testé **ligne par ligne, hors imports** : ne jamais écrire « select » et « from » sur une même ligne de commentaire.
- **Vitest de `apps/web` n'inclut que `test/**/*.test.ts`** — pas `.tsx`. Il n'y a ni jsdom ni Testing Library, et ce plan n'en ajoute pas : toute logique à tester est extraite en fonction pure.
- **Commande de vérification après chaque tâche :** `task verif` (lint + typecheck + tests unitaires, aucune dépendance à Docker).

---

## Structure des fichiers

**Créés**
- `apps/web/test/theme.test.ts` — garde : plus aucune valeur du thème shadcn par défaut
- `apps/web/components/section.tsx` — `Section`
- `apps/web/components/ligne.tsx` — `Ligne`
- `apps/web/components/montant.tsx` — `Montant`

**Modifiés**
- `apps/web/app/globals.css` — valeurs, polices, suppression de `.dark`/`--chart-*`/`--sidebar-*`
- `apps/web/app/layout.tsx` — polices, `bg-background text-foreground`
- `apps/web/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `select.tsx`
- `apps/web/lib/format.ts` — `formaterMontantSigne()`
- `apps/web/test/format.test.ts` — cas de `formaterMontantSigne()`
- `packages/domain/src/solde.ts` — `Synthese`, `synthese()`, `phraseSynthese()` réécrite
- `packages/domain/src/types.ts` — `nomPersonne()`
- `packages/domain/test/solde.test.ts` — cas de `synthese()`
- `apps/web/app/(app)/page.tsx`, `layout.tsx`, `depenses/page.tsx`, `config/page.tsx`
- `apps/web/app/(app)/depenses/formulaire-depense.tsx`, `config/formulaire-version.tsx`
- `apps/web/app/(auth)/login/page.tsx`
- `apps/web/e2e/parcours.spec.ts` — deux assertions exactes

**Supprimés**
- `apps/web/components/ui/card.tsx`
- `apps/web/components/ui/table.tsx`

---

## Task 1 : Tokens et polices

**Files:**
- Create: `apps/web/test/theme.test.ts`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: rien.
- Produces: les variables CSS `--background`, `--foreground`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--ring`, `--destructive`, `--radius` ; les utilitaires Tailwind `font-sans` (Inter) et `font-heading` (Instrument Serif). Toutes les tâches suivantes en dépendent.

- [ ] **Step 1: Écrire le test de garde qui échoue**

Créer `apps/web/test/theme.test.ts` :

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const GLOBALS = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf-8')

/**
 * Les valeurs livrees par shadcn (baseColor: neutral). Le critere de fin de
 * l'issue A2 est « plus aucune valeur du theme par defaut ne subsiste » : ce
 * test l'exprime litteralement plutot que d'interdire la chroma 0, qui est la
 * valeur legitime du blanc pur `oklch(1 0 0)`.
 */
const VALEURS_PAR_DEFAUT = [
  'oklch(0.145 0 0)',
  'oklch(0.205 0 0)',
  'oklch(0.269 0 0)',
  'oklch(0.371 0 0)',
  'oklch(0.439 0 0)',
  'oklch(0.556 0 0)',
  'oklch(0.577 0.245 27.325)',
  'oklch(0.708 0 0)',
  'oklch(0.87 0 0)',
  'oklch(0.922 0 0)',
  'oklch(0.97 0 0)',
  'oklch(0.985 0 0)',
]

describe('globals.css ne garde rien du theme shadcn par defaut', () => {
  it('ne declare plus de bloc .dark', () => {
    expect(GLOBALS).not.toMatch(/^\.dark\s*\{/m)
  })

  it('ne declare plus les tokens sans usage', () => {
    expect(GLOBALS).not.toMatch(/--chart-\d/)
    expect(GLOBALS).not.toMatch(/--sidebar/)
  })

  it('ne conserve aucune valeur du theme livre', () => {
    const restantes = VALEURS_PAR_DEFAUT.filter((v) => GLOBALS.includes(v))
    expect(restantes).toEqual([])
  })

  it('charge les deux familles de la direction visuelle', () => {
    expect(GLOBALS).toMatch(/--font-sans:\s*var\(--font-inter\)/)
    expect(GLOBALS).toMatch(/--font-heading:\s*var\(--font-instrument-serif\)/)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm --filter @homebudget/web test -- theme`
Expected: FAIL — quatre assertions rouges (le bloc `.dark`, les `--chart-*`, les valeurs par défaut, les polices absentes).

- [ ] **Step 3: Réécrire `globals.css`**

Remplacer l'intégralité de `apps/web/app/globals.css` par :

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@theme inline {
  /* Inter porte le texte et TOUS les montants en colonne (chiffres tabulaires). */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji",
    "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  /* Instrument Serif : le solde et les titres d'ecran, RIEN d'autre. Ses chiffres
     sont a chasse proportionnelle : elle ne doit jamais toucher un montant qui a
     un voisin au-dessus ou en dessous, sous peine de desaligner la colonne. */
  --font-heading: var(--font-instrument-serif), ui-serif, Georgia, serif;

  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-foreground: var(--foreground);
  --color-background: var(--background);

  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
}

:root {
  --background: oklch(1 0 0); /* #FFFFFF */
  --foreground: oklch(0.212 0.008 265); /* #16181C — encre */
  --muted: oklch(0.968 0.003 265); /* #F4F5F7 — le seul aplat de l'app */
  --muted-foreground: oklch(0.549 0.014 265); /* #676C76 — meta */
  --border: oklch(0.918 0.005 265); /* #E4E6EA — FILET, jamais un contour */
  --input: oklch(0.918 0.005 265);
  --primary: oklch(0.331 0.075 260); /* #16325C */
  --primary-foreground: oklch(1 0 0);
  --ring: oklch(0.331 0.075 260 / 45%);
  --destructive: oklch(0.404 0.146 27); /* #8B1A1A — erreurs de formulaire SEULEMENT */
  --radius: 0.375rem;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
}
```

- [ ] **Step 4: Charger les polices dans `app/layout.tsx`**

Remplacer l'intégralité de `apps/web/app/layout.tsx` par :

```tsx
import { Instrument_Serif, Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

// Auto-hebergees par next/font : aucune requete vers Google au runtime, et
// aucun decalage de rendu au chargement.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
})

export const metadata = { title: 'HomeBudget' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${instrumentSerif.variable}`}>
      {/* Les couleurs viennent des tokens. Toute classe `slate-*` ecrite ici
          court-circuiterait le theme : changer un token ne se verrait plus. */}
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `pnpm --filter @homebudget/web test -- theme`
Expected: PASS — 4 tests verts.

- [ ] **Step 6: Vérifier que rien d'autre n'a cassé**

Run: `task verif`
Expected: lint, typecheck et tous les tests unitaires verts.

À savoir : à ce stade, **l'écran ne change quasiment pas**. Aucune page n'utilise encore les tokens — c'est la tâche 8 et les suivantes qui le règlent. Ce n'est pas un bug.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/globals.css apps/web/app/layout.tsx apps/web/test/theme.test.ts
git commit -m "feat(web): les tokens portent enfin une direction visuelle

Refs #5"
```

---

## Task 2 : Les quatre contrôles

**Files:**
- Modify: `apps/web/components/ui/button.tsx`
- Modify: `apps/web/components/ui/input.tsx`
- Modify: `apps/web/components/ui/label.tsx`
- Modify: `apps/web/components/ui/select.tsx`
- Delete: `apps/web/components/ui/card.tsx`, `apps/web/components/ui/table.tsx`

**Interfaces:**
- Consumes: les tokens de la tâche 1.
- Produces: `Button` (props de `@base-ui/react/button` + `variant?: 'primaire' | 'discret'`), `Input` (props de `<input>`), `Label` (props de `<label>`), `Select` (props de `<select>` — élément **natif**, `<option>` en enfants). Les tâches 5 à 7 les consomment.

- [ ] **Step 1: Supprimer les deux conteneurs**

```bash
git rm apps/web/components/ui/card.tsx apps/web/components/ui/table.tsx
```

`Card` est un contour, soit exactement ce que la direction retire ; `Table` est ce que l'issue B2 démonte. Aucun fichier ne les importe (vérifiable : `grep -rn "components/ui/\(card\|table\)" apps/web` ne renvoie rien).

- [ ] **Step 2: Réécrire `button.tsx`**

```tsx
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { type VariantProps, cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Deux variantes, pas plus. `min-h-11` = 44px : la cible tactile est reglee
// ICI, a la source, plutot qu'ecran par ecran (issue C1).
const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md px-5 text-[0.9375rem] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primaire: 'bg-primary text-primary-foreground hover:bg-primary/90',
        discret: 'text-primary hover:bg-muted',
      },
    },
    defaultVariants: {
      variant: 'primaire',
    },
  },
)

function Button({
  className,
  variant = 'primaire',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
```

- [ ] **Step 3: Réécrire `input.tsx`**

```tsx
import { Input as InputPrimitive } from '@base-ui/react/input'
import type * as React from 'react'

import { cn } from '@/lib/utils'

// Pas de contour : l'affordance vient du fond `muted` et du filet inferieur,
// qui s'epaissit et prend l'accent au focus. C'est la traduction de la
// direction epuree sur un champ, sans le rendre invisible.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-t-md border-0 border-b border-border bg-muted px-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-b-2 focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
```

- [ ] **Step 4: Réécrire `label.tsx`**

```tsx
'use client'

import type * as React from 'react'

import { cn } from '@/lib/utils'

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-[0.8125rem] leading-none font-medium text-muted-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
```

- [ ] **Step 5: Remplacer `select.tsx` par un select natif stylé**

Remplacer l'intégralité du fichier — le composant généré était le Select **composé** de Base UI (`Portal` + `Positioner` + `Popup`), c'est-à-dire un popup en JS, pas un contrôle de formulaire :

```tsx
import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Un `<select>` NATIF, volontairement.
 *
 * Le composant genere par shadcn etait le Select composé de Base UI : un popup
 * en JS. Le formulaire de depense repose sur deux comportements natifs que ce
 * popup ne reproduit pas — `disabled` (avec son champ cache de compensation,
 * voir `formulaire-depense.tsx`) et l'ouverture du selecteur du systeme sur
 * mobile, qui est precisement ce que l'issue B3 cherche. Les parcours
 * Playwright pilotent d'ailleurs ces champs par `page.selectOption(...)`.
 *
 * Le natif porte gratuitement le clavier, l'ARIA et l'etat disabled : c'est la
 * raison meme pour laquelle la spec garde les controles.
 */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-12 w-full min-w-0 appearance-none rounded-t-md border-0 border-b border-border bg-muted px-3 text-base outline-none transition-colors focus-visible:border-b-2 focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Select }
```

- [ ] **Step 6: Vérifier**

Run: `task verif`
Expected: tout vert. `architecture.test.ts` doit rester vert — le nouveau `select.tsx` ne contient plus l'import `Select … from '@base-ui/react/select'` qui motivait son commentaire sur les faux positifs, et aucune ligne hors import n'associe « select » et « from ».

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/components/ui
git commit -m "feat(web): quatre controles selon les tokens, deux conteneurs en moins

Card est un contour, soit ce que la direction retire ; Table est ce que
B2 demonte. Le select redevient natif : le popup Base UI aurait casse le
disabled du mode transfert et l'ouverture du selecteur systeme.

Refs #6"
```

---

## Task 3 : `Section` et `Ligne`

**Files:**
- Create: `apps/web/components/section.tsx`
- Create: `apps/web/components/ligne.tsx`

**Interfaces:**
- Consumes: les tokens de la tâche 1.
- Produces:
  - `Section({ titre?: string, children: ReactNode, className?: string })` — `<section>`
  - `Ligne({ intitule: ReactNode, montant: ReactNode, meta?: ReactNode, detail?: ReactNode })` — `<li>`, à placer dans un `<ul>` ou `<ol>`.

  Les tâches 6 et 7 les consomment.

- [ ] **Step 1: Créer `apps/web/components/section.tsx`**

```tsx
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Un groupe de contenu. Elle ne DESSINE rien : ni bordure, ni fond, ni ombre.
 * Le groupement vient de l'ecart vertical — 40px entre deux sections, 12px a
 * l'interieur. C'est ce rapport qui remplace le cadre qu'on a retire ; il n'est
 * pas decoratif, c'est le mecanisme de structure de l'ecran.
 */
export function Section({
  titre,
  children,
  className,
}: {
  titre?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {titre ? (
        <h2 className="text-[0.8125rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {titre}
        </h2>
      ) : null}
      {children}
    </section>
  )
}
```

- [ ] **Step 2: Créer `apps/web/components/ligne.tsx`**

```tsx
import type { ReactNode } from 'react'

/**
 * Une entree de liste. UN SEUL balisage, une bascule purement CSS :
 *
 *   sous 640px  — deux colonnes, deux rangees :
 *                 intitule | montant
 *                 meta     | detail
 *   au-dela     — une seule rangee de quatre colonnes :
 *                 intitule | meta | detail | montant
 *
 * Pas de double rendu, pas de detection de viewport en JS. C'est ce qui rend
 * B2 (cartes sur mobile, tableau au-dela) et C2 (aucun debordement a 360px)
 * vraies par construction plutot que verifiees apres coup.
 *
 * `minmax(0,1fr)` sur la premiere colonne, et non `1fr` : sans lui une longue
 * description sans espace elargit la grille au-dela du viewport, ce qui est
 * exactement le debordement horizontal que C2 interdit.
 */
export function Ligne({
  intitule,
  montant,
  meta,
  detail,
}: {
  intitule: ReactNode
  montant: ReactNode
  meta?: ReactNode
  detail?: ReactNode
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
      <span className="min-w-0 font-medium break-words sm:col-start-1 sm:row-start-1">
        {intitule}
      </span>
      <span className="justify-self-end sm:col-start-4 sm:row-start-1">{montant}</span>
      {meta ? (
        <span className="text-[0.8125rem] text-muted-foreground sm:col-start-2 sm:row-start-1">
          {meta}
        </span>
      ) : null}
      {detail ? (
        <span className="justify-self-end text-[0.8125rem] text-muted-foreground sm:col-start-3 sm:row-start-1">
          {detail}
        </span>
      ) : null}
    </li>
  )
}
```

- [ ] **Step 3: Vérifier**

Run: `task verif`
Expected: tout vert.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/section.tsx apps/web/components/ligne.tsx
git commit -m "feat(web): Section et Ligne remplacent Card et Table

Ligne bascule de la carte au tableau en CSS pur, sur un seul balisage.

Refs #6"
```

---

## Task 4 : La fonction de formatage signé

**Files:**
- Modify: `apps/web/lib/format.ts`
- Test: `apps/web/test/format.test.ts`

**Interfaces:**
- Consumes: `formaterMontant(c: Cents): string` (déjà présent dans le même fichier).
- Produces: `formaterMontantSigne(c: Cents, avecSignePositif: boolean): string`. La tâche 5 la consomme.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `apps/web/test/format.test.ts` :

```ts
describe('formaterMontantSigne', () => {
  it('affiche un montant positif sans signe par defaut', () => {
    expect(formaterMontantSigne(114580, false)).toBe('1 145,80 €')
  })

  it('affiche un plus devant un positif quand on le demande', () => {
    expect(formaterMontantSigne(114580, true)).toBe('+1 145,80 €')
  })

  it('affiche TOUJOURS le moins sur un negatif, meme sans le demander', () => {
    // Un negatif rendu comme un positif serait un mensonge affiche. Le drapeau
    // ne commande QUE le plus explicite ; le moins n'est jamais masquable.
    expect(formaterMontantSigne(-114580, false)).toBe('−1 145,80 €')
    expect(formaterMontantSigne(-114580, true)).toBe('−1 145,80 €')
  })

  it('utilise le vrai moins typographique, pas un trait d union', () => {
    // U+2212. Il a la meme chasse que le plus en chiffres tabulaires : une
    // colonne de soldes signes reste alignee au caractere pres.
    expect(formaterMontantSigne(-100, true)).toContain('−')
    expect(formaterMontantSigne(-100, true)).not.toContain('-')
  })

  it('n affiche aucun signe a zero', () => {
    expect(formaterMontantSigne(0, true)).toBe('0,00 €')
  })
})
```

Compléter l'import en tête de fichier pour inclure `formaterMontantSigne`.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `pnpm --filter @homebudget/web test -- format`
Expected: FAIL — `formaterMontantSigne is not a function`.

- [ ] **Step 3: Implémenter**

Ajouter à `apps/web/lib/format.ts` :

```ts
/**
 * Le formatage signe des montants.
 *
 * `avecSignePositif` ne commande QUE le plus explicite : un montant negatif
 * porte toujours son moins. L'inverse permettrait qu'un oubli de drapeau
 * affiche `1 145,80 €` la ou la valeur vaut −114580 — un mensonge a l'ecran.
 *
 * Le signe est pose ICI, a partir du signe de la valeur recue, et jamais
 * derive d'un contexte. Voir CLAUDE.md, « Le piege qui coute de l'argent » :
 * si un ecran affiche un jour le mauvais sens, le bug est dans le domaine.
 */
export function formaterMontantSigne(c: Cents, avecSignePositif: boolean): string {
  const texte = formaterMontant(Math.abs(c))
  if (c < 0) return `−${texte}` // U+2212, pas un trait d'union
  if (avecSignePositif && c > 0) return `+${texte}`
  return texte
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `pnpm --filter @homebudget/web test -- format`
Expected: PASS — les 5 nouveaux cas verts, les cas existants inchangés.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/format.ts apps/web/test/format.test.ts
git commit -m "feat(web): le formatage signe des montants, en fonction pure

Le moins n'est jamais masquable ; le drapeau ne commande que le plus.

Refs #7"
```

---

## Task 5 : Le composant `Montant`

**Files:**
- Create: `apps/web/components/montant.tsx`

**Interfaces:**
- Consumes: `formaterMontantSigne()` (tâche 4), `Cents` de `@homebudget/domain`, `cn` de `@/lib/utils`.
- Produces: `Montant({ cents: Cents, niveau: 'heros' | 'notable' | 'discret', signe?: boolean, className?: string })`. Les tâches 6 et 7 le consomment.

- [ ] **Step 1: Créer `apps/web/components/montant.tsx`**

```tsx
import { formaterMontantSigne } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Cents } from '@homebudget/domain'

/**
 * L'unique frontiere entre les centimes et l'ecran.
 *
 * Ce composant N'A PAS LE DROIT de calculer un signe. Il affiche celui de la
 * valeur qu'il recoit. Il ne nie jamais une valeur, ne l'inverse jamais selon
 * la personne regardee, ne derive jamais un signe d'un contexte. C'est la garde
 * contre le piege du mode transfert documente dans CLAUDE.md.
 *
 * Aucune couleur ne code un sens : le solde est une DIRECTION (qui doit a qui),
 * pas un positif/negatif. Rouge/vert s'inverserait selon lequel des deux
 * utilisateurs regarde l'ecran.
 */
const NIVEAUX = {
  // Instrument Serif : chiffres proportionnels. Reserve a un montant ISOLE,
  // jamais a un montant qui a un voisin au-dessus ou en dessous.
  heros: 'font-heading text-[clamp(2.75rem,12vw,4rem)] leading-none tracking-[-0.02em]',
  notable: 'text-xl font-semibold tabular-nums',
  discret: 'text-[0.9375rem] font-medium tabular-nums text-muted-foreground',
} as const

export function Montant({
  cents,
  niveau,
  signe = false,
  className,
}: {
  cents: Cents
  niveau: keyof typeof NIVEAUX
  signe?: boolean
  className?: string
}) {
  return (
    // <data> : la valeur exacte en centimes reste lisible par une machine,
    // jamais l'euro arrondi.
    <data value={cents} className={cn(NIVEAUX[niveau], className)}>
      {formaterMontantSigne(cents, signe)}
    </data>
  )
}
```

- [ ] **Step 2: Vérifier**

Run: `task verif`
Expected: tout vert.

Note : il n'y a pas de test unitaire pour ce composant, et c'est délibéré. `apps/web` n'a ni jsdom ni Testing Library, et `vitest.config.ts` n'inclut que `test/**/*.test.ts`. Toute la logique testable a été extraite en tâche 4 ; ce qui reste ici est du mapping de classes, couvert par les parcours Playwright de la tâche 6.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/montant.tsx
git commit -m "feat(web): Montant, l'unique frontiere entre centimes et ecran

Refs #7"
```

---

## Task 6 : `Synthese` dans le domaine

**Files:**
- Modify: `packages/domain/src/types.ts`
- Modify: `packages/domain/src/solde.ts`
- Test: `packages/domain/test/solde.test.ts`

**Interfaces:**
- Consumes: `Resume`, `formaterEuros`, `Personne`.
- Produces:
  - `nomPersonne(p: Personne): string` (dans `types.ts`)
  - `type Synthese = { etat: 'a-jour' } | { etat: 'dette'; debiteur: Personne; crediteur: Personne; montant: Cents }`
  - `synthese(r: Resume): Synthese`
  - `phraseSynthese(r: Resume): string` — **sortie inchangée**

  La tâche 7 les consomme. Les deux modules sont déjà réexportés par `src/index.ts` (barrel en `export *`) : aucune ligne à y ajouter.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `packages/domain/test/solde.test.ts`, après le bloc `describe('phraseSynthese', …)` :

```ts
describe('synthese', () => {
  it('rend la structure quand Thomas est crediteur', () => {
    const r = resumer([depense({})])
    expect(synthese(r)).toEqual({
      etat: 'dette',
      debiteur: 'liz',
      crediteur: 'thomas',
      montant: 39197,
    })
  })

  it('rend la structure quand Liz est crediteure', () => {
    const r = resumer([
      depense({
        montant: 40000,
        payePar: 'liz',
        mode: 'transfert',
        type: 'transfert',
        parts: { thomas: 40000, liz: 0 },
      }),
    ])
    // Le montant est TOUJOURS positif : c'est `debiteur`/`crediteur` qui porte
    // le sens, jamais le signe. Un consommateur n'a donc rien a nier.
    expect(synthese(r)).toEqual({
      etat: 'dette',
      debiteur: 'thomas',
      crediteur: 'liz',
      montant: 40000,
    })
  })

  it('annonce l equilibre quand le solde est nul', () => {
    expect(synthese(resumer([]))).toEqual({ etat: 'a-jour' })
  })
})
```

Compléter l'import en tête de fichier pour inclure `synthese`.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `pnpm --filter @homebudget/domain test`
Expected: FAIL — `synthese is not a function`. Les trois tests de `phraseSynthese` doivent, eux, être **verts** : ils décrivent l'état actuel et ne doivent jamais rougir dans cette tâche.

- [ ] **Step 3: Ajouter `nomPersonne()` à `types.ts`**

Ajouter à la fin de `packages/domain/src/types.ts` :

```ts
const NOMS: Record<Personne, string> = { thomas: 'Thomas', liz: 'Liz' }

/** Le libelle affichable d'une personne. Le domaine porte deja ces deux noms
 *  dans `phraseSynthese` : les dupliquer dans l'UI ferait diverger les deux. */
export function nomPersonne(p: Personne): string {
  return NOMS[p]
}
```

- [ ] **Step 4: Réécrire la fin de `solde.ts`**

Remplacer la fonction `phraseSynthese` existante par :

```ts
/**
 * Qui doit combien a qui, sous forme de STRUCTURE.
 *
 * Le tableau de bord compose lui-meme son bandeau : un montant heros en serif
 * a 64px enchasse au milieu d'une phrase en Inter est incomposable. `montant`
 * est toujours POSITIF — c'est `debiteur`/`crediteur` qui porte le sens, de
 * sorte qu'aucun consommateur n'ait a nier une valeur pour l'afficher.
 */
export type Synthese =
  | { etat: 'a-jour' }
  | { etat: 'dette'; debiteur: Personne; crediteur: Personne; montant: Cents }

export function synthese(r: Resume): Synthese {
  if (r.soldeThomas === 0) return { etat: 'a-jour' }
  return r.soldeThomas > 0
    ? { etat: 'dette', debiteur: 'liz', crediteur: 'thomas', montant: r.soldeThomas }
    : { etat: 'dette', debiteur: 'thomas', crediteur: 'liz', montant: -r.soldeThomas }
}

/**
 * La meme information en une phrase. REECRITE PAR-DESSUS `synthese()` : il n'y
 * a donc toujours qu'une seule source de verite sur qui doit a qui. Sa sortie
 * ne change pas — cinq assertions la verrouillent (domain, db x2, seed), dont
 * le canari `Liz doit 1 145,80 € à Thomas`.
 */
export function phraseSynthese(r: Resume): string {
  const s = synthese(r)
  if (s.etat === 'a-jour') return 'Vous êtes à jour'
  return `${nomPersonne(s.debiteur)} doit ${formaterEuros(s.montant)} à ${nomPersonne(s.crediteur)}`
}
```

Compléter l'import en tête de `solde.ts` : `import { type ModeRepartition, type Parts, type Personne, type TypeDepense, nomPersonne } from './types.js'` — `nomPersonne` est une valeur, elle ne peut pas rester dans un `import type`.

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `pnpm --filter @homebudget/domain test`
Expected: PASS — les 3 nouveaux cas de `synthese` verts, **et les 3 cas de `phraseSynthese` toujours verts sans modification**. Si l'un d'eux rougit, la réécriture a changé la sortie : corriger `phraseSynthese`, jamais le test.

- [ ] **Step 6: Vérifier que le canari tient**

Run: `pnpm --filter @homebudget/db test`
Expected: PASS — `import-sheet.test.ts` affiche toujours `Liz doit 1 145,80 € à Thomas` et le solde vaut 114 580.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/types.ts packages/domain/src/solde.ts packages/domain/test/solde.test.ts
git commit -m "feat(domain): synthese() expose la structure, la phrase se reecrit par-dessus

Une seule source de verite sur qui doit a qui. La sortie de phraseSynthese
ne bouge pas : le canari reste 114 580.

Refs #7"
```

---

## Task 7 : Le tableau de bord, page de référence

**Files:**
- Modify: `apps/web/app/(app)/page.tsx`
- Modify: `apps/web/app/(app)/layout.tsx`
- Modify: `apps/web/e2e/parcours.spec.ts:31`, `:51`

**Interfaces:**
- Consumes: `Montant` (tâche 5), `Section` (tâche 3), `synthese`/`nomPersonne` (tâche 6).
- Produces: rien pour les tâches suivantes.

- [ ] **Step 1: Réécrire `app/(app)/page.tsx`**

```tsx
import { Montant } from '@/components/montant'
import { Section } from '@/components/section'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { type Resume, nomPersonne, resumer, synthese } from '@homebudget/domain'

// Le tableau de bord doit refleter la derniere ecriture, jamais un cache de build.
export const dynamic = 'force-dynamic'

export default async function TableauDeBord() {
  // EN PREMIERE LIGNE, avant toute lecture. Le layout du groupe (app) appelle
  // deja `exigerSession()`, mais Next.js ne garantit pas de re-rendre un layout
  // a chaque requete d'un segment : sa documentation deconseille explicitement
  // le controle d'acces en layout. Le middleware ne rattrape pas non plus — il
  // constate la PRESENCE du cookie, sans en verifier la signature. Cet ecran
  // expose le solde : la garde vit ici, le layout n'est que la profondeur.
  await exigerSession()

  // Les lignes sont lues telles quelles ; le calcul est fait par le domaine, ici,
  // en TypeScript. Aucun SELECT n'additionne de solde.
  const resume: Resume = resumer(await listerDepenses())
  const s = synthese(resume)

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      {/* Le solde est la seule chose qui compte vraiment : il est traite comme
          tel. Pas de cadre, pas de fond — c'est l'echelle typographique qui
          porte la hierarchie. */}
      <section data-testid="bandeau-solde" className="flex flex-col gap-3 pt-4">
        <p data-testid="phrase-synthese" className="flex flex-col gap-3">
          {s.etat === 'a-jour' ? (
            <span className="font-heading text-[clamp(2rem,8vw,2.75rem)] leading-none">
              Vous êtes à jour
            </span>
          ) : (
            <>
              <span className="text-[0.8125rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {nomPersonne(s.debiteur)} doit à {nomPersonne(s.crediteur)}
              </span>
              {/* Montant ISOLE : c'est le seul endroit de l'app ou la serif
                  touche un chiffre. */}
              <Montant cents={s.montant} niveau="heros" />
            </>
          )}
        </p>
      </section>

      <Section titre="Mouvements">
        <dl className="flex flex-col gap-3">
          <Chiffre libelle="Dépensé total" valeur={resume.totalDepenses} />
          <Chiffre libelle="Transferts" valeur={resume.totalTransferts} />
        </dl>
      </Section>

      <Section titre="Par personne">
        <dl className="flex flex-col gap-3">
          <Chiffre libelle="Payé par Thomas" valeur={resume.payeThomas} discret />
          <Chiffre libelle="Payé par Liz" valeur={resume.payeLiz} discret />
          <Chiffre libelle="Dû par Thomas" valeur={resume.duThomas} discret />
          <Chiffre libelle="Dû par Liz" valeur={resume.duLiz} discret />
          {/* `signe` affiche le plus explicite. Les valeurs arrivent DEJA
              signees du domaine : rien ici ne les inverse. */}
          <Chiffre libelle="Solde Thomas" valeur={resume.soldeThomas} discret signe />
          <Chiffre libelle="Solde Liz" valeur={resume.soldeLiz} discret signe />
        </dl>
      </Section>
    </div>
  )
}

function Chiffre({
  libelle,
  valeur,
  discret = false,
  signe = false,
}: {
  libelle: string
  valeur: number
  discret?: boolean
  signe?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <dt className="text-[0.9375rem] text-muted-foreground">{libelle}</dt>
      <dd>
        <Montant cents={valeur} niveau={discret ? 'discret' : 'notable'} signe={signe} />
      </dd>
    </div>
  )
}
```

- [ ] **Step 2: Réécrire `app/(app)/layout.tsx`**

```tsx
import { exigerSession } from '@/lib/session'
import Link from 'next/link'
import type { ReactNode } from 'react'

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const session = await exigerSession()
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5">
      <header className="flex items-center justify-between gap-4 border-b border-border py-4">
        <nav className="flex gap-5 text-[0.9375rem] font-medium">
          <Link href="/" className="hover:text-primary">
            Tableau de bord
          </Link>
          <Link href="/depenses" className="hover:text-primary">
            Dépenses
          </Link>
          <Link href="/config" className="hover:text-primary">
            Configuration
          </Link>
        </nav>
        <span className="text-[0.8125rem] text-muted-foreground">{session.nom}</span>
      </header>
      <main className="flex-1 py-6">{children}</main>
    </div>
  )
}
```

Note : la navigation au pouce et le bouton de déconnexion sont l'objet de l'issue B6. Cette tâche ne fait que détokeniser l'existant.

- [ ] **Step 3: Mettre à jour les deux assertions e2e exactes**

Dans `apps/web/e2e/parcours.spec.ts`, remplacer la ligne 31 :

```ts
    // LE CANARI, jusque dans l'UI. Le bandeau compose desormais un libelle et
    // un montant en serif : on verifie le SENS et la VALEUR, pas la ponctuation
    // d'une phrase qui n'existe plus comme telle. Le solde reste 114 580.
    // `uppercase` est une regle CSS : textContent garde la casse d'origine.
    await expect(page.getByTestId('phrase-synthese')).toContainText('Liz doit à Thomas')
    await expect(page.getByTestId('phrase-synthese')).toContainText('1 145,80 €')
```

Et la ligne 51 :

```ts
    // Liz a paye 50 € dont 25 € pour Thomas : la dette de Liz baisse de 25 €.
    await expect(page.getByTestId('phrase-synthese')).toContainText('Liz doit à Thomas')
    await expect(page.getByTestId('phrase-synthese')).toContainText('1 120,80 €')
```

Les lignes 56 et 72 (lecture de `textContent` puis comparaison avant/après) restent **inchangées** : le `data-testid="phrase-synthese"` est conservé sur le bloc composé, elles continuent donc de fonctionner.

- [ ] **Step 4: Vérifier les tests unitaires**

Run: `task verif`
Expected: tout vert.

- [ ] **Step 5: Vérifier les parcours e2e**

Run: `task test:e2e:frais`
Expected: les trois parcours verts. La commande est **destructive** : elle réinitialise la base locale avant de lancer Playwright.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(app)/page.tsx" "apps/web/app/(app)/layout.tsx" apps/web/e2e/parcours.spec.ts
git commit -m "feat(web): le solde domine le tableau de bord

Les huit tuiles traitaient a egalite un solde et sept chiffres de detail.
Les deux assertions e2e exactes verifient desormais le sens et la valeur ;
le canari reste 114 580.

Refs #7"
```

---

## Task 8 : La liste des dépenses

**Files:**
- Modify: `apps/web/app/(app)/depenses/page.tsx`

**Interfaces:**
- Consumes: `Montant`, `Section`, `Ligne`, `nomPersonne`.
- Produces: rien.

- [ ] **Step 1: Réécrire `app/(app)/depenses/page.tsx`**

```tsx
import { Ligne } from '@/components/ligne'
import { Montant } from '@/components/montant'
import { Section } from '@/components/section'
import { formaterDate } from '@/lib/format'
import { exigerSession } from '@/lib/session'
import { listerDepenses } from '@homebudget/db'
import { nomPersonne } from '@homebudget/domain'
import { FormulaireDepense } from './formulaire-depense'

export const dynamic = 'force-dynamic'

export default async function Depenses() {
  // La personne de la session pre-remplit « paye par » : c'est la raison d'etre
  // de la colonne `user.personne`, posee par le hook d'allowlist.
  const session = await exigerSession()
  const depenses = await listerDepenses()

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      <FormulaireDepense personne={session.personne} />

      <Section titre="Dépenses">
        <div data-testid="liste-depenses">
          {depenses.length === 0 ? (
            <p className="text-[0.9375rem] text-muted-foreground">Aucune dépense pour le moment.</p>
          ) : (
            <ul>
              {depenses.map((d) => (
                <Ligne
                  key={d.id}
                  intitule={d.description}
                  meta={`${formaterDate(d.date)} · payé par ${nomPersonne(d.payePar)}`}
                  /* Parts LUES, jamais recalculees a l'affichage. */
                  detail={
                    <>
                      T <Montant cents={d.parts.thomas} niveau="discret" /> / L{' '}
                      <Montant cents={d.parts.liz} niveau="discret" />
                    </>
                  }
                  montant={<Montant cents={d.montant} niveau="notable" />}
                />
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  )
}
```

La constante locale `LIBELLE_PERSONNE` disparaît : `nomPersonne()` du domaine la remplace, de sorte que les deux libellés ne puissent pas diverger.

- [ ] **Step 2: Vérifier**

Run: `task verif`
Expected: tout vert.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/depenses/page.tsx"
git commit -m "feat(web): la liste des depenses passe par Ligne et Montant

Refs #6, #7"
```

---

## Task 9 : La page de configuration

**Files:**
- Modify: `apps/web/app/(app)/config/page.tsx`

**Interfaces:**
- Consumes: `Montant`, `Section`, `Ligne`.
- Produces: rien.

- [ ] **Step 1: Réécrire `app/(app)/config/page.tsx`**

```tsx
import { Montant } from '@/components/montant'
import { Section } from '@/components/section'
import { formaterDate } from '@/lib/format'
import { exigerSession } from '@/lib/session'
import { listerVersions } from '@homebudget/db'
import { ratioThomas, totalChargesCommunes } from '@homebudget/domain'
import { FormulaireVersion } from './formulaire-version'

export const dynamic = 'force-dynamic'

export default async function Config() {
  // EN PREMIERE LIGNE : cet ecran affiche les salaires nets et tout l'historique
  // de configuration. Meme raison qu'au tableau de bord — le layout du groupe
  // (app) n'est pas garanti re-rendu a chaque requete de segment, et le
  // middleware ne fait qu'une verification optimiste de la presence du cookie.
  await exigerSession()

  const versions = await listerVersions()
  const courante = versions.find((v) => v.dateFin === null)

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      <Section titre="Historique de la configuration">
        <ol data-testid="timeline-versions" className="flex flex-col gap-6">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-col gap-2 border-b border-border pb-6 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{v.libelle}</span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {formaterDate(v.dateDebut)} → {v.dateFin ? formaterDate(v.dateFin) : 'en cours'}
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.8125rem] text-muted-foreground">Salaire Thomas</dt>
                  <dd>
                    <Montant cents={v.salaireNetThomas} niveau="discret" />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.8125rem] text-muted-foreground">Salaire Liz</dt>
                  <dd>
                    <Montant cents={v.salaireNetLiz} niveau="discret" />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.8125rem] text-muted-foreground">Charges communes</dt>
                  <dd>
                    <Montant cents={totalChargesCommunes(v)} niveau="discret" />
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-[0.8125rem] text-muted-foreground">Part Thomas</dt>
                  <dd className="text-[0.9375rem] font-medium tabular-nums text-muted-foreground">
                    {Math.round(ratioThomas(v) * 100)} %
                  </dd>
                </div>
              </dl>
              {v.dateFin !== null && (
                <p className="text-[0.8125rem] text-muted-foreground">
                  Version close : elle n'est plus modifiable. Créez-en une nouvelle pour changer les
                  règles.
                </p>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <FormulaireVersion courante={courante ?? null} />
    </div>
  )
}
```

Note : le pourcentage n'est **pas** un montant — il ne passe donc pas par `Montant`, qui n'accepte que des `Cents`.

- [ ] **Step 2: Vérifier**

Run: `task verif`
Expected: tout vert.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/config/page.tsx"
git commit -m "feat(web): la timeline de configuration passe aux tokens

Refs #6, #7"
```

---

## Task 10 : Les deux formulaires et l'écran de connexion

**Files:**
- Modify: `apps/web/app/(app)/depenses/formulaire-depense.tsx`
- Modify: `apps/web/app/(app)/config/formulaire-version.tsx`
- Modify: `apps/web/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `Button`, `Input`, `Label`, `Select` (tâche 2), `Montant` (tâche 5), `Section` (tâche 3).
- Produces: rien.

**Contrainte absolue de cette tâche : les attributs `name` des champs et les libellés de boutons ne changent pas.** Les parcours Playwright les ciblent nommément :
- `input[name="date"]`, `input[name="description"]`, `input[name="montant"]`
- `select[name="payePar"]`, `select[name="type"]`
- `input[name="libelle"]`, `input[name="dateDebut"]`, `input[name="salaireNetThomas"]`, `input[name="salaireNetLiz"]`
- boutons `Ajouter la dépense` et `Créer la version`
- `data-testid` : `apercu-parts`, `apercu-thomas`, `apercu-liz`, `message-erreur-apercu`, `message-erreur-envoi`

- [ ] **Step 1: Migrer `formulaire-depense.tsx`**

Remplacer chaque `<input className="rounded-md border border-slate-300 p-2" />` par `<Input />`, chaque `<select className="…">` par `<Select>`, et le `<button type="submit">` final par `<Button type="submit">`. Chaque `<label className="flex flex-col gap-1 text-sm">Texte<input …/></label>` devient :

```tsx
<div className="flex flex-col gap-1.5">
  <Label htmlFor="montant">Montant (€)</Label>
  <Input
    id="montant"
    name="montant"
    required
    inputMode="decimal"
    placeholder="1 110,58"
    value={montant}
    onChange={(e) => setMontant(e.target.value)}
  />
</div>
```

Ajouter les imports :

```tsx
import { Montant } from '@/components/montant'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
```

**Ne pas toucher** : la logique `estTransfert` / `modesProposes`, le `<select disabled>` et son `<input type="hidden" name="mode" value="transfert" />` de compensation (commenté ligne 185), ni le `useEffect` d'aperçu debounced.

L'enveloppe du formulaire perd son cadre :

```tsx
<form action={action} className="flex flex-col gap-4">
  <h2 className="font-heading text-[1.75rem] leading-tight">Ajouter une dépense</h2>
```

Le bloc d'aperçu passe aux tokens et à `Montant` :

```tsx
{apercu && (
  <div data-testid="apercu-parts" className="flex flex-col gap-1 rounded-md bg-muted p-4">
    <p className="font-medium">
      Thomas{' '}
      <span data-testid="apercu-thomas">
        <Montant cents={apercu.parts.thomas} niveau="notable" />
      </span>
      {' · '}
      Liz{' '}
      <span data-testid="apercu-liz">
        <Montant cents={apercu.parts.liz} niveau="notable" />
      </span>
    </p>
    <p className="text-[0.8125rem] text-muted-foreground">
      Config en vigueur au {formaterDate(apercu.versionDateDebut)} : {apercu.versionLibelle} —
      charges communes <Montant cents={apercu.totalChargesCommunes} niveau="discret" />
    </p>
  </div>
)}
```

Les deux messages d'erreur passent de `text-red-700` à `text-destructive`.

- [ ] **Step 2: Vérifier l'aperçu en e2e avant d'aller plus loin**

Run: `task test:e2e:frais`
Expected: les trois parcours verts. Le parcours 2 assère `getByTestId('apercu-thomas')` avec `toHaveText('25,00 €')` : le `<span>` porteur du testid enveloppe désormais un `<data>`, mais `toHaveText` lit le texte rendu — l'assertion tient. Si elle échoue, c'est que `Montant` a été inséré au mauvais niveau.

- [ ] **Step 3: Migrer `formulaire-version.tsx`**

Même traitement : `Input`, `Select`, `Label`, `Button`, suppression du cadre `rounded-xl border border-slate-200 bg-white p-4`. L'encart d'avertissement passe de `bg-emerald-50 text-emerald-900` — seule touche de couleur de l'app aujourd'hui — à `bg-muted text-foreground` : aucune couleur ne code un sens.

**Ne pas toucher** : `enEuros()` et `enLignes()`, qui pré-remplissent des champs éditables. Ce n'est pas de l'affichage ; A4 ne les concerne pas. Les trois `<textarea>` gardent leur `font-mono text-xs` mais passent au fond `bg-muted` et au filet inférieur, comme `Input`.

- [ ] **Step 4: Migrer `app/(auth)/login/page.tsx`**

Remplacer le `<button className="rounded-md bg-slate-900 px-5 py-3 text-white">` par `<Button>`, et le `h1 text-2xl font-semibold` par `font-heading text-[1.75rem]`. Le soin de la première impression est l'objet de l'issue B5 : cette tâche ne fait que détokeniser.

- [ ] **Step 5: Vérifier**

Run: `task verif`
Expected: tout vert.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(app)/depenses/formulaire-depense.tsx" "apps/web/app/(app)/config/formulaire-version.tsx" "apps/web/app/(auth)/login/page.tsx"
git commit -m "feat(web): les formulaires passent aux controles et aux tokens

Noms de champs et libelles de boutons inchanges : les parcours Playwright
les ciblent nommement.

Refs #6, #7"
```

---

## Task 11 : La garde finale

**Files:**
- Modify: `apps/web/test/theme.test.ts`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: le verrou qui rend A2 vraie — « changer un token se répercute partout ».

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `apps/web/test/theme.test.ts`. **Les deux `import` vont en tête de fichier**, fusionnés avec ceux qui s'y trouvent déjà — Biome réorganise les imports et refusera un `import` placé au milieu du fichier :

```ts
// en tete de fichier, avec les imports existants
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
```

```ts
// a la suite du fichier
const RACINE = fileURLToPath(new URL('..', import.meta.url))
const DOSSIERS = ['app', 'components']

function fichiersTsx(dossier: string): string[] {
  const trouves: string[] = []
  const parcourir = (d: string) => {
    for (const entree of readdirSync(d)) {
      const complet = join(d, entree)
      if (statSync(complet).isDirectory()) parcourir(complet)
      else if (/\.tsx?$/.test(entree)) trouves.push(complet)
    }
  }
  try {
    parcourir(join(RACINE, dossier))
  } catch {
    // Dossier absent : rien a verifier.
  }
  return trouves
}

/**
 * Une classe de palette Tailwind ecrite en dur court-circuite le theme : le
 * critere de fin de l'issue A2 — « changer un token se repercute partout » —
 * serait faux. Les couleurs passent par les tokens (`bg-background`,
 * `text-muted-foreground`, `border-border`, `text-destructive`), sans
 * exception.
 */
const PALETTE_EN_DUR =
  /\b(?:bg|text|border|ring|divide|placeholder|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/

describe('aucune couleur ne court-circuite les tokens', () => {
  it('n utilise aucune classe de palette Tailwind en dur', () => {
    const fautifs: string[] = []
    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersTsx(dossier)) {
        if (PALETTE_EN_DUR.test(readFileSync(fichier, 'utf-8'))) {
          fautifs.push(fichier.replace(RACINE, ''))
        }
      }
    }
    expect(fautifs).toEqual([])
  })

  it('n utilise ni bg-white ni text-white en dur', () => {
    const fautifs: string[] = []
    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersTsx(dossier)) {
        if (/\b(?:bg|text|border)-white\b/.test(readFileSync(fichier, 'utf-8'))) {
          fautifs.push(fichier.replace(RACINE, ''))
        }
      }
    }
    expect(fautifs).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer le test**

Run: `pnpm --filter @homebudget/web test -- theme`
Expected: PASS si les tâches 7 à 10 ont tout migré. **En cas d'échec, le test nomme les fichiers fautifs** : les corriger, ne jamais assouplir le motif.

- [ ] **Step 3: Vérification complète**

Run: `task verif`
Expected: lint, typecheck, tous les tests unitaires verts.

Run: `task test:e2e:frais`
Expected: les trois parcours verts, canari `1 145,80 €` compris.

- [ ] **Step 4: Vérifier de visu**

Run: `task dev` puis ouvrir `http://localhost:3000` en viewport 360px et en large.
Attendu : le solde domine le tableau de bord ; aucune bordure ne fait le tour d'un bloc ; la liste des dépenses s'empile sous 640px et s'aligne en colonnes au-delà ; aucun scroll horizontal.

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/theme.test.ts
git commit -m "test(web): verrouiller l'absence de couleur en dur

Sans ce test, une classe slate-* reintroduite ferait silencieusement
mentir le critere « changer un token se repercute partout ».

Refs #5"
```

---

## Auto-relecture

**Couverture de la spec**

| Exigence | Tâche |
|---|---|
| Palette, 9 tokens | 1 |
| Suppression `.dark`, `--chart-*`, `--sidebar-*` | 1 |
| Instrument Serif + Inter via `next/font` | 1 |
| `layout.tsx` détokenisé | 1 |
| Échelle typographique | 1 (tokens), 5 (`Montant`), 3 (`Section`) |
| Rythme 40/12 | 3 (`Section`), 7–9 (pages) |
| `--border` en filet, jamais contour | 2, 3, 7–10 |
| 4 contrôles retouchés, 44px | 2 |
| `card.tsx` / `table.tsx` supprimés | 2 |
| `Section`, `Ligne`, bascule CSS 640px | 3 |
| `Montant` 3 niveaux + `signe` | 4, 5 |
| Ne jamais calculer un signe | 4 (test), 5 (commentaire) |
| `<data value>`, U+2212 | 4, 5 |
| `enEuros()` hors périmètre | 10 |
| `Synthese` + `phraseSynthese` réécrite | 6 |
| Deux assertions e2e, `data-testid` conservé | 7 |
| Tableau de bord page de référence | 7 |
| Canari 114 580 intact | 6, 7, 11 |

**Points de vigilance signalés dans le plan**

- Après la tâche 1, l'écran ne change pas : c'est attendu, pas un bug.
- Les tests de `phraseSynthese` doivent rester verts pendant toute la tâche 6.
- Les `name` de champs et libellés de boutons sont pilotés par Playwright (tâche 10).
- `architecture.test.ts` interdit le mot « pool » n'importe où et « select … from » sur une ligne hors import.
- Vitest de `apps/web` n'inclut que `test/**/*.test.ts` : aucun test en `.tsx`.
