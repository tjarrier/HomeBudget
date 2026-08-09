# Borner la liste des dépenses — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Borner en SQL toute lecture de dépenses, et rendre le formulaire de saisie joignable au téléphone sans traverser l'historique.

**Architecture:** Trois lectures bornées dans `packages/db/src/lecture.ts` (`listerDepenses({limite})`, `resumerDepenses(filtres?)`, `listerMoisDepenses()`) remplacent les deux lectures non bornées de `apps/web`. `resumerDepenses()` est une deuxième implémentation de `resumer()`, en SQL, tenue par un test qui compare les deux champ pour champ sur le seed. Le domaine garde le sens (`synthese`, `phraseSynthese`) ; SQL ne fait que le pliage.

**Tech Stack:** TypeScript, Drizzle ORM, Postgres 16, Next.js App Router (Server Components), Vitest, Playwright, Tailwind v4.

**Spec :** `docs/superpowers/specs/2026-08-09-borner-la-liste-des-depenses-design.md`
**Issue :** [#41](https://github.com/tjarrier/HomeBudget/issues/41)

## Global Constraints

- **L'argent est un entier de centimes.** Aucun flottant, nulle part. `sum()` en Postgres rend `numeric`, livré en **chaîne** par le driver `pg` : la conversion est `Number(x ?? 0)`, jamais `parseFloat`.
- **`sum()` rend `null` sur un ensemble vide**, jamais `0`. Sans le `?? 0`, une base neuve produit `NaN`.
- **Aucune part n'est jamais recalculée à la lecture** (règle 4). `resumerDepenses()` ne fait que sommer des colonnes déjà figées (`part_thomas_cents`, `part_liz_cents`) — il n'applique aucun ratio.
- **`packages/domain` garde le sens.** `synthese()` et `phraseSynthese()` ne sont pas touchées et n'ont qu'une implémentation. SQL ne dérive aucun solde : `soldeThomas = payeThomas - duThomas` reste en TypeScript.
- **`apps/web` n'importe que la façade.** Tout nom nouveau doit entrer dans `FACADE_DB` de `apps/web/test/architecture.test.ts` **et** dans la liste de `CLAUDE.md` (section « L'application web »).
- **Les dates sont des chaînes ISO** `YYYY-MM-DD` / `YYYY-MM`, jamais des objets `Date`.
- **`drizzle-kit push` est interdit.** Ce plan ne change aucun schéma : aucune migration à générer.
- **Le palier est 20.** Une constante `PALIER = 20` dans la page, jamais un `20` littéral répété.
- **Noms de colonnes SQL** (`packages/db/src/schema.ts`) : `montant_cents`, `paye_par`, `type`, `part_thomas_cents`, `part_liz_cents`, `date`.

---

### Task 1 : `Resume` gagne `nombre`

**Files:**
- Modify: `packages/domain/src/solde.ts` (interface `Resume`, fonction `resumer`)
- Test: `packages/domain/test/solde.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `Resume.nombre: number` — le nombre de dépenses pliées. `resumer(depenses)` le remplit avec `depenses.length`. Consommé par les Tasks 3, 5 et 6.

- [x] **Step 1 : Écrire les tests qui échouent**

Dans `packages/domain/test/solde.test.ts`, dans le `describe('resumer', …)` existant, ajouter :

```ts
  it('compte les lignes pliees', () => {
    expect(resumer(depenses).nombre).toBe(2)
  })
```

Et dans le `it('gere une liste vide', …)` existant, ajouter la ligne :

```ts
    expect(r.nombre).toBe(0)
