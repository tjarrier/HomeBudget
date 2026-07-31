# Déploiement par GitHub Actions — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** un merge dans `main` publie une preview après CI verte, un tag `vX.Y.Z` migre puis promeut la production après revue humaine, et l'intégration Git de Vercel ne publie plus rien d'elle-même.

**Architecture :** `apps/web/vercel.json` coupe les déploiements automatiques de Vercel. `ci.yml` devient un workflow réutilisable (`workflow_call`) que les deux workflows de déploiement appellent, pour qu'il n'existe qu'une seule définition de « vérifié ». Chaque déploiement fait, dans cet ordre non négociable : migration de la base, puis build, puis promotion. Un test statique dans `apps/web/test/deploiement.test.ts` verrouille cet ordre et la coupure de l'intégration Git.

**Tech Stack :** GitHub Actions (`workflow_call`, environments), Vercel CLI (`vercel@latest`, `--prebuilt`), drizzle-kit (`db:migrate`), Vitest pour les tests statiques.

**Spec :** `docs/superpowers/specs/2026-07-31-deploiement-github-actions-design.md`
**Issue :** [#47](https://github.com/tjarrier/HomeBudget/issues/47)

## Global Constraints

- **`drizzle-kit push` est interdit partout**, y compris dans les workflows. Le seul chemin est `pnpm --filter @homebudget/db db:migrate`.
- **L'ordre migration → promotion ne se négocie pas.** Dans les deux workflows, `db:migrate` s'exécute avant tout `vercel deploy`, séquentiellement, dans le même job.
- **Le Root Directory du projet Vercel `home-budget` est `apps/web`.** Toute commande `vercel` tourne avec `working-directory: apps/web`, et `vercel.json` vit dans `apps/web/`. Un `vercel.json` à la racine du dépôt serait ignoré en silence.
- **Aucune dépendance ajoutée.** Pas de parseur YAML : les workflows sont testés comme du texte. La CLI Vercel est installée par le runner (`npm install --global vercel@latest`), jamais déclarée dans un `package.json`.
- **Les environments GitHub s'appellent `Preview` et `Production`** (majuscule initiale). Ils existent déjà, créés par le bot Vercel ; on les réutilise au lieu d'en créer des doublons en minuscules.
- **L'hôte stable de preview est `https://home-budget-git-main-tjarriers-projects.vercel.app`.** Il est fabriqué par Vercel à partir de la ref git du déploiement ; on ne l'assigne jamais à la main (les sous-domaines `*.vercel.app` sont réservés).
- **Aucun secret ne doit apparaître dans les logs.** `.vercel/.env.preview.local` contient `DATABASE_URL` et `GOOGLE_CLIENT_SECRET` : on n'en extrait jamais que `BETTER_AUTH_URL`, et on ne l'affiche jamais entier.
- Le français des commentaires de workflow et des messages d'erreur suit le reste du dépôt : **sans accents dans les fichiers YAML** (comme `ci.yml` aujourd'hui), avec accents dans le Markdown et les fichiers TypeScript.

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `apps/web/vercel.json` | Créer. Coupe les déploiements de l'intégration Git. | 1 |
| `apps/web/test/deploiement.test.ts` | Créer. Verrouille le contrat de déploiement : coupure Git, CI réutilisée, ordre migration → promotion. Grossit à chaque tâche. | 1, 2, 3, 4 |
| `.github/workflows/ci.yml` | Modifier. `on: pull_request` + `workflow_call`, sans `push`. | 2 |
| `.github/workflows/deploy-preview.yml` | Créer. Preview au merge dans `main`, plus déclenchement manuel. | 3 |
| `.github/workflows/deploy-production.yml` | Créer. Production au tag, garde d'ancêtre, revue humaine. | 4 |
| `CLAUDE.md` | Modifier. La cible Preview devient `-git-main-` ; nouvelle section « Déploiement ». | 5 |
| `apps/web/test/origine.test.ts` | Modifier. Fixtures `-git-preview-` → `-git-main-`. | 5 |
| `README.md` | Modifier. Comment on livre. | 5 |

---

### Task 1 : couper l'intégration Git de Vercel, et le tester

