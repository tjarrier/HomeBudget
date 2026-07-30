# E8 — Avertir sur une date de dépense hors fenêtre plausible

**Issue :** [#29](https://github.com/tjarrier/HomeBudget/issues/29) — *E8, Avertir sur
une date de dépense hors fenêtre plausible.*
**Paquets touchés :** `packages/domain`, `packages/db`, `apps/web`.
**Date :** 2026-07-30.

## Le problème

La spec fondatrice demande qu'une date hors de la fenêtre
`[première version de config, aujourd'hui + 1 an]` déclenche un avertissement — le
Sheet d'origine contenait une ligne datée `2029-09-29` au lieu de `2025-09-29`.

**La borne basse est tenue.** `versionEnVigueurLe()`
(`packages/domain/src/config-version.ts:57`) ne trouve aucune version couvrant une
date antérieure à la première, et jette un message déjà rédigé pour un humain :

> Aucune version de config ne couvre le 2019-05-01. Une depense sans regle
> applicable ne peut pas etre figee.

**La borne haute n'existe nulle part.** La migration `0004` est explicite
(ligne 39) : `date_fin is null` signifie que la version en cours **couvre tout ce
qui suit `date_debut`**. Il n'y a donc pas de borne supérieure en SQL. Il n'y en a
pas davantage dans `normaliser()` (`apps/web/lib/saisie.ts:36`), qui valide le
payeur, le type, le mode, la description et la cohérence type/mode — mais jamais la
date.

Conséquence vérifiée : **une dépense datée 2029 est acceptée sans le moindre
avertissement.** Ses parts sont figées pour toujours (règle 4), et elle pollue le
solde. C'est la ligne aberrante du Sheet, reproduite à l'identique. L'issue
[#40](https://github.com/tjarrier/HomeBudget/issues/40) confirme qu'aucun chemin de
réparation n'existe aujourd'hui.

## Le « Fini quand »

> Une date aberrante produit un avertissement compréhensible avant d'atteindre la
> base.

## La décision de fond : refus, pas avertissement contournable

L'issue dit « avertissement », mais aussi « avant d'atteindre la base ». On tranche
pour un **refus net**, pour deux raisons qui tiennent ensemble :

1. Les parts sont figées définitivement à l'écriture (règle 4).
2. Rien ne permet de réparer une dépense passée (issue #40).

Un avertissement qu'on peut franchir d'un clic est donc un moyen d'écrire une ligne
fausse et irréparable. Le mot « avertissement » de la spec a été écrit quand aucun
autre garde-fou n'existait ; l'intention — que l'aberration ne passe pas — est
mieux servie par un refus.

Aucun besoin de trois zones (« sûr / douteux / interdit ») : une dépense datée dans
l'année à venir est légitime, au-delà c'est une coquille. La frontière est binaire.

## Ce qu'on ne touche pas

- **Le calcul des parts, le solde, la résolution de version.** Aucune règle de
  répartition ne change. Le canari (114 580 centimes) reste identique, en
  unitaire, en intégration et à l'écran.
- **La borne basse.** `versionEnVigueurLe` la tient déjà, avec un message qui nomme
  la vraie cause. On n'en écrit pas un second qui dirait la même chose moins bien.
  On ajoute en revanche un test qui la verrouille.
- **Le SQL.** Pas de migration, pas de trigger. Le trigger `depense_dans_sa_version`
  reste la seule garde base côté dates. Un trigger bornant à `CURRENT_DATE + 1 an`
  serait cohérent avec la philosophie du projet, mais l'issue est étiquetée
  `domaine` + `web`, et une contrainte qui lit l'horloge est un objet plus délicat
  qu'il n'en a l'air (restauration de dump, rejeu de migration). Écarté
  consciemment, pas par oubli.
- **`import-sheet.ts`.** Sa table de correction transforme déjà explicitement
  `2029-09-29` en `2025-09-29`, et un test le verrouille
  (`packages/db/test/import-sheet.test.ts`). Rien à ajouter.
- **`normaliser()`.** Voir « Le point d'ancrage » : la garde va ailleurs, et ce
  fichier reste inchangé.

## Architecture

### 1. La règle vit dans le domaine

Nouveau module `packages/domain/src/horizon-saisie.ts`, exporté par `index.ts` :

```ts
/** Le dernier jour acceptable pour une dépense : un an après `aujourdhui`. */
export function dateMaxDepense(aujourdhui: string): string

/** Jette si `date` dépasse cet horizon. N'a aucune opinion sur la borne basse. */
export function verifierDatePlausible(date: string, aujourdhui: string): void
```

Un module séparé plutôt qu'un ajout à `config-version.ts` : la règle ne parle pas
de versions, elle parle de la date d'une dépense. `config-version.ts` fait déjà
180 lignes et a une responsabilité claire — on ne la dilue pas.

`aujourdhui` est un **paramètre**, jamais un `new Date()` interne. Le domaine reste
pur et le test n'a pas besoin de figer l'horloge.

Les deux fonctions valident la forme ISO de leur entrée, comme le fait déjà
`veilleDe`. Cela demande d'exporter `assertDateIsoValide` depuis
`config-version.ts` (aujourd'hui privée) plutôt que d'en écrire une deuxième copie.

**Le piège du 29 février.** `aujourdhui = 2028-02-29` : en JS,
`d.setUTCFullYear(2029)` sur un 29 février renvoie le **1ᵉʳ mars**. `dateMaxDepense`
rabat explicitement sur `2029-02-28`. C'est le même soin que `veilleDe` porte déjà
aux bornes de version, et il est testé.

### 2. Le point d'ancrage : `calculerPartsPourSaisie`

`packages/db/src/ecriture.ts:47`, juste avant `versionEnVigueurLe` :

```ts
export function calculerPartsPourSaisie(
  saisie: SaisieDepense,
  versions: VersionConfig[],
  aujourdhui: string = aujourdhuiIso(),
): PartsCalculees {
  verifierDatePlausible(saisie.date, aujourdhui)
  const version = versionEnVigueurLe(versions, saisie.date)
  …
}
```

**Pourquoi là et pas dans `normaliser()`.** Les deux chemins du formulaire (aperçu
et écriture) traversent les deux fonctions, donc les deux emplacements couvriraient
l'UI. Mais `ajouterDepense()` est exporté par la façade et joignable **sans**
`normaliser` — tests d'intégration, seed, futur import. Ancrer dans
`calculerPartsPourSaisie`, c'est protéger la façade elle-même : « avant d'atteindre
la base » au sens littéral. Et les deux bornes se retrouvent côte à côte, sur deux
lignes qui se lisent ensemble.

C'est aussi le point de passage unique de l'aperçu et de l'écriture (CLAUDE.md) :
un aperçu qui accepterait ce que l'écriture refuse serait exactement le mensonge à
l'écran que cette règle interdit.

**Le troisième paramètre est optionnel, avec défaut.** Conséquences voulues :

- Aucune signature d'appelant ne change (`apps/web/actions/depenses.ts:30`,
  `ecriture.ts:69`).
- La liste blanche de `apps/web/test/architecture.test.ts` reste intacte : aucun nom
  nouveau n'est importé depuis `@homebudget/db`.
- Les tests injectent une date fixe et restent déterministes.

`aujourdhuiIso()` est un helper privé de `packages/db` (non exporté par la façade).
Il lit l'horloge du serveur, éventuellement en UTC alors que les utilisateurs sont à
Paris : sur une fenêtre d'un an, un décalage de quelques heures n'a aucune
conséquence. La pureté est préservée là où elle compte — dans le domaine.

### 3. Le formulaire

`apps/web/app/(app)/depenses/formulaire-depense.tsx` : le champ date porte

```tsx
<Input id="date" name="date" type="date" required
       max={dateMaxDepense(AUJOURDHUI())} … />
```

`AUJOURDHUI()` existe déjà dans le fichier (ligne 21) et date en heure **locale**,
délibérément — un `toISOString()` proposerait demain quand on saisit à 23 h à Paris.

La règle n'est pas dupliquée : c'est **la même fonction du domaine** des deux côtés.
Seule la lecture de l'horloge diffère (navigateur ici, serveur là), sans effet sur
une fenêtre d'un an. `apps/web` importe déjà `@homebudget/domain` librement ; la
liste blanche de `architecture.test.ts` ne concerne que `@homebudget/db`.

Effet : le sélecteur de date natif grise l'au-delà, et le navigateur refuse la
soumission avant même l'aller-retour serveur. Le client n'est qu'un confort — le
serveur reste la seule autorité.

### 4. Le message

```
Date trop lointaine : le 2029-09-29 dépasse le 2027-07-30 (un an après
aujourd'hui). Vérifiez l'année — les parts d'une dépense sont figées
définitivement à sa création.
```

Il dit **quoi** (la date fautive), **quelle limite** (la borne calculée), et
**pourquoi ça compte** (l'irréversibilité). Les dates sont en ISO, comme dans les
messages existants du domaine — l'utilisateur vient de taper cette forme-là dans le
champ.

Le message remonte tel quel à l'écran : l'aperçu en direct l'affiche via
`messageApercu` (`formulaire-depense.tsx:322`), et une soumission forcée le fait
apparaître via l'état de `useActionState`, alimenté par `enEchec()`
(`formulaire-depense.tsx:327`).

## Flux de données

```
Formulaire ──(max=dateMaxDepense)──> le navigateur bloque d'emblée
     │
     │ (contournement, ou aperçu en direct)
     ▼
Server Action ──> normaliser() ──> calculerPartsPourSaisie(…, aujourdhui)
                                     │
                                     ├─ verifierDatePlausible  → borne HAUTE
                                     └─ versionEnVigueurLe     → borne BASSE
                                              │
                                              ▼
                                        ajouterDepense → base
```

## Gestion d'erreur

Un seul mécanisme, celui qui existe déjà : le domaine jette, la Server Action
attrape via `enEchec()` (`apps/web/actions/resultat.ts`), le formulaire affiche.
Aucun type de retour nouveau, aucun canal d'« avertissement » parallèle.

## Tests

**Domaine — `packages/domain/test/horizon-saisie.test.ts` (nouveau)**

- `dateMaxDepense('2026-07-30')` vaut `'2027-07-30'`.
- Le 29 février : `dateMaxDepense('2028-02-29')` vaut `'2029-02-28'`, pas
  `'2029-03-01'`.
- La limite exacte est **acceptée** : `verifierDatePlausible('2027-07-30',
  '2026-07-30')` ne jette pas.
- La limite + 1 jour est **refusée** : `'2027-07-31'` jette, et le message contient
  les deux dates.
- Le cas réel de l'issue : `'2029-09-29'` jette.
- Une date passée quelconque ne jette pas — ce module n'a pas d'opinion sur la
  borne basse.
- Une date ISO malformée ou impossible (`'2026-02-30'`, `'2026-7-1'`) jette.

**Domaine — borne basse, régression (`config-version.test.ts`)**

- Une date antérieure à la première version jette toujours le message de
  `versionEnVigueurLe`. Ce test n'existait pas ; il verrouille la moitié de la
  fenêtre qu'on ne réécrit pas.

**Intégration — `packages/db/test/facade.integration.test.ts`**

- `ajouterDepense` avec une date 2029 est **refusée**, et aucune ligne n'est écrite.
  C'est le « avant d'atteindre la base » du « Fini quand ».
- Une dépense datée dans les douze mois à venir passe toujours.

**Web — `apps/web/test/`**

- Test statique : le champ date de `formulaire-depense.tsx` porte un attribut `max`.
  Il ne suffit pas de vérifier que le serveur refuse — un utilisateur qui peut
  encore *choisir* la date aberrante dans le sélecteur natif rencontre l'erreur trop
  tard.

**Le canari**

Inchangé, dans les trois lieux : 114 580 centimes en unitaire, après aller-retour
Postgres, et à l'écran. Aucune date du seed n'approche l'horizon.