```

- [x] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `task test:domain`
Expected: FAIL — `expected undefined to be 2` sur le nouveau test.

- [x] **Step 3 : Implémenter**

Dans `packages/domain/src/solde.ts`, ajouter le champ EN TÊTE de l'interface :

```ts
export interface Resume {
  /**
   * Combien de lignes ce resume plie. Il est DANS le resume, et non rendu a
   * cote, parce que l'agregat SQL de `resumerDepenses()` doit rendre exactement
   * les memes champs que `resumer()` : le test qui compare les deux couvre alors
   * le compte comme le reste.
   */
  nombre: number
  /** Depenses reelles, transferts exclus. */
  totalDepenses: Cents
  // … le reste inchange
```

Et dans `resumer()`, initialiser puis remplir :

```ts
  const r: Resume = {
    nombre: depenses.length,
    totalDepenses: 0,
    // … le reste inchange
  }
```

- [x] **Step 4 : Lancer toute la suite unitaire**

Run: `task test`
Expected: PASS. `nombre` est un champ ajouté : aucun test existant ne compare un `Resume` entier. Si l'un le fait (`toEqual` sur un littéral), ajouter `nombre` à son attendu — ne jamais retirer le champ.

- [x] **Step 5 : Committer**

```bash
git add packages/domain/src/solde.ts packages/domain/test/solde.test.ts
git commit -m "feat(domain): un resume sait combien de lignes il plie"
```

---

### Task 2 : `listerDepenses({ limite })`

**Files:**
- Modify: `packages/db/src/lecture.ts` (interface `FiltresDepenses`, fonction `listerDepenses`)
- Test: `packages/db/test/facade.integration.test.ts`

**Interfaces:**
- Consumes: rien de la Task 1.
- Produces: `listerDepenses(filtres?: FiltresDepenses): Promise<Depense[]>` où `FiltresDepenses` gagne `limite?: number | undefined`. Consommé par les Tasks 5 et 6.

**Prérequis :** Postgres local. `task db:up` si le conteneur ne tourne pas.

- [x] **Step 1 : Sortir le jeu de données du bloc des filtres**

Trois blocs vont s'en servir. Dans `packages/db/test/facade.integration.test.ts`, **déplacer** la fonction `quatreDepenses()` (déclarée aujourd'hui dans `describe('listerDepenses — filtres', …)`, avec son JSDoc) au niveau du module, juste après `creerVersionSql()`. Ne rien changer à son corps ni à ses appels : le `beforeEach` global tronque déjà les tables entre deux tests, donc les blocs restent indépendants.

Run: `task test:integration`
Expected: PASS — c'est un déplacement, rien d'autre.

- [x] **Step 2 : Écrire le test qui échoue**

À la suite du `describe('listerDepenses — filtres', …)`, ajouter :

```ts
describe('listerDepenses — limite', () => {
  beforeEach(quatreDepenses)

  it('rend les N PLUS RECENTES, pas N au hasard', async () => {
    const toutes = await listerDepenses()
    expect(toutes.length).toBeGreaterThan(2)

    const bornees = await listerDepenses({ limite: 2 })

    expect(bornees).toHaveLength(2)
    // Le prefixe exact de la liste complete : la borne coupe la queue, elle ne
    // rebat pas les cartes. C'est ce qui rend « Voir plus » cumulatif honnete —
    // les lignes deja vues ne bougent pas quand la borne monte.
    expect(bornees.map((d) => d.id)).toEqual(toutes.slice(0, 2).map((d) => d.id))
  })

  it('se cumule avec un filtre', async () => {
    const deLiz = await listerDepenses({ payePar: 'liz' })
    expect(deLiz.length).toBeGreaterThan(1)

    const bornees = await listerDepenses({ payePar: 'liz', limite: 1 })

    expect(bornees).toHaveLength(1)
    expect(bornees[0]?.payePar).toBe('liz')
    expect(bornees[0]?.id).toBe(deLiz[0]?.id)
  })

  it('une limite plus grande que la base rend tout, sans erreur', async () => {
    const toutes = await listerDepenses()
    expect(await listerDepenses({ limite: 9999 })).toHaveLength(toutes.length)
  })
})
```

- [x] **Step 3 : Lancer le test, vérifier qu'il échoue**

Run: `task test:integration`
Expected: FAIL — `limite` n'existe pas sur `FiltresDepenses` (erreur de type), et `bornees` a la longueur de la liste complète.

- [x] **Step 4 : Implémenter**

Dans `packages/db/src/lecture.ts`, ajouter le champ à `FiltresDepenses` :

```ts
  type?: TypeDepense | undefined
  /**
   * Combien de lignes AU PLUS, en partant de la plus recente. Absent = toutes.
   *
   * Pas de `decalage` en face : « Voir plus » est CUMULATIF (`?n=40` demande les
   * 40 premieres, jamais la deuxieme page de 20), donc rien dans le produit n'a
   * d'offset a passer. Une borne qu'on n'utilise pas est une borne qu'on ne
   * teste pas.
   */
  limite?: number | undefined
```

Et dans `listerDepenses`, poser le `LIMIT` sur la requête. Drizzle refuse `.limit(undefined)` : la borne est conditionnelle, via `$dynamic()`.

```ts
export async function listerDepenses(filtres: FiltresDepenses = {}): Promise<Depense[]> {
  // `$dynamic()` parce que `.limit()` n'est pas conditionnel autrement : Drizzle
  // fige le type du builder des qu'on chaine, et `.limit(undefined)` emet
  // `LIMIT NULL`.
  const requete = db
    .select()
    .from(depense)
    .where(and(...conditions(filtres)))
    .orderBy(desc(depense.date), desc(depense.createdAt), desc(depense.id))
    .$dynamic()

  // Le tri est DEJA total (date, createdAt, id) — il l'etait pour la stabilite
  // entre deux lectures, il devient ici la condition pour qu'une borne veuille
  // dire quelque chose : sans ordre total, « les 20 premieres » ne designe pas
  // le meme ensemble d'un appel a l'autre.
  const lignes = await (filtres.limite === undefined ? requete : requete.limit(filtres.limite))
  return lignes.map(depenseDepuisLigne)
}
```

Mettre à jour le JSDoc de `listerDepenses` : la première ligne devient
`Les depenses, de la plus recente a la plus ancienne. Sans filtre ni limite : toutes.`

- [x] **Step 5 : Lancer les tests d'intégration**

Run: `task test:integration`
Expected: PASS, y compris le canari des 114 580 centimes.

- [x] **Step 6 : Committer**

```bash
git add packages/db/src/lecture.ts packages/db/test/facade.integration.test.ts
git commit -m "feat(db): listerDepenses accepte une limite, et coupe la queue"
```

---

### Task 3 : `resumerDepenses()`, et le verrou qui le tient

**Files:**
- Modify: `packages/db/src/lecture.ts`
- Test: `packages/db/test/facade.integration.test.ts`

**Interfaces:**
- Consumes: `Resume` de la Task 1 (avec `nombre`), `FiltresDepenses` et `conditions()` de la Task 2.
- Produces: `resumerDepenses(filtres?: FiltresDepenses): Promise<Resume>`. Consommé par les Tasks 5 et 6.

- [x] **Step 1 : Écrire les tests qui échouent**

Dans `packages/db/test/facade.integration.test.ts` :

a) Ajouter `resumerDepenses` à l'import depuis `../src/lecture.js` et `resumer` est déjà importé de `@homebudget/domain`.

b) Un nouveau `describe`, qui appelle le `quatreDepenses()` hissé au niveau du module par la Task 2 :

```ts
describe('resumerDepenses', () => {
  beforeEach(quatreDepenses)

  it('rend EXACTEMENT ce que resumer() rend sur les memes lignes', async () => {
    expect(await resumerDepenses()).toEqual(resumer(await listerDepenses()))
  })

  it('suit les memes filtres que la liste', async () => {
    for (const filtres of [{ payePar: 'liz' as const }, { mois: '2026-07' }, { type: 'transfert' as const }]) {
      expect(await resumerDepenses(filtres)).toEqual(resumer(await listerDepenses(filtres)))
    }
  })

  it('IGNORE la limite : un resume borne serait un solde faux', async () => {
    // La limite est une borne d'AFFICHAGE. Si elle se propageait a l'agregat,
    // l'ecran afficherait le solde des 20 lignes visibles en le presentant comme
    // le solde du couple — le bug que le projet existe pour ne plus avoir.
    expect(await resumerDepenses({ limite: 1 })).toEqual(await resumerDepenses())
  })

  it('rend des zeros, jamais des NaN, sur une base vide', async () => {
    await db.delete(depense)
    expect(await resumerDepenses()).toEqual(resumer([]))
  })
})
```

c) Le verrou du canari : dans `describe('LE CANARI, vu par la facade', …)`, ajouter un second `it` :

```ts
  it('rend le MEME canari par l agregat SQL que par le pliage du domaine', async () => {
    // Le seul garde-fou de la deuxieme implementation de `resumer()`. Sans lui,
    // l'agregat SQL derive en silence le premier jour ou `resumer()` change.
    await importerLeSheetDansLaBase()

    const parSQL = await resumerDepenses()

    expect(parSQL).toEqual(resumer(await listerDepenses()))
    expect(parSQL.soldeThomas).toBe(114580)
    expect(phraseSynthese(parSQL).replace(/[\xa0 ]/g, ' ')).toBe('Liz doit 1 145,80 € à Thomas')
  })
```

- [x] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `task test:integration`
Expected: FAIL — `resumerDepenses is not a function` / erreur de type à l'import.

- [x] **Step 3 : Implémenter**

Dans `packages/db/src/lecture.ts`, ajouter `Resume` à l'import de `@homebudget/domain`, puis la fonction. `conditions()` est déjà défini plus bas dans le fichier — pose `resumerDepenses` juste après `listerDepenses`.

```ts
/**
 * Le meme resume que `resumer()` du domaine, mais plie par Postgres : neuf
 * agregats au lieu de N lignes transportees.
 *
 * C'est une DEUXIEME implementation d'une regle de calcul, hors de
 * `packages/domain`. Ce qui la rend tenable, et rien d'autre : un test la compare
 * a `resumer(await listerDepenses())` champ pour champ, sur le seed reel. Le
 * canari des 114 580 centimes passe par les deux chemins.
 *
 * La frontiere est nette : SQL fait le PLIAGE, jamais le SENS. Les deux soldes se
 * derivent ici en TypeScript, comme dans `resumer()`, et `synthese()` /
 * `phraseSynthese()` restent la seule facon de dire qui doit a qui.
 *
 * Regle 4 sauve : ces sommes portent sur des colonnes DEJA FIGEES a l'ecriture.
 * Aucun ratio n'est applique, aucune part n'est recalculee. Un jour ou une
 * expression ici multiplierait un montant par un ratio, ce serait le bug du Sheet.
 *
 * `limite` est volontairement IGNOREE : c'est une borne d'affichage. Un resume
 * borne presenterait le solde des lignes visibles comme le solde du couple.
 */
export async function resumerDepenses(filtres: FiltresDepenses = {}): Promise<Resume> {
  // `sum()` rend `numeric`, que le driver `pg` livre en CHAINE — et `null` sur un
  // ensemble vide, jamais 0. `cents()` referme les deux : sans le `?? 0`, une base
  // neuve rendrait un resume de NaN, et l'ecran afficherait « NaN € ».
  const cents = (v: string | null) => Number(v ?? 0)

  const [ligne] = await db
    .select({
      nombre: sql<string>`count(*)`,
      totalDepenses: sql<string | null>`sum(${depense.montantCents}) filter (where ${depense.type} <> 'transfert')`,
      totalTransferts: sql<string | null>`sum(${depense.montantCents}) filter (where ${depense.type} = 'transfert')`,
      payeThomas: sql<string | null>`sum(${depense.montantCents}) filter (where ${depense.payePar} = 'thomas')`,
      payeLiz: sql<string | null>`sum(${depense.montantCents}) filter (where ${depense.payePar} = 'liz')`,
      duThomas: sql<string | null>`sum(${depense.partThomasCents})`,
      duLiz: sql<string | null>`sum(${depense.partLizCents})`,
    })
    .from(depense)
    .where(and(...conditions(filtres)))

  const payeThomas = cents(ligne?.payeThomas ?? null)
  const payeLiz = cents(ligne?.payeLiz ?? null)
  const duThomas = cents(ligne?.duThomas ?? null)
  const duLiz = cents(ligne?.duLiz ?? null)

  return {
    nombre: cents(ligne?.nombre ?? null),
    totalDepenses: cents(ligne?.totalDepenses ?? null),
    totalTransferts: cents(ligne?.totalTransferts ?? null),
    payeThomas,
    payeLiz,
    duThomas,
    duLiz,
    // Les DEUX seules soustractions, et elles sont ici et non en SQL : une ligne
    // de regle metier de plus a tenir en double serait une ligne de trop.
    soldeThomas: payeThomas - duThomas,
    soldeLiz: payeLiz - duLiz,
  }
}
```

- [x] **Step 4 : Lancer les tests d'intégration**

Run: `task test:integration`
Expected: PASS, dont les deux canaris.

- [x] **Step 5 : Committer**

```bash
git add packages/db/src/lecture.ts packages/db/test/facade.integration.test.ts
git commit -m "feat(db): resumerDepenses plie en SQL, et un test le tient a resumer()"
```

---

### Task 4 : `listerMoisDepenses()`

**Files:**
- Modify: `packages/db/src/lecture.ts`
- Test: `packages/db/test/facade.integration.test.ts`

**Interfaces:**
- Consumes: rien des tâches précédentes.
- Produces: `listerMoisDepenses(): Promise<string[]>` — les mois `YYYY-MM` qui portent au moins une dépense, du plus récent au plus ancien, sans doublon. Consommé par la Task 6.

- [x] **Step 1 : Écrire le test qui échoue**

Ajouter `listerMoisDepenses` à l'import depuis `../src/lecture.js`, puis :

```ts
describe('listerMoisDepenses', () => {
  beforeEach(quatreDepenses)

  it('rend les mois porteurs, sans doublon, du plus recent au plus ancien', async () => {
    const mois = await listerMoisDepenses()

    expect(mois).toEqual([...new Set(mois)])
    expect([...mois].sort().reverse()).toEqual(mois)
    expect(mois.every((m) => /^\d{4}-\d{2}$/.test(m))).toBe(true)
  })

  it('ne propose que des mois que le filtre sait retrouver', async () => {
    // Le contrat du selecteur : chaque option offerte rend au moins une ligne.
    // Un mois vide inviterait a un filtre dont on sait deja qu'il ne rendra rien.
    for (const m of await listerMoisDepenses()) {
      expect((await listerDepenses({ mois: m })).length).toBeGreaterThan(0)
    }
  })

  it('rend une liste vide sur une base vide', async () => {
    await db.delete(depense)
    expect(await listerMoisDepenses()).toEqual([])
  })
})
```

- [x] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `task test:integration`
Expected: FAIL — `listerMoisDepenses is not a function`.

- [x] **Step 3 : Implémenter**

```ts
/**
 * Les mois qui portent au moins une depense, `YYYY-MM`, du plus recent au plus
 * ancien. C'est ce que le selecteur de l'ecran des depenses propose.
 *
 * `date_trunc('month', …)` et non un `substring` : la MEME expression que
 * `conditions()` et que l'index partiel de la migration 0008. Une seule
 * definition de « le mois de cette date » dans le projet, donc le selecteur ne
 * peut pas proposer un mois que le filtre ne saurait pas retrouver.
 *
 * Le format se fait en SQL (`to_char`) pour que la valeur arrive deja en chaine
 * ISO : un `Date` cote TypeScript porterait un fuseau, et un mois de bascule
 * repasserait au mois precedent.
 */
export async function listerMoisDepenses(): Promise<string[]> {
  const lignes = await db
    .selectDistinct({
      mois: sql<string>`to_char(date_trunc('month', ${depense.date}::timestamp), 'YYYY-MM')`,
    })
    .from(depense)
    .orderBy(sql`1 desc`)
  return lignes.map((l) => l.mois)
}
```

- [x] **Step 4 : Lancer les tests d'intégration**

Run: `task test:integration`
Expected: PASS.

- [x] **Step 5 : Committer**

```bash
git add packages/db/src/lecture.ts packages/db/test/facade.integration.test.ts
git commit -m "feat(db): listerMoisDepenses, la meme definition du mois que le filtre"
```

---

### Task 5 : Le tableau de bord ne lit plus tout

**Files:**
- Modify: `apps/web/app/(app)/page.tsx`
- Modify: `apps/web/test/architecture.test.ts` (constante `FACADE_DB`)
- Modify: `CLAUDE.md` (section « L'application web », la liste de la façade)

**Interfaces:**
- Consumes: `resumerDepenses()` (Task 3), `listerDepenses({ limite })` (Task 2), `Resume.nombre` (Task 1).
- Produces: rien pour les tâches suivantes.

- [x] **Step 1 : Ouvrir la liste blanche, et vérifier qu'elle échoue d'abord**

Dans `apps/web/test/architecture.test.ts`, ajouter les deux noms à `FACADE_DB`, à la suite de `listerDepenses` :

```ts
const FACADE_DB = [
  'listerVersions',
  'listerDepenses',
  'resumerDepenses',
  'listerMoisDepenses',
  'ajouterDepense',
  // … le reste inchange
]
```

Run: `pnpm --filter @homebudget/web test`
Expected: PASS (la liste blanche autorise plus qu'elle ne voit ; rien ne les importe encore).

- [x] **Step 2 : Modifier le tableau de bord**

Dans `apps/web/app/(app)/page.tsx` :

- l'import devient `import { listerDepenses, resumerDepenses } from '@homebudget/db'` ;
- remplacer les deux lignes de lecture :

```ts
  // Deux lectures BORNEES, jamais la table entiere : le solde est un agregat que
  // Postgres plie, et l'apercu ne descend que cinq lignes. Le pliage est le meme
  // que `resumer()` — un test d'integration les compare champ pour champ.
  const resume: Resume = await resumerDepenses()
  const recentes = await listerDepenses({ limite: 5 })
  const s = synthese(resume)
```

- remplacer `depenses.length` par `resume.nombre` dans le bandeau (« Sur N dépenses ») ;
- remplacer `depenses.length === 0` par `recentes.length === 0` dans la carte « Dépenses récentes » ;
- remplacer `depenses.slice(0, 5).map(…)` par `recentes.map(…)` ;
- retirer `resumer` de l'import de `@homebudget/domain` s'il n'est plus utilisé (garder `Resume`, `Personne`, `nomPersonne`, `synthese`).

- [x] **Step 3 : Étendre CLAUDE.md**

Dans `CLAUDE.md`, section « L'application web », premier point, la liste de la façade devient :

```
  `listerVersions`, `listerDepenses`, `resumerDepenses`, `listerMoisDepenses`,
  `ajouterDepense`, `supprimerDepense`, `creerVersion`, `calculerPartsPourSaisie`,
  `genererChargeFixeDuMois`.
```

Et ajouter, juste après cette phrase :

```
  Aucune de ces lectures ne rend un nombre non borné de lignes : `listerDepenses`
  prend une `limite`, le solde est un agrégat SQL (`resumerDepenses`) et non un
  pliage de toutes les lignes transportées. `resumerDepenses` est la **seule**
  règle de calcul du projet écrite deux fois — un test d'intégration la compare à
  `resumer()` du domaine, champ pour champ, sur le seed réel.
```

- [x] **Step 4 : Vérifier**

Run: `task verif`
Expected: PASS — lint, typecheck, tests unitaires dont `architecture.test.ts`.

- [x] **Step 5 : Committer**

```bash
git add apps/web/app/\(app\)/page.tsx apps/web/test/architecture.test.ts CLAUDE.md
git commit -m "feat(web): le tableau de bord lit un agregat, plus la table entiere"
```

---

### Task 6 : L'écran des dépenses, borné et joignable au pouce

**Files:**
- Modify: `apps/web/app/(app)/depenses/page.tsx`
- Test: couvert par la Task 7 (e2e) ; aucun test unitaire — la page est un Server Component qui n'a que du câblage.

**Interfaces:**
- Consumes: `resumerDepenses()`, `listerMoisDepenses()`, `listerDepenses({ …filtres, limite })`, `Resume.nombre`.
- Produces: rien pour les tâches suivantes.

- [x] **Step 1 : Remplacer les lectures et poser la borne**

Dans `apps/web/app/(app)/depenses/page.tsx` :

a) l'import devient :

```ts
import { listerDepenses, listerMoisDepenses, resumerDepenses } from '@homebudget/db'
import { type Personne, synthese } from '@homebudget/domain'
```

b) `searchParams` gagne `n` :

```ts
  searchParams: Promise<{
    regler?: string | string[]
    mois?: string | string[]
    payePar?: string | string[]
    n?: string | string[]
  }>
```

c) au-dessus du composant, la constante et la validation :

```ts
/**
 * Le palier de « Voir plus ». 20 lignes tiennent sur un ecran de telephone sans
 * en faire une page de 4 000px (issue #41), et le pas est le meme que la borne
 * initiale : il n'y a qu'un chiffre a retenir.
 */
const PALIER = 20

/**
 * `?n` est une SAISIE, validee comme les filtres : retenue seulement si elle est
 * l'une des valeurs auxquelles « Voir plus » a pu mener — un multiple du palier,
 * au moins un palier, au plus le premier palier qui couvre tout. Un `?n=999999`
 * tape a la main ne doit pas pouvoir deborner la lecture.
 */
function borne(brut: string | string[] | undefined, total: number): number {
  const demande = Number(Array.isArray(brut) ? brut[0] : brut)
  if (!Number.isInteger(demande) || demande < PALIER || demande % PALIER !== 0) return PALIER
  return Math.min(demande, Math.ceil(total / PALIER) * PALIER)
}
```

d) le corps, à la place du bloc `const toutes = await listerDepenses()` … `const s = synthese(resumer(toutes))` :

```ts
  const session = await exigerSession()
  const { regler, mois, payePar, n } = await searchParams

