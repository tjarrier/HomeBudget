# E8 — Date de dépense hors fenêtre plausible : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refuser, avec un message compréhensible et avant toute écriture en base, une dépense datée à plus d'un an dans l'avenir.

**Architecture :** La règle est une fonction pure de `packages/domain` (`verifierDatePlausible`), appelée depuis `calculerPartsPourSaisie()` — le point de passage commun à l'aperçu en direct et à l'écriture réelle. Le formulaire pose en plus un `max` sur son champ date, calculé par **la même fonction du domaine**, pour que le sélecteur natif grise l'au-delà. La borne basse n'est pas retouchée : `versionEnVigueurLe` la tient déjà.

**Tech Stack :** TypeScript, Vitest, Next.js (App Router), pnpm workspaces, Biome.

**Spec :** `docs/superpowers/specs/2026-07-30-date-depense-hors-fenetre-design.md`
**Issue :** [#29](https://github.com/tjarrier/HomeBudget/issues/29)

## Global Constraints

- **L'argent est un entier de centimes.** Aucun flottant. (Sans objet ici, mais aucune tâche ne doit l'introduire.)
- **Les dates sont des chaînes ISO `YYYY-MM-DD`, jamais des objets `Date`.** Un objet `Date` porte un fuseau et décale les bornes d'un jour. `Date` ne sert qu'en **UTC**, en interne, et n'est jamais exposé — exactement comme `veilleDe` (`packages/domain/src/config-version.ts:160`).
- **`packages/domain` a zéro dépendance de production** et reste **pur** : aucune lecture d'horloge n'y est autorisée. `aujourdhui` est toujours un paramètre.
- **`apps/web` n'importe de `@homebudget/db` que la façade en liste blanche** (`apps/web/test/architecture.test.ts:129`). Ce plan n'y ajoute **aucun** nom. `@homebudget/domain` est en revanche librement importable.
- **L'aperçu et l'écriture partagent `calculerPartsPourSaisie()`.** Ne jamais les dédoubler : un aperçu qui diverge de l'écriture est un mensonge affiché.
- **Le canari du solde vaut 114 580 centimes** et ne doit pas bouger (`packages/db/test/import-sheet.test.ts`, `facade.integration.test.ts`, `apps/web/e2e/parcours.spec.ts`).
- **Commentaires de code sans accents** (convention du dépôt) ; **messages destinés à l'utilisateur avec toutes leurs accentuations**.
- **Aucune migration SQL**, aucun `drizzle-kit push`.
- Porte avant commit : `task verif` (lint + typecheck + test).

## Structure des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| `packages/domain/src/config-version.ts` | **Modifier** : rendre `assertDateIsoValide` exportée | 1 |
| `packages/domain/src/horizon-saisie.ts` | **Créer** : `dateMaxDepense`, `verifierDatePlausible` — la règle, et rien d'autre | 1 |
| `packages/domain/src/index.ts` | **Modifier** : réexporter le nouveau module | 1 |
| `packages/domain/test/horizon-saisie.test.ts` | **Créer** : les bornes, le 29 février, les dates invalides | 1 |
| `packages/domain/test/config-version.test.ts` | **Modifier** : annoter le test `2030-01-01` (qui tient quelle borne) | 1 |
| `packages/db/src/ecriture.ts` | **Modifier** : `aujourdhuiIso()` privé + appel de la garde dans `calculerPartsPourSaisie` | 2 |
| `packages/db/test/facade.integration.test.ts` | **Modifier** : la dépense lointaine n'atteint pas la base | 2 |
| `apps/web/app/(app)/depenses/formulaire-depense.tsx` | **Modifier** : `max` sur le champ date | 3 |
| `apps/web/test/borne-date-saisie.test.ts` | **Créer** : test statique du `max` | 3 |

Trois tâches, dans cet ordre : le domaine ne dépend de rien, la façade dépend du domaine, le formulaire dépend du domaine. Chacune est committable et testable seule.

---

### Task 1 : La règle, dans le domaine

