# G1 — Supprimer une dépense : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec :** `docs/superpowers/specs/2026-08-09-supprimer-une-depense-design.md`
**Issue :** [#40](https://github.com/tjarrier/HomeBudget/issues/40)

**Goal :** une dépense saisie par erreur se supprime depuis le téléphone, et le solde
revient exactement à sa valeur d'avant.

**Architecture :** un `DELETE` de la ligne, rien d'autre. La façade `packages/db`
gagne `supprimerDepense(id)`, une Server Action l'appelle, une croix par ligne de
l'historique la déclenche derrière un `confirm()` natif. **Aucune migration**
(le `DELETE` sur `depense` n'a jamais été bloqué) et **aucune fonction dans
`packages/domain`** (supprimer ne calcule rien).

**Tech stack :** TypeScript, Drizzle + Postgres, Next.js App Router (Server Actions),
Vitest, Playwright.

## Global Constraints

- **L'argent est un entier de centimes.** Aucun flottant nulle part.
- **Règle 4 — snapshot on write.** Aucune lecture ne recalcule jamais une part. Ce
  plan n'écrit aucun calcul : s'il t'en vient un, tu t'es trompé de tâche.
- **`drizzle-kit push` est interdit**, et ici sans objet : ce plan ne génère
  **aucune** migration. Si tu en écris une, relis la spec.
- **`apps/web` est UI seulement.** Elle n'importe que la façade de `@homebudget/db`,
  liste blanche `FACADE_DB` de `apps/web/test/architecture.test.ts`.
- **Toute Server Action appelle `exigerSession()` en première ligne**, verrouillé par
  `architecture.test.ts` (« chaque Server Action exige une session »).
- **Cible tactile plancher : 44 px** (`min-h-11` / `min-w-11`), issue C1.
- **Aucune couleur ne code un sens** (DESIGN.md). Un message d'échec utilise le token
  existant `text-destructive`, comme les deux formulaires de `/depenses`.
- **Le message d'échec de la façade est exactement :** `Cette dépense n'existe plus.`
  (apostrophe typographique `’` interdite — les autres messages du projet utilisent
  l'apostrophe droite `'` dans le code TypeScript ; recopie la chaîne telle quelle.)
- Les dates sont des chaînes ISO `YYYY-MM-DD`, jamais des objets `Date`.

## Structure des fichiers

| Fichier | Rôle |
| --- | --- |
| `packages/db/src/ecriture.ts` *(modifié)* | `supprimerDepense(id)` — le seul chemin de suppression du projet. |
| `packages/db/test/ecriture.test.ts` *(modifié)* | Le garde d'identifiant, sans Docker. |
| `packages/db/test/facade.integration.test.ts` *(modifié)* | Le verrou au centime, l'id inconnu, la charge générée régénérable. |
| `apps/web/actions/depenses.ts` *(modifié)* | `supprimerDepenseAction(id)`. |
| `apps/web/test/architecture.test.ts` *(modifié)* | `supprimerDepense` entre dans `FACADE_DB`. |
| `apps/web/components/bouton-supprimer-depense.tsx` *(créé)* | Le seul composant client de ce plan : `confirm()`, transition, message d'échec. |
| `apps/web/components/ligne-depense.tsx` *(modifié)* | Prop `supprimable`, `false` par défaut. |
| `apps/web/app/(app)/depenses/page.tsx` *(modifié)* | Active `supprimable` — et lui seul. |
| `apps/web/e2e/parcours.spec.ts` *(modifié)* | Le retour au centime, à l'écran, sur 360 px. |

---

### Task 1 : `supprimerDepense` dans la façade

**Files :**
- Modify: `packages/db/src/ecriture.ts` (ajout en fin de fichier)
- Test: `packages/db/test/ecriture.test.ts` (ajout en fin de fichier)
- Test: `packages/db/test/facade.integration.test.ts` (extraction d'un helper + nouveau `describe`)

**Interfaces :**
- Consomme : `db`, `depense` (`./client.js`, `./schema.js`), `eq` de `drizzle-orm` — déjà tous importés en tête de `ecriture.ts`.
- Produit : `supprimerDepense(id: string): Promise<void>`. Jette `Error("Cette dépense n'existe plus.")` si aucune ligne n'est retirée. Réexportée automatiquement par `packages/db/src/index.ts` (`export * from './ecriture.js'`) — **rien à ajouter dans `index.ts`**.

- [x] **Step 1 : Écrire le test unitaire du garde d'identifiant**

En fin de `packages/db/test/ecriture.test.ts`. Ajoute `supprimerDepense` à l'import
existant de `'../src/ecriture.js'` (il n'importe aujourd'hui que
`calculerPartsPourSaisie`).

```ts
/**
 * Le garde d'identifiant, verifiable SANS Docker : il jette avant de toucher au
 * pool, donc ce test tient dans la suite unitaire.
 *
 * `supprimerDepense` est joignable depuis une Server Action, c'est-a-dire depuis
 * un POST fabrique a la main. Sans ce garde, `db.delete(...)` transmet la chaine
 * a Postgres, qui repond `invalid input syntax for type uuid: "..."` — un
 * message de driver affiche tel quel a l'utilisateur par `enEchec`.
 */
describe('supprimerDepense — garde d identifiant', () => {
  it('refuse un identifiant qui n est pas un uuid, sans requete', async () => {
    await expect(supprimerDepense('pas-un-uuid')).rejects.toThrow("Cette dépense n'existe plus.")
  })
})
```

- [x] **Step 2 : Lancer le test, vérifier qu'il échoue**

```bash
pnpm --filter @homebudget/db exec vitest run test/ecriture.test.ts
```

Attendu : ÉCHEC — `supprimerDepense` n'est pas exportée par `../src/ecriture.js`
(erreur de type au chargement du module, ou `supprimerDepense is not a function`).

- [x] **Step 3 : Écrire `supprimerDepense`**

En fin de `packages/db/src/ecriture.ts` :

```ts
/**
 * Le format d'un uuid v4, tel que Postgres l'accepte pour `depense.id`.
 *
 * Frontiere de confiance : cette fonction est joignable depuis une Server
 * Action, donc depuis un POST fabrique a la main. Sans ce garde, une chaine
 * quelconque descend jusqu'au driver, qui repond `invalid input syntax for type
 * uuid` — un message de plomberie remonte tel quel a l'utilisateur par
 * `enEchec`. Meme message que la ligne absente : dans les deux cas, la depense
 * visee n'existe pas, et l'utilisateur n'a rien de plus a savoir.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Retire une depense. C'est la reponse a l'issue #40, et elle tient en une
 * ligne de SQL : le solde revient a sa valeur d'avant PAR CONSTRUCTION, parce
 * que `resumer()` est une somme sur les lignes presentes — retirer un terme
 * rend exactement la somme precedente. Rien n'est recalcule, rien n'est
 * compense, la regle 4 n'est pas concernee.
 *
 * L'append-only (regle 3) ne s'y oppose pas : c'est une regle de la CONFIG, qui
 * existe parce qu'une version est une piece d'archive dont dependent des parts
 * figees ailleurs. Une depense ne porte rien.
 *
 * JETTE quand aucune ligne n'est retiree. « Zero ligne supprimee » n'est pas un
 * succes : c'est le double clic, le retour arriere, ou le second telephone qui a
 * deja supprime la ligne. Un `void` muet ferait afficher « supprimee » sur une
 * action qui n'a rien fait — la meme erreur que le `vercel env add` qui sortait
 * en 0 sans rien ecrire.
 */
export async function supprimerDepense(id: string): Promise<void> {
  if (!UUID.test(id)) throw new Error("Cette dépense n'existe plus.")

  const supprimees = await db
    .delete(depense)
    .where(eq(depense.id, id))
    .returning({ id: depense.id })

  if (supprimees.length === 0) throw new Error("Cette dépense n'existe plus.")
}
```

- [x] **Step 4 : Relancer le test unitaire**

```bash
pnpm --filter @homebudget/db exec vitest run test/ecriture.test.ts
```

Attendu : SUCCÈS.

- [x] **Step 5 : Extraire le seed du canari d'intégration dans un helper**

Dans `packages/db/test/facade.integration.test.ts`, le bloc `describe('LE CANARI, vu
par la facade')` (vers la ligne 670) contient ~45 lignes de mise en place que le
nouveau test doit rejouer à l'identique. On les extrait **sans toucher à une seule
assertion du canari**.

Ajoute cette fonction juste au-dessus de `describe('LE CANARI, vu par la facade')` :

```ts
/**
 * Rejoue les 33 lignes reelles du Sheet dans la base, versions comprises.
 *
 * Extrait du canari pour que le test de suppression parte du MEME etat : deux
 * copies de cette mise en place divergeraient, et c'est precisement le solde de
 * reference qui perdrait son sens.
 */
async function importerLeSheetDansLaBase(): Promise<void> {
  const idsReels = new Map<string, string>()
  for (const v of VERSIONS_INITIALES) {
    const { rows } = await db.execute<{ id: string }>(sql`
      select * from creer_version_config(
        ${v.libelle}, ${v.dateDebut}::date, ${v.salaireNetThomas}, ${v.salaireNetLiz},
        ${JSON.stringify(v.chargesCommunes)}::jsonb,
        ${JSON.stringify(v.chargesPersoThomas)}::jsonb,
        ${JSON.stringify(v.chargesPersoLiz)}::jsonb
      )
    `)
    const ligne = rows[0]
    if (!ligne) throw new Error('creer_version_config n a rien renvoye')
    idsReels.set(v.id, ligne.id)
  }

  const csv = await import('node:fs').then((fs) =>
    fs.readFileSync(
      new URL('../../../docs/data/sheet-export-2026-07-12/depenses.csv', import.meta.url),
      'utf-8',
    ),
  )

  await db.insert(depense).values(
    importerDepenses(csv, VERSIONS_INITIALES).map((d) => {
      const versionId = idsReels.get(d.versionConfigId)
      if (!versionId) throw new Error(`Version inconnue : ${d.versionConfigId}`)
      return {
        date: d.date,
        description: d.description,
        montantCents: d.montant,
        payePar: d.payePar,
        type: d.type,
        modeRepartition: d.mode,
        partThomasCents: d.parts.thomas,
        partLizCents: d.parts.liz,
        versionConfigId: versionId,
        genereAuto: d.genereAuto,
        commentaire: d.commentaire,
      }
    }),
  )
}
```

Puis remplace le corps du `it('rend exactement 114 580 centimes apres relecture depuis
Postgres')` par :

```ts
    // Le canari du plan 1 tourne sur des objets en memoire. Celui-ci fait
    // l'aller-retour complet par la base : si un mapper inverse deux colonnes,
    // le solde bouge et ce test tombe. Ne l'ajuste pas — trouve ce qui a casse.
    await importerLeSheetDansLaBase()

    const r = resumer(await listerDepenses())

    expect(r.soldeThomas).toBe(114580)
    expect(formaterEuros(r.soldeThomas).replace(/[\xa0 ]/g, ' ')).toBe('1 145,80 €')
    expect(phraseSynthese(r).replace(/[\xa0 ]/g, ' ')).toBe('Liz doit 1 145,80 € à Thomas')
```

**Les trois assertions restent mot pour mot.** Si l'une d'elles change, tu as cassé le
canari — recommence.

- [x] **Step 6 : Écrire les trois tests d'intégration**

En fin de `packages/db/test/facade.integration.test.ts`. Ajoute `supprimerDepense` à
l'import existant de `'../src/ecriture.js'`.

```ts
describe('supprimerDepense', () => {
  /**
   * LE VERROU DE L'ISSUE #40, au centime : le solde du seed reel, une depense de
   * plus, puis sa suppression — et le solde doit revenir EXACTEMENT a 114 580.
   *
   * L'assertion du milieu n'est pas decorative. Sans elle, un `supprimerDepense`
   * qui ne supprimerait rien ET un `ajouterDepense` qui n'ajouterait rien
   * donneraient le meme vert.
   */
  it('rend au solde du seed sa valeur exacte', async () => {
    await importerLeSheetDansLaBase()
    expect(resumer(await listerDepenses()).soldeThomas).toBe(114580)

    // Datee dans la derniere version du Sheet, sinon `versionEnVigueurLe` n'a
    // aucune version a proposer. Payee par Liz : la dette bouge a coup sur.
    const ajoutee = await ajouterDepense({
      date: '2026-07-10',
      description: 'Coquille de saisie',
      montant: 5000,
      payePar: 'liz',
      type: 'courante',
      mode: 'moitie',
    })
    expect(resumer(await listerDepenses()).soldeThomas).not.toBe(114580)

    await supprimerDepense(ajoutee.id)

    expect(resumer(await listerDepenses()).soldeThomas).toBe(114580)
    expect(phraseSynthese(resumer(await listerDepenses())).replace(/[\xa0 ]/g, ' ')).toBe(
      'Liz doit 1 145,80 € à Thomas',
    )
  })

  /**
   * Le chemin d'erreur, verrouille la ou il nait. « Zero ligne supprimee » doit
   * se dire : c'est le double clic et le second telephone.
   */
  it('jette quand la depense n existe deja plus', async () => {
    await expect(supprimerDepense('00000000-0000-4000-8000-000000000000')).rejects.toThrow(
      "Cette dépense n'existe plus.",
    )
  })

  /**
   * La seule consequence non evidente de « toutes les depenses sont
   * supprimables » : l'index partiel de la migration 0008 relache son unicite
   * avec la ligne, donc le mois redevient generable. C'est ainsi qu'on repare
   * une charge fixe generee au mauvais payeur.
   */
  it('rouvre le mois d une charge generee a la regeneration', async () => {
    await creerVersion(V1)

    const premiere = await genererChargeFixeDuMois('2026-08', 'thomas')
    expect(premiere.creee).toBe(true)
    expect((await genererChargeFixeDuMois('2026-08', 'thomas')).creee).toBe(false)

    await supprimerDepense(premiere.depense.id)

    expect((await genererChargeFixeDuMois('2026-08', 'liz')).creee).toBe(true)
  })
})
```

**À propos de `V1`** : la constante existe déjà au niveau du module
(`packages/db/test/facade.integration.test.ts:467`), ouverte depuis le `2026-01-01` —
elle couvre donc `2026-08`. N'en écris pas une seconde.

**Une date en dur qui périmera** : `2026-08` doit rester dans l'horizon d'un an de
`verifierDatePlausible`, que `genererChargeFixeDuMois` applique. Après le 2027-08 ce
test tombera, et la réparation sera d'en déplacer le mois — pas de toucher à
l'horizon.

- [x] **Step 7 : Lancer les tests d'intégration**

```bash
task db:up
task test:integration
```

Attendu : SUCCÈS, canari inclus (`rend exactement 114 580 centimes`).

- [x] **Step 8 : Commit**

```bash
git add packages/db/src/ecriture.ts packages/db/test/ecriture.test.ts \
        packages/db/test/facade.integration.test.ts
git commit -m "feat(db): supprimerDepense, et le solde revient au centime"
```

---

### Task 2 : la Server Action

**Files :**
- Modify: `apps/web/actions/depenses.ts` (ajout en fin de fichier)
- Modify: `apps/web/test/architecture.test.ts` (constante `FACADE_DB`, ~ligne 129)

**Interfaces :**
- Consomme : `supprimerDepense(id: string): Promise<void>` (Task 1), `exigerSession()`, `enEchec`, `revalidatePath` — tous déjà importés dans le fichier sauf `supprimerDepense`.
- Produit : `supprimerDepenseAction(id: string): Promise<Resultat<null>>`, où `Resultat<T> = { ok: true; valeur: T } | { ok: false; message: string }`.

- [x] **Step 1 : Vérifier que la liste blanche refuse le nouvel import**

Ajoute `supprimerDepense` à l'import de `@homebudget/db` en tête de
`apps/web/actions/depenses.ts` (sans encore écrire l'action), puis :

```bash
pnpm --filter @homebudget/web exec vitest run test/architecture.test.ts
```

Attendu : ÉCHEC — `actions/depenses.ts : supprimerDepense`. C'est le filet qui
fonctionne : on ne le contourne pas, on l'enregistre.

- [x] **Step 2 : Ouvrir la liste blanche**

Dans `apps/web/test/architecture.test.ts`, ajoute `'supprimerDepense'` au tableau
`FACADE_DB`, juste après `'ajouterDepense'` :

```ts
const FACADE_DB = [
  'listerVersions',
  'listerDepenses',
  'ajouterDepense',
  'supprimerDepense',
  'creerVersion',
  'calculerPartsPourSaisie',
  'genererChargeFixeDuMois',
  'SaisieDepense',
  'SaisieVersion',
]
```

- [x] **Step 3 : Écrire l'action**

En fin de `apps/web/actions/depenses.ts` :

```ts
/**
 * Supprime une depense (issue #40).
 *
 * Un identifiant suffit : il n'y a pas de formulaire a valider, donc ni
 * `FormData` ni etat precedent a chainer — la signature `useActionState` des
 * deux autres actions de ce fichier serait du ceremonial pour rien.
 *
 * `exigerSession()` en PREMIERE ligne : une Server Action est un endpoint HTTP,
 * joignable sans jamais charger la page.
 */
export async function supprimerDepenseAction(id: string): Promise<Resultat<null>> {
  await exigerSession()
  try {
    await supprimerDepense(id)
    // Le solde affiche doit suivre l'effacement, sur les deux ecrans.
    revalidatePath('/')
    revalidatePath('/depenses')
    return { ok: true, valeur: null }
  } catch (e) {
    return enEchec(e)
  }
}
```

- [x] **Step 4 : Relancer les tests web**

```bash
pnpm --filter @homebudget/web test
pnpm --filter @homebudget/web typecheck
```

Attendu : SUCCÈS, y compris « chaque Server Action exige une session » — qui vérifie
statiquement que le fichier appelle `exigerSession()`.

- [x] **Step 5 : Commit**

```bash
git add apps/web/actions/depenses.ts apps/web/test/architecture.test.ts
git commit -m "feat(web): supprimerDepenseAction, et la facade s'ouvre d'un nom"
```

---

### Task 3 : la croix dans l'historique

**Files :**
- Create: `apps/web/components/bouton-supprimer-depense.tsx`
- Modify: `apps/web/components/ligne-depense.tsx`
- Modify: `apps/web/app/(app)/depenses/page.tsx` (ligne 53)

**Interfaces :**
- Consomme : `supprimerDepenseAction(id): Promise<Resultat<null>>` (Task 2), `formaterEuros(cents: number): string` de `@homebudget/domain`.
- Produit : `<BoutonSupprimerDepense id description montant />` et la prop `supprimable?: boolean` de `<LigneDepense />` (défaut `false`).
- Nom accessible du bouton, sur lequel s'appuie la Task 4 : `` Supprimer « ${description} » `` — guillemets français, **espaces ordinaires** (une espace insécable ne se comparerait pas à celle du test).

- [x] **Step 1 : Écrire le composant client**

Crée `apps/web/components/bouton-supprimer-depense.tsx` :

```tsx
'use client'

import { supprimerDepenseAction } from '@/actions/depenses'
import { formaterEuros } from '@homebudget/domain'
import { useState, useTransition } from 'react'

/**
 * La croix de suppression d'une ligne d'historique (issue #40).
 *
 * `window.confirm()` NATIF, et non un dialogue maison : accessible partout,
 * pilotable par Playwright (`page.once('dialog', ...)`), zero composant a
 * ecrire, zero piege de focus a tenir. Echelon 4 de l'echelle.
 *
 * PAS de suppression optimiste : la ligne disparait quand le serveur a
 * revalide, jamais avant. Sur une liste dont l'unique raison d'etre est de
 * prouver que rien ne bouge apres coup, faire disparaitre une ligne qui peut
 * revenir serait le pire des mensonges d'affichage.
 *
 * Le nom accessible porte la description : sans lui, une liste de trente
 * depenses offre trente boutons homonymes a un lecteur d'ecran comme a
 * Playwright.
 */
export function BoutonSupprimerDepense({
  id,
  description,
  montant,
}: { id: string; description: string; montant: number }) {
  const [enCours, demarrer] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        aria-label={`Supprimer « ${description} »`}
        disabled={enCours}
        // `min-h-11 min-w-11` = les 44px du plancher tactile (issue C1), tenus
        // ICI parce que ce bouton ne passe pas par la primitive `Button` : il
        // n'a ni fond, ni bordure, ni `px-5`. `-mr-1.5` le ramene contre le
        // bord de la carte sans reduire sa cible.
        className="-mr-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-faint transition-colors hover:bg-muted hover:text-body focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        onClick={() => {
          if (!window.confirm(`Supprimer « ${description} » (${formaterEuros(montant)}) ?`)) return
          demarrer(async () => {
            const resultat = await supprimerDepenseAction(id)
            setErreur(resultat.ok ? null : resultat.message)
          })
        }}
      >
        <span aria-hidden="true">×</span>
      </button>

      {/* `basis-full` : dans le `<li>` en `flex flex-wrap`, le message prend une
          ligne entiere SOUS la depense, plutot que de s'ecraser dans la colonne
          de 44px du bouton. Une classe, aucun niveau de DOM en plus. */}
      {erreur ? (
        <p
          role="alert"
          data-testid="erreur-suppression"
          className="basis-full text-sm text-destructive"
        >
          {erreur}
        </p>
      ) : null}
    </>
  )
}
```

- [x] **Step 2 : Brancher `LigneDepense`**

Dans `apps/web/components/ligne-depense.tsx` :

1. Ajoute l'import : `import { BoutonSupprimerDepense } from '@/components/bouton-supprimer-depense'`
2. Étends la signature et le `<li>` :

```tsx
export function LigneDepense({
  depense,
  avecPayeur = true,
  supprimable = false,
}: { depense: Depense; avecPayeur?: boolean; supprimable?: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-3.5 border-t border-subtle py-3 first:border-t-0">
```

3. Après le `<Montant …niveau="courant" />` final, avant la fermeture du `<li>` :

```tsx
      {/* Opt-in, jamais par defaut : le tableau de bord affiche les memes
          lignes, et on y vient LIRE un solde. Un appelant futur n'herite pas
          d'un bouton de suppression sans l'avoir demande. */}
      {supprimable ? (
        <BoutonSupprimerDepense
          id={depense.id}
          description={depense.description}
          montant={depense.montant}
        />
      ) : null}
```

Complète le docstring du composant d'un paragraphe :

```
 * `supprimable` est OPT-IN (issue #40) : seul l'historique de `/depenses`
 * l'active, parce que c'est l'ecran de la correction — le formulaire de saisie
 * y est deja cote a cote pour resaisir.
```

- [x] **Step 3 : Activer la prop sur `/depenses` uniquement**

Dans `apps/web/app/(app)/depenses/page.tsx`, ligne 53 :

```tsx
                  <LigneDepense key={d.id} depense={d} supprimable />
```

**Ne touche pas** à `apps/web/app/(app)/page.tsx:174` : le tableau de bord reste en
lecture seule.

- [x] **Step 4 : Vérifier types, lint et suite unitaire**

```bash
task verif
```

Attendu : SUCCÈS. `apps/web/test/cibles-tactiles.test.ts` ne couvre que les quatre
primitives de `components/ui/` — ce bouton n'en est pas une, c'est le balayage e2e
de la Task 4 qui mesurera sa boîte réelle.

- [x] **Step 5 : Commit**

```bash
git add apps/web/components/bouton-supprimer-depense.tsx \
        apps/web/components/ligne-depense.tsx "apps/web/app/(app)/depenses/page.tsx"
git commit -m "feat(web): une croix par ligne d'historique, derriere un confirm"
```

---

### Task 4 : le parcours téléphone

**Files :**
- Modify: `apps/web/e2e/parcours.spec.ts` (nouveau test, **après** le test « generer la charge du mois », vers la ligne 184)

**Interfaces :**
- Consomme : le helper `soldeEnCentimes(page)` déjà défini en tête du fichier (il lit l'attribut `value` du `<data>` de `phrase-synthese`, donc un entier de centimes) et le nom accessible `` Supprimer « … » `` de la Task 3.

- [x] **Step 1 : Écrire le test**

Insère-le **après** le test `generer la charge du mois, deux fois, ne l ecrit qu une
fois` et **avant** `creer une version ne change aucune depense passee`, à l'intérieur
du `describe('parcours authentifies')` :

```ts
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
    test.use(TELEPHONE)

    await page.goto('/')
    const avant = await soldeEnCentimes(page)

    await page.goto('/depenses')
    await page.getByRole('button', { name: 'Modifier' }).click()
    const description = 'Coquille a supprimer'
    await page.fill('input[name="date"]', '2026-07-11')
    await page.fill('input[name="description"]', description)
    await page.fill('input[name="montant"]', '40,00')
    await page.selectOption('select[name="payePar"]', 'thomas')
    await page.selectOption('select[name="type"]', 'courante')
    await page.getByRole('button', { name: 'Ajouter la dépense' }).click()
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
```

**Si `test.use(TELEPHONE)` à l'intérieur d'un `test()` est refusé par Playwright**
(il n'est valide qu'au niveau d'un fichier ou d'un `describe`), enveloppe le test
dans son propre bloc :

```ts
  test.describe('suppression d une depense (issue #40)', () => {
    test.use(TELEPHONE)
    // … le test ci-dessus, sans la ligne `test.use(TELEPHONE)`
  })
```

- [x] **Step 2 : Préparer l'environnement e2e du worktree**

Ce dépôt est un worktree : les `.env` ne sont pas versionnés, et un conteneur
`homebudget-db` du checkout principal peut occuper le port.

```bash
cp ../../../.env .env 2>/dev/null || true
cp ../../../apps/web/.env.local apps/web/.env.local 2>/dev/null || true
docker rm -f homebudget-db 2>/dev/null || true
```

Vérifie que `.env` et `apps/web/.env.local` existent avant de continuer ; sans eux,
la session Playwright ne s'ouvre pas et l'échec ne ressemble pas à sa cause.

- [x] **Step 3 : Lancer les parcours**

```bash
task test:e2e:frais
```

Attendu : SUCCÈS, tous parcours confondus — dont les deux canaris de lecture du seed,
qui doivent rester **avant** toute écriture.

- [x] **Step 4 : Commit**

```bash
git add apps/web/e2e/parcours.spec.ts
git commit -m "test(e2e): supprimer une depense rend au solde sa valeur exacte"
```

---

### Task 5 : clôture

**Files :**
- Modify: `docs/superpowers/plans/2026-08-09-supprimer-une-depense.md` (ce fichier)

- [x] **Step 1 : Vérification complète**

```bash
task verif
task test:integration
```

Attendu : SUCCÈS aux deux. Ne déclare rien de fini avant d'avoir lu les deux verdicts.

- [x] **Step 2 : Cocher toutes les cases de ce plan et retirer l'état**

Coche chaque `- [ ]` en `- [x]`, **et supprime la ligne `**État :** en cours`** sous
le titre. `apps/web/test/plans.test.ts` refuse un plan silencieux : sans le marqueur,
il exige zéro case vide. Relance :

```bash
pnpm --filter @homebudget/web exec vitest run test/plans.test.ts
```

- [x] **Step 3 : Commit et PR**

```bash
git add docs/superpowers/plans/2026-08-09-supprimer-une-depense.md
git commit -m "docs(plans): G1 livre, cases cochees"
git push -u origin g1-corriger-ou-annuler-une-depense-saisie
gh pr create --title "G1 — Supprimer une depense saisie par erreur" --body "$(cat <<'EOF'
Closes #40.

La decision prealable de l'issue est tranchee dans la spec : **suppression franche**,
pas de contre-ecriture. L'append-only est une regle de la config, pas des depenses, et
la regle 4 n'est pas concernee — supprimer ne recalcule rien, le solde revient par
construction.

- `supprimerDepense(id)` dans la facade, qui jette quand la ligne n'existe deja plus.
- Une croix par ligne de `/depenses`, derriere un `confirm()` natif. Le tableau de
  bord reste en lecture seule.
- Le verrou de l'issue, au centime : seed reel -> ajout -> suppression -> 114 580
  exactement (`facade.integration.test.ts`), et le meme aller-retour a l'ecran sur
  360 px (`parcours.spec.ts`).

Aucune migration : le `DELETE` sur `depense` n'a jamais ete bloque.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Ce que ce plan n'écrit PAS

- **Aucune migration.** Le `DELETE` sur `depense` n'a jamais été bloqué : la 0002
  protège `version_config` seule, la FK `restrict` protège la version *depuis* la
  dépense, et le trigger de la 0004 porte sur `insert or update`.
- **Aucune fonction dans `packages/domain`.** L'issue porte le label `domaine` ; il ne
  correspond à rien ici, et c'est le signe que la suppression franche était le bon
  choix.
- **Aucune corbeille, aucun undo.** La sauvegarde nocturne est le filet
  (`docs/superpowers/specs/2026-08-02-sauvegarde-restauration-prod-design.md`).
- **Aucun pré-remplissage du formulaire** depuis la ligne effacée : corriger, c'est
  supprimer puis resaisir dans le formulaire déjà côte à côte.
- **Aucun test e2e du chemin d'erreur de l'UI.** Rejouer « la ligne a déjà été
  supprimée » dans le navigateur demanderait deux sessions concurrentes ; le message
  est verrouillé là où il naît, en Task 1.