  // Les mois OFFERTS sont ceux qui existent, demandes a la base et non deduits
  // des lignes affichees : sous une borne, la liste ne connait plus que ses 20
  // premieres, et le selecteur ne proposerait plus que les mois recents.
  const moisDisponibles = await listerMoisDepenses()

  // … le bloc `filtres` / `filtre` existant, inchange

  // Le solde est calcule sur TOUT, jamais sur ce qui est affiche — ni le filtre
  // ni la borne ne le touchent. Un solde calcule sur les lignes visibles serait
  // un reglement PARTIEL presente comme le solde.
  const global = await resumerDepenses()
  // Le compte de ce qui CORRESPOND, qui n'est pas le compte de ce qui s'affiche :
  // c'est lui qui dit s'il reste quelque chose derriere la borne.
  const correspondantes = filtre ? (await resumerDepenses(filtres)).nombre : global.nombre

  const limite = borne(n, correspondantes)
  const depenses = await listerDepenses({ ...filtres, limite })
  const reste = correspondantes - depenses.length

  const s = synthese(global)
```

Le bloc `reglement` qui suit ne change pas (il lit déjà `s`).

- [x] **Step 2 : L'en-tête de la carte et le « Voir plus »**

`aside` de la `Carte` « Historique » devient :

```tsx
          aside={
            reste > 0
              ? `${depenses.length} sur ${correspondantes}`
              : filtre
                ? `${correspondantes} sur ${global.nombre}`
                : `${correspondantes} ${correspondantes > 1 ? 'dépenses' : 'dépense'}`
          }
```

Et **hors** du `<div data-testid="liste-depenses">`, juste après sa fermeture et toujours dans la `Carte` — pour la même raison que les filtres sont hors de lui : « Voir plus (14) » porte un chiffre qui bouge à chaque saisie, et il entrerait sinon dans le texte que les parcours comparent avant/après une opération censée ne rien changer.

```tsx
            {reste > 0 && (
              // Un <Link> et non un bouton : la borne est dans l'URL, donc elle
              // se partage et survit a un rechargement. Zero JavaScript de plus
              // sur un ecran qui n'en avait que pour les selecteurs.
              // Les parametres COURANTS sont repris : le filtre pose et
              // `?regler=1` (#26) survivent a un « Voir plus ».
              <Link
                href={`?${new URLSearchParams({
                  ...(filtres.mois ? { mois: filtres.mois } : {}),
                  ...(filtres.payePar ? { payePar: filtres.payePar } : {}),
                  ...(regler ? { regler: '1' } : {}),
                  n: String(limite + PALIER),
                })}`}
                data-testid="voir-plus"
                // min-h-11 : le plancher tactile du projet. Pleine largeur, donc
                // atteignable au pouce sans viser.
                className="mt-2 flex min-h-11 items-center justify-center rounded-lg border border-subtle text-sm font-medium hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {/* Le reste est DANS le libelle : « Voir plus » sans chiffre
                    n'apprend rien sur ce qu'il reste a parcourir. */}
                Voir plus ({reste})
              </Link>
            )}