**Files:**
- Create: `packages/domain/src/horizon-saisie.ts`
- Create: `packages/domain/test/horizon-saisie.test.ts`
- Modify: `packages/domain/src/config-version.ts:174` (exporter `assertDateIsoValide`)
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/test/config-version.test.ts:102-104` (commentaire seulement)

**Interfaces:**
- Consomme : `assertDateIsoValide(date: string): void` de `./config-version.js` — aujourd'hui **privée**, à rendre exportée. Elle valide la forme `YYYY-MM-DD` zéro-paddée **et** la validité calendaire réelle (`2026-02-30` est refusée).
- Produit :
  - `dateMaxDepense(aujourdhui: string): string` — le dernier jour acceptable, un an après `aujourdhui`, en ISO.
  - `verifierDatePlausible(date: string, aujourdhui: string): void` — jette si `date > dateMaxDepense(aujourdhui)`. Les tâches 2 et 3 consomment ces deux noms depuis `@homebudget/domain`.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `packages/domain/test/horizon-saisie.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { dateMaxDepense, verifierDatePlausible } from '../src/horizon-saisie.js'

describe('dateMaxDepense', () => {
  it('rend le meme jour de calendrier, un an plus tard', () => {
    expect(dateMaxDepense('2026-07-30')).toBe('2027-07-30')
  })

  it('rabat le 29 fevrier sur le 28, sans deborder sur mars', () => {
    // 2028 est bissextile, 2029 ne l'est pas. L'arithmetique naive de JS rend
    // 2029-03-01 : un jour d'horizon gagne en silence, exactement le genre de
    // decalage d'un jour contre lequel `veilleDe` se premunit deja.
    expect(dateMaxDepense('2028-02-29')).toBe('2029-02-28')
  })

  it('traverse une fin de mois sans deriver', () => {
    expect(dateMaxDepense('2026-12-31')).toBe('2027-12-31')
    expect(dateMaxDepense('2026-01-01')).toBe('2027-01-01')
  })

  it('refuse une date ISO non zero-paddee plutot que de la deviner', () => {
    expect(() => dateMaxDepense('2026-7-1')).toThrow(/invalide/i)
  })
})

