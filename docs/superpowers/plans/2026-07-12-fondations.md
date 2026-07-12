# HomeBudget — Plan 1 : Fondations

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le harness IA et le cœur métier de HomeBudget, jusqu'à prouver par un test exécutable que la reprise des données du Google Sheet donne « Liz doit 1 145,80 € à Thomas ».

**Architecture:** Monorepo pnpm à trois paquets. `packages/domain` contient toute la logique métier en TypeScript pur, sans aucune dépendance de framework, développé en TDD. `packages/db` porte le schéma Postgres — où les invariants du PRD deviennent des contraintes SQL — et l'import du Sheet, séparé en une fonction pure (testable partout) et une écriture en base (I/O). `apps/web` est créé au plan 2.

**Tech Stack:** pnpm workspaces, TypeScript strict (ESM), Vitest, Biome, Supabase (Postgres), Node 22+.

## Global Constraints

Ces règles s'appliquent à **toutes** les tâches. Une violation est un bug, quelle que soit l'élégance du code.

- **L'argent est un entier de centimes.** `1 110,58 €` s'écrit `111058`. Aucun montant n'est jamais un flottant, ni en base, ni dans le domaine. Le formatage en euros n'existe qu'à l'affichage.
- **Arrondi asymétrique.** `part_thomas = Math.round(montant × ratio)` puis `part_liz = montant − part_thomas`. Jamais deux arrondis. La somme est exacte par construction.
- **I1 — Config append-only.** Une version de config passée n'est jamais modifiée. Une révision crée une nouvelle version, qui clôture la précédente la veille.
- **I2 — Snapshot on write.** Les parts d'une dépense sont figées à sa création. Aucune lecture ne recalcule jamais une part.
- **Le mode `transfert` n'est pas « 100 % payeur ».** Quand Liz verse 400 € : `part_liz = 0`, `part_thomas = 400`. La dette de Liz *baisse*. Ne jamais inverser ce signe.
- **`packages/domain` n'importe rien.** Ni React, ni Next, ni Supabase, ni librairie de dates. Ses seules dépendances sont de développement (Vitest).
- **Les dates sont des chaînes ISO `YYYY-MM-DD`.** Pas d'objets `Date` dans le domaine : ils portent un fuseau horaire, source de bugs de bornes (une dépense du 1er du mois qui bascule au 30 du mois précédent).
- **TypeScript strict**, ESM, Node ≥ 22, pnpm ≥ 9.
- Commit après chaque tâche.

---

## Structure des fichiers

```
homebudget/
├─ CLAUDE.md                          manuel d'opération pour les agents
├─ .claude/
│  ├─ settings.json                   hooks qualité
│  ├─ hooks/verifier-fichier.sh       format + lint + typecheck à chaque écriture
│  └─ skills/{seed,verify}/SKILL.md   (/run arrive au plan 2, avec l'app)
├─ .github/workflows/ci.yml
├─ package.json                       racine, scripts du monorepo
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ biome.json
├─ packages/domain/
│  ├─ src/
│  │  ├─ money.ts                     centimes, formatage, parsing
│  │  ├─ types.ts                     Personne, TypeDepense, ModeRepartition, Parts
│  │  ├─ repartition.ts               les 4 modes
│  │  ├─ config-version.ts            résolution effective-dated, invariants de période
│  │  ├─ solde.ts                     soldes et agrégats du résumé
│  │  └─ index.ts                     surface publique
│  └─ test/*.test.ts
├─ packages/db/
│  ├─ supabase/migrations/*.sql       schéma et contraintes
│  ├─ src/import-sheet.ts             CSV → { versions, depenses }  (pur, zéro I/O)
│  ├─ src/seed.ts                     écrit le résultat de l'import dans Supabase
│  └─ test/import-sheet.test.ts       LE CANARI : 114 580 centimes
└─ docs/data/sheet-export-2026-07-12/ source de vérité (déjà commité)
```

---

## Task 1 : Squelette du monorepo et harness IA

Fonde le dépôt et les garde-fous. Tout le reste en dépend.

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.gitignore`, `.nvmrc`
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/index.ts`
- Create: `CLAUDE.md`
- Create: `.claude/settings.json`, `.claude/hooks/verifier-fichier.sh`

**Interfaces:**
- Consumes: rien.
- Produces: les scripts pnpm `test`, `test:domain`, `typecheck`, `lint`, `format`, utilisés par toutes les tâches suivantes et par la CI.

- [ ] **Step 1 : Initialiser le workspace pnpm**

`pnpm-workspace.yaml` :
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`.nvmrc` :
```
22
```

`package.json` (racine) :
```json
{
  "name": "homebudget",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "pnpm -r test",
    "test:domain": "pnpm --filter @homebudget/domain test",
    "typecheck": "tsc --build --force",
    "lint": "biome check .",
    "format": "biome check --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

`.gitignore` :
```
node_modules/
dist/
*.tsbuildinfo
.env
.env.local
.next/
coverage/
```

- [ ] **Step 2 : TypeScript strict et Biome**

`tsconfig.base.json` :
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "composite": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`noUncheckedIndexedAccess` est activé délibérément : il force à traiter `versions[0]` comme potentiellement `undefined`, ce qui est exactement le bug qu'on veut éviter quand aucune version de config ne couvre une date.

`biome.json` :
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": { "ignore": ["dist", "node_modules", ".next", "coverage"] },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "correctness": { "noUnusedVariables": "error" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } }
}
```

- [ ] **Step 3 : Créer le paquet domaine (vide mais buildable)**

`packages/domain/package.json` :
```json
{
  "name": "@homebudget/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Aucune dépendance de production. C'est intentionnel et doit le rester.

`packages/domain/tsconfig.json` :
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src/**/*", "test/**/*"]
}
```

`packages/domain/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
})
```

`packages/domain/src/index.ts` :
```ts
export {}
```

`tsconfig.json` (racine) :
```json
{
  "files": [],
  "references": [{ "path": "./packages/domain" }]
}
```

- [ ] **Step 4 : Installer et vérifier que la chaîne tourne**

```bash
pnpm install
pnpm typecheck
pnpm lint
```
Attendu : les trois commandes passent sans erreur. `pnpm test` ne trouve encore aucun test — normal.

- [ ] **Step 5 : Écrire le hook de qualité**

`.claude/hooks/verifier-fichier.sh` :
```bash
#!/usr/bin/env bash
# Formate, lint et typecheck après chaque écriture de fichier par un agent.
# Reçoit sur stdin le JSON du hook Claude Code ; en extrait le chemin du fichier.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

fichier=$(cat | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//; s/"$//')

# On ne réagit qu'aux sources TypeScript/JavaScript.
case "$fichier" in
  *.ts|*.tsx|*.js|*.jsx|*.json) ;;
  *) exit 0 ;;
esac
[ -f "$fichier" ] || exit 0

pnpm biome check --write "$fichier" >/dev/null 2>&1

if ! sortie=$(pnpm typecheck 2>&1); then
  # Code 2 : le message part sur stderr et remonte à l'agent, qui doit corriger.
  echo "Le typecheck echoue apres modification de $fichier :" >&2
  echo "$sortie" | tail -20 >&2
  exit 2
fi

exit 0
```

```bash
chmod +x .claude/hooks/verifier-fichier.sh
```

`.claude/settings.json` :
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/verifier-fichier.sh",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

Le hook rend le code 2 quand le typecheck échoue : Claude Code renvoie alors le message à l'agent, qui doit réparer avant de continuer. Un agent ne peut pas laisser le dépôt cassé.

- [ ] **Step 6 : Écrire CLAUDE.md**

`CLAUDE.md` :
```markdown
# HomeBudget — manuel d'opération

Budget partagé entre Thomas et Liz. Remplace un Google Sheet dont les formules
recalculaient rétroactivement tout l'historique à chaque changement de config.

**Spec :** `docs/superpowers/specs/2026-07-12-homebudget-harness-design.md`
**Données source :** `docs/data/sheet-export-2026-07-12/`

## Les règles qui ne se négocient pas

Le projet existe pour faire tenir ces quatre règles. Du code qui les viole est
faux, même s'il passe les tests et paraît plus simple.

1. **L'argent est un entier de centimes.** `1 110,58 €` s'écrit `111058`. Aucun
   flottant, nulle part — ni en base, ni dans le domaine. Le formatage en euros
   n'existe qu'à l'affichage.

2. **Arrondi asymétrique.** `part_thomas = Math.round(montant × ratio)`, puis
   `part_liz = montant − part_thomas`. Jamais deux arrondis : la somme doit être
   exacte *par construction*, pas par chance.

3. **Config append-only.** On ne modifie jamais une version de config passée. Une
   révision de loyer crée une *nouvelle* version qui clôture la précédente la
   veille. C'est la raison d'être du projet.

4. **Snapshot on write.** Les parts d'une dépense sont figées à sa création,
   d'après la config en vigueur *à la date de la dépense*. Aucune lecture ne
   recalcule jamais une part. Si tu écris un `SELECT` ou une vue qui recalcule
   une part, tu viens de réintroduire le bug du Sheet.

## Le piège qui coûte de l'argent

Le mode `transfert` n'est **pas** « 100 % au payeur », malgré ce que suggère le
PRD. Quand Liz verse 400 € à Thomas :

    part_liz = 0        part_thomas = 400
    solde_liz = 400 − 0 = +400   → la dette de Liz BAISSE de 400 €

Inverser ce signe fait dire à l'app que Liz doit 800 € de plus. Un test verrouille
le signe : ne le « corrige » pas.

## Architecture

- `packages/domain` — TypeScript pur, **zéro dépendance de production**. Toute la
  logique métier vit ici. Si tu écris une règle de calcul ailleurs, tu te trompes
  d'endroit.
- `packages/db` — schéma Postgres et import du Sheet. Les invariants ci-dessus
  sont des contraintes SQL (`EXCLUDE`, `CHECK`, triggers), pas des `if`. La base
  refuse physiquement d'écrire une donnée qui viole le PRD.
- `apps/web` — Next.js. UI seulement. Appelle le domaine, jamais l'inverse.

Les dates sont des chaînes ISO `YYYY-MM-DD`, jamais des objets `Date` (ils portent
un fuseau, ce qui décale les bornes de version d'un jour).

## Commandes

    pnpm test            tous les tests
    pnpm test:domain     le cœur métier seul (rapide)
    pnpm typecheck       vérification des types du monorepo
    pnpm lint            Biome
    pnpm format          Biome, en écriture

## Le canari

`packages/db/test/import-sheet.test.ts` rejoue les 33 lignes réelles du Sheet et
vérifie que le solde vaut **exactement 114 580 centimes** (« Liz doit 1 145,80 €
à Thomas »). Si ce test tombe, une des quatre règles ci-dessus a été violée.
Ne l'ajuste pas pour le faire passer : trouve ce qui a cassé.
```