```

Ajouter `import Link from 'next/link'` en tête du fichier.

- [x] **Step 3 : Le formulaire passe devant l'historique au téléphone**

Sur la `<div>` de la colonne de saisie, ajouter `max-lg:order-first` et étendre le commentaire :

```tsx
        {/* `sticky` : la saisie reste a portee quand l'historique s'allonge.
            Neutralise sous lg, ou les deux colonnes s'empilent.

            `max-lg:order-first` : au telephone, ouvrir cet ecran c'est etre deja
            DANS le formulaire — la ligne saisie apparait juste en dessous. Sans
            lui, saisir une depense demandait de traverser tout l'historique
            (issue #41). Au large, ou les deux colonnes coexistent, rien ne bouge. */}
        <div className="flex flex-col gap-6 max-lg:order-first lg:sticky lg:top-5">
```

- [x] **Step 4 : Vérifier**

Run: `task verif`
Expected: PASS.

Puis à l'œil, sur `task dev` : `/depenses` affiche 20 lignes et « Voir plus (14) » ; le clic mène à `?n=40` et affiche les 34 sans bouton ; `/depenses?payePar=liz` garde le filtre après un « Voir plus » ; `/depenses?n=999999` retombe à 20 lignes.

- [x] **Step 5 : Committer**

```bash
git add apps/web/app/\(app\)/depenses/page.tsx
git commit -m "feat(web): 20 lignes, un « Voir plus », et le formulaire d abord"
```

---

### Task 7 : Les parcours, à 360 px

**Files:**
- Modify: `apps/web/e2e/parcours.spec.ts`

**Interfaces:**
- Consumes: `data-testid="voir-plus"` (Task 6), `data-testid="liste-depenses"` (existant).
- Produces: rien.

**Prérequis :** les `.env` du checkout principal doivent exister dans ce worktree, et aucun conteneur `homebudget-db` orphelin ne doit tourner.

- [x] **Step 1 : Réparer ce que la borne casse**

Deux endroits lisent la liste comme si elle était complète :

a) Le test des filtres (« un choix dans un selecteur suffit ») compare `lignes.count()` avant et après filtrage. Sous la borne, `total` vaut 20 et le seed compte 17 lignes payées par Liz : l'écart devient d'une poignée de lignes, et une saisie de plus dans un parcours antérieur le referme. Le rendre insensible à la borne en ouvrant la liste entière :

```ts
      // `?n=40` : le premier palier qui couvre tout le seed. Ce test parle du
      // FILTRE, pas de la borne — la borne a son propre parcours plus bas.
      await page.goto('/depenses?n=40')