describe('verifierDatePlausible', () => {
  const AUJOURDHUI = '2026-07-30'

  it('accepte la limite exacte', () => {
    // La borne est INCLUSIVE : le dernier jour acceptable passe.
    expect(() => verifierDatePlausible('2027-07-30', AUJOURDHUI)).not.toThrow()
  })

  it('refuse le lendemain de la limite', () => {
    expect(() => verifierDatePlausible('2027-07-31', AUJOURDHUI)).toThrow(
      /2027-07-31[\s\S]*2027-07-30/,
    )
  })

  it('accepte aujourd hui', () => {
    expect(() => verifierDatePlausible(AUJOURDHUI, AUJOURDHUI)).not.toThrow()
  })

  it("refuse la date aberrante du Sheet d'origine", () => {
    // La ligne 5 de l'export portait 2029-09-29 pour 2025-09-29. C'est le cas
    // reel qui a motive l'issue #29.
    expect(() => verifierDatePlausible('2029-09-29', AUJOURDHUI)).toThrow(/trop lointaine/i)
  })

  it('dit POURQUOI la date est refusee, pas seulement qu elle l est', () => {
    // Les parts sont figees pour toujours a la creation et rien ne permet de
    // reparer une depense passee : le message doit porter cette information,
    // sinon l'utilisateur croit a une lubie de l'application.
    expect(() => verifierDatePlausible('2029-09-29', AUJOURDHUI)).toThrow(/fig/i)
  })

  it("n'a aucune opinion sur le passe, meme lointain", () => {
    // La borne BASSE appartient a `versionEnVigueurLe`, qui la produit deja avec
    // ses mots (« Aucune version de config ne couvre le ... »). Deux messages
    // pour la meme cause diraient la meme chose, moins bien.
    expect(() => verifierDatePlausible('1999-01-01', AUJOURDHUI)).not.toThrow()
  })

  it('refuse une date impossible au calendrier', () => {
    expect(() => verifierDatePlausible('2026-02-30', AUJOURDHUI)).toThrow(/invalide/i)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter @homebudget/domain test
```

Attendu : ÉCHEC — `Failed to resolve import "../src/horizon-saisie.js"`.

- [ ] **Step 3 : Exporter `assertDateIsoValide`**

Dans `packages/domain/src/config-version.ts` ligne 174, remplacer :

```ts
function assertDateIsoValide(date: string): void {
```

par :

```ts
export function assertDateIsoValide(date: string): void {
```

Le docstring au-dessus (lignes 168-173) reste inchangé. Aucun autre changement dans ce fichier.

> Pourquoi exporter plutôt que recopier : une seconde implémentation de la validation ISO divergerait tôt ou tard de celle-ci — et c'est précisément celle qui attrape le débordement silencieux de `Date.UTC` (mois 13, 30 février). `index.ts` fait `export *`, donc le nom devient public : c'est voulu, c'est une brique légitime du domaine.

- [ ] **Step 4 : Écrire l'implémentation minimale**

Créer `packages/domain/src/horizon-saisie.ts` :

```ts
import { assertDateIsoValide } from './config-version.js'

/**
 * Combien de temps dans l'avenir une depense reste plausible.
 *
 * Au-dela, c'est une coquille de saisie — le Sheet d'origine portait une ligne
 * datee 2029-09-29 pour 2025-09-29. La frontiere est binaire, volontairement :
 * une depense datee dans l'annee a venir est legitime (un prelevement annonce,
 * une regularisation), au-dela il n'existe pas de cas d'usage.
 */
const HORIZON_ANNEES = 1

/**
 * Le dernier jour acceptable pour une depense : un an apres `aujourdhui`,
 * borne INCLUSE.
 *
 * `Date` est utilise en UTC uniquement, jamais expose : un objet Date porte un
 * fuseau, et un decalage d'un jour ici deplacerait la borne (meme prudence que
 * `veilleDe`).
 *
 * Le 29 fevrier est le piege : `Date.UTC(2029, 1, 29)` deborde silencieusement
 * sur le 1er mars, parce que 2029 n'est pas bissextile. On detecte le
 * debordement au changement de mois et on rabat sur le dernier jour du mois
 * voulu, plutot que d'offrir un jour d'horizon supplementaire par accident.
 */
export function dateMaxDepense(aujourdhui: string): string {
  assertDateIsoValide(aujourdhui)
  const [a, m, j] = aujourdhui.split('-').map(Number) as [number, number, number]
  const max = new Date(Date.UTC(a + HORIZON_ANNEES, m - 1, j))
  if (max.getUTCMonth() !== m - 1) {
    // `setUTCDate(0)` recule au dernier jour du mois precedent — donc au dernier
    // jour du mois qu'on visait.
    max.setUTCDate(0)
  }
  return max.toISOString().slice(0, 10)
}

/**
 * Refuse une date de depense trop lointaine.
 *
 * N'a AUCUNE opinion sur la borne basse : elle est tenue par
 * `versionEnVigueurLe`, qui ne trouve aucune version couvrant une date
 * anterieure a la premiere et le dit deja avec ses mots.
 *
 * Pourquoi un refus et non un avertissement contournable : les parts d'une
 * depense sont figees POUR TOUJOURS a sa creation (regle 4 de CLAUDE.md), et
 * rien ne permet aujourd'hui de reparer une depense passee (issue #40). Un
 * avertissement qu'on franchit d'un clic serait donc un moyen d'ecrire une
 * ligne fausse et irreparable.
 */
export function verifierDatePlausible(date: string, aujourdhui: string): void {
  assertDateIsoValide(date)
  const max = dateMaxDepense(aujourdhui)
  // Comparaison lexicographique : elle est exacte sur des chaines YYYY-MM-DD
  // zero-paddees, et c'est deja ainsi que `versionEnVigueurLe` compare ses bornes.
  if (date > max) {
    throw new Error(
      `Date trop lointaine : le ${date} dépasse le ${max} (un an après aujourd’hui). Vérifiez l’année — les parts d’une dépense sont figées définitivement à sa création.`,
    )
  }
}
```

Puis ajouter la ligne dans `packages/domain/src/index.ts` :

```ts
export * from './config-version.js'
export * from './horizon-saisie.js'
export * from './money.js'
export * from './repartition.js'
export * from './types.js'
export * from './solde.js'
```

- [ ] **Step 5 : Lancer les tests du domaine et vérifier qu'ils passent**

```bash
pnpm --filter @homebudget/domain test
```

Attendu : tous verts, y compris les tests préexistants de `config-version.test.ts`, `money.test.ts`, `repartition.test.ts`, `solde.test.ts`.

- [ ] **Step 6 : Annoter le test qui décrit le trou**

`packages/domain/test/config-version.test.ts` lignes 102-104 contiennent aujourd'hui :

```ts
  it('trouve la version courante (dateFin null) pour une date lointaine', () => {
    expect(versionEnVigueurLe(versions, '2030-01-01').id).toBe('v2')
  })
```

Ce comportement est **correct et doit rester** : `versionEnVigueurLe` résout une version, elle ne juge pas la plausibilité. Mais tel quel, le test décrit littéralement le trou de l'issue #29. Le remplacer par :

```ts
  it('trouve la version courante (dateFin null) pour une date lointaine', () => {
    // Ce comportement est VOULU et ne doit pas etre « corrige » : une version
    // ouverte couvre tout ce qui suit sa dateDebut (migration 0004, ligne 39).
    // Ce n'est donc pas ici que 2030-01-01 est refuse — c'est
    // `verifierDatePlausible` (horizon-saisie.ts) qui tient la borne HAUTE, et
    // `calculerPartsPourSaisie` qui appelle les deux. Cette fonction-ci tient
    // la borne BASSE, et elle seule (voir le test juste en dessous).
    expect(versionEnVigueurLe(versions, '2030-01-01').id).toBe('v2')
  })
```

Aucun changement d'assertion : c'est un commentaire.

> Les deux tests de borne basse existent déjà (`config-version.test.ts:106` en unitaire, `facade.integration.test.ts:132` en intégration). On n'en écrit pas de troisième.

- [ ] **Step 7 : Lint, typecheck, tests**

```bash
task verif
```

Attendu : lint, typecheck et l'ensemble des tests unitaires au vert. Si Biome se plaint du formatage, lancer `task format` puis relancer.

- [ ] **Step 8 : Commit**

```bash
git add packages/domain/src/horizon-saisie.ts \
        packages/domain/src/config-version.ts \
        packages/domain/src/index.ts \
        packages/domain/test/horizon-saisie.test.ts \
        packages/domain/test/config-version.test.ts
git commit -m "feat(domain): borner a un an la date d une depense

La borne basse etait tenue par versionEnVigueurLe ; la borne haute
n existait nulle part. Une depense datee 2029 etait acceptee en silence
et ses parts figees pour toujours.

Refus et non avertissement : rien ne permet de reparer une depense
passee (#40), donc un avertissement contournable serait un moyen
d ecrire une ligne fausse et irreparable.

Refs #29"
```

---

### Task 2 : Brancher la garde sur le point de passage unique

**Files:**
- Modify: `packages/db/src/ecriture.ts:47-61`
- Modify: `packages/db/test/facade.integration.test.ts` (dans le `describe` qui contient `deuxVersions`, après le test « refuse une depense a une date qu aucune version ne couvre », ligne ~143)

**Interfaces:**
- Consomme : `verifierDatePlausible(date: string, aujourdhui: string): void` de `@homebudget/domain` (tâche 1).
- Produit : `calculerPartsPourSaisie(saisie: SaisieDepense, versions: VersionConfig[], aujourdhui?: string): PartsCalculees`. Le **troisième paramètre est optionnel** ; il vaut par défaut la date du jour côté serveur. Aucun appelant existant n'est à modifier, et **aucun nom nouveau n'entre dans la façade** : `aujourdhuiIso` reste privé au module (`index.ts` fait `export * from './ecriture.js'`, donc l'exporter le ferait fuiter dans la liste blanche de `apps/web/test/architecture.test.ts`).

- [ ] **Step 1 : Écrire le test d'intégration qui échoue**

Dans `packages/db/test/facade.integration.test.ts`, juste après le test « refuse une depense a une date qu aucune version ne couvre », insérer :

```ts
  /**
   * La borne HAUTE de la fenetre plausible (issue #29). Elle ne peut pas etre
   * ecrite en dur : le test doit rester vrai dans deux ans. On la construit
   * relativement a l'horloge — le 15 janvier de l'annee N+2 est toujours
   * au-dela d'un an apres aujourd'hui, quel que soit le jour de l'annee.
   */
  function dansDeuxAns(): string {
    return `${new Date().getUTCFullYear() + 2}-01-15`
  }

  it('refuse une depense datee a plus d un an, avant toute ecriture', async () => {
    await deuxVersions()

    await expect(
      ajouterDepense({
        date: dansDeuxAns(),
        description: 'Coquille d annee',
        montant: 5000,
        payePar: 'thomas',
        type: 'courante',
        mode: 'moitie',
      }),
    ).rejects.toThrow(/trop lointaine/i)

    // « Avant d'atteindre la base » : la garde n'a pas de valeur si la ligne est
    // ecrite puis l'erreur levee. La version courante etant ouverte, rien
    // d'autre n'aurait refuse cette date.
    const restantes = await listerDepenses()
    expect(restantes).toEqual([])
  })

  it('laisse passer une depense datee dans les mois a venir', async () => {
    // Le pendant du test precedent : interdire la sur-correction. Une depense
    // legitimement postdatee (prelevement annonce) doit toujours s ecrire.
    await deuxVersions()
    const dansUnMois = new Date()
    dansUnMois.setUTCDate(dansUnMois.getUTCDate() + 30)

    const d = await ajouterDepense({
      date: dansUnMois.toISOString().slice(0, 10),
      description: 'Prelevement annonce',
      montant: 5000,
      payePar: 'thomas',
      type: 'courante',
      mode: 'moitie',
    })

    expect(d.parts.thomas + d.parts.liz).toBe(d.montant)
  })
```

`listerDepenses` est déjà importé en tête du fichier (ligne 7).

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Postgres doit tourner (`task db:up` d'abord si besoin).

```bash
task test:integration
```

Attendu : ÉCHEC sur « refuse une depense datee a plus d un an » — la promesse est résolue au lieu d'être rejetée. Le second test (« laisse passer ») doit, lui, déjà passer.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Dans `packages/db/src/ecriture.ts`, ajouter `verifierDatePlausible` à l'import de `@homebudget/domain` (lignes 1-13, ordre alphabétique parmi les valeurs importées) :

```ts
import {
  type Cents,
  type Charge,
  type Depense,
  type ModeRepartition,
  type Parts,
  type Personne,
  type TypeDepense,
  type VersionConfig,
  calculerParts,
  ratioThomas,
  verifierDatePlausible,
  versionEnVigueurLe,
} from '@homebudget/domain'
```

Puis, juste avant `calculerPartsPourSaisie` (donc après l'interface `PartsCalculees`, ligne 37) :

```ts
/**
 * Aujourd'hui, en date ISO, d'apres l'horloge du SERVEUR.
 *
 * Volontairement NON exporte : `index.ts` fait `export *`, et la facade de
 * `packages/db` est une liste blanche verrouillee par
 * `apps/web/test/architecture.test.ts`. Rien a y ajouter pour cette regle.
 *
 * Lit l'horloge, donc impur — d'ou sa place ici et non dans le domaine, qui
 * recoit toujours `aujourdhui` en parametre. Le serveur peut tourner en UTC
 * pendant qu'on saisit a Paris : sur une fenetre d'un AN, un decalage de
 * quelques heures est sans consequence.
 */
function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10)
}
```

Enfin, modifier la signature et le corps de `calculerPartsPourSaisie` :

```ts
export function calculerPartsPourSaisie(
  saisie: SaisieDepense,
  versions: VersionConfig[],
  aujourdhui: string = aujourdhuiIso(),
): PartsCalculees {
  // Les DEUX bornes de la fenetre plausible, cote a cote :
  // - haute : plus d'un an dans l'avenir, c'est une coquille d'annee (#29) ;
  // - basse : anterieure a toute version, aucune regle n'est applicable.
  // Ancre ICI et non dans `normaliser()` cote web, parce que `ajouterDepense`
  // est joignable sans passer par le formulaire (tests, seed, futur import) :
  // c'est la facade elle-meme qu'il faut proteger.
  verifierDatePlausible(saisie.date, aujourdhui)
  const version = versionEnVigueurLe(versions, saisie.date)
  // `exactOptionalPropertyTypes` : on ne pose la cle que si elle a une valeur.
  const parts = calculerParts({
    montant: saisie.montant,
    mode: saisie.mode,
    payePar: saisie.payePar,
    ratioThomas: ratioThomas(version),
    ...(saisie.partsPersonnalisees ? { partsPersonnalisees: saisie.partsPersonnalisees } : {}),
  })
  return { parts, version }
}
```

Le docstring existant de `calculerPartsPourSaisie` (lignes 39-46) reste tel quel au-dessus.

- [ ] **Step 4 : Lancer les tests d'intégration et vérifier qu'ils passent**

```bash
task test:integration
```

Attendu : tout au vert, **y compris le canari du solde à 114 580 centimes** dans ce même fichier. Si le canari tombe, ne pas ajuster le test : une dépense légitime du seed a été refusée, donc la borne est mal calculée.

- [ ] **Step 5 : Vérifier que rien d'autre n'a bougé**

```bash
task verif
```

Attendu : lint, typecheck et tous les tests unitaires au vert — en particulier `packages/db/test/import-sheet.test.ts` (l'import passe par `versionEnVigueurLe` directement, pas par `calculerPartsPourSaisie` : il n'est pas touché) et `apps/web/test/architecture.test.ts` (aucun nom ajouté à la façade).

- [ ] **Step 6 : Commit**

```bash
git add packages/db/src/ecriture.ts packages/db/test/facade.integration.test.ts
git commit -m "feat(db): refuser une date de depense hors fenetre avant l ecriture

calculerPartsPourSaisie est le point de passage commun a l apercu et a
l ecriture : la garde y tient les deux bornes cote a cote. Le troisieme
parametre est optionnel, donc aucune signature d appelant ne change et
la facade ne gagne aucun nom.

Refs #29"
```

---

### Task 3 : Le champ date porte la borne

**Files:**
- Modify: `apps/web/app/(app)/depenses/formulaire-depense.tsx` (import ligne 16, champ date lignes 196-204)
- Create: `apps/web/test/borne-date-saisie.test.ts`

**Interfaces:**
- Consomme : `dateMaxDepense(aujourdhui: string): string` de `@homebudget/domain` (tâche 1), et la fonction locale `AUJOURDHUI()` déjà présente dans le fichier (ligne 21), qui date en heure **locale** — délibérément, un `toISOString()` proposerait demain quand on saisit à 23 h à Paris.
- Produit : rien que d'autres tâches consomment.

- [ ] **Step 1 : Écrire le test statique qui échoue**

Créer `apps/web/test/borne-date-saisie.test.ts` :

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Issue #29 — la borne haute des dates de depense.
 *
 * La VRAIE garde est serveur (`verifierDatePlausible`, appelee par
 * `calculerPartsPourSaisie`), et elle est testee dans le domaine et en
 * integration. Ce test-ci verrouille autre chose : que l'utilisateur ne puisse
 * pas CHOISIR la date aberrante dans le selecteur natif. Un refus qui n'arrive
 * qu'apres coup laisse remplir tout le formulaire pour rien.
 *
 * Il verifie aussi que la borne vient de la MEME fonction du domaine que le
 * serveur : une constante recopiee dans le composant divergerait un jour.
 */
function source(): string {
  const brut = readFileSync(
    fileURLToPath(new URL('../app/(app)/depenses/formulaire-depense.tsx', import.meta.url)),
    'utf-8',
  )
  // Sans depouiller les commentaires, une note qui citerait `dateMaxDepense`
  // suffirait a rendre le test vert alors que le composant ne l'appelle pas.
  return brut
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('le champ date du formulaire de depense porte la borne haute', () => {
  it('importe dateMaxDepense du domaine', () => {
    expect(source()).toMatch(/dateMaxDepense/)
  })

  it('pose un attribut max sur l input de type date', () => {
    const src = source()
    // La balise <Input ... type="date" ... /> en entier, attributs sur
    // plusieurs lignes compris. `[\s\S]*?` et non `[^>]*` : un handler
    // `onChange={(e) => ...}` contient un `>` qui couperait la classe negative
    // au milieu de la balise. Le `*?` non gourmand s'arrete au premier `/>`,
    // donc a la fermeture de cette balise-ci.
    const champ = src.match(/<Input[\s\S]*?type="date"[\s\S]*?\/>/)
    expect(champ, 'aucun <Input type="date" /> trouve dans le formulaire').not.toBeNull()
    expect(champ?.[0]).toMatch(/max=\{dateMaxDepense\(/)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter @homebudget/web test borne-date-saisie
```

Attendu : ÉCHEC sur les deux cas — `dateMaxDepense` n'est ni importé ni utilisé.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Dans `apps/web/app/(app)/depenses/formulaire-depense.tsx`, ligne 16, ajouter `dateMaxDepense` à l'import du domaine :

```tsx
import { type Personne, type TypeDepense, dateMaxDepense, modeParDefaut } from '@homebudget/domain'
```

Puis, lignes 196-204, le champ date devient :

```tsx
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                // Le selecteur natif grise l'au-dela, et le navigateur refuse la
                // soumission sans aller-retour serveur. Ce n'est qu'un confort :
                // le serveur reste la seule autorite (`verifierDatePlausible`,
                // appelee par `calculerPartsPourSaisie`). La regle n'est pas
                // dupliquee — c'est la MEME fonction du domaine des deux cotes,
                // seule la lecture de l'horloge differe, sans effet sur une
                // fenetre d'un an.
                max={dateMaxDepense(AUJOURDHUI())}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
```

> `AUJOURDHUI()` est appelé à chaque rendu, ce qui est correct et voulu : sans quoi un onglet laissé ouvert à cheval sur minuit garderait la borne de la veille.

- [ ] **Step 4 : Lancer le test et vérifier qu'il passe**

```bash
pnpm --filter @homebudget/web test
```

Attendu : tous les tests de `apps/web` au vert, dont `architecture.test.ts` (`@homebudget/domain` n'est pas soumis à la liste blanche, qui ne concerne que `@homebudget/db`).

- [ ] **Step 5 : Vérifier le parcours réel dans le navigateur**

```bash
task db:up && task dev
```

Sur `http://localhost:3000/depenses` : ouvrir « Modifier », puis le sélecteur de date. Vérifier que les dates au-delà d'un an sont **inatteignables**. Puis, en saisissant la date au clavier à `2029-09-29` avec un montant et une description remplis, vérifier que le message d'aperçu apparaît :

> Date trop lointaine : le 2029-09-29 dépasse le … (un an après aujourd’hui). Vérifiez l’année — les parts d’une dépense sont figées définitivement à sa création.

Arrêter avec `Ctrl-C`.

- [ ] **Step 6 : Porte complète**

```bash
task verif
```

Attendu : lint, typecheck et tous les tests unitaires au vert.

- [ ] **Step 7 : Commit**

```bash
git add apps/web/app/\(app\)/depenses/formulaire-depense.tsx apps/web/test/borne-date-saisie.test.ts
git commit -m "feat(web): griser les dates de depense au-dela d un an

Le refus serveur suffit a la correction, pas a l usage : rencontrer
l erreur apres avoir rempli le formulaire est un mauvais moment pour
l apprendre. Le max vient de la meme fonction du domaine que le serveur.

Refs #29"
```

---

## Vérification finale

- [ ] **La séquence complète de la CI**

```bash
task ci
```

**DESTRUCTIF** — réinitialise la base locale. Attendu : tout au vert, canari du solde à 114 580 centimes inclus, dans les trois lieux (unitaire, intégration, e2e).

- [ ] **Le « Fini quand » de l'issue**

Relire l'issue #29 et confirmer, avec les sorties de commandes en main : une date aberrante produit un avertissement compréhensible avant d'atteindre la base. Les preuves sont le test d'intégration de la tâche 2 (`rejects.toThrow` + table vide) et la vérification navigateur de la tâche 3.

## Ce que ce plan ne fait pas, et pourquoi

- **Aucune migration SQL.** Un trigger bornant à `CURRENT_DATE + 1 an` serait cohérent avec la philosophie du dépôt, mais l'issue est étiquetée `domaine` + `web`, et une contrainte qui lit l'horloge se comporte mal au rejeu de dump. Écarté consciemment.
- **`import-sheet.ts` inchangé.** Il appelle `versionEnVigueurLe` directement (ligne 106), pas `calculerPartsPourSaisie` : la garde ne l'atteint pas. C'est voulu — sa table de correction transforme déjà `2029-09-29` en `2025-09-29`, sous test.
- **`normaliser()` inchangé.** La garde est ancrée dans la façade, qui est joignable sans lui.
- **Pas de chemin de réparation** pour une dépense déjà écrite : c'est l'issue #40.