**Files:**
- Create: `apps/web/vercel.json`
- Test: `apps/web/test/deploiement.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `apps/web/test/deploiement.test.ts` avec les helpers `RACINE_DEPOT` (chemin absolu de la racine du dépôt) et `lire(cheminRelatif: string): string`. Les tâches 2, 3 et 4 ajoutent leurs `describe` dans ce fichier et réutilisent ces deux helpers.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `apps/web/test/deploiement.test.ts` :

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Ce test vit dans `apps/web` parce que c'est le paquet deploye — `vercel.json`
 * y est desormais, et `pnpm test` n'execute que les tests des paquets du
 * workspace. Il ne parle pas d'interface : il verrouille le contrat de
 * deploiement.
 *
 * Il n'y a pas de parseur YAML dans le projet et on n'en ajoute pas un pour ca :
 * les workflows sont lus comme du texte. Ce que ces assertions protegent, ce
 * n'est pas du style — c'est l'ordre `db:migrate` avant `vercel deploy`. Du code
 * neuf qui parle a un schema vieux ne se rattrape pas apres coup.
 */
const RACINE_DEPOT = fileURLToPath(new URL('../../..', import.meta.url))

const lire = (cheminRelatif: string): string =>
  readFileSync(join(RACINE_DEPOT, cheminRelatif), 'utf8')

describe('vercel.json', () => {
  it("coupe les deploiements de l'integration Git", () => {
    const config = JSON.parse(lire('apps/web/vercel.json'))

    expect(config.git.deploymentEnabled).toBe(false)
  })

  it('vit dans le Root Directory du projet, seul endroit ou Vercel le lit', () => {
    // Le Root Directory vaut `apps/web`. Un `vercel.json` a la racine du depot
    // serait ignore en silence : `deploymentEnabled: false` n'aurait aucun effet
    // et un merge dans `main` continuerait de partir en production.
    expect(existsSync(join(RACINE_DEPOT, 'vercel.json'))).toBe(false)
    expect(existsSync(join(RACINE_DEPOT, 'apps/web/vercel.json'))).toBe(true)
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `pnpm --filter @homebudget/web exec vitest run test/deploiement.test.ts`
Expected : FAIL — `ENOENT: no such file or directory ... apps/web/vercel.json`, et le second test échoue sur `expect(false).toBe(true)`.

- [ ] **Step 3 : créer `apps/web/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": { "deploymentEnabled": false }
}
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run : `pnpm --filter @homebudget/web exec vitest run test/deploiement.test.ts`
Expected : PASS, 2 tests.

- [ ] **Step 5 : vérifier que rien d'autre n'a bougé**

Run : `task verif`
Expected : lint, typecheck et tests unitaires verts.

- [ ] **Step 6 : commit**

```bash
git add apps/web/vercel.json apps/web/test/deploiement.test.ts
git commit -m "feat(ci): couper les deploiements de l'integration Git Vercel"
```

---

### Task 2 : rendre `ci.yml` appelable, et ne le jouer qu'une fois