```

et remplacer les deux assertions `toBeGreaterThan(1)` / `toBeLessThan(total)` par une comparaison qui ne dépend d'aucun compte absolu :

```ts
      const total = await lignes.count()
      expect(total).toBeGreaterThan(1)
      // … apres selectOption
      expect(await lignes.count()).toBeLessThan(total)
```

Conséquence sur les URL attendues : `appliquer()` dans `filtres.tsx` repart de `new URLSearchParams(params)`, donc **`n` survit au changement de filtre**, et il arrive en tête puisqu'il y était déjà. Les deux assertions d'URL du test deviennent :

```ts
      await expect(page).toHaveURL('/depenses?n=40&payePar=liz')
      // … puis apres le second selectOption
      await expect(page).toHaveURL('/depenses?n=40&payePar=liz&mois=2026-07')
```

Ne pas modifier `filtres.tsx` pour éviter ça : que la borne survive au filtre est le bon comportement — on ne veut pas qu'un changement de filtre replie une liste qu'on venait de dérouler.

b) Vérifier que le canari du solde et le parcours de suppression ne dépendent d'aucune ligne ancienne : ils lisent le bandeau du tableau de bord et des lignes qu'ils viennent d'écrire (donc les plus récentes, en tête). Aucun changement attendu — le confirmer en lançant la suite.

- [x] **Step 2 : Le parcours de la borne**

Ajouter, à la fin du fichier, un `describe` dédié. **Après** les canaris et les parcours d'écriture existants : il n'écrit rien, mais il lit des comptes que les écritures précédentes déplacent.

```ts
/**
 * Issue #41 — la liste est bornee, la suite reste atteignable, et le formulaire
 * est joignable sans traverser l'historique.
 *
 * Sur le telephone de reference : c'est l'ecran qui a motive l'issue.
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

  test('le formulaire de saisie precede l historique', async ({ page }) => {
    await page.goto('/depenses')

    // La POSITION a l'ecran, pas l'ordre du DOM : c'est ce que le pouce
    // rencontre. Le formulaire doit etre AU-DESSUS de l'historique.
    const formulaire = await page.locator('input[name="description"]').boundingBox()
    const historique = await page.getByTestId('liste-depenses').boundingBox()

    expect(formulaire?.y ?? 0).toBeLessThan(historique?.y ?? 0)
    // Et joignable sans defiler : le champ tient dans le premier ecran de 740px.
    expect(formulaire?.y ?? 0).toBeLessThan(740)
  })

  test('la borne se laisse pousser, mais pas deborner', async ({ page }) => {
    // 100 est un multiple du palier, donc une borne legitime, et il couvre tout
    // le seed : tout s'affiche, et il ne reste rien a voir.
    await page.goto('/depenses?n=100')
    await expect(page.getByTestId('voir-plus')).toHaveCount(0)
    expect(await page.getByTestId('liste-depenses').getByRole('listitem').count()).toBeGreaterThan(
      20,
    )

    // `?n=999999` n'est aucune des valeurs auxquelles « Voir plus » a pu mener :
    // ce n'est pas une borne, c'est une URL bricolee. L'ecran retombe au palier.
    await page.goto('/depenses?n=999999')
    await expect(page.getByTestId('liste-depenses').getByRole('listitem')).toHaveCount(20)
  })
})
```

- [x] **Step 3 : Lancer les parcours sur une base neuve**

Run: `task test:e2e:frais`
Expected: PASS, dont les deux canaris du solde à 1 145,80 €.

Si `toHaveCount(20)` échoue avec un compte plus élevé : les parcours antérieurs ont ajouté des lignes, ce qui ne change pas la borne — 20 reste 20. Si le compte est **inférieur** à 20, c'est la borne qui n'est pas appliquée : revenir à la Task 6.

- [x] **Step 4 : Committer**

```bash
git add apps/web/e2e/parcours.spec.ts
git commit -m "test(e2e): la liste s arrete a 20, et le formulaire vient d abord"
```

---

### Task 8 : Clôture

**Files:**
- Modify: `docs/superpowers/plans/2026-08-09-borner-la-liste-des-depenses.md` (ce fichier)

- [x] **Step 1 : Cocher toutes les cases de ce plan et retirer la ligne `**État :** en cours`**

`apps/web/test/plans.test.ts` refuse un plan silencieux : soit il déclare être en cours, soit ses cases sont cochées. Retirer la déclaration est le geste de clôture.

- [x] **Step 2 : La séquence complète de la CI, en local**

Run: `task ci`
Expected: PASS de bout en bout. **DESTRUCTIF** — la base locale est réinitialisée.

- [x] **Step 3 : Committer**

```bash
git add docs/superpowers/plans/2026-08-09-borner-la-liste-des-depenses.md
git commit -m "docs(plans): G2 livre, cases cochees"
```

Le push et l'ouverture de la PR reviennent à l'humain, après une dernière relecture de
toute la branche — ce n'est pas ce commit de clôture qui les déclenche.

---

## Ce que ce plan ne fait pas

- **Aucune migration.** Le schéma ne change pas. `date` porte déjà un index, et à l'échelle du couple le `date_trunc` de `listerMoisDepenses` se lit en séquentiel sans effet mesurable.
- **Aucun `decalage`.** « Voir plus » est cumulatif ; rien n'a d'offset à passer.
- **Aucun filtre par type dans l'UI.** #28 l'avait écarté, borner la liste ne change pas cet arbitrage.
