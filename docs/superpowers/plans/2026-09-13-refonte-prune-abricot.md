# Refonte « Prune et abricot » — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appliquer la direction « Prune et abricot » à `apps/web` : nouvelle palette et deux polices, saisie en feuille ouverte depuis un « + » central, écran Tableau de bord, Config dans le menu du compte.

**Architecture:** Les valeurs changent dans `globals.css`, les noms de tokens restent le contrat avec le markup. La saisie quitte `/depenses` pour un `<dialog>` natif monté une fois dans `app/(app)/layout.tsx`, dont l'état ouvert vit dans l'URL (`?saisie=1`, `?saisie=regler`). Aucune règle de calcul ne bouge : l'aperçu reste `previsualiserPartsAction`, l'écriture `ajouterDepenseAction`, le montant du règlement `synthese()`.

**Tech Stack:** Next.js 15 (App Router, Server Actions), React 19, Tailwind v4, `next/font/google`, Vitest, Playwright.

**Spec :** `docs/superpowers/specs/2026-09-13-refonte-prune-abricot-design.md`
**Issue :** [#68](https://github.com/tjarrier/HomeBudget/issues/68)
**Maquette :** [Refonte HomeBudget](https://claude.ai/code/artifact/4ea069ff-3b79-479f-af93-ab4d4215509d), page « Direction A »

## Global Constraints

- **Les quatre règles de `CLAUDE.md` ne bougent pas.** Aucun montant flottant, aucune part recalculée à la lecture, aucune écriture hors Server Action.
- **`exigerSession()` en première ligne** de toute `page.tsx` du groupe `(app)` et de toute Server Action. `test/architecture.test.ts` le vérifie.
- **`apps/web` n'importe de `@homebudget/db` que la façade.** Ce plan n'y ajoute aucun nom : `resumerDepenses` et `listerDepenses` y sont déjà.
- **`listerDepenses` est toujours appelée avec une `limite`.**
- **Le markup n'écrit jamais une couleur**, seulement un token (`bg-emphasis`, `text-marque`…). `test/theme.test.ts` interdit les classes de palette Tailwind en dur, `bg-white`, et (après la Task 1) les tokens retirés.
- **Palette** (spec, « Les couleurs ») : fond `#f7f4ef`, surface `#ffffff`, prune `#3d2344`, prune clair `#5b3563`, surface prune `#f3ecf3`, abricot `#f2a45e`, encre `#1f1a24`, atténué `#6e6673`, champ `#f5f1ec`, limite `#8a828e`, filet `#efeae4`, erreur `#b91c1c`.
- **L'abricot ne porte jamais de texte** et ne sert jamais de filet ni d'icône seule sur fond clair (2,05:1 sur blanc).
- **Polices :** Manrope (`--font-sans`, variable `--font-manrope`) et Bricolage Grotesque (`--font-display`, variable `--font-bricolage`). Bricolage ne touche jamais un montant en liste.
- **`Montant` ne dérive jamais un signe.** Le glyphe vient du signe de la valeur reçue ; aucun `-` dans le JSX.
- **Planchers :** 44 px sur tout ce qui se touche (`h-11` ou `min-h-11` dans chaque primitive), 12 px entre « Se déconnecter » et « Annuler », 360 px de largeur testée.
- **Les dates sont des chaînes ISO `YYYY-MM-DD`.**
- **Les valeurs attendues des tests ne bougent pas** : 114 580 centimes, 25,00 € / 25,00 €, −2 500 et +2 000 centimes. Une assertion peut changer de sélecteur, jamais de montant.
- **L'ordre de `e2e/parcours.spec.ts` compte** : les canaris lisent le seed avant toute écriture, « régler les comptes met le solde à zéro » reste la dernière écriture du fichier.
- **Style du code :** commentaires en français **sans accents** (comme tout le dépôt), textes d'interface accentués.
- **`task test:e2e:frais` détruit la base locale** (`db:reset`) : c'est voulu, c'est la seule façon de rejouer les canaris.

---

### Task 1 : Tokens et polices

**Files:**
- Modify: `apps/web/app/globals.css` (fichier entier)
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/test/theme.test.ts`
- Modify (remplacements mécaniques) : `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(app)/page.tsx`, `apps/web/app/(app)/config/page.tsx`, `apps/web/app/(app)/config/formulaire-version.tsx`, `apps/web/components/badge.tsx`, `apps/web/components/marque.tsx`, `apps/web/components/menu-compte.tsx`, `apps/web/components/ligne-depense.tsx`, `apps/web/components/ui/input.tsx`, `apps/web/components/ui/textarea.tsx`

**Interfaces:**
- Consumes: rien.
- Produces: les utilitaires `bg-marque`, `text-marque`, `bg-marque-surface`, `font-display`, `shadow-action`, `rounded-2xl` (24 px), `rounded-3xl` (28 px). Retire `text-faint`, `bg-positive-surface`, `text-positive`. Toutes les tâches suivantes les utilisent.

- [x] **Step 1 : Écrire les tests qui échouent**

Dans `apps/web/test/theme.test.ts`, remplacer le test « ne charge qu une seule famille de caracteres » (et son commentaire) par :

```ts
  /**
   * DEUX familles, et pas trois (spec 2026-09-13, « La typographie »). Manrope
   * porte le texte, Bricolage Grotesque le solde et les titres. Une troisieme
   * famille, ou le retour d'Inter, ferait diverger l'app de sa maquette.
   */
  it('charge exactement deux familles de caracteres', () => {
    expect(GLOBALS).toMatch(/--font-sans:\s*var\(--font-manrope\)/)
    expect(GLOBALS).toMatch(/--font-display:\s*var\(--font-bricolage\)/)
    // `--font-mono` n'est pas une famille chargee : c'est la pile systeme.
    const familles = GLOBALS.match(/^\s*--font-(?!mono\b)[a-z-]+:/gm) ?? []
    expect(familles).toHaveLength(2)
    expect(GLOBALS).not.toMatch(/--font-inter/)
  })
```

Puis ajouter à la fin du fichier :

```ts
/**
 * Les tokens retires par la refonte (spec 2026-09-13, « Les couleurs ») :
 * `text-faint` ne tenait pas 4,5:1, l'emerald diluait le prune et l'abricot.
 * Un usage oublie compilerait sans erreur — Tailwind ignore en silence une
 * classe dont le token n'existe plus — et rendrait un texte a la couleur
 * heritee, sans que rien ne le signale.
 */
const TOKENS_RETIRES = /\b(?:text-faint|bg-positive-surface|text-positive)\b/

describe('la refonte ne laisse aucun token retire', () => {
  it('globals.css ne declare plus ni slate, ni faint, ni positive', () => {
    expect(GLOBALS).not.toMatch(/--slate-\d|--text-faint|--positive-/)
  })

  it('le markup n utilise plus aucun token retire', () => {
    const fautifs: string[] = []
    for (const dossier of DOSSIERS) {
      for (const fichier of fichiersTsx(dossier)) {
        if (TOKENS_RETIRES.test(readFileSync(fichier, 'utf-8'))) {
          fautifs.push(fichier.replace(RACINE, ''))
        }
      }
    }
    expect(fautifs).toEqual([])
  })
})
```

- [x] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `pnpm --filter @homebudget/web exec vitest run test/theme.test.ts`
Expected: FAIL sur « charge exactement deux familles », « globals.css ne declare plus ni slate… » et « le markup n utilise plus aucun token retire ».

- [x] **Step 3 : Réécrire `globals.css`**

Remplacer tout le fichier `apps/web/app/globals.css` par :

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

/* --------------------------------------------------------------------------
   Direction visuelle « Prune et abricot » : spec
   docs/superpowers/specs/2026-09-13-refonte-prune-abricot-design.md, maquette
   « Refonte HomeBudget ».

   Deux couleurs d'identite. Le PRUNE porte la marque (bandeau du solde, liens,
   icones), l'ABRICOT porte l'action principale. Aucune des deux ne code un
   sens : le bandeau est prune quel que soit le sens de la dette. Tout passe
   par un token semantique : `apps/web/test/theme.test.ts` interdit toute classe
   de palette Tailwind ecrite en dur.

   Chaque contraste cite ici a ete CALCULE (formule WCAG 2.x), pas estime.
   -------------------------------------------------------------------------- */

@theme inline {
  /* Manrope porte le texte, Bricolage Grotesque le solde et les titres. Les deux
     sont auto-hebergees par next/font (app/layout.tsx). */
  --font-sans: var(--font-manrope), ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji",
    "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  --font-display: var(--font-bricolage), ui-sans-serif, system-ui, sans-serif;
  /* Mono : la zone de saisie des charges et les <code>, rien d'autre. */
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Tokens semantiques -> utilitaires Tailwind. Ce sont les SEULS noms de
     couleur que le markup a le droit d'ecrire. */
  --color-app: var(--app-bg);
  --color-surface: var(--surface-card);
  --color-emphasis: var(--surface-emphasis);
  --color-on-emphasis: var(--on-emphasis);
  --color-strong: var(--text-strong);
  --color-body: var(--text-body);
  --color-muted-foreground: var(--text-muted);
  --color-subtle: var(--border-subtle);
  --color-marque: var(--marque);
  --color-marque-surface: var(--marque-surface);
  --color-overlay: var(--overlay);

  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-muted: var(--muted);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-foreground: var(--foreground);
  --color-background: var(--background);

  --radius-sm: calc(var(--radius) * 0.6); /* ~8px */
  --radius-md: calc(var(--radius) * 0.8); /* ~11px — pastilles d'icone */
  --radius-lg: var(--radius); /* 14px — champs, choix, boutons */
  --radius-xl: 1.25rem; /* 20px — cartes */
  --radius-2xl: 1.5rem; /* 24px — bandeau du solde */
  --radius-3xl: 1.75rem; /* 28px — feuille de saisie */

  --shadow-xs: 0 1px 2px 0 rgb(31 26 36 / 0.05);
  --shadow-sm: 0 1px 3px 0 rgb(31 26 36 / 0.1), 0 1px 2px -1px rgb(31 26 36 / 0.1);
  /* Le « + » de la barre basse, et lui seul : il deborde au-dessus de la barre. */
  --shadow-action: 0 6px 16px rgb(31 26 36 / 0.18);
}

:root {
  --app-bg: #f7f4ef;
  --surface-card: #ffffff;
  /* PRUNE : le bandeau du solde, et lui seul. Blanc dessus : 13,79:1 ; blanc a
     72 % : 7,87:1 ; blanc a 60 % : 5,95:1. */
  --surface-emphasis: #3d2344;
  --on-emphasis: #ffffff;
  /* L'encre : titres, montants, choix selectionne. 17,05:1 sur blanc. */
  --text-strong: #1f1a24;
  --text-body: #1f1a24;
  /* Le SEUL gris de texte : 5,51:1 sur blanc, 5,02:1 sur le fond, 4,90:1 sur un
     champ. Il n'y a pas de troisieme gris : l'ancien `--text-faint` ne tenait
     que 2,67:1, pour des parts figees que le parcours Playwright compare. */
  --text-muted: #6e6673;
  --border-subtle: #efeae4; /* FILET entre deux lignes */
  /* Le prune clair : liens, icones, anneau de focus. 9,84:1 sur blanc. */
  --marque: #5b3563;
  --marque-surface: #f3ecf3;

  --background: var(--surface-card);
  --foreground: var(--text-strong);
  /* Fond de champ et de choix non selectionne. */
  --muted: #f5f1ec;
  --overlay: color-mix(in oklab, var(--text-strong) 55%, transparent);
  --border: var(--border-subtle);
  /* LIMITE d'un champ : son filet inferieur. 3,30:1 sur --muted (WCAG 1.4.11).
     Le fond du champ seul ne donne que 1,12:1 sur blanc : sans ce filet, un
     champ vide est invisible. Filet != limite : ne pas les fusionner. */
  --input: #8a828e;
  /* ABRICOT : l'action principale. 2,05:1 sur blanc — un bouton est identifie
     par son libelle (8,32:1), pas par son contour. L'abricot ne porte donc
     jamais de texte et ne sert jamais de filet. */
  --primary: #f2a45e;
  --primary-foreground: #1f1a24;
  --ring: #5b3563;
  --radius: 0.875rem; /* 14px */

  --destructive: #b91c1c; /* erreurs de formulaire SEULEMENT. 6,47:1 */
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-app text-strong;
  }
  html {
    @apply font-sans;
  }

  /* `appearance-none` (components/ui/select.tsx) retire la fleche native du
     systeme sans rien y substituer. On la remplace par un chevron SVG encode en
     URI — `url()` ne peut pas lire une variable CSS, donc la couleur est le hex
     litteral de --text-muted (#6e6673) : a garder synchronise si ce token change. */
  select[data-slot="select"] {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%236e6673' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5.5 8l4.5 4.5L14.5 8'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.875rem center;
    background-size: 0.85rem;
  }
}
```

- [x] **Step 4 : Charger les deux polices**

Dans `apps/web/app/layout.tsx`, remplacer l'import et la constante `inter` :

```tsx
import { Bricolage_Grotesque, Manrope } from 'next/font/google'
```

```tsx
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
})
```

et la balise `<html>` :

```tsx
    <html lang="fr" className={`${manrope.variable} ${bricolage.variable}`}>
```

- [x] **Step 5 : Migrer les usages des tokens retirés**

Run (depuis `apps/web`) :

```bash
grep -rlE 'text-faint|bg-positive-surface|text-positive' app components \
  | xargs sed -i 's/text-faint/text-muted-foreground/g; s/bg-positive-surface/bg-marque-surface/g; s/text-positive/text-marque/g'
```

Puis relire le diff : `git diff --stat` doit lister les dix fichiers de la section **Files** (hors `globals.css`, `layout.tsx`, `theme.test.ts`), et aucun autre.

- [x] **Step 6 : Lancer les tests, vérifier qu'ils passent**

Run: `pnpm --filter @homebudget/web exec vitest run test/theme.test.ts`
Expected: PASS.

Run: `task verif`
Expected: PASS (lint, typecheck, tous les tests unitaires).

- [x] **Step 7 : Vérifier le rendu**

Run: `task dev`, ouvrir http://localhost:3000 : le bandeau du solde est prune, les boutons pleins sont abricot, le texte est en Manrope. Vérifier dans l'inspecteur que `font-variant-numeric: tabular-nums` aligne bien les montants de la liste (spec, « Risques ») ; sinon, l'écrire dans la PR et s'arrêter pour en discuter.

- [x] **Step 8 : Commit**

```bash
git add apps/web/app apps/web/components apps/web/test/theme.test.ts
git commit -m "feat(web): palette prune et abricot, Manrope et Bricolage Grotesque (#68)"
```

---

### Task 2 : Les primitives retouchées, et `Choix`

**Files:**
- Modify: `apps/web/components/ui/button.tsx`
- Modify: `apps/web/components/ui/input.tsx`
- Modify: `apps/web/components/ui/select.tsx`
- Modify: `apps/web/components/ui/textarea.tsx`
- Modify: `apps/web/components/ui/label.tsx`
- Create: `apps/web/components/ui/choix.tsx`
- Test: `apps/web/test/cibles-tactiles.test.ts`

**Interfaces:**
- Consumes: tokens de la Task 1.
- Produces:
  - `Choix({ legende: string; name: string; options: readonly OptionChoix[]; valeur: string; onChange: (valeur: string) => void; className?: string })`
  - `interface OptionChoix { valeur: string; libelle: string }`
  - `buttonVariants` garde ses deux variantes `primaire` et `discret`.

- [x] **Step 1 : Écrire le test qui échoue**

Dans `apps/web/test/cibles-tactiles.test.ts`, remplacer la constante :

```ts
const PRIMITIVES = ['button', 'input', 'select', 'textarea', 'choix'] as const
```

- [x] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `pnpm --filter @homebudget/web exec vitest run test/cibles-tactiles.test.ts`
Expected: FAIL — `ENOENT: no such file or directory ... components/ui/choix.tsx`.

- [x] **Step 3 : Créer `Choix`**

`apps/web/components/ui/choix.tsx` :

```tsx
import { cn } from '@/lib/utils'

export interface OptionChoix {
  valeur: string
  libelle: string
}

/**
 * Un choix ferme parmi quelques options, habille en segments : payeur, type,
 * repartition, raccourci de date.
 *
 * Des boutons radio NATIFS, pour la raison qui a fait garder le <select> natif :
 * le clavier (fleches), l'ARIA et la soumission dans le FormData, sans une ligne
 * de JavaScript. `<fieldset>` et `<legend>` donnent son nom au groupe.
 *
 * L'input couvre TOUT le segment (`absolute inset-0`, `opacity-0`) au lieu
 * d'etre masque en `sr-only`. Un radio de 1px serait mesure par
 * `e2e/cibles-tactiles.spec.ts` et tomberait sous le plancher de 44px, et
 * Playwright ne pourrait pas le cocher sans forcer. Transparent, il recoit le
 * doigt, le clic et le focus a la taille du segment.
 *
 * `h-12` (48px) pour le dessin, `min-h-11` pour le plancher tactile que
 * `test/cibles-tactiles.test.ts` verifie a la source. `px-1` et 13px : trois
 * segments tiennent dans 320px, « Personnalisée » compris.
 */
export function Choix({
  legende,
  name,
  options,
  valeur,
  onChange,
  className,
}: {
  legende: string
  name: string
  options: readonly OptionChoix[]
  valeur: string
  onChange: (valeur: string) => void
  className?: string
}) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="mb-1.5 text-[0.8125rem] font-semibold text-muted-foreground">
        {legende}
      </legend>
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <label
            key={option.valeur}
            className={cn(
              'relative flex h-12 min-h-11 items-center justify-center rounded-lg px-1 text-center text-[0.8125rem] leading-tight font-semibold transition-colors',
              'bg-muted text-strong',
              'has-[:checked]:bg-strong has-[:checked]:text-on-emphasis',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-surface',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.valeur}
              checked={valeur === option.valeur}
              onChange={() => onChange(option.valeur)}
              className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-lg opacity-0"
            />
            {option.libelle}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
```

- [x] **Step 4 : Retoucher `Button`**

Dans `apps/web/components/ui/button.tsx`, remplacer le commentaire et l'appel `cva` par :

```tsx
// Deux variantes, pas plus. `min-h-11` = 44px : la cible tactile est reglee
// ICI, a la source, plutot qu'ecran par ecran (issue C1).
//
// Le plein est l'ABRICOT, l'action principale ; son texte est l'encre (8,32:1).
// Le discret est un texte prune sans contour : un lien d'action (« Modifier »,
// « Voir plus », « Annuler »), qui ne rivalise jamais avec le plein.
const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-[0.9375rem] font-bold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primaire: 'bg-primary text-primary-foreground hover:bg-primary/85',
        discret: 'font-semibold text-marque hover:bg-marque-surface',
      },
    },
    defaultVariants: {
      variant: 'primaire',
    },
  },
)
```

- [x] **Step 5 : Retoucher `Input`, `Select`, `Textarea`, `Label`**

`apps/web/components/ui/input.tsx` — remplacer le commentaire et la fonction :

```tsx
/**
 * Un champ sur fond `--muted`, sans contour, delimite par un FILET INFERIEUR en
 * `--input` (3,30:1 sur ce fond, WCAG 1.4.11) qui passe a 2px prune au focus.
 * Le fond seul ne donne que 1,12:1 sur blanc : sans le filet, un champ vide
 * serait invisible. Arrondi en haut seulement, pour que le filet reste droit.
 *
 * `h-11` (44px) : le plancher tactile du projet (issue C1), regle ICI.
 * `text-base` (16px) : en dessous, Safari iOS zoome la page au focus.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-t-lg border-0 border-b border-input bg-muted px-4 text-base transition-[color,border-color] outline-none',
        'placeholder:text-muted-foreground',
        'focus-visible:border-b-2 focus-visible:border-marque',
        'disabled:pointer-events-none disabled:opacity-50',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}
```

`apps/web/components/ui/select.tsx` — dans la fonction, remplacer les classes :

```tsx
      className={cn(
        'h-11 w-full min-w-0 appearance-none rounded-t-lg border-0 border-b border-input bg-muted pr-10 pl-4 text-base transition-[color,border-color] outline-none',
        'focus-visible:border-b-2 focus-visible:border-marque',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
```

et, dans son commentaire, la phrase sur `pr-9` par : « `pr-10` laisse la place pour qu'un intitule long ne passe jamais dessous. »

`apps/web/components/ui/textarea.tsx` — remplacer les classes :

```tsx
      className={cn(
        'min-h-11 w-full min-w-0 resize-y rounded-t-lg border-0 border-b border-input bg-muted px-4 py-2.5 text-base transition-[color,border-color] outline-none',
        'placeholder:text-muted-foreground',
        'focus-visible:border-b-2 focus-visible:border-marque',
        'disabled:pointer-events-none disabled:opacity-50',
        'aria-invalid:border-destructive',
        className,
      )}
```

`apps/web/components/ui/label.tsx` — remplacer les classes :

```tsx
        'flex items-center gap-2 text-[0.8125rem] leading-none font-semibold text-muted-foreground select-none',
```

- [x] **Step 6 : Lancer les tests**

Run: `pnpm --filter @homebudget/web exec vitest run test/cibles-tactiles.test.ts test/theme.test.ts`
Expected: PASS, dont « choix porte h-11 ou min-h-11 ».

Run: `task verif`
Expected: PASS.

- [x] **Step 7 : Vérifier que les parcours tiennent encore**

Run: `task test:e2e:frais`
Expected: PASS. Rien n'utilise encore `Choix` ; les primitives ont seulement changé d'habillage.

- [x] **Step 8 : Commit**

```bash
git add apps/web/components/ui apps/web/test/cibles-tactiles.test.ts
git commit -m "feat(web): primitives retouchees et choix en segments natifs (#68)"
```

---

### Task 3 : La veille d'une date, et l'URL de la feuille

**Files:**
- Modify: `apps/web/lib/format.ts`
- Test: `apps/web/test/format.test.ts`
- Create: `apps/web/lib/url-saisie.ts`
- Test: `apps/web/test/url-saisie.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `veille(iso: string): string`
  - `type ModeSaisie = 'libre' | 'regler'`
  - `modeSaisie(valeur: string | null): ModeSaisie | null`
  - `lienOuvrirSaisie(chemin: string, params: URLSearchParams, mode: ModeSaisie): string`
  - `lienFermerSaisie(chemin: string, params: URLSearchParams): string`

- [x] **Step 1 : Écrire les tests qui échouent**

Dans `apps/web/test/format.test.ts`, ajouter `veille` à l'import depuis `'../lib/format.js'`, puis :

```ts
describe('veille', () => {
  it('recule d un jour, a travers les mois, les annees et les fevriers', () => {
    expect(veille('2026-07-12')).toBe('2026-07-11')
    expect(veille('2026-03-01')).toBe('2026-02-28')
    expect(veille('2024-03-01')).toBe('2024-02-29')
    expect(veille('2026-01-01')).toBe('2025-12-31')
  })

  it('jette plutot que de rendre une date inventee', () => {
    expect(() => veille('2026-07')).toThrow(/invalide/)
    expect(() => veille('')).toThrow(/invalide/)
  })
})
```

Créer `apps/web/test/url-saisie.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { lienFermerSaisie, lienOuvrirSaisie, modeSaisie } from '../lib/url-saisie.js'

describe('modeSaisie', () => {
  it('ne reconnait que les deux valeurs que la feuille sait ouvrir', () => {
    expect(modeSaisie('1')).toBe('libre')
    expect(modeSaisie('regler')).toBe('regler')
    expect(modeSaisie(null)).toBeNull()
    expect(modeSaisie('oui')).toBeNull()
  })
})

describe('lienOuvrirSaisie', () => {
  it('garde les parametres de l ecran courant', () => {
    const params = new URLSearchParams('mois=2026-08&n=40')
    expect(lienOuvrirSaisie('/depenses', params, 'libre')).toBe(
      '/depenses?mois=2026-08&n=40&saisie=1',
    )
  })

  it('ouvre le reglement depuis l accueil', () => {
    expect(lienOuvrirSaisie('/', new URLSearchParams(), 'regler')).toBe('/?saisie=regler')
  })

  it('remplace un mode deja ouvert plutot que d en empiler deux', () => {
    expect(lienOuvrirSaisie('/', new URLSearchParams('saisie=regler'), 'libre')).toBe('/?saisie=1')
  })

  it('ne modifie pas les parametres recus', () => {
    const params = new URLSearchParams('mois=2026-08')
    lienOuvrirSaisie('/depenses', params, 'libre')
    expect(params.toString()).toBe('mois=2026-08')
  })
})

describe('lienFermerSaisie', () => {
  it('retire la feuille et garde le reste', () => {
    expect(lienFermerSaisie('/depenses', new URLSearchParams('mois=2026-08&saisie=1'))).toBe(
      '/depenses?mois=2026-08',
    )
  })

  it('ne laisse pas de « ? » orphelin', () => {
    expect(lienFermerSaisie('/', new URLSearchParams('saisie=regler'))).toBe('/')
  })
})
```

- [x] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `pnpm --filter @homebudget/web exec vitest run test/format.test.ts test/url-saisie.test.ts`
Expected: FAIL — `veille` n'est pas exportée, `../lib/url-saisie.js` introuvable.

- [x] **Step 3 : Implémenter `veille`**

Dans `apps/web/lib/format.ts`, après `aujourdhuiLocal()` :

```ts
/**
 * La veille d'une date ISO : `2026-03-01` -> `2026-02-28`. Sert le raccourci
 * « Hier » de la saisie.
 *
 * L'arithmetique passe par `Date.UTC` sur les composantes, et le resultat est
 * relu en UTC : aucun fuseau n'intervient, contrairement a un `new Date(iso)`
 * local dont minuit peut tomber la veille en UTC. Le `Date` ne sort jamais de
 * cette fonction : elle recoit et rend une chaine.
 */
export function veille(iso: string): string {
  const [annee, mois, jour] = iso.split('-').map(Number)
  if (!annee || !mois || !jour) throw new Error(`Date ISO invalide : ${iso}`)
  return new Date(Date.UTC(annee, mois - 1, jour - 1)).toISOString().slice(0, 10)
}
```

- [x] **Step 4 : Implémenter `url-saisie.ts`**

`apps/web/lib/url-saisie.ts` :

```ts
/**
 * L'etat ouvert de la feuille de saisie vit dans l'URL (spec 2026-09-13) :
 * `?saisie=1` l'ouvre, `?saisie=regler` l'ouvre pre-remplie pour regler les
 * comptes. Meme choix que « Voir plus » (#41) : un lien fonctionne sans
 * JavaScript, le bouton retour du telephone ferme la feuille, et un test l'ouvre
 * par `goto()`.
 *
 * Les autres parametres — les filtres de /depenses, `n` — survivent a
 * l'ouverture comme a la fermeture : on saisit PAR-DESSUS l'ecran courant.
 */
export type ModeSaisie = 'libre' | 'regler'

export function modeSaisie(valeur: string | null): ModeSaisie | null {
  if (valeur === '1') return 'libre'
  if (valeur === 'regler') return 'regler'
  return null
}

export function lienOuvrirSaisie(chemin: string, params: URLSearchParams, mode: ModeSaisie): string {
  const suite = new URLSearchParams(params)
  suite.set('saisie', mode === 'regler' ? 'regler' : '1')
  return `${chemin}?${suite}`
}

export function lienFermerSaisie(chemin: string, params: URLSearchParams): string {
  const suite = new URLSearchParams(params)
  suite.delete('saisie')
  const requete = suite.toString()
  return requete ? `${chemin}?${requete}` : chemin
}
```

- [x] **Step 5 : Lancer les tests, vérifier qu'ils passent**

Run: `pnpm --filter @homebudget/web exec vitest run test/format.test.ts test/url-saisie.test.ts`
Expected: PASS.

- [x] **Step 6 : Commit**

```bash
git add apps/web/lib/format.ts apps/web/lib/url-saisie.ts apps/web/test/format.test.ts apps/web/test/url-saisie.test.ts
git commit -m "feat(web): veille() et l'URL de la feuille de saisie (#68)"
```

---

### Task 4 : Les composants produit

**Files:**
- Modify: `apps/web/components/montant.tsx`
- Modify: `apps/web/components/carte.tsx`
- Modify: `apps/web/components/entete-page.tsx`
- Modify: `apps/web/components/avatar.tsx`
- Modify: `apps/web/components/badge.tsx`
- Modify: `apps/web/components/ligne-depense.tsx`

**Interfaces:**
- Consumes: tokens de la Task 1.
- Produces:
  - `EntetePage({ titre: string; sousTitre?: string; retour?: { href: string; libelle: string } })`
  - `Montant` : mêmes props, mêmes niveaux (`heros`, `notable`, `courant`, `discret`).
  - `BadgeType` est supprimé ; `BadgeVersion` reste.
  - `LigneDepense` : mêmes props (`depense`, `avecPayeur`, `supprimable`).

Il n'y a pas de test unitaire de composant dans ce dépôt : ces changements sont d'habillage, vérifiés par `task verif` (types, lint) puis par les parcours e2e, qui lisent `phrase-synthese`, `liste-depenses`, les boutons « Supprimer » et les parts.

- [x] **Step 1 : Vérifier que `BadgeType` n'a qu'un usage**

Run: `grep -rn "BadgeType" apps/web/app apps/web/components`
Expected: deux lignes seulement — la définition dans `components/badge.tsx` et l'import dans `components/ligne-depense.tsx`. S'il y en a d'autres, s'arrêter : la spec ne les a pas prévus.

- [x] **Step 2 : `Montant`**

Dans `apps/web/components/montant.tsx`, remplacer `NIVEAUX` :

```tsx
const NIVEAUX = {
  /**
   * Le solde du bandeau prune. Bricolage Grotesque, chiffres PROPORTIONNELS :
   * un montant isole, qui n'a pas de voisin a aligner. `clamp` : 43px a 360px,
   * 50px au-dela — assez pour un solde a cinq chiffres sans deborder.
   */
  heros:
    'font-display text-[clamp(2.25rem,12vw,3.125rem)] leading-[1.02] font-semibold tracking-[-0.035em]',
  /** Les quatre chiffres du tableau de bord. */
  notable: 'text-[1.1875rem] font-bold tabular-nums tracking-[-0.02em]',
  /** Le montant d'une ligne de liste, d'une ligne de bilan, de l'apercu. */
  courant: 'text-[0.9375rem] font-bold tabular-nums',
  /** Une valeur de second plan : detail des parts. */
  discret: 'text-xs font-medium tabular-nums text-muted-foreground',
} as const
```

Et dans le commentaire du composant, remplacer « La maquette du design system tinte le positif en emerald et le negatif en rouge ; » par « Une maquette tinte volontiers le positif et le negatif ; ».

- [x] **Step 3 : `Carte`**

Dans `apps/web/components/carte.tsx`, remplacer le JSX retourné :

```tsx
    <section className={cn('rounded-xl bg-surface p-5 shadow-xs', className)}>
      {titre ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[1.1875rem] font-semibold tracking-[-0.01em]">
            {titre}
          </h2>
          {aside ? <span className="text-[0.8125rem] text-muted-foreground">{aside}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
```

et dans son commentaire, « blanc, un filet, un rayon de 14px, une ombre a peine perceptible » par « blanc, sans bordure, un rayon de 20px, une ombre a peine perceptible : sur le fond chaud, le blanc suffit a la detacher ».

- [x] **Step 4 : `EntetePage`**

Remplacer tout `apps/web/components/entete-page.tsx` par :

```tsx
import Link from 'next/link'

/**
 * Le titre d'ecran. Chaque page en pose un — c'est le <h1> unique du document,
 * sous lequel les `Carte` s'articulent en <h2>.
 *
 * `retour` pose une fleche avant le titre, pour un ecran qu'on n'atteint pas par
 * la navigation principale (le tableau de bord). Son nom accessible est
 * `libelle` : une fleche seule ne dit pas ou elle mene.
 */
export function EntetePage({
  titre,
  sousTitre,
  retour,
}: {
  titre: string
  sousTitre?: string
  retour?: { href: string; libelle: string }
}) {
  return (
    <header className="mb-6 flex items-center gap-1">
      {retour ? (
        <Link
          href={retour.href}
          aria-label={retour.libelle}
          className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-lg text-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-[22px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m11 6-6 6 6 6" />
          </svg>
        </Link>
      ) : null}
      <div className="min-w-0">
        <h1 className="font-display text-[1.3125rem] font-semibold tracking-[-0.015em]">{titre}</h1>
        {sousTitre ? <p className="mt-0.5 text-sm text-muted-foreground">{sousTitre}</p> : null}
      </div>
    </header>
  )
}
```

- [x] **Step 5 : `Avatar` et `BadgeVersion`**

Dans `apps/web/components/avatar.tsx`, remplacer la ligne `sombre ? … : …` par :

```tsx
        sombre ? 'bg-emphasis text-on-emphasis' : 'bg-marque-surface text-emphasis',
```

et dans le commentaire, « (le systeme est achromatique) » par « (aucune couleur par personne, spec 2026-09-13) ».

Dans `apps/web/components/badge.tsx`, supprimer `LIBELLES`, le commentaire de `BadgeType` et la fonction `BadgeType`, ainsi que l'import `type TypeDepense` devenu inutile. Il reste l'import de `cn` et `BadgeVersion`, dont les classes sont déjà `bg-muted text-muted-foreground` / `bg-marque-surface text-marque` depuis la Task 1.

- [x] **Step 6 : `LigneDepense`**

Remplacer tout `apps/web/components/ligne-depense.tsx` par :

```tsx
import type { ReactNode } from 'react'

import { BoutonSupprimerDepense } from '@/components/bouton-supprimer-depense'
import { Montant } from '@/components/montant'
import { formaterDate } from '@/lib/format'
import type { Depense, TypeDepense } from '@homebudget/domain'
import { nomPersonne } from '@homebudget/domain'

/** Le type, en toutes lettres : c'est le nom accessible de l'icone. */
const LIBELLES_TYPE: Record<TypeDepense, string> = {
  charge_fixe: 'Charge fixe',
  transfert: 'Transfert',
  courante: 'Courante',
}

const ICONES: Record<TypeDepense, ReactNode> = {
  charge_fixe: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  transfert: (
    <>
      <path d="M4 8h15" />
      <path d="m15 4 4 4-4 4" />
      <path d="M20 16H5" />
      <path d="m9 12-4 4 4 4" />
    </>
  ),
  courante: (
    <>
      <path d="M6 7h12l1 14H5z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </>
  ),
}

/**
 * Une entree de l'historique : quoi, quand, qui a paye, combien.
 *
 * L'icone code le TYPE, jamais la personne. Elle porte son libelle en
 * `aria-label` : l'information ne passe pas par le dessin seul.
 *
 * « payé par » et la date `05/07/2026` sont gardes, meme la ou la maquette
 * ecrit « Liz → Thomas » et « 5 juil. » : le parcours des filtres (#28)
 * reconnait une ligne de Liz a ce texte et un mois a `/07/2026`.
 *
 * `parts` est AFFICHE, pas seulement stocke : c'est la seule chose que cet ecran
 * prouve a l'oeil — les parts d'une depense ne bougent plus jamais apres sa
 * saisie. Le parcours Playwright compare ce texte avant et apres la creation
 * d'une version de config ; le retirer rendrait ce test vide de sens.
 *
 * `supprimable` est OPT-IN (issue #40) : seul l'historique de `/depenses`
 * l'active. Un appelant futur n'herite pas d'un bouton de suppression sans
 * l'avoir demande.
 */
export function LigneDepense({
  depense,
  avecPayeur = true,
  supprimable = false,
}: { depense: Depense; avecPayeur?: boolean; supprimable?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 border-t border-subtle py-3 first:border-t-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-marque-surface text-marque">
        <svg
          role="img"
          aria-label={LIBELLES_TYPE[depense.type]}
          viewBox="0 0 24 24"
          className="size-[19px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {ICONES[depense.type]}
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.9375rem] font-semibold">{depense.description}</div>
        <div className="mt-px flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted-foreground">
          <span className="tabular-nums">{formaterDate(depense.date)}</span>
          {avecPayeur ? (
            <>
              <span aria-hidden="true">·</span>
              <span>payé par {nomPersonne(depense.payePar)}</span>
            </>
          ) : null}
          {/* La PROVENANCE : ce mot dit qui a ecrit la ligne (issue #24). */}
          {depense.genereAuto ? (
            <>
              <span aria-hidden="true">·</span>
              <span>générée</span>
            </>
          ) : null}
        </div>
        {/* Parts LUES, jamais recalculees a l'affichage. */}
        <div className="mt-px text-xs text-muted-foreground">
          Thomas <Montant cents={depense.parts.thomas} niveau="discret" /> · Liz{' '}
          <Montant cents={depense.parts.liz} niveau="discret" />
        </div>
      </div>

      <Montant cents={depense.montant} niveau="courant" className="whitespace-nowrap" />

      {supprimable ? (
        <BoutonSupprimerDepense
          id={depense.id}
          description={depense.description}
          montant={depense.montant}
        />
      ) : null}
    </li>
  )
}
```

- [x] **Step 7 : Vérifier**

Run: `task verif`
Expected: PASS.

Run: `task test:e2e:frais`
Expected: PASS. Le filtre (#28) lit toujours « payé par Liz » et `/07/2026` ; la comparaison des parts avant/après une version lit un texte stable.

- [x] **Step 8 : Commit**

```bash
git add apps/web/components
git commit -m "feat(web): montant, carte, entete et ligne de depense a la nouvelle direction (#68)"
```

---

### Task 5 : L'écran Tableau de bord

**Files:**
- Create: `apps/web/app/(app)/tableau-de-bord/page.tsx`
- Modify: `apps/web/actions/depenses.ts` (les trois `revalidatePath`)
- Test: `apps/web/e2e/parcours.spec.ts` (canari)
- Test: `apps/web/e2e/cibles-tactiles.spec.ts`

**Interfaces:**
- Consumes: `EntetePage({ retour })`, `Montant({ testId })`, `Carte` (Task 4).
- Produces: la route `/tableau-de-bord`, et les `data-testid` `solde-tableau-de-bord`, `solde-thomas`, `solde-liz`.

- [x] **Step 1 : Écrire les tests e2e qui échouent**

Dans `apps/web/e2e/parcours.spec.ts`, dans le test « le solde de reference du seed est a l ecran », ajouter à la fin :

```ts
        // Le tableau de bord lit le MEME agregat : il doit dire le meme solde, et
        // les deux soldes signes doivent etre le meme fait vu des deux bouts —
        // jamais deux valeurs positives, jamais un signe inverse.
        await page.goto('/tableau-de-bord')
        await expect(page.getByTestId('solde-tableau-de-bord')).toHaveAttribute('value', '114580')
        await expect(page.getByTestId('solde-thomas')).toHaveAttribute('value', '114580')
        await expect(page.getByTestId('solde-liz')).toHaveAttribute('value', '-114580')
```

Dans `apps/web/e2e/cibles-tactiles.spec.ts`, renommer le test existant « le tableau de bord ne pose aucune cible sous 44px » en « l'accueil ne pose aucune cible sous 44px » (deux tests de même titre dans un `describe` font échouer Playwright), puis ajouter après lui :

```ts
  test('le tableau de bord ne pose aucune cible sous 44px', async ({ page }) => {
    await page.goto('/tableau-de-bord')
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible()
    // La fleche de retour est le seul controle de l'ecran : une icone de 22px,
    // dont la cible doit pourtant tenir 44px.
    await expect(page.getByRole('link', { name: "Retour à l'accueil" })).toBeVisible()
    expect(await trouverCiblesTropPetites(page)).toEqual([])
  })
```

- [x] **Step 2 : Lancer les e2e, vérifier qu'ils échouent**

Run: `task test:e2e:frais`
Expected: FAIL — `/tableau-de-bord` rend une 404 : `solde-tableau-de-bord` et le titre sont introuvables.

- [x] **Step 3 : Créer la page**

`apps/web/app/(app)/tableau-de-bord/page.tsx` :

```tsx
import { Carte } from '@/components/carte'
import { EntetePage } from '@/components/entete-page'
import { Montant } from '@/components/montant'
import { exigerSession } from '@/lib/session'
import { resumerDepenses } from '@homebudget/db'
import { type Personne, type Resume, nomPersonne, synthese } from '@homebudget/domain'

// Le tableau de bord doit refleter la derniere ecriture, jamais un cache de build.
export const dynamic = 'force-dynamic'

/** Un pourcentage entier, sans jamais diviser par zero (base vide). */
function pourcent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

export default async function TableauDeBord() {
  // EN PREMIERE LIGNE, avant toute lecture : le layout ne garantit pas d'etre
  // re-rendu a chaque requete, et le middleware ne verifie que la presence du
  // cookie. Cet ecran expose le solde.
  await exigerSession()

  // Un agregat, AUCUNE ligne de depense : la borne de G2 ne s'applique pas ici.
  const resume: Resume = await resumerDepenses()
  const s = synthese(resume)

  const totalPaye = resume.payeThomas + resume.payeLiz
  const totalDu = resume.duThomas + resume.duLiz
  const pctThomas = pourcent(resume.payeThomas, totalPaye)

  return (
    <>
      <EntetePage titre="Tableau de bord" retour={{ href: '/', libelle: "Retour à l'accueil" }} />

      {/* Le rappel du solde. Pas de `phrase-synthese` ici : le canari lit
          l'accueil, et deux elements portant ce testid rendraient ses
          assertions ambigues. */}
      <section className="flex flex-col rounded-2xl bg-emphasis px-5 py-4 text-on-emphasis">
        <p className="text-[0.8125rem] font-semibold text-on-emphasis/72">
          {s.etat === 'a-jour'
            ? 'Vous êtes à jour'
            : `${nomPersonne(s.debiteur)} doit à ${nomPersonne(s.crediteur)}`}
        </p>
        {s.etat === 'dette' ? (
          <Montant
            cents={s.montant}
            niveau="heros"
            className="mt-1"
            testId="solde-tableau-de-bord"
          />
        ) : null}
        <p className="mt-1 text-[0.8125rem] text-on-emphasis/60">
          Sur {resume.nombre} {resume.nombre > 1 ? 'dépenses' : 'dépense'}
        </p>
      </section>

      <h2 className="mt-7 mb-2.5 font-display text-[1.1875rem] font-semibold tracking-[-0.01em]">
        Vue d’ensemble
      </h2>
      {/* `grid-cols-2` vaut `repeat(2, minmax(0, 1fr))` : chaque colonne est
          bornee par la place disponible, les montants insecables ne poussent pas
          la grille au-dela de 360px (issue C2). */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Chiffre libelle="Total dépensé" valeur={resume.totalDepenses} sous="Transferts exclus" />
        <Chiffre libelle="Transferts" valeur={resume.totalTransferts} sous="Virements et remb." />
        <Chiffre
          libelle="Dû par Thomas"
          valeur={resume.duThomas}
          sous={`${pourcent(resume.duThomas, totalDu)} % des charges`}
        />
        <Chiffre
          libelle="Dû par Liz"
          valeur={resume.duLiz}
          sous={`${pourcent(resume.duLiz, totalDu)} % des charges`}
        />
      </div>

      <Carte titre="Répartition" className="mt-7">
        <div className="flex flex-col divide-y divide-subtle">
          <BilanPersonne
            personne="thomas"
            paye={resume.payeThomas}
            du={resume.duThomas}
            solde={resume.soldeThomas}
            pct={pctThomas}
          />
          <BilanPersonne
            personne="liz"
            paye={resume.payeLiz}
            du={resume.duLiz}
            solde={resume.soldeLiz}
            pct={100 - pctThomas}
          />
        </div>
      </Carte>
    </>
  )
}

function Chiffre({ libelle, valeur, sous }: { libelle: string; valeur: number; sous: string }) {
  return (
    <div className="rounded-lg bg-surface p-3.5 shadow-xs">
      <div className="text-[0.8125rem] font-semibold text-muted-foreground">{libelle}</div>
      <div className="mt-1.5 whitespace-nowrap">
        <Montant cents={valeur} niveau="notable" />
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sous}</div>
    </div>
  )
}

/**
 * Le bilan d'une personne. `solde` arrive DEJA signe du domaine : rien ici ne
 * l'inverse ni ne le teinte. Les deux barres ont la meme couleur : aucune
 * couleur par personne.
 */
function BilanPersonne({
  personne,
  paye,
  du,
  solde,
  pct,
}: {
  personne: Personne
  paye: number
  du: number
  solde: number
  pct: number
}) {
  return (
    <div className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <span className="text-[0.9375rem] font-bold">{nomPersonne(personne)}</span>
        <span className="ml-auto text-[0.8125rem] text-muted-foreground">
          a payé <Montant cents={paye} niveau="courant" className="text-strong" />
        </span>
      </div>

      {/* Purement decorative : le pourcentage est ecrit en clair dessous. */}
      <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
        <i className="block h-full rounded-full bg-marque" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">{pct} % du total payé</div>

      <dl className="flex flex-col gap-1 text-[0.84375rem]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Aurait dû payer</dt>
          <dd>
            <Montant cents={du} niveau="courant" className="font-semibold" />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Solde</dt>
          <dd>
            <Montant cents={solde} niveau="courant" signe testId={`solde-${personne}`} />
          </dd>
        </div>
      </dl>
    </div>
  )
}
```

- [x] **Step 4 : Rafraîchir le tableau de bord après une écriture**

Dans `apps/web/actions/depenses.ts`, dans **chacune** des trois actions `ajouterDepenseAction`, `genererChargeFixeAction` et `supprimerDepenseAction`, ajouter après `revalidatePath('/depenses')` :

```ts
    revalidatePath('/tableau-de-bord')
```

et remplacer les deux commentaires « sur les deux ecrans » par « sur les trois ecrans ».

- [x] **Step 5 : Lancer les tests, vérifier qu'ils passent**

Run: `task verif`
Expected: PASS — `architecture.test.ts` trouve la nouvelle page et son `exigerSession()`.

Run: `task test:e2e:frais`
Expected: PASS — y compris `/tableau-de-bord ne scrolle pas horizontalement a 360px`, que `debordement.spec.ts` ajoute seul en lisant le disque.

- [x] **Step 6 : Commit**

```bash
git add "apps/web/app/(app)/tableau-de-bord" apps/web/actions/depenses.ts apps/web/e2e
git commit -m "feat(web): ecran tableau de bord, meme agregat que l'accueil (#68)"
```

---

### Task 6 : La saisie devient une feuille

**Files:**
- Move + rewrite: `apps/web/app/(app)/depenses/formulaire-depense.tsx` → `apps/web/components/formulaire-depense.tsx`
- Create: `apps/web/components/feuille-saisie.tsx`
- Modify: `apps/web/actions/depenses.ts` (`preparerReglementAction`)
- Modify: `apps/web/app/(app)/layout.tsx` (monter la feuille)
- Modify: `apps/web/app/(app)/depenses/page.tsx` (retirer la saisie et `?regler`)
- Modify: `apps/web/app/(app)/page.tsx` (lien « Régler les comptes » seulement)
- Test: `apps/web/e2e/parcours.spec.ts`, `apps/web/e2e/cibles-tactiles.spec.ts`, `apps/web/e2e/debordement.spec.ts`

**Interfaces:**
- Consumes: `Choix`, `OptionChoix` (Task 2) ; `veille`, `modeSaisie`, `lienOuvrirSaisie`, `lienFermerSaisie` (Task 3).
- Produces:
  - `preparerReglementAction(): Promise<Resultat<{ montant: Cents; payePar: Personne } | null>>`
  - `FormulaireDepense({ personne: Personne; reglement?: { montant: Cents; payePar: Personne } | undefined; onEnregistree: () => void })`
  - `FeuilleSaisie({ personne: Personne })`, un `<dialog aria-label="Nouvelle dépense">`
  - Les noms stables pour les tests : radios « Thomas », « Liz », « Aujourd'hui », « Hier », « Autre date », « Courante », « Charge fixe », « Transfert », « Moitié », « Au prorata », « Personnalisée » ; boutons « Modifier », « Replier », « Fermer », « Ajouter la dépense » ; champs `montant`, `description`, `date`, `partThomas`, `partLiz`, `commentaire`.

- [x] **Step 1 : Réécrire les parcours de saisie (ils doivent échouer)**

Dans `apps/web/e2e/parcours.spec.ts` :

**a.** Remplacer le corps du test « ajouter une depense fait bouger le solde » par :

```ts
        await page.goto('/')
        const soldeAvant = await soldeEnCentimes(page)

        await page.goto('/?saisie=1')
        const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
        await expect(feuille).toBeVisible()

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
```

**b.** Dans « supprimer une depense rend au solde sa valeur exacte », remplacer le bloc qui va de `await page.goto('/depenses')` jusqu'à `await expect(page.getByTestId('liste-depenses')).toContainText(description)` (le premier) par :

```ts
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
```

**c.** Dans les trois tests du `describe('borne haute de la date de depense (issue #29)')`, remplacer chaque

```ts
      await page.goto('/depenses')
      await page.getByRole('button', { name: 'Modifier' }).click()
```

par

```ts
      await page.goto('/?saisie=1')
      const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
      await feuille.getByRole('button', { name: 'Modifier' }).click()
      await feuille.getByRole('radio', { name: 'Autre date' }).check()
```

et, dans le troisième, remplacer `await page.getByRole('button', { name: 'Replier' }).click()` par `await feuille.getByRole('button', { name: 'Replier' }).click()` et `await expect(page.getByLabel('Date')).toBeVisible()` par `await expect(page.locator('input[name="date"]')).toBeVisible()`.

**d.** Dans « regler les comptes pre-remplit un transfert du solde exact », remplacer `await page.goto('/depenses?regler=1')` par :

```ts
    await page.goto('/?saisie=regler')
    const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
```

et remplacer le commentaire et l'assertion `await expect(page.getByText(/payé par Liz · transfert/)).toBeVisible()` par :

```ts
    // Le payeur est le DEBITEUR — le piege documente de CLAUDE.md. Le seed part
    // de « Liz doit 1 145,80 € a Thomas » et aucun parcours precedent n'inverse
    // ce sens : Liz reste debitrice. Le payeur est visible sans deplier ; la
    // ligne de resume dit le type.
    await expect(feuille.getByRole('radio', { name: 'Liz' })).toBeChecked()
    await expect(feuille.getByText("Aujourd'hui · transfert")).toBeVisible()
```

**e.** Dans « un filtre ne change pas le montant du reglement », remplacer `await page.goto('/depenses?regler=1&mois=2026-08')` par `await page.goto('/depenses?mois=2026-08&saisie=regler')`.

**f.** Dans « regler les comptes met le solde a zero », remplacer `await expect(page).toHaveURL('/depenses?regler=1')` par `await expect(page).toHaveURL('/?saisie=regler')`, puis remplacer le bloc qui va de `await page.getByRole('button', { name: 'Ajouter la dépense' }).click()` jusqu'à `await expect(page.getByTestId('apercu-parts')).toHaveCount(0)` par :

```ts
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
```

**g.** Supprimer le test « le formulaire de saisie precede l historique » : le formulaire n'est plus sur `/depenses`. Le critère qu'il portait (joignable sans défiler) revient en Task 8, sur la feuille.

Dans `apps/web/e2e/cibles-tactiles.spec.ts`, remplacer le test « le formulaire de depense ne pose aucune cible sous 44px, details deplies » par :

```ts
  test('la feuille de saisie ne pose aucune cible sous 44px, details deplies', async ({
    page,
  }) => {
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
```

Dans `apps/web/e2e/debordement.spec.ts`, remplacer les deux tests « le formulaire de depense ne deborde pas, details deplies » et « l'apercu des parts ne deborde pas » par :

```ts
test('la feuille de saisie ne deborde pas, details deplies', async ({ page }) => {
  await page.goto('/?saisie=1')
  const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
  // Deplie, avec la rangee a trois segments la plus longue (« Personnalisée »)
  // et les deux champs de parts cote a cote.
  await feuille.getByRole('button', { name: 'Modifier' }).click()
  await feuille.getByRole('radio', { name: 'Autre date' }).check()
  await feuille.getByRole('radio', { name: 'Personnalisée' }).check()
  await expect(page.getByLabel('Part Thomas (€)')).toBeVisible()
  expect(await debordements(page)).toEqual([])
})

test("l'apercu des parts ne deborde pas", async ({ page }) => {
  await page.goto('/?saisie=1')
  // L'apercu n'existe qu'une fois montant ET description saisis (250ms de
  // debounce, puis un aller-retour serveur).
  await page.getByLabel('Montant (€)').fill('1 110,58')
  await page.getByLabel('Description').fill('Loyer + charges juillet')
  await expect(page.getByTestId('apercu-parts')).toBeVisible()
  expect(await debordements(page)).toEqual([])
})
```

- [x] **Step 2 : Lancer les e2e, vérifier qu'ils échouent**

Run: `task test:e2e:frais`
Expected: FAIL — aucun `dialog` « Nouvelle dépense » sur `/?saisie=1`.

- [x] **Step 3 : `preparerReglementAction`**

Dans `apps/web/actions/depenses.ts`, compléter les imports :

```ts
import {
  ajouterDepense,
  calculerPartsPourSaisie,
  genererChargeFixeDuMois,
  listerVersions,
  resumerDepenses,
  supprimerDepense,
} from '@homebudget/db'
import {
  type Cents,
  type Parts,
  type Personne,
  synthese,
  totalChargesCommunes,
} from '@homebudget/domain'
```

et ajouter, après `ajouterDepenseAction` :

```ts
/**
 * Ce que « Regler les comptes » pre-remplit : le solde EXACT et la personne qui
 * le doit. `null` quand il n'y a rien a regler.
 *
 * Une action et non une lecture de page : la feuille de saisie est montee dans
 * le layout, qui ne recoit pas `searchParams`. Le calcul n'est pas duplique —
 * c'est le meme `synthese()` que l'accueil, sur le meme agregat, jamais un
 * montant venu du navigateur.
 *
 * `exigerSession()` en PREMIERE ligne : elle expose le solde.
 */
export async function preparerReglementAction(): Promise<
  Resultat<{ montant: Cents; payePar: Personne } | null>
> {
  await exigerSession()
  try {
    const s = synthese(await resumerDepenses())
    return {
      ok: true,
      valeur: s.etat === 'dette' ? { montant: s.montant, payePar: s.debiteur } : null,
    }
  } catch (e) {
    return enEchec(e)
  }
}
```

- [x] **Step 4 : Déplacer et réécrire `FormulaireDepense`**

Run: `git mv "apps/web/app/(app)/depenses/formulaire-depense.tsx" apps/web/components/formulaire-depense.tsx`

Puis remplacer tout `apps/web/components/formulaire-depense.tsx` par :

```tsx
'use client'

import {
  type Apercu,
  type SaisieBrute,
  ajouterDepenseAction,
  previsualiserPartsAction,
} from '@/actions/depenses'
import { Montant } from '@/components/montant'
import { Button } from '@/components/ui/button'
import { Choix } from '@/components/ui/choix'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { aujourdhuiLocal, formaterDate, montantPourSaisie, veille } from '@/lib/format'
import {
  type Cents,
  type Personne,
  type TypeDepense,
  dateMaxDepense,
  modeParDefaut,
} from '@homebudget/domain'
import posthog from 'posthog-js'
import { useActionState, useEffect, useState } from 'react'

const LIBELLE_TYPE: Record<TypeDepense, string> = {
  courante: 'courante',
  charge_fixe: 'charge fixe',
  transfert: 'transfert',
}

const LIBELLE_MODE: Record<string, string> = {
  prorata: 'au prorata',
  moitie: 'moitié-moitié',
  personnalise: 'parts personnalisées',
  transfert: 'transfert',
}

const PAYEURS = [
  { valeur: 'thomas', libelle: 'Thomas' },
  { valeur: 'liz', libelle: 'Liz' },
] as const

const TYPES = [
  { valeur: 'courante', libelle: 'Courante' },
  { valeur: 'charge_fixe', libelle: 'Charge fixe' },
  { valeur: 'transfert', libelle: 'Transfert' },
] as const

// Le mode « transfert » n'est jamais propose : il va avec le type « transfert »,
// et avec lui seul (`lib/saisie.ts` refuse les combinaisons croisees).
const MODES = [
  { valeur: 'prorata', libelle: 'Au prorata' },
  { valeur: 'moitie', libelle: 'Moitié' },
  { valeur: 'personnalise', libelle: 'Personnalisée' },
] as const

const RACCOURCIS_DATE = [
  { valeur: 'aujourdhui', libelle: "Aujourd'hui" },
  { valeur: 'hier', libelle: 'Hier' },
  { valeur: 'autre', libelle: 'Autre date' },
] as const

export function FormulaireDepense({
  personne,
  reglement,
  onEnregistree,
}: {
  personne: Personne
  /**
   * Pose par « Régler les comptes » (issue #26) : le solde courant et la
   * personne qui le DOIT. `| undefined` explicite — `exactOptionalPropertyTypes`
   * refuse qu'on passe `undefined` a un prop simplement optionnel.
   */
  reglement?: { montant: Cents; payePar: Personne } | undefined
  /** Appelee apres une ecriture reussie : la feuille se ferme. Doit etre stable. */
  onEnregistree: () => void
}) {
  const [etat, action, enCours] = useActionState(ajouterDepenseAction, null)

  // Un reglement est un TRANSFERT : `type` et `mode` valent tous deux
  // `transfert`, et `normaliser()` refuse toute combinaison croisee.
  const typeInitial: TypeDepense = reglement ? 'transfert' : 'courante'

  const [date, setDate] = useState(aujourdhuiLocal)
  const [description, setDescription] = useState(reglement ? 'Règlement des comptes' : '')
  const [montant, setMontant] = useState(reglement ? montantPourSaisie(reglement.montant) : '')
  // Pre-rempli avec la personne connectee : dans neuf cas sur dix, on saisit
  // ce qu'on vient de payer soi-meme. Un reglement impose le DEBITEUR : c'est
  // lui qui verse, et l'inverser doublerait la dette au lieu de l'annuler
  // (CLAUDE.md, « Le piege qui coute de l'argent »).
  const [payePar, setPayePar] = useState<string>(reglement?.payePar ?? personne)
  const [type, setType] = useState<TypeDepense>(typeInitial)
  const [mode, setMode] = useState<string>(modeParDefaut(typeInitial))
  const [partThomas, setPartThomas] = useState('')
  const [partLiz, setPartLiz] = useState('')
  const [commentaire, setCommentaire] = useState('')

  // B3 : les champs a defaut correct sont replies par defaut. Ils restent
  // MONTES (masques par `hidden`, pas demontes) : un champ hidden mais non
  // disabled est serialise normalement a la soumission. Les demonter enverrait
  // la depense sans date ni type.
  const [detailsOuverts, setDetailsOuverts] = useState(false)
  // « Autre date » choisi explicitement : le champ reste visible meme si la date
  // tapee retombe sur aujourd'hui ou hier.
  const [autreDate, setAutreDate] = useState(false)

  const [apercu, setApercu] = useState<Apercu | null>(null)
  const [messageApercu, setMessageApercu] = useState<string | null>(null)

  const aujourdhui = aujourdhuiLocal()
  const raccourciDate = autreDate
    ? 'autre'
    : date === aujourdhui
      ? 'aujourdhui'
      : date === veille(aujourdhui)
        ? 'hier'
        : 'autre'

  function choisirRaccourciDate(valeur: string) {
    if (valeur === 'autre') {
      setAutreDate(true)
      return
    }
    setAutreDate(false)
    setDate(valeur === 'hier' ? veille(aujourdhuiLocal()) : aujourdhuiLocal())
  }

  function changerType(nouveau: string) {
    setType(nouveau as TypeDepense)
    setMode(modeParDefaut(nouveau as TypeDepense))
  }

  // Un <input type="date"> vide renvoie '' : replier rafficherait alors un
  // resume qui appelle formaterDate('') (throw, cf. lib/format.ts) et laisserait
  // un champ `required` masque bloquer la soumission sans focus possible. On
  // retablit le defaut avant de replier.
  //
  // Meme famille de piege pour une date HORS BORNE (issue #29) : `hidden` ne
  // rend pas un champ valide, seulement invisible et infocalisable. On refuse
  // donc de replier tant que la date depasse la borne, pour que l'erreur reste
  // visible et focalisable.
  function replier() {
    if (!date) setDate(aujourdhuiLocal())
    if (date > dateMaxDepense(aujourdhuiLocal())) return
    setDetailsOuverts(false)
  }

  // La ligne de resume DIT TOUJOURS LA VERITE sur ce qui sera enregistre. Le
  // payeur n'y figure plus : il est visible sans deplier.
  function construireResume(): string {
    const dateTxt = date === aujourdhuiLocal() ? "Aujourd'hui" : formaterDate(date)
    // Cas transfert : type et mode valent tous deux `transfert` — on n'affiche
    // qu'une fois `transfert`, jamais « transfert, transfert ».
    const typeMode =
      type === 'transfert' ? 'transfert' : `${LIBELLE_TYPE[type]}, ${LIBELLE_MODE[mode] ?? mode}`
    return `${dateTxt} · ${typeMode}`
  }

  const estTransfert = type === 'transfert'

  // Apercu en direct : chaque changement significatif redemande au SERVEUR de
  // rejouer le calcul. Rien de la config ne descend dans le navigateur.
  useEffect(() => {
    if (!montant || !description) {
      setApercu(null)
      setMessageApercu(null)
      return
    }
    const brut: SaisieBrute = {
      date,
      description,
      montant,
      payePar,
      type,
      mode,
      partThomas,
      partLiz,
    }
    let annule = false
    const minuteur = setTimeout(async () => {
      const r = await previsualiserPartsAction(brut)
      if (annule) return
      if (r.ok) {
        setApercu(r.valeur)
        setMessageApercu(null)
      } else {
        setApercu(null)
        setMessageApercu(r.message)
      }
    }, 250)
    return () => {
      annule = true
      clearTimeout(minuteur)
    }
  }, [date, description, montant, payePar, type, mode, partThomas, partLiz])

  // Un resultat de soumission ecrase l'erreur d'apercu : jamais deux messages
  // rouges empiles qui se contredisent.
  useEffect(() => {
    if (etat) setMessageApercu(null)
  }, [etat])

  // Apres une ecriture reussie, la feuille se ferme et ce formulaire est demonte :
  // c'est ce qui desarme un second clic. Vider `montant` en plus couvre les
  // quelques millisecondes entre la reponse et la navigation — le champ est
  // `required`, le navigateur refuse une soumission vide.
  useEffect(() => {
    if (etat?.ok) {
      setMontant('')
      setDescription('')
      onEnregistree()
    }
  }, [etat, onEnregistree])

  function soumettreDepense(form: FormData) {
    posthog.capture('expense_submission_started', {
      expense_type: type,
      allocation_mode: mode,
    })
    action(form)
  }

  return (
    <form action={soumettreDepense} className="flex flex-col">
      <div className="flex flex-col gap-4 px-5">
        <div className="flex flex-col items-center gap-1">
          <Label htmlFor="montant">Montant (€)</Label>
          <Input
            id="montant"
            name="montant"
            required
            autoFocus
            inputMode="decimal"
            placeholder="0,00"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
            className="h-auto bg-transparent py-1 text-center font-display text-[3.625rem] leading-[1.1] font-semibold tracking-[-0.035em]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            name="description"
            required
            placeholder="Courses, loyer, restaurant…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <Choix legende="Payé par" name="payePar" options={PAYEURS} valeur={payePar} onChange={setPayePar} />

        {!detailsOuverts && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.84375rem] text-muted-foreground">{construireResume()}</p>
            <Button
              type="button"
              variant="discret"
              aria-expanded={false}
              onClick={() => setDetailsOuverts(true)}
              className="-mr-3 px-3"
            >
              Modifier
            </Button>
          </div>
        )}

        <div hidden={!detailsOuverts} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Choix
              legende="Date"
              name="raccourciDate"
              options={RACCOURCIS_DATE}
              valeur={raccourciDate}
              onChange={choisirRaccourciDate}
            />
            <div hidden={raccourciDate !== 'autre'} className="flex flex-col gap-1.5">
              <Label htmlFor="date">Date de la dépense</Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                // Le selecteur natif grise l'au-dela, et le navigateur refuse la
                // soumission sans aller-retour serveur. Ce n'est qu'un confort :
                // le serveur reste la seule autorite (`verifierDatePlausible`,
                // appelee par `calculerPartsPourSaisie`).
                max={dateMaxDepense(aujourdhuiLocal())}
                value={date}
                onChange={(e) => {
                  setAutreDate(true)
                  setDate(e.target.value)
                }}
              />
            </div>
          </div>

          <Choix legende="Type" name="type" options={TYPES} valeur={type} onChange={changerType} />

          {estTransfert ? (
            <div className="flex flex-col gap-1.5">
              {/* Aucun radio de mode n'est monte pour un transfert : ce champ
                  cache est la seule source de `mode`. */}
              <input type="hidden" name="mode" value="transfert" />
              <p className="text-xs text-muted-foreground">
                Un transfert ne se répartit pas : la totalité est portée au crédit de celui qui
                verse.
              </p>
            </div>
          ) : (
            <Choix legende="Répartition" name="mode" options={MODES} valeur={mode} onChange={setMode} />
          )}

          {mode === 'personnalise' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="partThomas">Part Thomas (€)</Label>
                <Input
                  id="partThomas"
                  name="partThomas"
                  inputMode="decimal"
                  value={partThomas}
                  onChange={(e) => setPartThomas(e.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="partLiz">Part Liz (€)</Label>
                <Input
                  id="partLiz"
                  name="partLiz"
                  inputMode="decimal"
                  value={partLiz}
                  onChange={(e) => setPartLiz(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commentaire">Commentaire (facultatif)</Label>
            <Input
              id="commentaire"
              name="commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
            />
          </div>

          <div>
            <Button
              type="button"
              variant="discret"
              aria-expanded={true}
              onClick={replier}
              className="-ml-3 px-3"
            >
              Replier
            </Button>
          </div>
        </div>
      </div>

      {/* Le pied reste colle en bas de la feuille quand elle defile (details
          deplies) : l'apercu et la validation ne sortent jamais de l'ecran. */}
      <div className="sticky bottom-0 mt-4 flex flex-col gap-3 border-t border-subtle bg-surface px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {/* L'apercu est calcule par la MEME fonction que l'ecriture, cote
            serveur. Un apercu qui divergerait de ce qui sera enregistre serait
            un mensonge affiche a l'utilisateur. */}
        {apercu && (
          <div data-testid="apercu-parts" className="flex flex-col gap-0.5">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.8125rem]">
              <span className="font-semibold text-muted-foreground">Aperçu des parts</span>
              <span className="font-bold">
                Thomas <Montant cents={apercu.parts.thomas} niveau="courant" testId="apercu-thomas" />{' '}
                · Liz <Montant cents={apercu.parts.liz} niveau="courant" testId="apercu-liz" />
              </span>
            </p>
            <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">
              Config en vigueur au {formaterDate(apercu.versionDateDebut)} : {apercu.versionLibelle}{' '}
              — charges communes <Montant cents={apercu.totalChargesCommunes} niveau="discret" />
            </p>
          </div>
        )}

        {messageApercu && (
          <p data-testid="message-erreur-apercu" className="text-sm text-destructive">
            {messageApercu}
          </p>
        )}
        {etat && !etat.ok && (
          <p data-testid="message-erreur-envoi" className="text-sm text-destructive">
            {etat.message}
          </p>
        )}

        <Button type="submit" disabled={enCours} className="h-[3.375rem] w-full rounded-[1rem] text-base">
          {enCours ? 'Enregistrement…' : 'Ajouter la dépense'}
        </Button>
      </div>
    </form>
  )
}
```

- [x] **Step 5 : Créer `FeuilleSaisie`**

`apps/web/components/feuille-saisie.tsx` :

```tsx
'use client'

import { preparerReglementAction } from '@/actions/depenses'
import { FormulaireDepense } from '@/components/formulaire-depense'
import { lienFermerSaisie, modeSaisie } from '@/lib/url-saisie'
import type { Cents, Personne } from '@homebudget/domain'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type Reglement = { montant: Cents; payePar: Personne }

/**
 * La feuille de saisie, ouverte par-dessus n'importe quel ecran (spec
 * 2026-09-13).
 *
 * Un <dialog> NATIF ouvert par showModal(), pour la raison qui l'a fait choisir
 * pour `MenuCompte` : piege de focus, Escape, arriere-plan inerte et ::backdrop,
 * sans une ligne de JS. Ancre en bas sous 768px, centre au-dela.
 *
 * L'etat ouvert vit dans l'URL (`lib/url-saisie.ts`) : le bouton retour du
 * telephone la ferme, et fermer la feuille — Escape, « Fermer », un clic sur le
 * voile, une ecriture reussie — retire `saisie` de l'URL. Montee UNE fois, dans
 * le layout du groupe (app).
 *
 * Le formulaire n'est MONTE que feuille ouverte : chaque ouverture repart d'un
 * formulaire vierge, et le fermer apres une ecriture le demonte — c'est ce qui
 * desarme un second clic.
 */
export function FeuilleSaisie({ personne }: { personne: Personne }) {
  const feuille = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const chemin = usePathname()
  const params = useSearchParams()
  const mode = modeSaisie(params.get('saisie'))

  // `undefined` : pas encore lu. `null` : rien a regler.
  const [reglement, setReglement] = useState<Reglement | null | undefined>(undefined)
  const [erreur, setErreur] = useState<string | null>(null)

  const fermer = useCallback(() => {
    router.replace(lienFermerSaisie(chemin, new URLSearchParams(params)), { scroll: false })
  }, [router, chemin, params])

  useEffect(() => {
    const dialogue = feuille.current
    if (!dialogue) return
    if (mode && !dialogue.open) dialogue.showModal()
    if (!mode && dialogue.open) dialogue.close()
  }, [mode])

  // Le montant du reglement vient du SERVEUR, par le meme `synthese()` que
  // l'accueil : jamais d'un parametre d'URL qu'on pourrait taper a la main.
  useEffect(() => {
    setReglement(undefined)
    setErreur(null)
    if (mode !== 'regler') return
    let annule = false
    preparerReglementAction().then((r) => {
      if (annule) return
      if (r.ok) setReglement(r.valeur)
      else setErreur(r.message)
    })
    return () => {
      annule = true
    }
  }, [mode])

  const rienARegler = mode === 'regler' && reglement === null
  // Le formulaire lit `reglement` dans son etat initial, une seule fois : il ne
  // se monte qu'une fois cette valeur connue.
  const pret = mode === 'libre' || (mode === 'regler' && reglement !== undefined && !rienARegler)

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: le clic sur le voile double Escape, que le <dialog> natif gere deja au clavier.
    <dialog
      ref={feuille}
      aria-label="Nouvelle dépense"
      // Le <dialog> se ferme seul sur Escape : on le repercute dans l'URL. Quand
      // c'est l'URL qui a change (bouton retour), `mode` vaut deja null.
      onClose={() => {
        if (mode) fermer()
      }}
      onClick={(evenement) => {
        if (evenement.target === feuille.current) feuille.current?.close()
      }}
      className={[
        'w-full border-0 bg-surface p-0 text-strong backdrop:bg-overlay',
        'max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain',
        'max-md:mt-auto max-md:mb-0 max-md:max-w-none max-md:rounded-t-3xl',
        'md:m-auto md:max-w-md md:rounded-3xl',
      ].join(' ')}
    >
      <div className="sticky top-0 z-10 bg-surface px-5 pt-2">
        <div aria-hidden="true" className="mx-auto h-1 w-9 rounded-full bg-subtle md:hidden" />
        <div className="flex min-h-12 items-center justify-between">
          <h2 className="font-display text-[1.3125rem] font-semibold tracking-[-0.015em]">
            Nouvelle dépense
          </h2>
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => feuille.current?.close()}
            className="-mr-2 flex size-11 items-center justify-center rounded-full bg-muted text-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12" />
              <path d="M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>

      {erreur && <p className="px-5 pb-5 text-sm text-destructive">{erreur}</p>}
      {rienARegler && (
        <p className="px-5 pb-5 text-sm text-muted-foreground">
          Vous êtes à jour : il n’y a rien à régler.
        </p>
      )}
      {pret && (
        <FormulaireDepense
          key={mode}
          personne={personne}
          reglement={reglement ?? undefined}
          onEnregistree={fermer}
        />
      )}
    </dialog>
  )
}
```

- [x] **Step 6 : Monter la feuille dans le layout**

Dans `apps/web/app/(app)/layout.tsx`, ajouter les imports :

```tsx
import { Suspense, type ReactNode } from 'react'

import { FeuilleSaisie } from '@/components/feuille-saisie'
```

(en remplaçant `import type { ReactNode } from 'react'`), puis, dans le JSX retourné, juste avant le `</>` final :

```tsx
      {/* `useSearchParams()` dans un composant client : la frontiere Suspense
          est ce que Next exige pour ne pas basculer tout le layout en rendu
          client. Le groupe (app) est dynamique de toute facon (cookies). */}
      <Suspense fallback={null}>
        <FeuilleSaisie personne={session.personne} />
      </Suspense>
```

- [x] **Step 7 : Retirer la saisie de `/depenses`**

Dans `apps/web/app/(app)/depenses/page.tsx` :

- supprimer l'import `import { FormulaireDepense } from './formulaire-depense'` ;
- remplacer `import { type Personne, synthese } from '@homebudget/domain'` par `import type { Personne } from '@homebudget/domain'` ;
- dans le type de `searchParams`, supprimer la ligne `regler?: string | string[]` ; dans la déstructuration, remplacer `const { regler, mois, payePar, n } = await searchParams` par `const { mois, payePar, n } = await searchParams` ;
- supprimer les lignes `const s = synthese(global)` et la constante `reglement` ;
- dans le `href` de « Voir plus », supprimer la ligne `...(regler ? { regler: '1' } : {}),` et, dans le commentaire au-dessus, « le filtre pose et `?regler=1` (#26) survivent » par « le filtre pose survit » ;
- remplacer le bloc final (commentaire compris) qui commence par `{/* \`sticky\` : la saisie reste a portee` et se termine par le `</div>` qui contient `FormulaireGeneration` par :

```tsx
        {/* Au large, a cote de l'historique ; au telephone, dessous : on ouvre
            cet ecran pour relire l'historique, pas pour generer un loyer une
            fois par mois. La saisie, elle, est la feuille du « + ». */}
        <div className="lg:sticky lg:top-5">
          <FormulaireGeneration personne={session.personne} />
        </div>
```

- [x] **Step 8 : Pointer « Régler les comptes » vers la feuille**

Dans `apps/web/app/(app)/page.tsx`, remplacer `href="/depenses?regler=1"` par `href="/?saisie=regler"`. L'accueil est réécrit en Task 7 ; ce changement d'une ligne garde le parcours de règlement vert entre-temps.

- [x] **Step 9 : Lancer les tests, vérifier qu'ils passent**

Run: `task verif`
Expected: PASS — `architecture.test.ts` trouve `preparerReglementAction` et son `exigerSession()`.

Run: `task test:e2e:frais`
Expected: PASS, dont les canaris (114 580), « ajouter une depense fait bouger le solde » (−2 500) dans les deux tailles, la suppression (+2 000 puis retour), et les deux règlements.

- [x] **Step 10 : Commit**

```bash
git add apps/web
git commit -m "feat(web): la saisie devient une feuille ouverte par l'URL (#68)"
```

---

### Task 7 : L'accueil

**Files:**
- Modify: `apps/web/app/(app)/page.tsx` (fichier entier)
- Test: `apps/web/e2e/parcours.spec.ts`

**Interfaces:**
- Consumes: `LigneDepense`, `Montant` (Task 4) ; `lienOuvrirSaisie` (Task 3) ; la route `/tableau-de-bord` (Task 5).
- Produces: `<h1 data-testid="phrase-synthese">`, liens « Régler les comptes », « Voir le détail », « Voir tout », `data-testid="dernieres-depenses"`.

- [x] **Step 1 : Adapter les tests (ils doivent échouer)**

Dans `apps/web/e2e/parcours.spec.ts`, test « le solde de reference du seed est a l ecran » :

- remplacer le commentaire « Le bandeau enchasse le montant AU MILIEU de la phrase… » et l'assertion `toContainText(/Liz doit .+ à Thomas/)` par :

```ts
        // Le sens est le libelle (« Liz doit à Thomas ») ; le montant est un bloc
        // a part, en dessous. La valeur reste epinglee au nœud <data>.
        await expect(page.getByTestId('phrase-synthese')).toContainText('Liz doit à Thomas')
```

- remplacer la ligne `await page.goto('/tableau-de-bord')` (ajoutée en Task 5) par :

```ts
        await page.getByRole('link', { name: 'Voir le détail' }).click()
        await expect(page).toHaveURL('/tableau-de-bord')
```

Dans « ajouter une depense fait bouger le solde », après `await expect(page).toHaveURL('/')`, ajouter :

```ts
        // L'ecran sous la feuille suit l'ecriture, sans rechargement.
        await expect(page.getByTestId('dernieres-depenses')).toContainText(description)
```

- [x] **Step 2 : Lancer les e2e, vérifier qu'ils échouent**

Run: `task test:e2e:frais`
Expected: FAIL — pas de lien « Voir le détail », pas de `dernieres-depenses`.

- [x] **Step 3 : Réécrire l'accueil**

Remplacer tout `apps/web/app/(app)/page.tsx` par :

```tsx
import Link from 'next/link'

import { LigneDepense } from '@/components/ligne-depense'
import { Montant } from '@/components/montant'
import { exigerSession } from '@/lib/session'
import { lienOuvrirSaisie } from '@/lib/url-saisie'
import { listerDepenses, resumerDepenses } from '@homebudget/db'
import { nomPersonne, synthese } from '@homebudget/domain'

// L'accueil doit refleter la derniere ecriture, jamais un cache de build.
export const dynamic = 'force-dynamic'

export default async function Accueil() {
  // EN PREMIERE LIGNE, avant toute lecture. Le layout du groupe (app) appelle
  // deja `exigerSession()`, mais Next.js ne garantit pas de re-rendre un layout
  // a chaque requete d'un segment, et le middleware ne constate que la PRESENCE
  // du cookie. Cet ecran expose le solde : la garde vit ici.
  await exigerSession()

  // Deux lectures BORNEES : le solde est un agregat que Postgres plie, et
  // l'apercu ne descend que cinq lignes.
  const resume = await resumerDepenses()
  const recentes = await listerDepenses({ limite: 5 })
  const s = synthese(resume)

  return (
    <>
      {/* LA surface prune de l'application, reservee au seul chiffre qui compte.
          Elle est prune quel que soit le sens de la dette : la couleur est la
          marque, jamais un jugement. */}
      <section data-testid="bandeau-solde" className="flex flex-col rounded-2xl bg-emphasis p-5 text-on-emphasis">
        {/* Le <h1> de l'ecran : l'accueil n'a pas d'autre titre, et
            `debordement.spec.ts` attend un <h1> visible sur chaque route. */}
        <h1 data-testid="phrase-synthese" className="flex flex-col">
          {s.etat === 'a-jour' ? (
            <span className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.02em]">
              Vous êtes à jour
            </span>
          ) : (
            <>
              <span className="text-sm font-semibold text-on-emphasis/72">
                {nomPersonne(s.debiteur)} doit à {nomPersonne(s.crediteur)}
              </span>
              <Montant cents={s.montant} niveau="heros" className="mt-1.5" />
            </>
          )}
        </h1>
        <p className="mt-1.5 text-[0.8125rem] text-on-emphasis/60">
          Sur {resume.nombre} {resume.nombre > 1 ? 'dépenses' : 'dépense'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* Rien a regler, pas de lien : un lien inerte inviterait a creer un
              transfert de zero. */}
          {s.etat === 'dette' && (
            <Link
              href={lienOuvrirSaisie('/', new URLSearchParams(), 'regler')}
              scroll={false}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-on-emphasis/14 px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-on-emphasis focus-visible:outline-none"
            >
              Régler les comptes
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </Link>
          )}
          <Link
            href="/tableau-de-bord"
            className="inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold text-on-emphasis/85 focus-visible:ring-2 focus-visible:ring-on-emphasis focus-visible:outline-none"
          >
            Voir le détail
          </Link>
        </div>
      </section>

      <div className="mt-7 mb-1.5 flex items-center justify-between">
        <h2 className="font-display text-[1.1875rem] font-semibold tracking-[-0.01em]">
          Dernières dépenses
        </h2>
        <Link
          href="/depenses"
          className="-mr-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-marque focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Voir tout
        </Link>
      </div>

      <div className="rounded-xl bg-surface px-3.5 py-1 shadow-xs">
        {recentes.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Aucune dépense pour le moment.</p>
        ) : (
          <ul data-testid="dernieres-depenses">
            {recentes.map((d) => (
              <LigneDepense key={d.id} depense={d} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
```

- [x] **Step 4 : Lancer les tests, vérifier qu'ils passent**

Run: `task verif`
Expected: PASS.

Run: `task test:e2e:frais`
Expected: PASS — y compris « Vous êtes à jour » en texte exact après le règlement, et « l'accueil ne pose aucune cible sous 44px » (« Voir tout »).

- [x] **Step 5 : Commit**

```bash
git add "apps/web/app/(app)/page.tsx" apps/web/e2e/parcours.spec.ts
git commit -m "feat(web): accueil, le solde en titre et les dernieres depenses (#68)"
```

---

### Task 8 : La coque — barre à trois cases, menu du compte dans l'en-tête

**Files:**
- Modify: `apps/web/components/nav-principale.tsx` (fichier entier)
- Modify: `apps/web/components/menu-compte.tsx`
- Modify: `apps/web/components/marque.tsx`
- Modify: `apps/web/app/(app)/layout.tsx`
- Test: `apps/web/e2e/parcours.spec.ts`

**Interfaces:**
- Consumes: `lienOuvrirSaisie` (Task 3) ; `FeuilleSaisie` montée (Task 6) ; `buttonVariants` (Task 2).
- Produces: `MenuCompte({ personne, nom, habillage: 'entete' | 'rail' })` ; le lien « Ajouter une dépense » ; le lien « Configuration » dans la feuille de compte.

- [x] **Step 1 : Écrire les tests qui échouent**

Dans `apps/web/e2e/parcours.spec.ts`, dans le `describe('sur un telephone')` :

Dans « la navigation est ancree au bord inferieur de l ecran », après `await expect(barre).toBeVisible()`, ajouter :

```ts
      // Trois cases : Accueil, le « + », Depenses. Config est dans le menu du compte.
      await expect(barre.getByRole('link')).toHaveCount(3)
```

Puis ajouter, avant « un signOut qui echoue ne fait pas croire a la sortie » :

```ts
    test('le + ouvre la saisie par-dessus l ecran courant, sans defiler', async ({ page }) => {
      await page.goto('/depenses?mois=2026-07')
      await page.getByRole('link', { name: 'Ajouter une dépense' }).click()
      // Les filtres survivent a l'ouverture : on saisit PAR-DESSUS l'ecran.
      await expect(page).toHaveURL('/depenses?mois=2026-07&saisie=1')
      const feuille = page.getByRole('dialog', { name: 'Nouvelle dépense' })
      await expect(feuille).toBeVisible()

      // Le critere de l'issue #68 : montant, description, payeur et validation
      // tiennent dans le premier ecran du telephone, feuille repliee. Ce test ne
      // voit pas le clavier virtuel : la verification sur un vrai telephone est
      // la derniere tache du plan.
      const bas = TELEPHONE.viewport.height
      for (const cible of [
        page.locator('input[name="montant"]'),
        page.locator('input[name="description"]'),
        feuille.getByRole('radio', { name: 'Liz' }),
        feuille.getByRole('button', { name: 'Ajouter la dépense' }),
      ]) {
        const boite = await cible.boundingBox()
        expect(boite).not.toBeNull()
        expect((boite?.y ?? bas) + (boite?.height ?? 0)).toBeLessThanOrEqual(bas)
      }

      // Fermer rend l'ecran tel qu'il etait, filtres compris.
      await feuille.getByRole('button', { name: 'Fermer' }).click()
      await expect(feuille).toBeHidden()
      await expect(page).toHaveURL('/depenses?mois=2026-07')
    })

    test('la configuration s ouvre depuis le menu du compte', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Compte' }).click()
      await page.getByRole('link', { name: 'Configuration' }).click()
      await expect(page).toHaveURL('/config')
      // La feuille de compte vit dans le layout, qui survit a la navigation :
      // sans fermeture explicite, elle resterait ouverte sur /config.
      await expect(page.getByRole('dialog', { name: 'Compte' })).toBeHidden()
    })
```

- [x] **Step 2 : Lancer les e2e, vérifier qu'ils échouent**

Run: `task test:e2e:frais`
Expected: FAIL — la barre compte trois liens et un bouton « Compte » (pas trois liens), aucun lien « Ajouter une dépense », aucun lien « Configuration ».

- [x] **Step 3 : Réécrire `NavPrincipale`**

Remplacer tout `apps/web/components/nav-principale.tsx` par :

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'

import { lienOuvrirSaisie } from '@/lib/url-saisie'
import { cn } from '@/lib/utils'

const ACCUEIL = {
  href: '/',
  libelle: 'Accueil',
  icone: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
}

const DEPENSES = {
  href: '/depenses',
  libelle: 'Dépenses',
  icone: (
    <>
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="M4.5 6h.01" />
      <path d="M4.5 12h.01" />
      <path d="M4.5 18h.01" />
    </>
  ),
}

/**
 * La navigation principale : barre basse de trois cases sous 768px, rail
 * lateral au-dessus. UNE liste pour les deux tailles.
 *
 * Au centre de la barre, le « + » : l'action la plus frequente de l'app, a
 * portee de pouce depuis n'importe quel ecran. C'est un LIEN qui ajoute
 * `saisie=1` a l'URL courante en gardant ses autres parametres — la feuille
 * s'ouvre par-dessus l'ecran, filtres compris. Au rail, il passe en tete.
 *
 * Config n'est plus ici : c'est un geste rare (une revision de loyer), il vit
 * dans le menu du compte.
 *
 * L'etat actif est porte par la couleur, la pastille ET `aria-current`, jamais
 * par le contraste seul.
 */
export function NavPrincipale() {
  const chemin = usePathname()
  const params = useSearchParams()

  return (
    <nav
      aria-label="Navigation principale"
      className="grid flex-1 grid-cols-3 items-center md:mt-1 md:flex md:flex-col md:items-stretch md:gap-0.5"
    >
      <Lien {...ACCUEIL} actif={chemin === ACCUEIL.href} />
      <Link
        href={lienOuvrirSaisie(chemin, new URLSearchParams(params), 'libre')}
        scroll={false}
        aria-label="Ajouter une dépense"
        className={cn(
          'flex items-center justify-center bg-primary text-primary-foreground transition-colors hover:bg-primary/85',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
          // Barre basse : un cercle de 58px qui deborde de 26px au-dessus.
          'max-md:-mt-6.5 max-md:size-[3.625rem] max-md:justify-self-center max-md:rounded-full max-md:shadow-action',
          // Rail : un bouton plein, en tete de la liste.
          'md:order-first md:mb-3 md:min-h-11 md:gap-2 md:rounded-lg md:px-3 md:text-sm md:font-bold',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[26px] shrink-0 md:size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span className="hidden md:inline">Ajouter une dépense</span>
      </Link>
      <Lien {...DEPENSES} actif={chemin === DEPENSES.href} />
    </nav>
  )
}

function Lien({
  href,
  libelle,
  icone,
  actif,
}: {
  href: string
  libelle: string
  icone: ReactNode
  actif: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? 'page' : undefined}
      className={cn(
        'flex items-center rounded-lg transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
        'max-md:min-h-12 max-md:flex-col max-md:justify-center max-md:gap-0.5',
        'md:gap-3 md:px-2.5 md:py-2',
        actif ? 'text-emphasis md:bg-marque-surface' : 'text-muted-foreground hover:text-strong',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full max-md:h-7.5 max-md:w-14',
          actif && 'max-md:bg-marque-surface',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[21px] shrink-0 md:size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icone}
        </svg>
      </span>
      <span className="text-[0.6875rem] font-bold md:text-sm md:font-semibold">{libelle}</span>
    </Link>
  )
}
```

- [x] **Step 4 : `MenuCompte` à deux habillages, et le lien Configuration**

Dans `apps/web/components/menu-compte.tsx` :

- ajouter les imports :

```tsx
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
```

(et fusionner avec l'import existant de `Button` : `import { Button, buttonVariants } from '@/components/ui/button'`) ;

- remplacer le premier paragraphe du commentaire du composant par :

```tsx
/**
 * Qui est connecte, par ou sortir, et ou regler la configuration.
 *
 * Rendu DEUX fois, comme `Marque` : dans l'entete sous 768px (`habillage=
 * "entete"`, l'avatar seul), en pied de rail au-dessus (`"rail"`, avatar, nom
 * et chevron). Chaque exemplaire est masque par `display: none` a la taille de
 * l'autre, donc sorti de l'arbre d'accessibilite : il n'y a jamais deux boutons
 * « Compte » atteignables. Ce qui avait echoue avant l'issue #13 n'etait pas le
 * double rendu, c'etait un bouton present mais intouchable (`max-md:sr-only`).
```

(garder le paragraphe sur le `<dialog>` natif) ;

- changer la signature :

```tsx
export function MenuCompte({
  personne,
  nom,
  habillage,
}: {
  personne: Personne
  nom: string
  habillage: 'entete' | 'rail'
}) {
```

- remplacer le `<button …>` déclencheur entier par :

```tsx
      <button
        type="button"
        aria-haspopup="dialog"
        // Dans l'entete, l'avatar seul n'a pas de texte : « Compte » est son nom.
        // Au rail, le nom visible suffit (WCAG 2.5.3, le nom accessible contient
        // le texte affiche).
        aria-label={habillage === 'entete' ? 'Compte' : undefined}
        onClick={() => {
          setEchec(false)
          feuille.current?.showModal()
        }}
        className={cn(
          'flex items-center rounded-lg transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
          habillage === 'entete'
            ? '-mr-2 size-11 justify-center rounded-full'
            : 'min-h-11 w-full gap-2.5 p-2.5 text-left text-muted-foreground hover:bg-muted',
        )}
      >
        <Avatar personne={personne} decoratif />
        {habillage === 'rail' ? (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-strong">{nom}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m18 15-6-6-6 6" />
            </svg>
          </>
        ) : null}
      </button>
```

- ajouter `import { cn } from '@/lib/utils'` ;
- remplacer le bloc `<div className="flex flex-col gap-3">` (les deux boutons) par :

```tsx
          {/* `gap-3` : « Se déconnecter » / « Annuler » est la seule paire
              d'actions adjacentes du produit ou un appui de travers change de
              sens. 12px au moins entre les deux. */}
          <div className="flex flex-col gap-3">
            <Link
              href="/config"
              // La feuille vit dans le layout, qui survit a la navigation :
              // sans cette fermeture, elle resterait ouverte sur /config.
              onClick={() => feuille.current?.close()}
              className={buttonVariants({ variant: 'discret', className: 'justify-start' })}
            >
              Configuration
            </Link>
            <Button onClick={seDeconnecter}>Se déconnecter</Button>
            <Button variant="discret" onClick={() => feuille.current?.close()}>
              Annuler
            </Button>
          </div>
```

- dans les classes du `<dialog>`, remplacer `max-md:rounded-t-xl` par `max-md:rounded-t-3xl` et `md:rounded-xl` par `md:rounded-3xl`.

- [x] **Step 5 : `Marque`**

Remplacer le JSX retourné par `Marque` dans `apps/web/components/marque.tsx` :

```tsx
    <span className="font-display text-[1.3125rem] font-bold tracking-[-0.02em]">HomeBudget</span>
```

et, dans le commentaire, « le monogramme et le nom » par « le nom, en Bricolage Grotesque ».

- [x] **Step 6 : Le layout**

Dans `apps/web/app/(app)/layout.tsx` :

- remplacer le `<header …>` mobile par :

```tsx
        <header className="flex items-center justify-between bg-app px-5 py-1.5 pt-[calc(0.375rem+env(safe-area-inset-top))] md:hidden">
          <Marque />
          <MenuCompte personne={session.personne} nom={session.nom} habillage="entete" />
        </header>
```

- dans l'`<aside>`, remplacer `<NavPrincipale />` et `<MenuCompte … />` par :

```tsx
          <Suspense fallback={null}>
            <NavPrincipale />
          </Suspense>
          <div className="max-md:hidden md:mt-auto">
            <MenuCompte personne={session.personne} nom={session.nom} habillage="rail" />
          </div>
```

- dans les classes de l'`<aside>`, remplacer `max-md:px-2` par `max-md:px-4` et ajouter `max-md:h-[calc(4.75rem+env(safe-area-inset-bottom))]` ;
- dans les classes de `<main>`, remplacer `pb-[calc(5rem+env(safe-area-inset-bottom))]` par `pb-[calc(6.5rem+env(safe-area-inset-bottom))]`, et le commentaire au-dessus par : « 6.5rem = la barre basse (76px) plus une respiration : sans cette reserve, la derniere ligne se cache dessous. `env()` y ajoute l'indicateur d'accueil des iPhone — nul partout ailleurs. » ;
- dans le commentaire du composant, remplacer « une barre `fixed bottom-0` a quatre cellules » par « une barre `fixed bottom-0` a trois cases, et le menu du compte monte dans l'entete ».

- [x] **Step 7 : Lancer les tests, vérifier qu'ils passent**

Run: `task verif`
Expected: PASS.

Run: `task test:e2e:frais`
Expected: PASS — dont « le + ouvre la saisie… sans defiler », « la configuration s ouvre depuis le menu du compte », les deux tests de déconnexion, et « la feuille de compte ne pose aucune cible sous 44px » (12 px entre « Se déconnecter » et « Annuler »).

- [x] **Step 8 : Commit**

```bash
git add apps/web
git commit -m "feat(web): barre a trois cases et menu du compte dans l'entete (#68)"
```

---

### Task 9 : Documentation, vérification sur téléphone, clôture

**Files:**
- Modify: `DESIGN.md` (fichier entier)
- Modify: `docs/superpowers/plans/2026-09-13-refonte-prune-abricot.md` (cases, marqueur d'état)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien de nouveau dans le code.

- [x] **Step 1 : Réécrire `DESIGN.md`**

Remplacer tout `DESIGN.md` par :

````markdown
# HomeBudget — manuel visuel

Ce fichier est la source de vérité du système visuel de `apps/web`. Il documente
ce que le code fait **aujourd'hui**.

**Spec :** `docs/superpowers/specs/2026-09-13-refonte-prune-abricot-design.md`
**Maquette :** « Refonte HomeBudget », page « Direction A » (issue #68)
**Implémentation :** `apps/web/app/globals.css` — les tokens ; `apps/web/components/` — les composants.
**Verrous :** `apps/web/test/theme.test.ts`, `apps/web/test/cibles-tactiles.test.ts`, `apps/web/e2e/`.

> `docs/superpowers/specs/2026-07-19-direction-visuelle-design.md` est dépassée : elle
> décrivait une app achromatique. Elle reste utile pour les raisonnements qu'elle porte
> sur `Montant`.

## Les règles qui ne se négocient pas

1. **Deux couleurs d'identité, et aucune ne code un sens.** Le **prune** porte la marque
   (bandeau du solde, liens, icônes), l'**abricot** porte l'action principale. Un solde
   est une **direction** : `+1 145,80` pour Thomas et `−1 145,80` pour Liz sont le même
   fait vu des deux bouts. Le bandeau est prune quel que soit le sens de la dette ; les
   deux soldes ont la même encre.

2. **Aucune couleur par personne.** Les pastilles de Thomas et de Liz sont identiques ;
   le nom porte l'identité.

3. **Deux familles de caractères.** Manrope pour le texte, Bricolage Grotesque pour le
   solde et les titres. Bricolage ne touche jamais un montant en liste : ses chiffres
   ne s'alignent pas. `theme.test.ts` refuse une troisième famille.

4. **Le markup n'écrit jamais une couleur.** Il écrit un token (`bg-emphasis`,
   `text-marque`, `border-subtle`). `theme.test.ts` interdit les classes de palette
   Tailwind en dur, `bg-white`, et les tokens retirés (`text-faint`, `*-positive`).

5. **Clair uniquement.** Pas de bloc `.dark`.

## Tokens

| Utilitaire | Valeur | Rôle | Contraste |
|---|---|---|---|
| `bg-app` | `#f7f4ef` | fond de page | |
| `bg-surface` | `#ffffff` | cartes, feuilles | |
| `bg-emphasis` / `text-on-emphasis` | `#3d2344` / blanc | **prune** : le bandeau du solde | 13,79:1 ; blanc 72 % 7,87:1 ; 60 % 5,95:1 |
| `text-marque` / `bg-marque` | `#5b3563` | liens, icônes, barres, focus | 9,84:1 sur blanc |
| `bg-marque-surface` | `#f3ecf3` | pastilles d'icône, état actif, réassurance | |
| `bg-primary` / `text-primary-foreground` | `#f2a45e` / `#1f1a24` | **abricot** : l'action principale | texte 8,32:1 ; abricot sur blanc 2,05:1 |
| `text-strong` | `#1f1a24` | encre : titres, montants, choix sélectionné | 17,05:1 |
| `text-muted-foreground` | `#6e6673` | **le seul gris de texte** | 5,51:1 blanc, 5,02:1 fond, 4,90:1 champ |
| `bg-muted` | `#f5f1ec` | fond de champ et de choix | |
| `border-input` | `#8a828e` | **limite** : filet inférieur d'un champ | 3,30:1 sur `bg-muted` |
| `border-subtle` | `#efeae4` | **filet** entre deux lignes | |
| `ring-ring` | `#5b3563` | focus visible | 9,84:1 |
| `text-destructive` | `#b91c1c` | erreurs de formulaire et d'action échouée | 6,47:1 |
| `backdrop:bg-overlay` | encre à 55 % | le voile des `<dialog>` | |

**L'abricot ne porte jamais de texte** et ne sert jamais de filet ni d'icône seule sur
fond clair : 2,05:1 sur blanc. Un bouton abricot est identifié par son libellé.

**Filet ≠ limite.** `border-subtle` sépare deux lignes et reste léger. `border-input`
délimite un champ et tient 3:1. Le fond d'un champ seul ne donne que 1,12:1 sur blanc :
sans son filet inférieur, un champ vide est invisible.

Rayons : 14 px champs, choix et boutons ; 20 px cartes ; 24 px bandeau ; 28 px feuilles.
Une ombre `shadow-xs` sur les cartes, `shadow-action` sur le « + » et lui seul.

Le chevron du `<select>` est un hex littéral dans `globals.css` (`url()` ne lit pas une
variable) : `#6e6673`, à resynchroniser si `--text-muted` change.

## Typographie

```
solde (heros)     Bricolage 600   clamp(2.25rem, 12vw, 3.125rem)
titre d'écran     Bricolage 600   1.3125rem
titre de section  Bricolage 600   1.1875rem
montant saisi     Bricolage 600   3.625rem
corps             Manrope 600     0.9375rem
libellé, méta     Manrope 600/400 0.8125rem   atténué
```

**Tous les montants en liste sont en `tabular-nums`.**

## Composants

### Les contrôles — `components/ui/`

- **`Button`** — deux variantes : `primaire` (abricot, texte encre) et `discret` (texte
  prune, sans contour). `min-h-11` dans les deux cas.
- **`Input`**, **`Select`**, **`Textarea`** — fond `bg-muted`, arrondis en haut, filet
  inférieur `border-input` qui passe à 2 px prune au focus. `h-11` / `min-h-11`.
  `text-base` : sous 16 px, Safari iOS zoome au focus. `Select` reste un `<select>`
  natif.
- **`Choix`** — des boutons radio natifs en segments (`<fieldset>`, `<legend>`). L'input
  couvre tout le segment en `opacity-0` : un radio `sr-only` de 1 px tomberait sous le
  plancher mesuré par `e2e/cibles-tactiles.spec.ts`.
- **`Label`** — atténué, 600, toujours lié par `htmlFor`.

### Les composants produit — `components/`

- **`FeuilleSaisie`** — la saisie, un `<dialog>` natif monté une fois dans le layout.
  Son état ouvert vit dans l'URL : `?saisie=1`, `?saisie=regler` (`lib/url-saisie.ts`).
  Le formulaire n'est monté que feuille ouverte, et la feuille se ferme après une
  écriture : c'est ce qui désarme un second clic.
- **`FormulaireDepense`** — montant, description et payeur visibles ; date, type,
  répartition et commentaire repliés, **montés et masqués par `hidden`**, jamais
  `disabled`. L'aperçu est `previsualiserPartsAction`, la fonction de l'écriture.
- **`NavPrincipale`** — trois cases sous 768 px (Accueil, « + », Dépenses), rail
  au-dessus. Le « + » est un lien qui ajoute `saisie=1` à l'URL courante.
- **`MenuCompte`** — rendu deux fois, dans l'en-tête sous 768 px et en pied de rail
  au-dessus. Il porte « Configuration », « Se déconnecter » et « Annuler ».
- **`Carte`** — blanc, sans bordure, 20 px, `shadow-xs`. `titre` rend un `<h2>`.
- **`EntetePage`** — le `<h1>` d'un écran, avec une flèche de retour optionnelle.
- **`LigneDepense`** — icône du type (nom accessible : le type), description,
  « date · payé par », **parts affichées**, montant.
- **`Montant`** — voir ci-dessous.

## Le traitement des montants

`Montant` est **l'unique frontière entre les centimes et l'écran**. Quatre niveaux, un
booléen `signe`.

| Niveau | Rendu | Usage |
|---|---|---|
| `heros` | Bricolage 600, proportionnel | le solde, sur l'accueil et le tableau de bord |
| `notable` | Manrope 700, 1.1875rem | les quatre chiffres du tableau de bord |
| `courant` | Manrope 700, 0.9375rem | une ligne de liste, de bilan, l'aperçu |
| `discret` | Manrope 500, 0.75rem, atténué | détail des parts |

**Ce que le composant n'a pas le droit de faire.** Il ne nie jamais une valeur, ne
l'inverse jamais selon la personne regardée, ne dérive jamais un signe d'un contexte.
Si un écran affiche un jour le mauvais sens, le bug est dans le domaine — jamais un `-`
dans le JSX. Le moins est un vrai `−` (U+2212), et le rendu est un `<data value={cents}>`.

## Accessibilité — les planchers

- **44 px** sur tout ce qui se touche, tenu à la source dans chaque primitive et mesuré
  sur le rendu par `e2e/cibles-tactiles.spec.ts`, écran par écran, feuilles ouvertes.
- **12 px** entre « Se déconnecter » et « Annuler ».
- **3:1** pour la limite d'un champ et l'anneau de focus ; **4,5:1** pour tout texte.
- **360 px** de largeur testée (`e2e/telephone.ts`) ; `e2e/debordement.spec.ts` lit les
  routes sur le disque.
- La saisie tient **sans défiler**, feuille repliée : `e2e/parcours.spec.ts` le mesure.
- Aucune information portée par la couleur seule : `aria-current` sur la navigation,
  `aria-label` sur les icônes de type et les avatars.
- `viewport-fit=cover` : chaque bord a sa contrepartie en `calc(base + env(…))`.

## Hors périmètre

Le mode sombre. Les icônes de bibliothèque (`lucide-react` n'est importé nulle part) et
les animations au-delà du `<dialog>` natif.

## Quand on touche au visuel

`task verif` avant de committer, `task test:e2e:frais` avant de pousser. Ne pas
assouplir `theme.test.ts` : c'est lui qui rend les règles ci-dessus vraies.
````

- [x] **Step 2 : Toute la suite, depuis une base neuve**

Run: `task verif && task test:integration && task test:e2e:frais`
Expected: PASS sur les trois.

- [x] **Step 3 : Vérifier sur un vrai téléphone**

Pousser la branche, puis déployer la preview depuis la branche :

```bash
git push -u origin HEAD
gh workflow run deploy-preview.yml --ref "$(git branch --show-current)"
```

Une fois le run vert, sur un téléphone, ouvrir `https://preview.homebudget.thomasjarrier.fr` :

1. Toucher le « + ». Taper un montant puis une description, **clavier ouvert** : les deux champs restent visibles au-dessus du clavier.
2. Toucher « Liz » : le clavier se ferme, et « Ajouter la dépense » est visible **sans défiler**.
3. Sur `/depenses`, les montants de la liste s'alignent au chiffre près (chiffres tabulaires de Manrope).
4. Le bouton retour du téléphone ferme la feuille.

Écrire le résultat des quatre points dans la description de la PR. Si le point 1 ou 2 échoue, ne pas ajouter de JavaScript qui suit le clavier : rapprocher le pied de la feuille du haut (spec, « Risques »), puis rejouer ce step.

Rappel : cette preview écrit dans la base de recette, pas en production — et la preview de `main` n'est plus en ligne tant qu'on ne l'a pas redéployée.

- [x] **Step 4 : Clore le plan**

Dans ce fichier, cocher toutes les cases et supprimer la ligne `**État :** en cours`.

Run: `pnpm --filter @homebudget/web exec vitest run test/plans.test.ts`
Expected: PASS.

- [x] **Step 5 : Commit**

```bash
git add DESIGN.md docs/superpowers/plans/2026-09-13-refonte-prune-abricot.md
git commit -m "docs: manuel visuel prune et abricot, plan clos (#68)"
```

La PR porte `Closes #68`.