**Files:**
- Modify: `.github/workflows/ci.yml:3-6`
- Test: `apps/web/test/deploiement.test.ts` (ajout d'un `describe`)

**Interfaces:**
- Consumes: `RACINE_DEPOT` et `lire()` de la tâche 1.
- Produces: le workflow réutilisable `./.github/workflows/ci.yml`, appelable sans aucun paramètre ni secret. Son unique job s'appelle `qualite` ; vu depuis un appelant, son check s'affiche `<nom-du-job-appelant> / qualite`.

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter dans `apps/web/test/deploiement.test.ts`, après le `describe('vercel.json')` :

```ts
describe('ci.yml', () => {
  const ci = lire('.github/workflows/ci.yml')

  it('est appelable par les workflows de deploiement', () => {
    // Une seule definition de « verifie ». Les deux workflows de deploiement
    // l'appellent au lieu d'en recopier les etapes.
    expect(ci).toContain('workflow_call:')
  })

  it('ne se declenche plus sur push', () => {
    // Sur `main`, c'est `deploy-preview.yml` qui appelle la CI. Garder le
    // declencheur `push` ferait tourner deux fois Postgres et Playwright a
    // chaque merge, pour deux verdicts qu'il faudrait ensuite comparer.
    expect(ci).not.toMatch(/^\s+push:/m)
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `pnpm --filter @homebudget/web exec vitest run test/deploiement.test.ts`
Expected : FAIL — les deux nouveaux tests échouent (`workflow_call:` absent, `push:` présent).

- [ ] **Step 3 : modifier le déclencheur de `ci.yml`**

Remplacer les lignes 3 à 6 :

```yaml
on:
  push:
    branches: [main]
  pull_request:
```

par :

```yaml
# Sur `main`, la CI est appelee par `deploy-preview.yml`, et sur un tag par
# `deploy-production.yml` : un seul run, un seul verdict, et il est relie au
# deploiement qu'il autorise. D'ou l'absence de declencheur `push` ici.
on:
  pull_request:
  workflow_call:
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run : `pnpm --filter @homebudget/web exec vitest run test/deploiement.test.ts`
Expected : PASS, 4 tests.

- [ ] **Step 5 : commit**

```bash
git add .github/workflows/ci.yml apps/web/test/deploiement.test.ts
git commit -m "refactor(ci): rendre ci.yml appelable et ne le jouer qu'une fois par commit"
```

- [ ] **Step 6 : signaler l'effet de bord à Thomas**

Le nom du check change dans les runs appelés : `qualite` devient `verif / qualite`. Si une règle de protection de branche exige le check `qualite`, elle doit être mise à jour, sinon les PR restent bloquées sur un check qui n'arrivera jamais. Le vérifier avec :

```bash
gh api repos/tjarrier/HomeBudget/branches/main/protection --jq '.required_status_checks'
```

Une réponse `404` signifie qu'aucune protection n'est configurée : il n'y a rien à faire.

---

### Task 3 : `deploy-preview.yml`

**Files:**
- Create: `.github/workflows/deploy-preview.yml`
- Test: `apps/web/test/deploiement.test.ts` (ajout de deux `describe`)

**Interfaces:**
- Consumes: `lire()` de la tâche 1 ; le workflow réutilisable `./.github/workflows/ci.yml` de la tâche 2.
- Produces: le nom de job `verif` (l'appel de la CI) et `deploy`, réutilisés tels quels par la tâche 4. Le pattern d'assertions partagées `WORKFLOWS_DE_DEPLOIEMENT` défini au Step 1 sera étendu par la tâche 4 avec l'entrée `deploy-production.yml`.

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter dans `apps/web/test/deploiement.test.ts` :

```ts
/**
 * Les regles qui valent pour les deux workflows de deploiement. La tache 4 y
 * ajoute `deploy-production.yml` ; l'entree unique ci-dessous n'est pas un oubli
 * a ce stade du plan.
 */
const WORKFLOWS_DE_DEPLOIEMENT = [['deploy-preview.yml', lire('.github/workflows/deploy-preview.yml')]] as const

describe.each(WORKFLOWS_DE_DEPLOIEMENT)('%s', (_nom, contenu) => {
  it('ne deploie que derriere la CI, en la reutilisant telle quelle', () => {
    expect(contenu).toContain('uses: ./.github/workflows/ci.yml')
    expect(contenu).toContain('needs: verif')
  })

  it('migre la base avant de promouvoir le code', () => {
    // La regle qui coute de l'argent si elle tombe : une migration qui echoue
    // doit arreter le deploiement avant que du code neuf ne parle a un schema
    // vieux. Ce test compare des positions dans le fichier, donc aucun
    // commentaire ne doit mentionner `vercel deploy` avant l'etape de migration.
    const migration = contenu.indexOf('db:migrate')
    const promotion = contenu.indexOf('vercel deploy')

    expect(migration).toBeGreaterThan(-1)
    expect(promotion).toBeGreaterThan(-1)
    expect(migration).toBeLessThan(promotion)
  })

  it("n'utilise jamais drizzle-kit push, qui supprimerait nos garde-fous", () => {
    expect(contenu).not.toContain('drizzle-kit push')
  })

  it('declare son environment GitHub, la ou vit DATABASE_URL', () => {
    expect(contenu).toMatch(/environment: (Preview|Production)/)
  })

  it('fait tourner la CLI Vercel dans le Root Directory du projet', () => {
    // Le Root Directory vaut `apps/web`. Une commande `vercel` lancee a la
    // racine du depot ne trouverait pas le projet.
    expect(contenu).toContain('working-directory: apps/web')
  })
})

describe('deploy-preview.yml', () => {
  const preview = lire('.github/workflows/deploy-preview.yml')

  it('publie au merge dans main, et a la demande', () => {
    expect(preview).toContain('branches: [main]')
    expect(preview).toContain('workflow_dispatch:')
  })

  it('ne promeut jamais en production', () => {
    expect(preview).not.toContain('--prod')
  })

  it('ne laisse pas deux migrations courir sur la meme base', () => {
    expect(preview).toContain('cancel-in-progress: false')
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `pnpm --filter @homebudget/web exec vitest run test/deploiement.test.ts`
Expected : FAIL — `ENOENT ... .github/workflows/deploy-preview.yml` (l'erreur survient au chargement du fichier de test, avant l'exécution des cas).

- [ ] **Step 3 : créer `.github/workflows/deploy-preview.yml`**

```yaml
name: Deploiement preview

# Le deployeur, et lui seul : `apps/web/vercel.json` a coupe les deploiements de
# l'integration Git. Un merge dans `main` publie ici, en preview, apres CI verte.
#
# `workflow_dispatch` n'a pas d'entree `ref` : le selecteur de branche natif de
# GitHub fait deja le travail, et une entree en plus ferait verifier une branche
# pendant qu'on en deploie une autre. Un dispatch sur une autre branche produit
# l'hote `-git-<branche>-` correspondant, qui n'est pas dans les redirect URIs de
# Google : la connexion y echouera, et c'est sans solution automatique puisque
# Google n'accepte aucun wildcard.
on:
  push:
    branches: [main]
  workflow_dispatch:

# Pas d'annulation : `db:migrate` est la seule etape non idempotente de la
# chaine, et deux runs concurrents sur la meme base sont la seule facon de la
# corrompre. On fait la queue.
concurrency:
  group: preview
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  verif:
    uses: ./.github/workflows/ci.yml

  deploy:
    needs: verif
    runs-on: ubuntu-latest
    environment: Preview

    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # La migration d'abord. Elle porte sur la base de PREVIEW : `DATABASE_URL`
      # vient du secret de l'environment `Preview`, qui doit pointer une autre
      # base que la production. Une preview branchee sur la prod y creerait de
      # vraies depenses, et une version qui porte des depenses n'est plus
      # supprimable (`0002` et la FK `restrict`).
      - name: Migrer la base de preview
        run: pnpm --filter @homebudget/db db:migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Installer la CLI Vercel
        run: npm install --global vercel@latest

      - name: Tirer la configuration et les variables de Preview
        working-directory: apps/web
        run: vercel pull --yes --environment=preview --token="$VERCEL_TOKEN"

      # Sans BETTER_AUTH_URL dans l'environnement Preview du projet Vercel,
      # `next build` echoue : `origineAuth()` refuse de demarrer sur Vercel
      # plutot que de retomber sur `localhost`, et c'est voulu — cette URI est
      # enregistree chez Google, donc le tour OAuth reussirait et renverrait
      # l'utilisateur sur son propre poste, sans aucune erreur.
      #
      # Cette garde ne change pas le verdict, elle le rend lisible tout de suite
      # au lieu de deux minutes plus tard dans une stacktrace de build. Le
      # fichier tire contient aussi DATABASE_URL et GOOGLE_CLIENT_SECRET : on
      # n'en extrait que cette seule variable.
      - name: Lire l'origine annoncee a Google
        working-directory: apps/web
        run: |
          origine=$(grep -m1 '^BETTER_AUTH_URL=' .vercel/.env.preview.local | cut -d= -f2- | tr -d '"' || true)
          if [ -z "$origine" ]; then
            echo "::error::BETTER_AUTH_URL est absente de l'environnement Preview du projet Vercel. Posez-y l'URL de branche stable, la meme que le redirect URI enregistre chez Google."
            exit 1
          fi
          echo "ORIGINE=$origine" >> "$GITHUB_ENV"

      - name: Construire
        working-directory: apps/web
        run: vercel build --token="$VERCEL_TOKEN"

      - name: Publier
        working-directory: apps/web
        run: |
          url=$(vercel deploy --prebuilt --token="$VERCEL_TOKEN")
          echo "URL=$url" >> "$GITHUB_ENV"

      # La verification que l'issue demande de faire pour de vrai, et non de
      # supposer : l'origine annoncee a Google d'un cote, les hotes que Vercel a
      # reellement attribues au deploiement de l'autre. Ils doivent coincider sur
      # `home-budget-git-main-...`. On ne filtre que des hostnames, jamais la
      # sortie brute de `vercel inspect`.
      - name: Resumer
        working-directory: apps/web
        run: |
          hotes=$(vercel inspect "$URL" --token="$VERCEL_TOKEN" 2>&1 \
            | grep -o '[a-z0-9.-]*\.vercel\.app' | sort -u || true)
          {
            echo "## Preview publiee"
            echo
            echo "- Ref deployee : \`${{ github.ref_name }}\`"
            echo "- URL unique : $URL"
            echo "- Origine annoncee a Google : $ORIGINE"
            echo
            echo '### Hotes attribues par Vercel'
            echo
            echo '```'
            echo "$hotes"
            echo '```'
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run : `pnpm --filter @homebudget/web exec vitest run test/deploiement.test.ts`
Expected : PASS, 12 tests.

- [ ] **Step 5 : vérifier la syntaxe du workflow avant de committer**

Run : `gh workflow list --repo tjarrier/HomeBudget` ne sert à rien ici (le workflow n'est pas encore poussé). Se contenter d'une relecture ciblée :

```bash
grep -n 'working-directory\|db:migrate\|vercel deploy' .github/workflows/deploy-preview.yml
```

Expected : la ligne `db:migrate` apparaît avant la ligne `vercel deploy`, et chaque commande `vercel` est précédée d'un `working-directory: apps/web` (sauf `npm install --global`, qui n'en a pas besoin).

- [ ] **Step 6 : commit**

```bash
git add .github/workflows/deploy-preview.yml apps/web/test/deploiement.test.ts
git commit -m "feat(ci): publier une preview au merge dans main"
```

---

### Task 4 : `deploy-production.yml`

**Files:**
- Create: `.github/workflows/deploy-production.yml`
- Modify: `apps/web/test/deploiement.test.ts` (étendre `WORKFLOWS_DE_DEPLOIEMENT`, ajouter un `describe`)

**Interfaces:**
- Consumes: `lire()` et `WORKFLOWS_DE_DEPLOIEMENT` des tâches 1 et 3 ; le workflow réutilisable de la tâche 2.
- Produces: rien que d'autres tâches consomment.

- [ ] **Step 1 : écrire le test qui échoue**

Dans `apps/web/test/deploiement.test.ts`, remplacer la définition de `WORKFLOWS_DE_DEPLOIEMENT` par :

```ts
const WORKFLOWS_DE_DEPLOIEMENT = [
  ['deploy-preview.yml', lire('.github/workflows/deploy-preview.yml')],
  ['deploy-production.yml', lire('.github/workflows/deploy-production.yml')],
] as const
```

Et ajouter à la fin du fichier :

```ts
describe('deploy-production.yml', () => {
  const production = lire('.github/workflows/deploy-production.yml')

  it('ne se declenche que sur un tag de version', () => {
    expect(production).toContain('tags:')
    expect(production).toContain('v[0-9]+.[0-9]+.[0-9]+')
    // Aucun declencheur de branche : la production ne suit pas `main` commit par
    // commit, elle suit des versions.
    expect(production).not.toContain('branches:')
  })

  it('refuse un tag pose hors de main', () => {
    expect(production).toContain('merge-base --is-ancestor')
  })

  it('refuse le tag avant de jouer la CI, pas apres', () => {
    // Un job de garde, pas une etape dans `deploy` : un tag pose sur un commit
    // hors `main` est refuse en dix secondes, sans brûler Postgres ni Playwright.
    expect(production.indexOf('merge-base --is-ancestor')).toBeLessThan(
      production.indexOf('uses: ./.github/workflows/ci.yml'),
    )
    expect(production).toContain('needs: garde')
  })

  it('promeut en production', () => {
    expect(production).toContain('vercel deploy --prebuilt --prod')
  })
})
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `pnpm --filter @homebudget/web exec vitest run test/deploiement.test.ts`
Expected : FAIL — `ENOENT ... .github/workflows/deploy-production.yml`.

- [ ] **Step 3 : créer `.github/workflows/deploy-production.yml`**

```yaml
name: Deploiement production

# Une version, pas un commit. La production ne bouge que sur un tag, et le tag
# est la seule chose qui la fait bouger — `apps/web/vercel.json` a coupe les
# deploiements de l'integration Git.
on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'

concurrency:
  group: production
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  # Un job, et non une etape de `deploy` : un tag pose sur un commit hors `main`
  # est refuse en dix secondes, sans brûler Postgres et Playwright pour rien.
  garde:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Verifier que le commit tague appartient a main
        run: |
          git fetch --no-tags origin main
          if ! git merge-base --is-ancestor "$GITHUB_SHA" origin/main; then
            echo "::error::Le commit $GITHUB_SHA n'est pas un ancetre de main. Un tag pose hors de main ne part pas en production."
            exit 1
          fi

  # Un tag peut pointer un commit que la CI n'a jamais vu : on rejoue la
  # verification complete, on ne fait pas confiance a l'historique.
  verif:
    needs: garde
    uses: ./.github/workflows/ci.yml

  deploy:
    needs: verif
    runs-on: ubuntu-latest
    # Protection par reviewer requise sur cet environment : approuver, ce n'est
    # pas seulement publier du code, c'est autoriser une migration sur la base de
    # production. La revue se place donc apres le vert de la CI et avant l'ecriture.
    environment: Production

    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # L'ordre n'est pas negociable, et il est sequentiel dans ce seul job : une
      # migration qui echoue arrete le deploiement avant que du code neuf ne parle
      # a un schema vieux. `drizzle-kit push` reste interdit ici comme ailleurs —
      # il proposerait de supprimer nos garde-fous.
      - name: Migrer la base de production
        run: pnpm --filter @homebudget/db db:migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Installer la CLI Vercel
        run: npm install --global vercel@latest

      - name: Tirer la configuration et les variables de Production
        working-directory: apps/web
        run: vercel pull --yes --environment=production --token="$VERCEL_TOKEN"

      - name: Construire
        working-directory: apps/web
        run: vercel build --prod --token="$VERCEL_TOKEN"

      - name: Promouvoir
        working-directory: apps/web
        run: |
          url=$(vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN")
          {
            echo "## Production promue"
            echo
            echo "- Version : \`${{ github.ref_name }}\`"
            echo "- Commit : \`${{ github.sha }}\`"
            echo "- Deploiement : $url"
          } >> "$GITHUB_STEP_SUMMARY"
```

- [ ] **Step 4 : lancer le test pour vérifier qu'il passe**

Run : `pnpm --filter @homebudget/web exec vitest run test/deploiement.test.ts`
Expected : PASS, 21 tests (les 5 assertions partagées jouent désormais deux fois).

- [ ] **Step 5 : lancer la porte complète**

Run : `task verif`
Expected : vert. `biome` ne lit pas les fichiers YAML, mais il lit le test : c'est lui qui doit rester propre.

- [ ] **Step 6 : commit**

```bash
git add .github/workflows/deploy-production.yml apps/web/test/deploiement.test.ts
git commit -m "feat(ci): promouvoir la production sur un tag de version"
```

---

### Task 5 : reprendre la documentation

**Files:**
- Modify: `CLAUDE.md:129-135` puis ajout d'une section après la ligne 147
- Modify: `apps/web/test/origine.test.ts:16-19` et les assertions qui citent l'hôte
- Modify: `README.md` (nouvelle section après « Commandes »)

**Interfaces:**
- Consumes: les trois workflows et `vercel.json` des tâches 1 à 4.
- Produces: rien.

- [ ] **Step 1 : corriger l'affirmation devenue fausse dans CLAUDE.md**

Remplacer les lignes 129 à 135 :

```markdown
- **Cible Preview : l'URL de BRANCHE**, `home-budget-git-<branche>-tjarriers-projects.vercel.app`,
  et une branche de preview figée (`preview`) pour n'avoir qu'un seul redirect URI à
  enregistrer. Surtout pas `-git-main-` : c'est un alias de la **production**, donc les
  previews atterriraient sur la vraie base après authentification.
- Ne reconstruis jamais ce hostname à la main : au-delà de 63 caractères avant `.vercel.app`,
  Vercel tronque, et retire le slug de scope en entier. Lis-le dans le commentaire du bot
  Vercel sur la PR, ou dans le `redirect_uri` que Google affiche quand il refuse.
```

par :

```markdown
- **Cible Preview : `https://home-budget-git-main-tjarriers-projects.vercel.app`.** C'est
  l'URL de branche de `main`, et depuis que `apps/web/vercel.json` coupe les déploiements
  de l'intégration Git, elle ne sert plus la production : Vercel ne déploie plus `main` du
  tout, c'est `deploy-preview.yml` qui le fait, **en preview**, donc avec les variables
  d'environnement Preview. L'avertissement inverse qui figurait ici ne valait que tant que
  l'intégration Git envoyait `main` en production.
- **On ne choisit pas ce hostname, on choisit la ref.** Vercel le fabrique à partir de la
  ref git du déploiement, et les sous-domaines `*.vercel.app` sont réservés : aucun
  `vercel alias set` n'est possible dessus. Ne reconstruis jamais ce nom à la main non
  plus : au-delà de 63 caractères avant `.vercel.app`, Vercel tronque et retire le slug de
  scope en entier. Lis-le dans le résumé du run de `deploy-preview.yml`, qui affiche côte à
  côte l'origine annoncée à Google et les hôtes réellement attribués.
```

- [ ] **Step 2 : ajouter la section « Déploiement » à CLAUDE.md**

L'insérer entre le paragraphe « L'aperçu des parts » (ligne 147) et le titre `## Commandes` :

```markdown
## Déploiement

**Vercel ne déploie plus rien tout seul.** `apps/web/vercel.json` pose
`git.deploymentEnabled: false`. Le fichier est dans `apps/web` et non à la racine parce
que c'est le *Root Directory* du projet Vercel : Vercel ne lit que celui-là, et un fichier
à la racine serait ignoré en silence — `main` repartirait en production par la porte de
derrière, sans que rien ne le signale.

Deux workflows, un seul déployeur, et une seule définition de « vérifié » : `ci.yml` est
appelable (`workflow_call`), les deux l'appellent, aucun ne recopie ses étapes.

- **Preview au merge** (`deploy-preview.yml`) : push sur `main`, ou déclenchement manuel
  sur une branche. Cible `-git-main-`.
- **Production au tag** (`deploy-production.yml`) : un tag `vX.Y.Z`. Le workflow refuse un
  tag posé hors de `main`, rejoue la CI complète (un tag peut pointer un commit qu'elle n'a
  jamais vu), puis attend une revue humaine.

**L'ordre ne se négocie pas : migration d'abord, promotion ensuite.** Une migration qui
échoue doit arrêter le déploiement avant que du code neuf ne parle à un schéma vieux.
`apps/web/test/deploiement.test.ts` le verrouille en comparant les positions des deux
étapes dans chaque workflow — n'y écris pas `vercel deploy` dans un commentaire placé avant
l'étape de migration, tu ferais tomber le test à juste titre.

`drizzle-kit push` reste interdit, y compris en production. Les workflows appellent
`db:migrate`.

Approuver le déploiement de production, ce n'est pas seulement publier du code : c'est
autoriser une migration sur la base réelle. La revue se place après le vert de la CI et
avant l'écriture.
```

- [ ] **Step 3 : aligner les fixtures de `origine.test.ts`**

Le test vérifie qu'on lit `BETTER_AUTH_URL` et qu'on ignore l'URL unique du déploiement ; son sens ne change pas. Seul l'hôte cité change, pour qu'il cesse de documenter une cible abandonnée. Remplacer partout dans `apps/web/test/origine.test.ts` :

```
home-budget-git-preview-tjarriers-projects.vercel.app
```

par :

```
home-budget-git-main-tjarriers-projects.vercel.app
```

Il y a quatre occurrences (lignes 19, 25-26, 84-85 dans la version actuelle). Ne toucher à rien d'autre : ni `home-budget-a1b2c3-...` (l'URL unique, qui doit rester différente), ni les assertions.

- [ ] **Step 4 : lancer les tests touchés**

Run : `pnpm --filter @homebudget/web exec vitest run test/origine.test.ts test/deploiement.test.ts`
Expected : PASS.

- [ ] **Step 5 : documenter la livraison dans le README**

Insérer après la section « Commandes » (juste avant `## Le canari`) :

```markdown
## Livrer

Le déploiement est fait par GitHub Actions, jamais à la main, et jamais par Vercel de sa
propre initiative.

- **Un merge dans `main`** publie une preview sur
  `home-budget-git-main-tjarriers-projects.vercel.app`, après CI verte. Le résumé du run
  affiche l'URL et les hôtes attribués.
- **Un tag de version** publie en production :

  ```sh
  git tag v0.1.0
  git push origin v0.1.0
  ```

  Le workflow refuse le tag s'il ne pointe pas un commit de `main`, rejoue la CI complète,
  puis attend une approbation sur l'environment `Production` de GitHub. Approuver déclenche
  la migration de la base **puis** la promotion, dans cet ordre.

Une CI rouge bloque les deux.
```

- [ ] **Step 6 : porte complète et commit**

Run : `task verif`
Expected : vert.

```bash
git add CLAUDE.md README.md apps/web/test/origine.test.ts
git commit -m "docs: la preview cible -git-main-, et le deploiement passe par la CI"
```

---

### Task 6 : mettre en service, et vérifier le piège pour de vrai

Cette tâche n'écrit pas de code. Elle est dans le plan parce que la définition de « fini » de l'issue #47 en dépend, et parce que son ordre compte : `vercel build` échoue si `BETTER_AUTH_URL` n'est pas posée *avant* le premier run.

**Files:** aucun.

**Interfaces:**
- Consumes: les workflows des tâches 3 et 4, une fois la branche mergée dans `main`.
- Produces: la confirmation que l'hôte `-git-main-` sert bien la base de preview.

- [ ] **Step 1 : poser les secrets de dépôt** *(Thomas — nécessite un token Vercel)*

Créer un token dans les réglages Vercel, puis :

```bash
gh secret set VERCEL_TOKEN --repo tjarrier/HomeBudget
gh secret set VERCEL_ORG_ID --repo tjarrier/HomeBudget
gh secret set VERCEL_PROJECT_ID --repo tjarrier/HomeBudget
```

`VERCEL_ORG_ID` et `VERCEL_PROJECT_ID` se lisent dans les réglages du projet Vercel, ou dans `.vercel/project.json` après un `vercel link` local.

- [ ] **Step 2 : poser les secrets d'environment** *(Thomas)*

```bash
gh secret set DATABASE_URL --repo tjarrier/HomeBudget --env Preview
gh secret set DATABASE_URL --repo tjarrier/HomeBudget --env Production
```

Le premier prend l'URL de la base de preview — **distincte de la production**. Le second celle de Supabase.

- [ ] **Step 3 : créer la règle de protection sur l'environment `Production`, et la vérifier** *(Thomas)*

Déjà vérifié : les environments `Preview` et `Production` existent sous ces noms exacts dans le dépôt, et leurs `protection_rules` sont actuellement **vides**. Sans règle, GitHub exécute le job `deploy` sans aucune approbation : le premier tag `vX.Y.Z` migrerait la base de production et promouvrait tout seul.

Dans *Settings → Environments → Production*, cocher **Required reviewers** et s'y ajouter. Vérifier que la règle est bien posée :

```bash
gh api repos/tjarrier/HomeBudget/environments/Production --jq '.protection_rules'
```

Expected : une règle de type `required_reviewers`. **Aucun tag `vX.Y.Z` ne doit être poussé tant que cette commande ne la renvoie pas** — c'est la seule chose qui rend la revue humaine du contrat (`CLAUDE.md`, section Déploiement) réelle plutôt qu'un vœu documenté.

- [ ] **Step 4 : compléter les variables d'environnement Preview du projet Vercel** *(Thomas)*

Dans les réglages Vercel, scope **Preview** :

```
BETTER_AUTH_URL=https://home-budget-git-main-tjarriers-projects.vercel.app
DATABASE_URL=<la base de preview>
BETTER_AUTH_SECRET=<openssl rand -base64 32, distinct de la production>
GOOGLE_CLIENT_ID=<le meme client OAuth>
GOOGLE_CLIENT_SECRET=<le meme client OAuth>
ALLOWLIST_THOMAS=<adresse>
ALLOWLIST_LIZ=<adresse>
```

Sans `BETTER_AUTH_URL`, l'étape « Lire l'origine annoncee a Google » du workflow échoue avec un message explicite : c'est le comportement voulu, pas un bug.

- [ ] **Step 5 : vérifier que les deux `DATABASE_URL` d'un même environment désignent la même base** *(Thomas)*

Il y a désormais deux sources pour une seule base, à l'intérieur de chaque environment : le secret d'environment GitHub posé au Step 2, que la migration utilise, et la variable du projet Vercel posée au Step 4, que `vercel build` embarque dans l'application. Si elles divergent, la migration s'applique sur une base et le code neuf parle à une autre. Les workflows font maintenant ce contrôle eux-mêmes et font échouer le run si les empreintes (hôte et nom de base, sans les identifiants) diffèrent — ce n'est plus seulement une chose à vérifier une fois, c'est verrouillé à chaque déploiement. Poser les deux valeurs pour qu'elles désignent la même base (ou une paire pooler/connexion directe légitime sur la même base) rend ce contrôle silencieux.

Une limite à garder en tête : l'empreinte laisse tomber les identifiants, et une URL de pooler Supabase porte la référence du projet dans son utilisateur (`postgres.<ref>@aws-0-<région>.pooler.supabase.com:6543/postgres`), pas dans son hôte. Deux URLs de pooler appartenant à deux projets Supabase différents produisent donc la même empreinte, et le contrôle passe alors que la migration et l'application visent deux projets distincts. La vérification humaine reste donc nécessaire : coller une URL de pooler de production dans la variable Preview est exactement l'erreur que ce contrôle ne sait pas attraper.

- [ ] **Step 6 : merger, puis déclencher le premier passage à la main**

Une fois la PR mergée dans `main`, le push déclenche `deploy-preview.yml` tout seul. Sinon :

```bash
gh workflow run deploy-preview.yml --repo tjarrier/HomeBudget --ref main
gh run watch --repo tjarrier/HomeBudget
```

- [ ] **Step 7 : lire le résumé du run — c'est la vérification que l'issue exige**

Dans le résumé, `Origine annoncee a Google` et `Hotes attribues par Vercel` doivent coïncider sur `home-budget-git-main-tjarriers-projects.vercel.app`.

**Si l'hôte n'apparaît pas dans les hôtes attribués**, Vercel n'assigne pas l'alias de branche à un déploiement `--prebuilt` fait par la CLI. On ne peut pas le poser à la main. Le repli, à décider avec Thomas et non à improviser : faire porter au déploiement une autre ref — le workflow force la branche `preview` sur le commit de `main` et déploie depuis ce checkout, pour obtenir `-git-preview-`. Ne pas l'écrire d'avance.

- [ ] **Step 8 : vérifier que cette URL sert la base de PREVIEW, et pas la production**

Ouvrir `https://home-budget-git-main-tjarriers-projects.vercel.app`. La connexion échouera encore (le redirect URI n'est pas enregistré), mais l'écran de connexion doit s'afficher. Pour trancher sur la base, comparer le solde affiché après le Step 9, ou interroger les deux bases :

```bash
psql "<DATABASE_URL de preview>" -c 'select count(*) from depense'
psql "<DATABASE_URL de production>" -c 'select count(*) from depense'
```

Deux comptes différents, et l'écran doit montrer celui de la preview.

- [ ] **Step 9 : enregistrer le redirect URI chez Google** *(Thomas)*

Console Google Cloud, client OAuth du projet, *Authorized redirect URIs*, ajouter :

```
https://home-budget-git-main-tjarriers-projects.vercel.app/api/auth/callback/google
```

Puis se connecter sur l'URL de preview et vérifier qu'une adresse hors allowlist est bien rejetée.

- [ ] **Step 10 : vérifier que les checks requis sur les pull requests restent atteignables**

Deux choses ont changé la liste des checks qu'une PR reçoit : le check de la CI s'appelle maintenant `verif / qualite` quand il tourne à l'intérieur d'un workflow de déploiement (au lieu de `qualite`, voir Task 2 Step 6), et le check du bot Vercel n'arrivera plus jamais sur une PR, puisque l'intégration Git est coupée. Si l'un des deux est exigé par une règle de protection de branche, chaque PR resterait bloquée sur un check qui n'arrive jamais.

Déjà vérifié : à ce jour, `gh api repos/tjarrier/HomeBudget/branches/main/protection` renvoie `404` — aucune protection de branche n'est configurée, donc rien à corriger maintenant. Mais si une protection est activée un jour, revérifier avec la même commande, et adapter les checks requis aux noms ci-dessus.

- [ ] **Step 11 : vérifier que l'intégration Git de Vercel ne publie plus rien**

```bash
gh api "repos/tjarrier/HomeBudget/deployments?per_page=10" \
  --jq '.[] | "\(.environment) | \(.ref) | \(.created_at) | \(.creator.login)"'
```

Expected : plus aucun déploiement créé par `vercel[bot]` après le merge. Ouvrir une PR de test le confirme : elle ne doit plus recevoir de preview automatique.

- [ ] **Step 12 : la production, sur un tag**

```bash
git tag v0.1.0
git push origin v0.1.0
gh run watch --repo tjarrier/HomeBudget
```

Expected : la garde passe, la CI est verte, le job `deploy` attend une approbation. Après approbation : la migration s'exécute, **puis** la promotion. Vérifier aussi le refus : un tag posé sur un commit hors `main` doit échouer sur le job `garde` en moins d'une minute.

- [ ] **Step 13 : clôturer l'issue**

```bash
gh issue close 47 --repo tjarrier/HomeBudget \
  --comment "Preview au merge sur -git-main-, production au tag apres revue, integration Git de Vercel coupee. Verifie sur le premier passage."
```

---

## Auto-relecture

**Couverture de la spec** — chaque section de `2026-07-31-deploiement-github-actions-design.md` est couverte : §1 `vercel.json` → tâche 1 ; §2 `ci.yml` appelable → tâche 2 ; §3 preview → tâche 3 ; §4 production → tâche 4 ; §5 le test qui verrouille → réparti sur les tâches 1 à 4, chacune apportant ses assertions avec son livrable ; §6 documentation → tâche 5 ; prérequis humains et vérification du premier passage → tâche 6.

**Écarts assumés par rapport à la spec** — deux, tous deux du côté du test :

- La spec listait « chaque job `deploy` déclare son `environment` » ; le plan y ajoute deux assertions non prévues (`working-directory: apps/web` présent, `cancel-in-progress: false` sur la preview). Elles protègent les deux erreurs les plus faciles à commettre en modifiant ces workflows.
- La spec ne disait pas où vérifier que `vercel.json` n'est *pas* à la racine. Le plan le teste (tâche 1, Step 1), parce qu'un fichier à la racine est ignoré en silence : c'est le mode de défaillance le plus coûteux de toute la tâche.

**Cohérence des noms** — les jobs s'appellent `verif`, `deploy` et `garde` dans les deux workflows et dans les assertions. Les helpers du test (`RACINE_DEPOT`, `lire`, `WORKFLOWS_DE_DEPLOIEMENT`) sont définis en tâche 1 et 3 puis réutilisés sans être renommés. Les environments sont `Preview` et `Production` partout.

**Piège connu du test** — l'assertion d'ordre compare `indexOf('db:migrate')` et `indexOf('vercel deploy')`. Un commentaire mentionnant `vercel deploy` au-dessus de l'étape de migration la ferait tomber. C'est dit dans le test lui-même, dans CLAUDE.md, et ici.
