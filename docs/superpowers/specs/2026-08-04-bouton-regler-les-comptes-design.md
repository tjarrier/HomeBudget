# E5 — Bouton « Régler les comptes »

**Issue :** [#26](https://github.com/tjarrier/HomeBudget/issues/26) — *E5, Bouton
Régler les comptes.*
**Paquets touchés :** `apps/web` seul.
**Date :** 2026-08-04.

## Le problème

Le tableau de bord annonce « Liz doit 1 145,80 € à Thomas ». Pour solder cette
dette, il faut aujourd'hui ouvrir `/depenses`, déplier les détails, basculer le
type sur *Transfert*, choisir le bon payeur, puis **recopier à la main** un montant
lu sur l'écran précédent.

Trois de ces gestes peuvent se tromper, et deux se trompent silencieusement :

- **Le payeur.** C'est le **débiteur** qui verse. L'inverser double la dette au lieu
  de l'annuler — le piège documenté en tête de `CLAUDE.md`.
- **Le montant recopié.** Une coquille laisse un solde résiduel de quelques centimes
  que rien ne signale.
- **Le type.** `transfert` avec un mode autre que `transfert` est désormais refusé
  par `normaliser()` (`apps/web/lib/saisie.ts:62`), mais l'inverse — une dépense
  *courante* saisie pour un remboursement — passe et se répartit moitié-moitié.

Les parts sont figées **pour toujours** à l'écriture (règle 4), et aucun chemin de
correction n'existe tant que
[#40](https://github.com/tjarrier/HomeBudget/issues/40) n'est pas livrée.

## Le « Fini quand »

> Après validation, le solde tombe à zéro.

## Le calcul : aucune règle nouvelle

`synthese()` (`packages/domain/src/solde.ts:93`) rend déjà tout ce qu'il faut,
et le rend sous une forme qui interdit l'erreur de signe : le `montant` est
**toujours positif**, c'est `debiteur`/`crediteur` qui porte le sens.

Régler, c'est donc exactement :

| Champ      | Valeur         |
| ---------- | -------------- |
| `type`     | `transfert`    |
| `mode`     | `transfert`    |
| `payePar`  | `s.debiteur`   |
| `montant`  | `s.montant`    |

**Vérification du signe, sur le canari.** Liz doit 1 145,80 €, donc
`soldeThomas = +114580` et `synthese()` désigne `debiteur = 'liz'`. Un transfert de
`114580` payé par Liz fige `part_liz = 0` et `part_thomas = 114580`
(`repartition.ts`, mode `transfert`). D'où :

```
soldeLiz    += 114580 − 0      →  −114580 + 114580 = 0
soldeThomas += 0 − 114580      →  +114580 − 114580 = 0
```

Les deux tombent à zéro, et `synthese()` bascule sur `{ etat: 'a-jour' }`.

**Aucune fonction n'est ajoutée au domaine.** Le règlement est une lecture de deux
champs d'une structure qui existe déjà. Écrire un `reglement(resume)` dupliquerait
la logique de `synthese()` et créerait un second endroit où le signe pourrait
diverger.

## Les décisions

### 1. Le bouton pré-remplit le formulaire existant, il n'écrit pas

Le mot de l'issue est « pré-remplir », pas « enregistrer ». Le clic mène au
formulaire de `/depenses` avec ses champs déjà posés ; l'utilisateur valide.

Ce qu'on y gagne, et qu'un second chemin d'écriture aurait fallu réécrire :
l'aperçu des parts calculé **par la même fonction que l'écriture**, la validation
croisée `type`/`mode`, la borne de date de #29, la Server Action et ses messages
d'erreur.

Ce qu'on y gagne surtout : **l'aperçu des parts est la confirmation.** Il affiche
`Thomas 1 145,80 € / Liz 0,00 €` avant validation — c'est-à-dire le sens du
transfert, en toutes lettres, sur l'écran. Aucune modale à écrire ne dirait mieux
que ça, sur une action dont la ligne n'est pas encore annulable.

**Écarté :** un bouton qui écrit directement, sans passer par le formulaire. Un clic
suffirait alors à figer une ligne irréversible.

### 2. Un drapeau dans l'URL, jamais le montant

Le lien est `/depenses?regler=1`. La page `/depenses` appelle **déjà**
`listerDepenses()` : elle rejoue `resumer()` + `synthese()` pour zéro requête
supplémentaire.

**Écarté :** `?montant=114580&payePar=liz`. Une URL porte un montant figé au rendu
du *tableau de bord*, périmé dès qu'une dépense est saisie entre-temps — et
partageable, donc à valider à l'arrivée comme n'importe quelle saisie utilisateur.
Un drapeau ne peut pas mentir sur le montant : le chiffre ne quitte jamais le
serveur.

**Conséquence utile :** `?regler=1` sur un solde nul donne `reglement = undefined`,
donc le formulaire reprend ses défauts ordinaires. Une URL gardée en favori ne peut
rien pré-remplir de faux.

### 3. Le bouton se pose sous le bandeau, pas dedans

`DESIGN.md` réserve `bg-emphasis` au « bandeau du solde » comme **seul aplat
sombre**, et le niveau `heros` « au solde du bandeau sombre, et lui seul ». Cette
surface est écrite pour ne porter qu'une chose.

Aucune des deux variantes de `Button` n'est faite pour ce fond : `primaire` est
slate-900 sur slate-900, `discret` porte des jetons de surface claire
(`bg-surface`, `hover:bg-muted`). L'y poser demanderait une troisième variante —
`DESIGN.md` dit « deux variantes, pas plus » — ou des classes locales.

Le bouton se place donc **juste sous le bandeau**, avant la rangée des quatre
chiffres : à trois centimètres de la phrase qu'il résout, avec `variant="discret"`
tel quel, et **zéro jeton nouveau**.

### 4. Pas de bouton quand il n'y a rien à régler

`s.etat === 'a-jour'` → le bouton n'est pas rendu. Un bouton qui n'a rien à faire
est pire qu'un bouton absent : il invite à créer un transfert de zéro.

### 5. Le montant reste modifiable

Un règlement partiel (« je te vire 400 sur les 1 145,80 ») est un usage normal, et
le formulaire sait déjà le faire. Rien n'est verrouillé ; le pré-remplissage est une
proposition, pas une contrainte.

## L'implémentation

### `app/(app)/page.tsx` — le bouton

Rendu entre la `<section data-testid="bandeau-solde">` et la grille des quatre
chiffres, **conditionné à `s.etat === 'dette'`** :

```tsx
<Link href="/depenses?regler=1" className={buttonVariants({ variant: 'discret' })}>
  Régler les comptes
</Link>
```

`buttonVariants` est déjà exporté par `components/ui/button.tsx` : le plancher
tactile de 44px (`min-h-11`, issue C1) vient avec, sans qu'on ait à y penser, et
`e2e/cibles-tactiles.spec.ts` le mesurera comme tous les autres contrôles.

### `app/(app)/depenses/page.tsx` — la lecture du drapeau

`searchParams` suit la forme de `login/page.tsx` (`Promise<…>`, Next 15) :

```ts
const { regler } = await searchParams
const s = synthese(resumer(depenses))
const reglement =
  regler && s.etat === 'dette' ? { montant: s.montant, payePar: s.debiteur } : undefined
```

`resumer` et `synthese` viennent de `@homebudget/domain`, qui n'est pas soumis à la
liste blanche de `test/architecture.test.ts` — celle-ci ne borne que
`@homebudget/db`, dont aucun import nouveau n'est ajouté.

### `depenses/formulaire-depense.tsx` — le pré-remplissage

Un prop optionnel `reglement?: { montant: Cents; payePar: Personne }`, consommé par
les initialiseurs `useState` **existants** :

| État          | Sans règlement           | Avec règlement                       |
| ------------- | ------------------------ | ------------------------------------ |
| `montant`     | `''`                     | `montantPourSaisie(reglement.montant)` |
| `description` | `''`                     | `'Règlement des comptes'`            |
| `payePar`     | `personne` (la session)  | `reglement.payePar` (le débiteur)    |
| `type`        | `'courante'`             | `'transfert'`                        |
| `mode`        | `modeParDefaut('courante')` | `modeParDefaut('transfert')` → `'transfert'` |

**Pas d'`useEffect`, pas de synchronisation.** Un initialiseur `useState` ne court
qu'au montage ; le lien vient d'une autre route, donc le composant se monte. Toute
frappe suivante appartient à l'utilisateur, et rien ne la réécrit.

Le formulaire reste **replié** : sa ligne de résumé annonce déjà « Aujourd'hui ·
payé par Liz · transfert ». Elle dit toujours la vérité sur ce qui sera
enregistré — c'est sa raison d'être, et elle couvre exactement les deux champs que
le règlement pose sans les montrer.

L'aperçu des parts se déclenche seul : `montant` et `description` sont remplis, donc
le `useEffect` existant interroge le serveur et affiche `Thomas 1 145,80 € /
Liz 0,00 €`.

### `lib/format.ts` — une ligne

`formaterMontant()` rend `1 145,80 €`, et un champ étiqueté « Montant (€) » ne veut
pas du symbole — le `placeholder` existant (`1 110,58`) fixe la forme attendue :

```ts
export const montantPourSaisie = (c: Cents) => formaterMontant(c).replace(/\s€$/, '')
```

`formaterMontant` a déjà normalisé les espaces insécables d'`Intl`, donc `\s` suffit.

## Ce qui vérifie

**`test/format.test.ts` — l'aller-retour.** C'est le seul endroit du diff où de
l'argent traverse une chaîne de caractères, donc le seul qui mérite un test
unitaire :

```
parserEurosSaisis(montantPourSaisie(c)) === c
```

sur le canari `114580`, plus quelques valeurs limites : `0`, `1` (un centime),
`100000000` (un million d'euros, deux séparateurs de milliers).

**`e2e/parcours.spec.ts` — le critère de l'issue, en un test.** Depuis `/` :

1. cliquer « Régler les comptes » ;
2. vérifier l'aperçu — `apercu-liz` à `0,00 €` : c'est le sens du transfert, à
   l'écran, avant l'écriture ;
3. valider ;
4. revenir sur `/` et attendre **`soldeEnCentimes(page) === 0`** et « Vous êtes à
   jour » ;
5. vérifier que le bouton a disparu (décision 4).

**Placement : après `« creer une version ne change aucune depense passee »`, avant
le bloc `sur un telephone`.** Ce test met le solde à zéro : plus aucun test ne doit
le lire ensuite. Les trois parcours téléphone qui suivent n'y touchent pas.
L'ordre des tests de ce fichier est déjà contraint et commenté — ce test s'ajoute au
bout de la chaîne d'écritures, il ne s'y insère pas.

## Hors périmètre

- **Annuler un règlement saisi par erreur.** C'est
  [#40](https://github.com/tjarrier/HomeBudget/issues/40), et le formulaire ne
  l'offre pour aucune autre dépense.
- **Un règlement partiel proposé** (la moitié, un montant arrondi). Le champ est
  modifiable ; en préremplir plusieurs demanderait une UI que rien ne réclame.
- **Une trace du règlement dans l'historique** autre que la ligne de transfert
  elle-même, qui porte déjà sa description.