- [ ] **Step 7 : Commit**

```bash
git add -A
git commit -m "chore: squelette du monorepo et harness IA

- pnpm workspaces, TypeScript strict, Biome, Vitest
- hook qualite : format + typecheck a chaque ecriture, bloquant
- CLAUDE.md : les 4 invariants et le piege du signe des transferts"
```

---

## Task 2 : `money.ts` — l'arithmétique en centimes

**Files:**
- Create: `packages/domain/src/money.ts`
- Test: `packages/domain/test/money.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `type Cents = number`
  - `function eurosVersCents(euros: number): Cents`
  - `function centsVersEuros(c: Cents): number`
  - `function formaterEuros(c: Cents): string`
  - `function repartirAuRatio(montant: Cents, ratioPremier: number): [Cents, Cents]`

- [ ] **Step 1 : Écrire les tests qui échouent**

`packages/domain/test/money.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { centsVersEuros, eurosVersCents, formaterEuros, repartirAuRatio } from '../src/money.js'

describe('eurosVersCents', () => {
  it('convertit un montant simple', () => {
    expect(eurosVersCents(1110.58)).toBe(111058)
  })

  it('resiste aux flottants pleins du Sheet', () => {
    expect(eurosVersCents(718.6105882)).toBe(71861)
    expect(eurosVersCents(762.6051613)).toBe(76261)
  })

  it('arrondit au centime le plus proche', () => {
    expect(eurosVersCents(0.005)).toBe(1)
    expect(eurosVersCents(0.004)).toBe(0)
  })

  it('refuse un montant non fini', () => {
    expect(() => eurosVersCents(Number.NaN)).toThrow()
    expect(() => eurosVersCents(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('formaterEuros', () => {
  it('formate a la francaise', () => {
    // Espace insecable etroit (U+202F) comme separateur de milliers, virgule decimale.
    expect(formaterEuros(111058).replace(/ | /g, ' ')).toBe('1 110,58 €')
    expect(formaterEuros(0).replace(/ | /g, ' ')).toBe('0,00 €')
  })

  it('formate les montants negatifs', () => {
    expect(formaterEuros(-39197).replace(/ | /g, ' ')).toBe('-391,97 €')
  })
})

describe('centsVersEuros', () => {
  it('fait l aller-retour', () => {
    expect(centsVersEuros(111058)).toBe(1110.58)
  })
})

describe('repartirAuRatio', () => {
  const RATIO_THOMAS = 3300 / 5100 // 0,647058...

  it('reproduit les parts du Sheet sur le loyer v1', () => {
    expect(repartirAuRatio(111058, RATIO_THOMAS)).toEqual([71861, 39197])
  })

  it('reproduit les parts du Sheet sur le loyer v2', () => {
    expect(repartirAuRatio(107359, RATIO_THOMAS)).toEqual([69468, 37891])
  })

  it('garantit que la somme egale toujours le montant', () => {
    // Le coeur du probleme : aucun montant, aucun ratio ne doit casser l invariant.
    for (let montant = 1; montant <= 3000; montant++) {
      for (const ratio of [0.5, RATIO_THOMAS, 1 / 3, 0.999, 0.001]) {
        const [a, b] = repartirAuRatio(montant, ratio)
        expect(a + b).toBe(montant)
        expect(Number.isInteger(a)).toBe(true)
        expect(Number.isInteger(b)).toBe(true)
      }
    }
  })

  it('gere les bornes', () => {
    expect(repartirAuRatio(100, 0)).toEqual([0, 100])
    expect(repartirAuRatio(100, 1)).toEqual([100, 0])
    expect(repartirAuRatio(0, 0.5)).toEqual([0, 0])
  })

  it('refuse un ratio hors de [0,1]', () => {
    expect(() => repartirAuRatio(100, 1.5)).toThrow()
    expect(() => repartirAuRatio(100, -0.1)).toThrow()
  })

  it('refuse un montant non entier', () => {
    expect(() => repartirAuRatio(100.5, 0.5)).toThrow()
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `pnpm --filter @homebudget/domain test`
Attendu : ÉCHEC — `Failed to resolve import "../src/money.js"`.

- [ ] **Step 3 : Implémenter**

`packages/domain/src/money.ts` :
```ts
/**
 * L'argent est un entier de centimes. Jamais un flottant.
 * `1 110,58 €` s'ecrit `111058`.
 */
export type Cents = number

const FORMATEUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function eurosVersCents(euros: number): Cents {
  if (!Number.isFinite(euros)) {
    throw new Error(`Montant invalide : ${euros}`)
  }
  return Math.round(euros * 100)
}

export function centsVersEuros(c: Cents): number {
  assertEntier(c)
  return c / 100
}

export function formaterEuros(c: Cents): string {
  assertEntier(c)
  return FORMATEUR.format(c / 100)
}

/**
 * Repartit un montant entre deux parts selon un ratio, en garantissant
 * `premier + second === montant` **par construction**.
 *
 * Un seul arrondi : le second recoit le reste. C'est ce qui rend l'invariant
 * exact plutot que probable.
 */
export function repartirAuRatio(montant: Cents, ratioPremier: number): [Cents, Cents] {
  assertEntier(montant)
  if (!Number.isFinite(ratioPremier) || ratioPremier < 0 || ratioPremier > 1) {
    throw new Error(`Ratio hors de [0,1] : ${ratioPremier}`)
  }
  const premier = Math.round(montant * ratioPremier)
  return [premier, montant - premier]
}

function assertEntier(c: Cents): void {
  if (!Number.isInteger(c)) {
    throw new Error(`Montant en centimes attendu (entier), recu : ${c}`)
  }
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `pnpm --filter @homebudget/domain test`
Attendu : PASS, 12 tests.

- [ ] **Step 5 : Commit**

```bash
git add packages/domain
git commit -m "feat(domain): arithmetique en centimes, somme des parts exacte par construction"
```

---

## Task 3 : `types.ts` et `repartition.ts` — les quatre modes

**Files:**
- Create: `packages/domain/src/types.ts`, `packages/domain/src/repartition.ts`
- Test: `packages/domain/test/repartition.test.ts`

**Interfaces:**
- Consumes: `Cents`, `repartirAuRatio` (Task 2).
- Produces:
  - `type Personne = 'thomas' | 'liz'`
  - `type TypeDepense = 'charge_fixe' | 'courante' | 'transfert'`
  - `type ModeRepartition = 'prorata' | 'moitie' | 'personnalise' | 'transfert'`
  - `interface Parts { thomas: Cents; liz: Cents }`
  - `function calculerParts(entree: EntreeRepartition): Parts`
  - `function modeParDefaut(type: TypeDepense): ModeRepartition`

- [ ] **Step 1 : Écrire les tests qui échouent**

`packages/domain/test/repartition.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { calculerParts, modeParDefaut } from '../src/repartition.js'

const RATIO_THOMAS = 3300 / 5100

describe('mode prorata', () => {
  it('reproduit les parts du loyer v1', () => {
    expect(
      calculerParts({
        montant: 111058,
        mode: 'prorata',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
      }),
    ).toEqual({ thomas: 71861, liz: 39197 })
  })

  it('reproduit les parts du loyer v2', () => {
    expect(
      calculerParts({
        montant: 107359,
        mode: 'prorata',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
      }),
    ).toEqual({ thomas: 69468, liz: 37891 })
  })
})

describe('mode moitie', () => {
  it('partage en deux', () => {
    expect(
      calculerParts({ montant: 215274, mode: 'moitie', payePar: 'thomas', ratioThomas: RATIO_THOMAS }),
    ).toEqual({ thomas: 107637, liz: 107637 })
  })

  it('attribue le centime impair de facon deterministe, jamais en double', () => {
    // 101 centimes ne se coupent pas en deux : Thomas prend 51, Liz 50.
    // Ce qui compte n'est pas qui recoit le centime, mais que la somme soit exacte.
    const parts = calculerParts({
      montant: 101,
      mode: 'moitie',
      payePar: 'thomas',
      ratioThomas: RATIO_THOMAS,
    })
    expect(parts).toEqual({ thomas: 51, liz: 50 })
    expect(parts.thomas + parts.liz).toBe(101)
  })
})

describe('mode transfert', () => {
  // LE PIEGE. Le PRD dit "100% payeur" mais le calcul est l'inverse :
  // la part du payeur vaut 0, celle de l'autre vaut le montant.
  it('quand Liz verse 400 EUR, la part de Liz vaut 0', () => {
    expect(
      calculerParts({ montant: 40000, mode: 'transfert', payePar: 'liz', ratioThomas: RATIO_THOMAS }),
    ).toEqual({ thomas: 40000, liz: 0 })
  })

  it('quand Thomas verse, la part de Thomas vaut 0', () => {
    expect(
      calculerParts({
        montant: 40000,
        mode: 'transfert',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
      }),
    ).toEqual({ thomas: 0, liz: 40000 })
  })
})

describe('mode personnalise', () => {
  it('reprend les parts saisies', () => {
    expect(
      calculerParts({
        montant: 49214,
        mode: 'personnalise',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
        partsPersonnalisees: { thomas: 0, liz: 49214 },
      }),
    ).toEqual({ thomas: 0, liz: 49214 })
  })

  it('refuse une somme qui ne fait pas le montant', () => {
    expect(() =>
      calculerParts({
        montant: 10000,
        mode: 'personnalise',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
        partsPersonnalisees: { thomas: 4000, liz: 5000 },
      }),
    ).toThrow(/somme des parts/i)
  })

  it('refuse l absence de parts saisies', () => {
    expect(() =>
      calculerParts({
        montant: 10000,
        mode: 'personnalise',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
      }),
    ).toThrow(/parts personnalisees/i)
  })
})

describe('invariant universel', () => {
  it('la somme des parts egale toujours le montant', () => {
    for (const mode of ['prorata', 'moitie', 'transfert'] as const) {
      for (let montant = 1; montant <= 2000; montant++) {
        for (const payePar of ['thomas', 'liz'] as const) {
          const p = calculerParts({ montant, mode, payePar, ratioThomas: RATIO_THOMAS })
          expect(p.thomas + p.liz).toBe(montant)
        }
      }
    }
  })
})

describe('modeParDefaut', () => {
  it('propose le mode attendu par type de depense', () => {
    expect(modeParDefaut('charge_fixe')).toBe('prorata')
    expect(modeParDefaut('courante')).toBe('moitie')
    expect(modeParDefaut('transfert')).toBe('transfert')
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `pnpm --filter @homebudget/domain test`
Attendu : ÉCHEC — `Failed to resolve import "../src/repartition.js"`.

- [ ] **Step 3 : Implémenter**

`packages/domain/src/types.ts` :
```ts
import type { Cents } from './money.js'

export type Personne = 'thomas' | 'liz'

export type TypeDepense = 'charge_fixe' | 'courante' | 'transfert'

/**
 * `transfert` : la part du PAYEUR vaut 0, celle de l'autre vaut le montant total.
 * Le PRD l'appelle « 100 % payeur », ce qui suggere l'inverse. Voir CLAUDE.md.
 */
export type ModeRepartition = 'prorata' | 'moitie' | 'personnalise' | 'transfert'

export interface Parts {
  thomas: Cents
  liz: Cents
}

export function autre(p: Personne): Personne {
  return p === 'thomas' ? 'liz' : 'thomas'
}
```

`packages/domain/src/repartition.ts` :
```ts
import { type Cents, repartirAuRatio } from './money.js'
import type { ModeRepartition, Parts, Personne, TypeDepense } from './types.js'

export interface EntreeRepartition {
  montant: Cents
  mode: ModeRepartition
  payePar: Personne
  /** Issu de la version de config en vigueur A LA DATE de la depense. */
  ratioThomas: number
  /** Requis si et seulement si mode === 'personnalise'. */
  partsPersonnalisees?: Parts
}

export function modeParDefaut(type: TypeDepense): ModeRepartition {
  switch (type) {
    case 'charge_fixe':
      return 'prorata'
    case 'courante':
      return 'moitie'
    case 'transfert':
      return 'transfert'
  }
}

export function calculerParts(entree: EntreeRepartition): Parts {
  const { montant, mode, payePar, ratioThomas, partsPersonnalisees } = entree

  switch (mode) {
    case 'prorata': {
      const [thomas, liz] = repartirAuRatio(montant, ratioThomas)
      return { thomas, liz }
    }

    case 'moitie': {
      const [thomas, liz] = repartirAuRatio(montant, 0.5)
      return { thomas, liz }
    }

    case 'transfert': {
      // La part du payeur vaut 0 : il ne se doit rien a lui-meme.
      // Sa creance sur l'autre est le montant entier. Ne pas inverser.
      return payePar === 'liz' ? { thomas: montant, liz: 0 } : { thomas: 0, liz: montant }
    }

    case 'personnalise': {
      if (!partsPersonnalisees) {
        throw new Error('Mode personnalise : parts personnalisees requises.')
      }
      const { thomas, liz } = partsPersonnalisees
      if (thomas + liz !== montant) {
        throw new Error(
          `La somme des parts (${thomas} + ${liz} = ${thomas + liz}) doit egaler le montant (${montant}).`,
        )
      }
      return { thomas, liz }
    }
  }
}
```

`packages/domain/src/index.ts` :
```ts
export * from './money.js'
export * from './repartition.js'
export * from './types.js'
```

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `pnpm --filter @homebudget/domain test`
Attendu : PASS. Le test « quand Liz verse 400 EUR, la part de Liz vaut 0 » est le verrou du signe.

- [ ] **Step 5 : Commit**

```bash
git add packages/domain
git commit -m "feat(domain): les 4 modes de repartition, signe du transfert verrouille par test"
```

---

## Task 4 : `config-version.ts` — la configuration versionnée

Le cœur de l'invariant I1.

**Files:**
- Create: `packages/domain/src/config-version.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/config-version.test.ts`

**Interfaces:**
- Consumes: `Cents` (Task 2), `Parts` (Task 3).
- Produces:
  - `interface Charge { libelle: string; montant: Cents }`
  - `interface VersionConfig { id, libelle, dateDebut, dateFin, salaireNetThomas, salaireNetLiz, chargesCommunes, chargesPersoThomas, chargesPersoLiz }`
  - `function totalChargesCommunes(v: VersionConfig): Cents`
  - `function ratioThomas(v: VersionConfig): number`
  - `function loyerParPersonne(v: VersionConfig): Parts`
  - `function versionEnVigueurLe(versions: VersionConfig[], date: string): VersionConfig`
  - `function verifierContinuite(versions: VersionConfig[]): void`
  - `function cloturerEtAjouter(versions: VersionConfig[], nouvelle: VersionConfig): VersionConfig[]`

- [ ] **Step 1 : Écrire les tests qui échouent**

`packages/domain/test/config-version.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import {
  type VersionConfig,
  cloturerEtAjouter,
  loyerParPersonne,
  ratioThomas,
  totalChargesCommunes,
  verifierContinuite,
  versionEnVigueurLe,
} from '../src/config-version.js'

const V1: VersionConfig = {
  id: 'v1',
  libelle: 'Config initiale',
  dateDebut: '2025-07-01',
  dateFin: '2026-06-30',
  salaireNetThomas: 330000,
  salaireNetLiz: 180000,
  chargesCommunes: [
    { libelle: 'Loyer', montant: 78500 },
    { libelle: 'Charges locatives', montant: 3500 },
    { libelle: 'Assurance habitation', montant: 1959 },
    { libelle: 'Eau', montant: 3000 },
    { libelle: 'Elec + gaz', montant: 16900 },
    { libelle: 'Internet', montant: 3599 },
    { libelle: 'Salle de sport', montant: 3600 },
  ],
  chargesPersoThomas: [],
  chargesPersoLiz: [],
}

const V2: VersionConfig = {
  id: 'v2',
  libelle: 'Revision loyer',
  dateDebut: '2026-07-01',
  dateFin: null,
  salaireNetThomas: 330000,
  salaireNetLiz: 180000,
  chargesCommunes: [
    { libelle: 'Loyer', montant: 79100 },
    { libelle: 'Charges locatives', montant: 3500 },
    { libelle: 'Assurance habitation', montant: 1959 },
    { libelle: 'Eau', montant: 3000 },
    { libelle: 'Elec + gaz', montant: 12000 },
    { libelle: 'Internet', montant: 3000 },
    { libelle: 'Salle de sport', montant: 3600 },
    { libelle: 'Entretien chaudiere', montant: 1200 },
  ],
  chargesPersoThomas: [],
  chargesPersoLiz: [],
}

describe('champs derives', () => {
  it('calcule le total des charges communes', () => {
    expect(totalChargesCommunes(V1)).toBe(111058)
    expect(totalChargesCommunes(V2)).toBe(107359)
  })

  it('calcule le ratio de Thomas depuis les salaires', () => {
    expect(ratioThomas(V1)).toBeCloseTo(0.6470588, 7)
  })

  it('calcule le loyer par personne', () => {
    expect(loyerParPersonne(V1)).toEqual({ thomas: 71861, liz: 39197 })
    expect(loyerParPersonne(V2)).toEqual({ thomas: 69468, liz: 37891 })
  })

  it('refuse des salaires cumules nuls', () => {
    const zero = { ...V1, salaireNetThomas: 0, salaireNetLiz: 0 }
    expect(() => ratioThomas(zero)).toThrow(/salaires/i)
  })
})

describe('versionEnVigueurLe', () => {
  const versions = [V1, V2]

  it('trouve la version au milieu de sa periode', () => {
    expect(versionEnVigueurLe(versions, '2025-12-05').id).toBe('v1')
  })

  it('inclut le premier jour de la periode', () => {
    expect(versionEnVigueurLe(versions, '2025-07-01').id).toBe('v1')
    expect(versionEnVigueurLe(versions, '2026-07-01').id).toBe('v2')
  })

  it('inclut le dernier jour de la periode', () => {
    expect(versionEnVigueurLe(versions, '2026-06-30').id).toBe('v1')
  })

  it('bascule bien a la veille / au jour de la revision', () => {
    // La borne exacte : c'est la que les bugs de fuseau horaire se logent.
    expect(versionEnVigueurLe(versions, '2026-06-30').id).toBe('v1')
    expect(versionEnVigueurLe(versions, '2026-07-01').id).toBe('v2')
  })

  it('trouve la version courante (dateFin null) pour une date lointaine', () => {
    expect(versionEnVigueurLe(versions, '2030-01-01').id).toBe('v2')
  })

  it('refuse une date anterieure a toute version', () => {
    expect(() => versionEnVigueurLe(versions, '2025-06-30')).toThrow(/aucune version/i)
  })

  it('refuse une liste vide', () => {
    expect(() => versionEnVigueurLe([], '2025-07-01')).toThrow(/aucune version/i)
  })
})

describe('verifierContinuite', () => {
  it('accepte des versions contigues', () => {
    expect(() => verifierContinuite([V1, V2])).not.toThrow()
  })

  it('accepte une version unique ouverte', () => {
    expect(() => verifierContinuite([V2])).not.toThrow()
  })

  it('refuse un chevauchement', () => {
    const chevauchante = { ...V2, dateDebut: '2026-06-15' }
    expect(() => verifierContinuite([V1, chevauchante])).toThrow(/chevauche/i)
  })

  it('refuse un trou', () => {
    const trouee = { ...V2, dateDebut: '2026-08-01' }
    expect(() => verifierContinuite([V1, trouee])).toThrow(/trou/i)
  })

  it('refuse deux versions ouvertes', () => {
    const ouverte = { ...V1, dateFin: null }
    expect(() => verifierContinuite([ouverte, V2])).toThrow()
  })
})

describe('cloturerEtAjouter (append-only)', () => {
  const nouvelle: VersionConfig = {
    ...V2,
    id: 'v3',
    libelle: 'Nouvelle revision',
    dateDebut: '2027-01-01',
    dateFin: null,
  }

  it('cloture la version courante la VEILLE de la nouvelle', () => {
    const resultat = cloturerEtAjouter([V1, V2], nouvelle)
    expect(resultat).toHaveLength(3)
    expect(resultat[1]?.id).toBe('v2')
    expect(resultat[1]?.dateFin).toBe('2026-12-31')
    expect(resultat[2]?.dateFin).toBeNull()
  })

  it('gere la cloture au 1er mars (annee non bissextile)', () => {
    const marsNonBissextile = { ...nouvelle, dateDebut: '2027-03-01' }
    const resultat = cloturerEtAjouter([V1, V2], marsNonBissextile)
    expect(resultat[1]?.dateFin).toBe('2027-02-28')
  })

  it('gere la cloture au 1er mars (annee bissextile)', () => {
    const marsBissextile = { ...nouvelle, dateDebut: '2028-03-01' }
    const resultat = cloturerEtAjouter([V1, V2], marsBissextile)
    expect(resultat[1]?.dateFin).toBe('2028-02-29')
  })

  it('ne modifie jamais les versions existantes en place', () => {
    const versions = [V1, V2]
    const avant = structuredClone(versions)
    cloturerEtAjouter(versions, nouvelle)
    expect(versions).toEqual(avant) // append-only : aucune mutation
  })

  it('refuse une nouvelle version qui commence avant la version courante', () => {
    const passee = { ...nouvelle, dateDebut: '2026-01-01' }
    expect(() => cloturerEtAjouter([V1, V2], passee)).toThrow(/anterieure/i)
  })

  it('produit une suite continue', () => {
    const resultat = cloturerEtAjouter([V1, V2], nouvelle)
    expect(() => verifierContinuite(resultat)).not.toThrow()
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `pnpm --filter @homebudget/domain test`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : Implémenter**

`packages/domain/src/config-version.ts` :
```ts
import { type Cents, repartirAuRatio } from './money.js'
import type { Parts } from './types.js'

export interface Charge {
  libelle: string
  montant: Cents
}

/**
 * Une version de config decrit « les regles applicables a partir de telle date ».
 * Append-only : on ne modifie jamais une version passee, on en cree une nouvelle.
 */
export interface VersionConfig {
  id: string
  libelle: string
  /** ISO YYYY-MM-DD, inclus. */
  dateDebut: string
  /** ISO YYYY-MM-DD, inclus. `null` = version en cours. */
  dateFin: string | null
  salaireNetThomas: Cents
  salaireNetLiz: Cents
  chargesCommunes: Charge[]
  chargesPersoThomas: Charge[]
  chargesPersoLiz: Charge[]
}

export function totalChargesCommunes(v: VersionConfig): Cents {
  return v.chargesCommunes.reduce((somme, c) => somme + c.montant, 0)
}

export function ratioThomas(v: VersionConfig): number {
  const total = v.salaireNetThomas + v.salaireNetLiz
  if (total <= 0) {
    throw new Error('Salaires cumules nuls : la repartition au prorata est indefinie.')
  }
  return v.salaireNetThomas / total
}

export function ratioLiz(v: VersionConfig): number {
  return 1 - ratioThomas(v)
}

export function loyerParPersonne(v: VersionConfig): Parts {
  const [thomas, liz] = repartirAuRatio(totalChargesCommunes(v), ratioThomas(v))
  return { thomas, liz }
}

/**
 * La version applicable a une date. C'est elle qui sert a figer les parts
 * d'une depense — et jamais la version « courante ».
 */
export function versionEnVigueurLe(versions: VersionConfig[], date: string): VersionConfig {
  const trouvee = versions.find((v) => date >= v.dateDebut && (v.dateFin === null || date <= v.dateFin))
  if (!trouvee) {
    throw new Error(
      `Aucune version de config ne couvre le ${date}. Une depense sans regle applicable ne peut pas etre figee.`,
    )
  }
  return trouvee
}

/** Les versions ne se chevauchent pas et ne laissent pas de trou. */
export function verifierContinuite(versions: VersionConfig[]): void {
  if (versions.length === 0) return

  const triees = [...versions].sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))

  const ouvertes = triees.filter((v) => v.dateFin === null)
  if (ouvertes.length > 1) {
    throw new Error(`${ouvertes.length} versions ouvertes : une seule peut avoir dateFin === null.`)
  }

  for (const v of triees) {
    if (v.dateFin !== null && v.dateFin < v.dateDebut) {
      throw new Error(`Version ${v.id} : dateFin (${v.dateFin}) precede dateDebut (${v.dateDebut}).`)
    }
  }

  for (let i = 0; i < triees.length - 1; i++) {
    const courante = triees[i]
    const suivante = triees[i + 1]
    if (!courante || !suivante) continue

    if (courante.dateFin === null) {
      throw new Error(`Version ${courante.id} est ouverte mais ${suivante.id} la suit.`)
    }
    if (courante.dateFin >= suivante.dateDebut) {
      throw new Error(
        `Version ${courante.id} (fin ${courante.dateFin}) chevauche ${suivante.id} (debut ${suivante.dateDebut}).`,
      )
    }
    if (veilleDe(suivante.dateDebut) !== courante.dateFin) {
      throw new Error(
        `Trou entre ${courante.id} (fin ${courante.dateFin}) et ${suivante.id} (debut ${suivante.dateDebut}).`,
      )
    }
  }
}

/**
 * Ajoute une version en cloturant la precedente la VEILLE de sa prise d'effet.
 * Ne mute rien : renvoie une nouvelle liste. C'est l'append-only en pratique.
 */
export function cloturerEtAjouter(
  versions: VersionConfig[],
  nouvelle: VersionConfig,
): VersionConfig[] {
  if (versions.length === 0) {
    return [{ ...nouvelle, dateFin: null }]
  }

  const triees = [...versions].sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))
  const derniere = triees[triees.length - 1]
  if (!derniere) throw new Error('Liste de versions incoherente.')

  if (nouvelle.dateDebut <= derniere.dateDebut) {
    throw new Error(
      `Date de prise d'effet (${nouvelle.dateDebut}) anterieure ou egale a la version courante (${derniere.dateDebut}). Le versioning est append-only.`,
    )
  }

  const cloturee: VersionConfig = { ...derniere, dateFin: veilleDe(nouvelle.dateDebut) }
  return [...triees.slice(0, -1), cloturee, { ...nouvelle, dateFin: null }]
}

/**
 * La veille d'une date ISO, en arithmetique de calendrier pure.
 * `Date` est utilise en UTC uniquement, jamais expose : un objet Date porte un
 * fuseau, et un decalage d'un jour ici corromprait toutes les bornes de version.
 */
export function veilleDe(date: string): string {
  const [a, m, j] = date.split('-').map(Number)
  if (a === undefined || m === undefined || j === undefined) {
    throw new Error(`Date ISO invalide : ${date}`)
  }
  const d = new Date(Date.UTC(a, m - 1, j))
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
```

Note sur `verifierContinuite` : le test « refuse deux versions ouvertes » passe par la garde `ouvertes.length > 1`, atteinte avant la boucle.

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `pnpm --filter @homebudget/domain test`
Attendu : PASS. Les tests de bornes (`2026-06-30` → v1, `2026-07-01` → v2) et de bissextilité sont les plus importants.

- [ ] **Step 5 : Exporter et commiter**

`packages/domain/src/index.ts` :
```ts
export * from './config-version.js'
export * from './money.js'
export * from './repartition.js'
export * from './types.js'
```

```bash
git add packages/domain
git commit -m "feat(domain): config versionnee effective-dated, append-only"
```

---

## Task 5 : `solde.ts` — soldes et résumé

**Files:**
- Create: `packages/domain/src/solde.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/solde.test.ts`

**Interfaces:**
- Consumes: `Cents`, `formaterEuros` (Task 2), `Parts`, `Personne`, `TypeDepense`, `ModeRepartition` (Task 3).
- Produces:
  - `interface Depense { id, date, description, montant, payePar, type, mode, parts, versionConfigId, genereAuto, commentaire }`
  - `function soldeDepense(d: Depense): Parts`
  - `interface Resume { totalDepenses, totalTransferts, payeThomas, payeLiz, duThomas, duLiz, soldeThomas, soldeLiz }`
  - `function resumer(depenses: Depense[]): Resume`
  - `function phraseSynthese(r: Resume): string`

- [ ] **Step 1 : Écrire les tests qui échouent**

`packages/domain/test/solde.test.ts` :
```ts
import { describe, expect, it } from 'vitest'
import { type Depense, phraseSynthese, resumer, soldeDepense } from '../src/solde.js'

function depense(p: Partial<Depense>): Depense {
  return {
    id: 'x',
    date: '2025-08-05',
    description: 'test',
    montant: 111058,
    payePar: 'thomas',
    type: 'charge_fixe',
    mode: 'prorata',
    parts: { thomas: 71861, liz: 39197 },
    versionConfigId: 'v1',
    genereAuto: false,
    commentaire: null,
    ...p,
  }
}

describe('soldeDepense', () => {
  it('le payeur est credite de ce qu il a avance au-dela de sa part', () => {
    // Thomas paie 1110,58 EUR, sa part est 718,61 EUR : Liz lui doit 391,97 EUR.
    expect(soldeDepense(depense({}))).toEqual({ thomas: 39197, liz: -39197 })
  })

  it('un transfert de Liz reduit sa dette', () => {
    // LE PIEGE : Liz verse 400 EUR, sa part vaut 0 -> son solde monte de +400.
    const virement = depense({
      montant: 40000,
      payePar: 'liz',
      type: 'transfert',
      mode: 'transfert',
      parts: { thomas: 40000, liz: 0 },
    })
    expect(soldeDepense(virement)).toEqual({ thomas: -40000, liz: 40000 })
  })

  it('les soldes sont toujours opposes', () => {
    const d = depense({ montant: 21527, parts: { thomas: 10764, liz: 10763 } })
    const s = soldeDepense(d)
    expect(s.thomas).toBe(-s.liz)
  })
})

describe('resumer', () => {
  const depenses: Depense[] = [
    depense({ id: '1' }), // Thomas paie 1110,58 ; parts 718,61 / 391,97
    depense({
      id: '2',
      montant: 40000,
      payePar: 'liz',
      type: 'transfert',
      mode: 'transfert',
      parts: { thomas: 40000, liz: 0 },
    }),
  ]

  it('agrege les montants payes et dus', () => {
    const r = resumer(depenses)
    expect(r.payeThomas).toBe(111058)
    expect(r.payeLiz).toBe(40000)
    expect(r.duThomas).toBe(71861 + 40000)
    expect(r.duLiz).toBe(39197 + 0)
  })

  it('separe les depenses reelles des transferts', () => {
    const r = resumer(depenses)
    expect(r.totalDepenses).toBe(111058) // le virement n est pas une depense
    expect(r.totalTransferts).toBe(40000)
  })

  it('calcule des soldes opposes', () => {
    const r = resumer(depenses)
    expect(r.soldeThomas).toBe(111058 - (71861 + 40000)) // -799
    expect(r.soldeLiz).toBe(-r.soldeThomas)
  })

  it('gere une liste vide', () => {
    const r = resumer([])
    expect(r.soldeThomas).toBe(0)
    expect(r.totalDepenses).toBe(0)
  })
})

describe('phraseSynthese', () => {
  it('dit qui doit quoi quand Thomas est crediteur', () => {
    const r = resumer([depense({})])
    expect(phraseSynthese(r).replace(/ | /g, ' ')).toBe('Liz doit 391,97 € à Thomas')
  })

  it('dit qui doit quoi quand Liz est crediteure', () => {
    const r = resumer([
      depense({ montant: 40000, payePar: 'liz', mode: 'transfert', type: 'transfert', parts: { thomas: 40000, liz: 0 } }),
    ])
    expect(phraseSynthese(r).replace(/ | /g, ' ')).toBe('Thomas doit 400,00 € à Liz')
  })

  it('annonce l equilibre quand le solde est nul', () => {
    expect(phraseSynthese(resumer([]))).toBe('Vous êtes à jour')
  })
})
```

- [ ] **Step 2 : Vérifier que les tests échouent**

Run: `pnpm --filter @homebudget/domain test`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : Implémenter**

`packages/domain/src/solde.ts` :
```ts
import { type Cents, formaterEuros } from './money.js'
import type { ModeRepartition, Parts, Personne, TypeDepense } from './types.js'

/**
 * Une depense enregistree. `parts` est FIGE a la creation d'apres la version de
 * config en vigueur a `date` : rien ne le recalcule jamais (invariant I2).
 */
export interface Depense {
  id: string
  /** ISO YYYY-MM-DD. */
  date: string
  description: string
  montant: Cents
  payePar: Personne
  type: TypeDepense
  mode: ModeRepartition
  parts: Parts
  versionConfigId: string
  genereAuto: boolean
  commentaire: string | null
}

/** « Ce que j'ai paye » moins « ce que j'aurais du payer ». */
export function soldeDepense(d: Depense): Parts {
  return {
    thomas: (d.payePar === 'thomas' ? d.montant : 0) - d.parts.thomas,
    liz: (d.payePar === 'liz' ? d.montant : 0) - d.parts.liz,
  }
}

export interface Resume {
  /** Depenses reelles, transferts exclus. */
  totalDepenses: Cents
  /** Virements et remboursements : des mouvements de dette, pas des depenses. */
  totalTransferts: Cents
  payeThomas: Cents
  payeLiz: Cents
  duThomas: Cents
  duLiz: Cents
  soldeThomas: Cents
  soldeLiz: Cents
}

export function resumer(depenses: Depense[]): Resume {
  const r: Resume = {
    totalDepenses: 0,
    totalTransferts: 0,
    payeThomas: 0,
    payeLiz: 0,
    duThomas: 0,
    duLiz: 0,
    soldeThomas: 0,
    soldeLiz: 0,
  }

  for (const d of depenses) {
    if (d.type === 'transfert') {
      r.totalTransferts += d.montant
    } else {
      r.totalDepenses += d.montant
    }

    if (d.payePar === 'thomas') r.payeThomas += d.montant
    else r.payeLiz += d.montant

    r.duThomas += d.parts.thomas
    r.duLiz += d.parts.liz
  }

  r.soldeThomas = r.payeThomas - r.duThomas
  r.soldeLiz = r.payeLiz - r.duLiz
  return r
}

export function phraseSynthese(r: Resume): string {
  if (r.soldeThomas === 0) return 'Vous êtes à jour'
  return r.soldeThomas > 0
    ? `Liz doit ${formaterEuros(r.soldeThomas)} à Thomas`
    : `Thomas doit ${formaterEuros(-r.soldeThomas)} à Liz`
}
```

Note : `totalDepenses` exclut les transferts, contrairement au Sheet qui les additionnait à tout. Un virement n'est pas une dépense, c'est un mouvement de dette. Le solde, lui, est identique — c'est ce qui compte pour le canari.

- [ ] **Step 4 : Vérifier que les tests passent**

Run: `pnpm --filter @homebudget/domain test`
Attendu : PASS.

- [ ] **Step 5 : Exporter et commiter**

Ajouter à `packages/domain/src/index.ts` :
```ts
export * from './solde.js'
```

```bash
git add packages/domain
git commit -m "feat(domain): soldes par depense et resume general"
```

---

## Task 6 : `import-sheet.ts` — la reprise du Sheet et LE CANARI

La tâche qui prouve que tout ce qui précède est juste.

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/vitest.config.ts`
- Create: `packages/db/src/import-sheet.ts`
- Test: `packages/db/test/import-sheet.test.ts`
- Modify: `tsconfig.json` (racine) — ajouter la référence

**Interfaces:**
- Consumes: tout `@homebudget/domain`.
- Produces:
  - `const VERSIONS_INITIALES: VersionConfig[]` (v1 et v2, tirées du Sheet)
  - `function importerDepenses(csv: string, versions: VersionConfig[]): Depense[]`

- [ ] **Step 1 : Créer le paquet `db`**

`packages/db/package.json` :
```json
{
  "name": "@homebudget/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": { "test": "vitest run" },
  "dependencies": { "@homebudget/domain": "workspace:*" }
}
```

`packages/db/tsconfig.json` :
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["src/**/*", "test/**/*"],
  "references": [{ "path": "../domain" }]
}
```

`packages/db/vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Les tests d'integration exigent Docker : ils ne doivent pas bloquer
    // la suite unitaire, qui doit rester executable partout, en une seconde.
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
  },
})
```

`tsconfig.json` (racine) — remplacer par :
```json
{
  "files": [],
  "references": [{ "path": "./packages/domain" }, { "path": "./packages/db" }]
}
```

Puis : `pnpm install`

- [ ] **Step 2 : Écrire le test qui échoue — le canari**

`packages/db/test/import-sheet.test.ts` :
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { formaterEuros, phraseSynthese, resumer, verifierContinuite } from '@homebudget/domain'
import { describe, expect, it } from 'vitest'
import { VERSIONS_INITIALES, importerDepenses } from '../src/import-sheet.js'

const CSV = readFileSync(
  fileURLToPath(new URL('../../../docs/data/sheet-export-2026-07-12/depenses.csv', import.meta.url)),
  'utf-8',
)

describe('versions initiales', () => {
  it('forme une suite continue et sans chevauchement', () => {
    expect(() => verifierContinuite(VERSIONS_INITIALES)).not.toThrow()
  })

  it('v1 se cloture la veille de v2', () => {
    expect(VERSIONS_INITIALES[0]?.dateFin).toBe('2026-06-30')
    expect(VERSIONS_INITIALES[1]?.dateDebut).toBe('2026-07-01')
    expect(VERSIONS_INITIALES[1]?.dateFin).toBeNull()
  })
})

describe('import du Sheet', () => {
  const depenses = importerDepenses(CSV, VERSIONS_INITIALES)

  it('importe les 33 lignes', () => {
    expect(depenses).toHaveLength(33)
  })

  it('corrige la date aberrante 2029-09-29 en 2025-09-29', () => {
    expect(depenses.some((d) => d.date.startsWith('2029'))).toBe(false)
    const rembours = depenses.find(
      (d) => d.description === 'Remboursement Tricount' && d.montant === 49214,
    )
    expect(rembours?.date).toBe('2025-09-29')
  })

  it('reclasse les virements et remboursements en transferts', () => {
    const transferts = depenses.filter((d) => d.type === 'transfert')
    expect(transferts).toHaveLength(13)
    for (const t of transferts) {
      expect(t.mode).toBe('transfert')
      // La part du payeur vaut 0 : le signe ne doit jamais s'inverser.
      const partPayeur = t.payePar === 'thomas' ? t.parts.thomas : t.parts.liz
      expect(partPayeur).toBe(0)
    }
  })

  it('laisse les Billets Colombie en courante 50/50', () => {
    const colombie = depenses.find((d) => d.description === 'Billets Colombie')
    expect(colombie?.type).toBe('courante')
    expect(colombie?.mode).toBe('moitie')
    expect(colombie?.parts).toEqual({ thomas: 107637, liz: 107637 })
  })

  it('importe la ligne de juillet 2026 telle quelle, a 1 110,58 EUR', () => {
    // Le Sheet n'avait pas repercute la revision de loyer. On importe la realite,
    // pas l'intention : c'est ce qui a ete paye.
    const juillet = depenses.find((d) => d.date === '2026-07-05' && d.type === 'charge_fixe')
    expect(juillet?.montant).toBe(111058)
    expect(juillet?.parts).toEqual({ thomas: 71861, liz: 39197 })
  })

  it('rattache chaque depense a la version en vigueur a sa date', () => {
    const avant = depenses.find((d) => d.date === '2026-06-05' && d.type === 'charge_fixe')
    const apres = depenses.find((d) => d.date === '2026-07-05' && d.type === 'charge_fixe')
    expect(avant?.versionConfigId).toBe('v1')
    expect(apres?.versionConfigId).toBe('v2')
  })

  it('respecte l invariant sur chaque ligne : parts sommees au montant', () => {
    for (const d of depenses) {
      expect(d.parts.thomas + d.parts.liz).toBe(d.montant)
    }
  })
})

describe('LE CANARI — non-regression du solde', () => {
  it('Liz doit exactement 1 145,80 EUR a Thomas', () => {
    const r = resumer(importerDepenses(CSV, VERSIONS_INITIALES))

    // 114 580 centimes. Pas 114 579, pas 114 581.
    //
    // Le Sheet affichait 1 145,79 EUR, arrondi de 1 145,788425 EUR : il traînait
    // des fractions de centime que personne ne pouvait payer. L'arithmetique en
    // centimes les supprime. L'ecart d'un centime est la CORRECTION, pas le bug.
    //
    // Si ce test tombe, ne l'ajuste pas : un des quatre invariants a ete viole
    // (recalcul retroactif, signe de transfert inverse, double arrondi, flottant).
    expect(r.soldeThomas).toBe(114580)
    expect(r.soldeLiz).toBe(-114580)
    expect(formaterEuros(r.soldeThomas).replace(/ | /g, ' ')).toBe('1 145,80 €')
    expect(phraseSynthese(r).replace(/ | /g, ' ')).toBe('Liz doit 1 145,80 € à Thomas')
  })
})
```

- [ ] **Step 3 : Vérifier que le test échoue**

Run: `pnpm --filter @homebudget/db test`
Attendu : ÉCHEC — `Failed to resolve import "../src/import-sheet.js"`.

- [ ] **Step 4 : Implémenter l'import**

`packages/db/src/import-sheet.ts` :
```ts
import {
  type Depense,
  type ModeRepartition,
  type Parts,
  type Personne,
  type TypeDepense,
  type VersionConfig,
  calculerParts,
  eurosVersCents,
  ratioThomas,
  versionEnVigueurLe,
} from '@homebudget/domain'

/** Les deux versions de config du Sheet, en centimes. */
export const VERSIONS_INITIALES: VersionConfig[] = [
  {
    id: 'v1',
    libelle: 'Config initiale',
    dateDebut: '2025-07-01',
    dateFin: '2026-06-30',
    salaireNetThomas: 330000,
    salaireNetLiz: 180000,
    chargesCommunes: [
      { libelle: 'Loyer', montant: 78500 },
      { libelle: 'Charges locatives', montant: 3500 },
      { libelle: 'Assurance habitation', montant: 1959 },
      { libelle: 'Eau', montant: 3000 },
      { libelle: 'Élec + gaz', montant: 16900 },
      { libelle: 'Internet', montant: 3599 },
      { libelle: 'Salle de sport', montant: 3600 },
      { libelle: 'Entretien chaudière', montant: 0 },
    ],
    chargesPersoThomas: [
      { libelle: 'Frais CB', montant: 1800 },
      { libelle: 'Téléphone mobile', montant: 1699 },
      { libelle: 'Coaching', montant: 12000 },
      { libelle: 'Assurances (voitures, etc)', montant: 5426 },
      { libelle: 'Outils IA', montant: 11700 },
      { libelle: 'Zwift', montant: 1999 },
    ],
    chargesPersoLiz: [{ libelle: 'Téléphone mobile', montant: 1599 }],
  },
  {
    id: 'v2',
    libelle: 'Révision loyer',
    dateDebut: '2026-07-01',
    dateFin: null,
    salaireNetThomas: 330000,
    salaireNetLiz: 180000,
    chargesCommunes: [
      { libelle: 'Loyer', montant: 79100 },
      { libelle: 'Charges locatives', montant: 3500 },
      { libelle: 'Assurance habitation', montant: 1959 },
      { libelle: 'Eau', montant: 3000 },
      { libelle: 'Élec + gaz', montant: 12000 },
      { libelle: 'Internet', montant: 3000 },
      { libelle: 'Salle de sport', montant: 3600 },
      { libelle: 'Entretien chaudière', montant: 1200 },
    ],
    chargesPersoThomas: [
      { libelle: 'Frais CB', montant: 1800 },
      { libelle: 'Téléphone mobile', montant: 1699 },
      { libelle: 'Coaching', montant: 12000 },
      { libelle: 'Assurances (voitures, etc)', montant: 5426 },
      { libelle: 'Outils IA', montant: 11700 },
      { libelle: 'Zwift', montant: 1999 },
    ],
    chargesPersoLiz: [{ libelle: 'Téléphone mobile', montant: 1599 }],
  },
]

/** Corrections appliquees a la source. Chacune est justifiee dans la spec, §9. */
const DATES_CORRIGEES: Record<string, string> = {
  // Coquille du Sheet : le Tricount rembourse date du 27/09/2025.
  '2029-09-29': '2025-09-29',
}

/**
 * Un virement ou un remboursement n'est pas une depense : c'est un mouvement de
 * dette. Le Sheet les typait « Courante », faute de mieux.
 */
function estTransfert(description: string): boolean {
  const d = description.toLowerCase()
  return (
    d.startsWith('virement') ||
    d.startsWith('remboursement') ||
    d.startsWith('remoursement') // faute de frappe presente dans le Sheet
  )
}

interface LigneCsv {
  date: string
  description: string
  montant: number
  payePar: Personne
  partThomas: number
  partLiz: number
  commentaire: string
}

export function importerDepenses(csv: string, versions: VersionConfig[]): Depense[] {
  return parserCsv(csv).map((ligne, i) => construireDepense(ligne, versions, i))
}

function construireDepense(ligne: LigneCsv, versions: VersionConfig[], index: number): Depense {
  const date = DATES_CORRIGEES[ligne.date] ?? ligne.date
  const montant = eurosVersCents(ligne.montant)
  const version = versionEnVigueurLe(versions, date)
  const ratio = ratioThomas(version)

  const partThomasSheet = eurosVersCents(ligne.partThomas)
  const { type, mode } = classer(ligne, montant, partThomasSheet, ratio)

  const parts: Parts = calculerParts({
    montant,
    mode,
    payePar: ligne.payePar,
    ratioThomas: ratio,
    ...(mode === 'personnalise'
      ? { partsPersonnalisees: { thomas: partThomasSheet, liz: montant - partThomasSheet } }
      : {}),
  })

  return {
    id: `seed-${String(index + 1).padStart(2, '0')}`,
    date,
    description: ligne.description,
    montant,
    payePar: ligne.payePar,
    type,
    mode,
    parts,
    versionConfigId: version.id,
    genereAuto: false,
    commentaire: ligne.commentaire || null,
  }
}

/**
 * Retrouve le type et le mode d'une ligne du Sheet, qui ne connaissait que
 * « Charge fixe » et « Courante ». On deduit le mode des parts calculees :
 * si elles collent au prorata (ou a la moitie), c'est ce mode ; sinon, la
 * repartition etait ad hoc, donc personnalisee.
 */
function classer(
  ligne: LigneCsv,
  montant: number,
  partThomas: number,
  ratio: number,
): { type: TypeDepense; mode: ModeRepartition } {
  if (estTransfert(ligne.description)) {
    return { type: 'transfert', mode: 'transfert' }
  }
  if (partThomas === Math.round(montant * ratio)) {
    return { type: 'charge_fixe', mode: 'prorata' }
  }
  if (partThomas === Math.round(montant / 2)) {
    return { type: 'courante', mode: 'moitie' }
  }
  // Loyer de juillet 2025 : proratise a la main (arrivees echelonnees).
  // Tricount, Noel, Coiffeur : avances de l'un pour l'autre.
  const type: TypeDepense = ligne.description.toLowerCase().startsWith('loyer')
    ? 'charge_fixe'
    : 'courante'
  return { type, mode: 'personnalise' }
}

/** Parseur CSV minimal : gere les champs cites et les guillemets doubles. */
function parserCsv(csv: string): LigneCsv[] {
  const lignes = csv.trim().split('\n')
  return lignes.slice(1).map((ligne) => {
    const champs = decouper(ligne)
    const [date, description, montant, payePar, , partThomas, partLiz, , , commentaire] = champs
    if (!date || !description || !montant || !payePar || !partThomas || !partLiz) {
      throw new Error(`Ligne CSV incomplete : ${ligne}`)
    }
    return {
      date,
      description,
      montant: Number(montant),
      payePar: payePar === 'Thomas' ? 'thomas' : 'liz',
      partThomas: Number(partThomas),
      partLiz: Number(partLiz),
      commentaire: commentaire ?? '',
    }
  })
}

function decouper(ligne: string): string[] {
  const champs: string[] = []
  let courant = ''
  let dansGuillemets = false

  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') {
        courant += '"'
        i++
      } else {
        dansGuillemets = !dansGuillemets
      }
    } else if (c === ',' && !dansGuillemets) {
      champs.push(courant)
      courant = ''
    } else {
      courant += c
    }
  }
  champs.push(courant)
  return champs.map((c) => c.trim())
}
```

`packages/db/src/index.ts` :
```ts
export * from './import-sheet.js'
```

- [ ] **Step 5 : Vérifier que le canari passe**

Run: `pnpm --filter @homebudget/db test`
Attendu : PASS, dont `LE CANARI — non-regression du solde › Liz doit exactement 1 145,80 EUR a Thomas`.

Si le canari échoue, ne modifie pas le chiffre attendu. Vérifie dans l'ordre : le signe des transferts, le double arrondi, un flottant qui a survécu.

- [ ] **Step 6 : Commit**

```bash
git add packages/db tsconfig.json
git commit -m "feat(db): import du Sheet et test de non-regression du solde

Les 33 lignes reelles rejouees par le domaine donnent 114 580 centimes.
Ce test est le canari du projet : s'il tombe, un invariant a ete viole."
```

---

## Task 7 : Le schéma Postgres — les invariants dans la base

Ce que le domaine garantit par convention, la base le garantit par contrainte.

**Files:**
- Create: `packages/db/supabase/migrations/0001_schema.sql`
- Create: `packages/db/supabase/migrations/0002_invariants.sql`
- Create: `packages/db/supabase/config.toml`
- Test: `packages/db/test/invariants.integration.test.ts`
- Modify: `packages/db/package.json` (script `test:integration`)

**Interfaces:**
- Consumes: rien du code TS ; c'est du SQL.
- Produces: les tables `version_config` et `depense`, la fonction `creer_version_config()`.

- [ ] **Step 1 : Écrire le schéma**

`packages/db/supabase/migrations/0001_schema.sql` :
```sql
-- HomeBudget : schema initial.
-- Tous les montants sont des ENTIERS DE CENTIMES. Jamais de numeric, jamais de float.

create type personne as enum ('thomas', 'liz');
create type type_depense as enum ('charge_fixe', 'courante', 'transfert');
create type mode_repartition as enum ('prorata', 'moitie', 'personnalise', 'transfert');

-- Configuration versionnee : effective-dated, append-only (invariant I1).
create table version_config (
  id                       uuid primary key default gen_random_uuid(),
  libelle                  text not null check (length(trim(libelle)) > 0),
  date_debut               date not null,
  date_fin                 date,                       -- null = version en cours
  salaire_net_thomas_cents integer not null check (salaire_net_thomas_cents >= 0),
  salaire_net_liz_cents    integer not null check (salaire_net_liz_cents >= 0),
  charges_communes         jsonb not null default '[]'::jsonb,
  charges_perso_thomas     jsonb not null default '[]'::jsonb,
  charges_perso_liz        jsonb not null default '[]'::jsonb,
  created_at               timestamptz not null default now(),

  -- Le prorata est indefini si personne ne gagne rien.
  constraint salaires_cumules_non_nuls
    check (salaire_net_thomas_cents + salaire_net_liz_cents > 0),

  constraint periode_coherente
    check (date_fin is null or date_fin >= date_debut)
);

-- Depenses : les parts sont FIGEES a l'ecriture (invariant I2).
create table depense (
  id                uuid primary key default gen_random_uuid(),
  date              date not null,
  description       text not null check (length(trim(description)) > 0),
  montant_cents     integer not null check (montant_cents > 0),
  paye_par          personne not null,
  type              type_depense not null,
  mode_repartition  mode_repartition not null,
  part_thomas_cents integer not null,
  part_liz_cents    integer not null,
  version_config_id uuid not null references version_config (id) on delete restrict,
  genere_auto       boolean not null default false,
  commentaire       text,
  created_at        timestamptz not null default now(),

  -- L'invariant qui rend le solde exact. La base refuse physiquement de l'ecrire faux.
  constraint parts_somment_au_montant
    check (part_thomas_cents + part_liz_cents = montant_cents)
);

create index depense_date_idx on depense (date desc);
create index depense_version_idx on depense (version_config_id);
```

- [ ] **Step 2 : Écrire les invariants**

`packages/db/supabase/migrations/0002_invariants.sql` :
```sql
-- Les regles du PRD, portees par la base plutot que par le code applicatif.

create extension if not exists btree_gist;

-- I1a — Deux versions ne peuvent pas se chevaucher. Physiquement impossible a ecrire.
alter table version_config
  add constraint versions_sans_chevauchement
  exclude using gist (
    daterange(date_debut, coalesce(date_fin, 'infinity'::date), '[]') with &&
  );

-- I1b — Une version close ne se modifie plus. Append-only.
create or replace function bloquer_modification_version_close()
returns trigger
language plpgsql
as $$
begin
  -- Cloturer une version ouverte (poser date_fin) reste autorise : c'est le
  -- mecanisme normal de creation d'une nouvelle version.
  if old.date_fin is not null then
    raise exception
      'Version « % » close le % : la configuration est append-only. Creez une nouvelle version a partir d''une date.',
      old.libelle, old.date_fin
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger version_config_append_only
  before update on version_config
  for each row
  execute function bloquer_modification_version_close();

-- I2 — Une depense figee ne voit jamais ses parts recalculees par la base.
-- Aucune vue, aucun trigger ne recalcule part_thomas_cents / part_liz_cents.
-- Le calcul vit dans packages/domain, une seule fois, a l'ecriture.

-- Creation d'une version : cloture la precedente la VEILLE, en une transaction.
create or replace function creer_version_config(
  p_libelle                  text,
  p_date_debut               date,
  p_salaire_net_thomas_cents integer,
  p_salaire_net_liz_cents    integer,
  p_charges_communes         jsonb,
  p_charges_perso_thomas     jsonb,
  p_charges_perso_liz        jsonb
)
returns version_config
language plpgsql
as $$
declare
  v_courante version_config;
  v_nouvelle version_config;
begin
  select * into v_courante from version_config where date_fin is null;

  if found then
    if p_date_debut <= v_courante.date_debut then
      raise exception
        'Date de prise d''effet (%) anterieure ou egale a la version courante (%).',
        p_date_debut, v_courante.date_debut;
    end if;

    update version_config
       set date_fin = p_date_debut - interval '1 day'
     where id = v_courante.id;
  end if;

  insert into version_config (
    libelle, date_debut, date_fin,
    salaire_net_thomas_cents, salaire_net_liz_cents,
    charges_communes, charges_perso_thomas, charges_perso_liz
  ) values (
    p_libelle, p_date_debut, null,
    p_salaire_net_thomas_cents, p_salaire_net_liz_cents,
    p_charges_communes, p_charges_perso_thomas, p_charges_perso_liz
  )
  returning * into v_nouvelle;

  return v_nouvelle;
end;
$$;
```

- [ ] **Step 3 : Écrire le test d'intégration**

Ce test exige une Supabase locale (Docker). Il est séparé de la suite unitaire.

`packages/db/test/invariants.integration.test.ts` :
```ts
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'

// Ces valeurs sont celles de `supabase start` en local.
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const db = createClient(URL, KEY)

async function reset() {
  await db.from('depense').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('version_config').delete().neq('id', '00000000-0000-0000-0000-000000000000')
}

async function creerVersion(libelle: string, dateDebut: string) {
  const { data, error } = await db.rpc('creer_version_config', {
    p_libelle: libelle,
    p_date_debut: dateDebut,
    p_salaire_net_thomas_cents: 330000,
    p_salaire_net_liz_cents: 180000,
    p_charges_communes: [{ libelle: 'Loyer', montant: 78500 }],
    p_charges_perso_thomas: [],
    p_charges_perso_liz: [],
  })
  if (error) throw new Error(error.message)
  return data
}

describe('invariants portes par la base', () => {
  beforeEach(reset)

  it('creer une version cloture la precedente la VEILLE', async () => {
    await creerVersion('v1', '2025-07-01')
    await creerVersion('v2', '2026-07-01')

    const { data } = await db.from('version_config').select('*').order('date_debut')
    expect(data?.[0]?.date_fin).toBe('2026-06-30')
    expect(data?.[1]?.date_fin).toBeNull()
  })

  it('refuse de modifier une version close (append-only)', async () => {
    await creerVersion('v1', '2025-07-01')
    await creerVersion('v2', '2026-07-01')

    const { data } = await db.from('version_config').select('id').eq('libelle', 'v1').single()
    const { error } = await db
      .from('version_config')
      .update({ salaire_net_thomas_cents: 999999 })
      .eq('id', data?.id)

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/append-only/i)
  })

  it('refuse deux versions qui se chevauchent', async () => {
    await creerVersion('v1', '2025-07-01')
    const { error } = await db.from('version_config').insert({
      libelle: 'chevauchante',
      date_debut: '2025-08-01',
      date_fin: null,
      salaire_net_thomas_cents: 330000,
      salaire_net_liz_cents: 180000,
    })
    expect(error?.message).toMatch(/chevauchement|exclusion/i)
  })

  it('refuse une depense dont les parts ne somment pas au montant', async () => {
    const version = await creerVersion('v1', '2025-07-01')
    const { error } = await db.from('depense').insert({
      date: '2025-08-05',
      description: 'incoherente',
      montant_cents: 10000,
      paye_par: 'thomas',
      type: 'courante',
      mode_repartition: 'personnalise',
      part_thomas_cents: 4000,
      part_liz_cents: 5000, // 9000 != 10000
      version_config_id: version.id,
    })
    expect(error?.message).toMatch(/parts_somment_au_montant/i)
  })

  it('refuse une depense sans version de config', async () => {
    const { error } = await db.from('depense').insert({
      date: '2025-08-05',
      description: 'orpheline',
      montant_cents: 10000,
      paye_par: 'thomas',
      type: 'courante',
      mode_repartition: 'moitie',
      part_thomas_cents: 5000,
      part_liz_cents: 5000,
      version_config_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).not.toBeNull()
  })
})
```

`packages/db/package.json` — ajouter :
```json
{
  "scripts": {
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "db:start": "supabase start",
    "db:reset": "supabase db reset"
  },
  "devDependencies": {
    "supabase": "^2.0.0"
  },
  "dependencies": {
    "@homebudget/domain": "workspace:*",
    "@supabase/supabase-js": "^2.47.0"
  }
}
```

`packages/db/vitest.integration.config.ts` :
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['test/**/*.integration.test.ts'] },
})
```

Deux configurations, une seule raison : `pnpm test` (donc la CI) ne doit jamais dépendre de Docker. La suite unitaire tourne partout en une seconde ; l'intégration s'invoque explicitement.

- [ ] **Step 4 : Lancer Supabase et vérifier**

```bash
cd packages/db
pnpm supabase init      # si supabase/config.toml n'existe pas encore
pnpm supabase start     # demarre Postgres dans Docker, imprime les cles
pnpm supabase db reset  # applique les migrations
```

Récupérer `service_role key` dans la sortie de `supabase start`, puis :

```bash
SUPABASE_SERVICE_ROLE_KEY=<la_cle> pnpm test:integration
```
Attendu : PASS, 5 tests. Le test « refuse de modifier une version close » est le plus important : il prouve que l'append-only n'est pas une politesse mais une loi.

- [ ] **Step 5 : Commit**

```bash
git add packages/db
git commit -m "feat(db): schema Postgres, invariants I1 et I2 portes par des contraintes

- EXCLUDE gist : deux versions ne peuvent pas se chevaucher
- trigger : une version close est immuable (append-only)
- CHECK : part_thomas + part_liz = montant, toujours
La base refuse physiquement d'ecrire une donnee qui viole le PRD."
```

---

## Task 8 : Le seed — écrire la reprise en base

**Files:**
- Create: `packages/db/src/seed.ts`
- Modify: `packages/db/package.json` (script `db:seed`)

**Interfaces:**
- Consumes: `VERSIONS_INITIALES`, `importerDepenses` (Task 6), le schéma (Task 7).
- Produces: `pnpm --filter @homebudget/db db:seed`.

- [ ] **Step 1 : Écrire le script de seed**

`packages/db/src/seed.ts` :
```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { formaterEuros, phraseSynthese, resumer } from '@homebudget/domain'
import { createClient } from '@supabase/supabase-js'
import { VERSIONS_INITIALES, importerDepenses } from './import-sheet.js'

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante.')
}

const db = createClient(URL, KEY)

const CSV = readFileSync(
  fileURLToPath(new URL('../../../docs/data/sheet-export-2026-07-12/depenses.csv', import.meta.url)),
  'utf-8',
)

const SOLDE_ATTENDU = 114580

async function main() {
  console.log('Purge...')
  await db.from('depense').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('version_config').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Les versions passent par la fonction SQL : elle cloture la precedente la
  // veille, en transaction. On ne contourne pas le mecanisme append-only.
  console.log('Versions de config...')
  const idsParCle = new Map<string, string>()
  for (const v of VERSIONS_INITIALES) {
    const { data, error } = await db.rpc('creer_version_config', {
      p_libelle: v.libelle,
      p_date_debut: v.dateDebut,
      p_salaire_net_thomas_cents: v.salaireNetThomas,
      p_salaire_net_liz_cents: v.salaireNetLiz,
      p_charges_communes: v.chargesCommunes,
      p_charges_perso_thomas: v.chargesPersoThomas,
      p_charges_perso_liz: v.chargesPersoLiz,
    })
    if (error) throw new Error(`Version ${v.libelle} : ${error.message}`)
    idsParCle.set(v.id, data.id)
    console.log(`  ${v.libelle} — a partir du ${v.dateDebut}`)
  }

  const depenses = importerDepenses(CSV, VERSIONS_INITIALES)
  console.log(`Depenses (${depenses.length})...`)

  const { error } = await db.from('depense').insert(
    depenses.map((d) => ({
      date: d.date,
      description: d.description,
      montant_cents: d.montant,
      paye_par: d.payePar,
      type: d.type,
      mode_repartition: d.mode,
      part_thomas_cents: d.parts.thomas,
      part_liz_cents: d.parts.liz,
      version_config_id: idsParCle.get(d.versionConfigId),
      genere_auto: d.genereAuto,
      commentaire: d.commentaire,
    })),
  )
  if (error) throw new Error(`Insertion des depenses : ${error.message}`)

  // Le seed se verifie lui-meme : on relit la base, on recalcule, on compare.
  const { data: relues } = await db.from('depense').select('*')
  const resume = resumer(
    (relues ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description,
      montant: r.montant_cents,
      payePar: r.paye_par,
      type: r.type,
      mode: r.mode_repartition,
      parts: { thomas: r.part_thomas_cents, liz: r.part_liz_cents },
      versionConfigId: r.version_config_id,
      genereAuto: r.genere_auto,
      commentaire: r.commentaire,
    })),
  )

  console.log(`\n${phraseSynthese(resume)}`)

  if (resume.soldeThomas !== SOLDE_ATTENDU) {
    throw new Error(
      `Solde incorrect apres seed : ${formaterEuros(resume.soldeThomas)} au lieu de ${formaterEuros(SOLDE_ATTENDU)}.`,
    )
  }
  console.log('Solde conforme a la reprise du Sheet.')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
```

`packages/db/package.json` — ajouter au bloc `scripts` :
```json
"db:seed": "tsx src/seed.ts"
```

et au bloc `devDependencies` :
```json
"tsx": "^4.19.0"
```

- [ ] **Step 2 : Lancer le seed**

```bash
pnpm install
cd packages/db
pnpm supabase db reset
SUPABASE_SERVICE_ROLE_KEY=<la_cle> pnpm db:seed
```

Attendu, en dernière ligne :
```
Liz doit 1 145,80 € à Thomas
Solde conforme a la reprise du Sheet.
```

Le seed se vérifie lui-même : il relit ce qu'il vient d'écrire et recalcule. S'il sort autre chose, il échoue avec le code 1.

- [ ] **Step 3 : Commit**

```bash
git add packages/db
git commit -m "feat(db): seed de reprise, auto-verifie contre le solde de reference"
```

---

## Task 9 : CI et skills projet

Le harness devient exécutable en dehors de la machine de Thomas.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.claude/skills/seed/SKILL.md`, `.claude/skills/verify/SKILL.md`

**Interfaces:**
- Consumes: les scripts pnpm (Task 1), le seed (Task 8).
- Produces: rien de consommé par du code.

- [ ] **Step 1 : Écrire la CI**

`.github/workflows/ci.yml` :
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  qualite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck

      # Le canari. S'il tombe, la PR ne passe pas : un invariant a ete viole.
      - run: pnpm test
```

Les tests d'intégration Supabase (Docker) ne tournent pas en CI au plan 1 : ils exigent un service Postgres et ralentissent la boucle. Le canari, lui, est pur et tourne en moins d'une seconde — c'est lui qui protège le solde. Les invariants SQL sont vérifiés localement via `pnpm --filter @homebudget/db test:integration`. On les branchera en CI au plan 2, quand un service Postgres sera de toute façon nécessaire pour les tests E2E.

- [ ] **Step 2 : Écrire le skill `/seed`**

`.claude/skills/seed/SKILL.md` :
```markdown
---
name: seed
description: Réinitialise la base locale au seed de reprise du Google Sheet et vérifie que le solde de référence (1 145,80 €) est intact.
---

# Seed de HomeBudget

Remet la base locale dans l'état de la reprise du Sheet, puis se vérifie.

## Marche à suivre

1. Vérifier que Supabase local tourne :

       cd packages/db && pnpm supabase status

   S'il ne tourne pas : `pnpm supabase start`. Récupérer la `service_role key`
   dans la sortie.

2. Réappliquer les migrations à blanc :

       pnpm supabase db reset

3. Lancer le seed :

       SUPABASE_SERVICE_ROLE_KEY=<cle> pnpm db:seed

## Ce qu'il faut voir

    Liz doit 1 145,80 € à Thomas
    Solde conforme a la reprise du Sheet.

## Si le solde diffère

**Ne modifie pas le montant attendu.** Il est prouvé par
`packages/db/test/import-sheet.test.ts` à partir du CSV réel. Un écart signifie
qu'un invariant a été violé. Cherche dans cet ordre :

1. Le signe du mode `transfert` (part du payeur = 0, pas le montant).
2. Un double arrondi dans une répartition.
3. Un flottant qui a survécu quelque part.
4. Un recalcul de part à la lecture (interdit : les parts sont figées).
```

- [ ] **Step 3 : Écrire le skill `/verify`**

`.claude/skills/verify/SKILL.md` :
```markdown
---
name: verify
description: Vérifie qu'une modification de HomeBudget n'a rien cassé — typecheck, tests, canari du solde, et invariants SQL si la base est concernée.
---

# Vérifier une modification

Les tests verts ne suffisent pas : il faut que les invariants tiennent.

## Toujours

    pnpm lint
    pnpm typecheck
    pnpm test

Le canari (`LE CANARI — non-regression du solde`) doit passer. Il rejoue les 33
lignes réelles du Sheet et exige exactement 114 580 centimes.

## Si la modification touche `packages/db/supabase/`

Les invariants sont dans la base, pas dans le code. Il faut les exercer :

    cd packages/db
    pnpm supabase db reset
    SUPABASE_SERVICE_ROLE_KEY=<cle> pnpm test:integration

Ces tests prouvent que la base **refuse** d'écrire une donnée qui viole le PRD :
versions qui se chevauchent, version close modifiée, parts qui ne somment pas
au montant.

## Si la modification touche `packages/domain`

Vérifie qu'aucune dépendance de production n'a été ajoutée :

    cat packages/domain/package.json

Le bloc `dependencies` doit rester absent. Le domaine est pur — c'est ce qui le
rend testable sans mock et réutilisable partout.

## Avant de déclarer que c'est fini

Montre la sortie réelle des commandes. Ne dis pas « les tests passent » sans
l'avoir vu.
```

- [ ] **Step 4 : Vérifier la CI en local**

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test
```
Attendu : les trois passent, dont le canari.

- [ ] **Step 5 : Commit**

```bash
git add .github .claude
git commit -m "ci: lint, typecheck et canari bloquants ; skills /seed et /verify"
```

---

## État à la fin du plan 1

- `pnpm test` prouve, à partir du CSV réel, que **Liz doit 1 145,80 € à Thomas**.
- La base refuse d'écrire une config qui se chevauche, de modifier une version close, ou d'enregistrer une dépense dont les parts ne somment pas au montant.
- Un agent qui écrit du code voit son fichier formaté, linté et typechecké, et se fait rejeter s'il casse la compilation.
- La CI bloque toute PR qui casse le canari.

Le plan 2 construira `apps/web` : les trois écrans, l'auth Google, le déploiement Vercel. Il s'appuiera sur un domaine dont chaque règle est déjà prouvée.
