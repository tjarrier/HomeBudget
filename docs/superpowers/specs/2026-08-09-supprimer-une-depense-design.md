# G1 — Corriger ou annuler une dépense saisie

**Issue :** [#40](https://github.com/tjarrier/HomeBudget/issues/40) — *G1, Corriger
ou annuler une dépense saisie.*
**Paquets touchés :** `packages/db` et `apps/web`. **`packages/domain` : aucun changement.**
**Date :** 2026-08-09.

## Le problème

Une faute de frappe sur un montant est définitive. `packages/db/src/ecriture.ts`
n'expose que `ajouterDepense`, `genererChargeFixeDuMois` et `creerVersion` : aucun
`update`, aucun `delete`, aucune UI. Le canari passe, le solde est exact — et faux,
parce qu'il additionne une ligne que personne n'a jamais dépensée.

C'est le pendant de [#29](https://github.com/tjarrier/HomeBudget/issues/29) : ce que
la validation laisse passer, plus rien ne le répare.

## La décision préalable

L'issue posait la question : contre-écriture ou suppression franche ?

**Suppression franche.** Le `DELETE` de la ligne.

Ce qui a tranché :

- **L'append-only est une règle de la _config_, pas des dépenses** (règle 3 de
  `CLAUDE.md`). Elle existe parce qu'une version de config est une *pièce d'archive*
  dont dépendent des parts déjà figées ailleurs. Une dépense ne porte rien : personne
  ne s'y réfère.
- **La règle 4 n'est pas concernée.** Elle interdit de *recalculer* une part après
  coup. Une suppression ne calcule rien. Le solde revient à sa valeur d'avant **par
  construction** — `resumer()` est une somme sur les lignes présentes, retirer un
  terme rend exactement la somme précédente. Aucune compensation à écrire, donc
  aucune compensation à faire juste.
- **La contre-écriture ne pouvait pas être « la même ligne en négatif ».** Le CHECK
  `montant_positif` l'interdit. Il aurait fallu la ligne *miroir* — payeur inversé,
  parts échangées `(t, l) → (l, t)`, ce qui somme bien au montant et neutralise bien
  le solde. Mais alors **« Total dépenses » du tableau de bord compte `2 × montant`
  au lieu de `0`** : la ligne d'annulation est une dépense comme une autre pour
  `resumer()`. Réparer ça demandait un lien entre les deux lignes, donc une colonne,
  donc une migration — pour une traçabilité que personne n'a demandée sur un budget
  à deux.

Ce qu'on perd, et qu'on assume : une ligne effacée ne laisse aucune trace, et il
n'y a **aucune annulation**. La sauvegarde de la nuit
(`docs/superpowers/specs/2026-08-02-sauvegarde-restauration-prod-design.md`)
n'est pas ce recours : `task db:restaurer` pose un `drop schema public` en
`RESTRICT`, dans la même transaction que le reste — visé sur une base peuplée
comme la nôtre, il échoue sans rien toucher (CLAUDE.md § Sauvegarde), et une
restauration en place perdrait de toute façon tout ce qui a été écrit depuis
02:17. Au mieux, restaurer dans une base annexe permet de *relire* la ligne
perdue et de la resaisir à la main — jamais de la rendre.

## Le « Fini quand »

> Une dépense saisie par erreur peut être neutralisée depuis le téléphone, le solde
> revient exactement à sa valeur d'avant, et un test verrouille cette égalité au
> centime.

## Ce qui ne change pas

**Aucune migration.** Le `DELETE` sur `depense` n'a jamais été bloqué :

- La 0002 étend l'append-only au `DELETE`, mais **sur `version_config` seulement**.
- La FK `on delete restrict` protège la version *depuis* la dépense, jamais l'inverse.
- Le trigger `depense_dans_sa_version` (0004) porte sur `insert or update`. Un
  `DELETE` ne peut, par construction, pas sortir une ligne de sa plage.
- Conséquence symétrique, sans risque : supprimer la dernière dépense figée sur
  une version encore *ouverte* lui rend sa pleine mutabilité, le `exists (select
  1 from depense …)` de `bloquer_modification_version_close` (0004) ne trouvant
  plus rien au prochain `UPDATE` — une version *close*, elle, reste verrouillée
  par `date_fin` quoi qu'il arrive, et aucune façade n'expose d'`UPDATE` de
  `version_config`.

**Aucune fonction dans `packages/domain`.** Supprimer n'est pas une règle de calcul :
c'est le retrait d'un terme d'une somme. L'issue porte le label `domaine` ; il ne
correspond à rien ici, et c'est le signe que la décision ci-dessus est la bonne.

## La façade

```ts
// packages/db/src/ecriture.ts
export async function supprimerDepense(id: string): Promise<void>
```

Un `db.delete(depense).where(eq(depense.id, id)).returning()`. Zéro ligne rendue →
elle **jette**, avec le vocabulaire des autres gardes du projet :

> `Cette dépense n'existe plus.`

Ne pas rendre ce cas silencieux. « Zéro ligne supprimée » n'est pas un succès : c'est
le double clic, le retour arrière du navigateur, ou le second téléphone qui a déjà
supprimé la ligne. Un `void` muet ferait afficher « supprimée » sur une action qui
n'a rien fait — la même erreur que le `vercel env add` qui sortait en 0 sans écrire.

`supprimerDepense` s'ajoute à la liste blanche `FACADE_DB` de
`apps/web/test/architecture.test.ts` : sans ça, le test tombe de lui-même dès le
premier import côté web. C'est le filet qui fonctionne, on ne fait que l'enregistrer.

## La Server Action

```ts
// apps/web/actions/depenses.ts
export async function supprimerDepenseAction(id: string): Promise<Resultat<null>>
```

`exigerSession()` en **première ligne** — une Server Action est un endpoint HTTP,
joignable sans jamais charger la page. Puis `revalidatePath('/')` et
`revalidatePath('/depenses')`, comme ses deux voisines : le solde doit suivre
l'écriture sur les deux écrans.

Signature à un argument plutôt qu'un `FormData` : il n'y a pas de formulaire à
valider, un identifiant suffit. Le rendu reste `Resultat<null>` et l'échec passe par
`enEchec`, qui remonte le message tel quel.

## L'écran

`LigneDepense` gagne une prop **`supprimable`, à `false` par défaut** :

- `/depenses` l'active — c'est l'écran de saisie, donc celui de la correction, et le
  formulaire y est déjà côte à côte pour resaisir.
- Le tableau de bord (`app/(app)/page.tsx`, « dernières dépenses ») ne l'active pas.
  On y vient lire un solde, pas éditer.

Le défaut à `false` est le bon sens : un troisième appelant futur n'hérite pas d'un
bouton de suppression sans l'avoir demandé.

Quand elle est active, la ligne rend un composant client
`apps/web/components/bouton-supprimer-depense.tsx` :

- **Une croix discrète**, cible tactile **44 × 44** — `apps/web/e2e/cibles-tactiles.spec.ts`
  balaie déjà toutes les cibles interactives des écrans, ce bouton y entre sans qu'on
  écrive un test de plus. Nom accessible explicite : `Supprimer « <description> »`,
  sinon la liste offre N boutons homonymes au lecteur d'écran comme à Playwright.
- **`window.confirm()` natif**, nommant la description **et** le montant formaté.
  Échelon 4 de l'échelle : rien à écrire, accessible partout, pilotable par
  Playwright (`page.on('dialog')`). Un dialogue maison coûterait un composant, un
  piège de focus et une gestion d'`Escape` pour la même phrase.
- **`useTransition`** pour l'état pendant (bouton désactivé), et l'échec rendu sous
  la ligne dans un `role="alert"`.

Pas de suppression optimiste : la ligne disparaît quand le serveur a revalidé, pas
avant. Sur une liste dont l'unique raison d'être est de prouver que rien ne bouge
après coup, faire disparaître une ligne qui pourrait revenir serait le pire des
mensonges d'affichage.

## Les tests

**Le verrou au centime** — `packages/db/test/facade.integration.test.ts`, sur le seed
réel du Sheet :

```
importerDepenses(VERSIONS_INITIALES)   →  soldeThomas === 114580
ajouterDepense(...)                    →  soldeThomas !== 114580   (l'ajout a bien porté)
supprimerDepense(id)                   →  soldeThomas === 114580   exactement
```

L'assertion du milieu n'est pas décorative : sans elle, un `supprimerDepense` qui ne
supprimerait rien *et* un `ajouterDepense` qui n'ajouterait rien donneraient le même
vert.

Deux tests d'intégration de plus :

- **Supprimer un id inconnu jette.** Le chemin d'erreur de la façade, verrouillé là
  où il est écrit.
- **Supprimer une charge générée rouvre son mois.** `genererChargeFixeDuMois` →
  `supprimerDepense` → `genererChargeFixeDuMois` rend `creee: true`. C'est la seule
  conséquence non évidente de « toutes les dépenses sont supprimables » : l'index
  partiel de la 0008 relâche son unicité avec la ligne.

**Le parcours téléphone** — `apps/web/e2e/parcours.spec.ts`, viewport 360 px, placé
**après** les canaris qui lisent le seed intact : saisir une dépense, supprimer via
la croix + `confirm`, et vérifier le retour au centime avec le helper
`soldeEnCentimes(page)` déjà présent dans le fichier — il lit l'attribut `value` du
`<data>`, donc un entier de centimes et non une chaîne formatée.

```
const avant = await soldeEnCentimes(page)   // le seed est déjà écrit par les tests précédents
… saisie …                                   → soldeEnCentimes(page) !== avant
… croix + confirm …                          → soldeEnCentimes(page) === avant
```

On capture `avant` à l'exécution, jamais la constante `114580` : les parcours qui
précèdent ont déjà fait bouger le solde du seed, et c'est exactement le motif que
suit déjà le test « régler les comptes ».

## Les limites assumées

- **Le chemin d'erreur de l'UI n'est verrouillé que côté façade.** Rejouer « la ligne
  a déjà été supprimée » dans le navigateur demanderait deux sessions concurrentes
  pour vérifier une phrase. Le message existe, il est testé là où il naît.
- **Aucune corbeille, aucun undo.** Le geste est confirmé, et la sauvegarde nocturne
  est le filet. Une corbeille serait la solution *soft delete* écartée plus haut,
  entrée par la porte de derrière.
- **« Corriger » se fait en deux gestes** : supprimer, puis resaisir dans le
  formulaire qui est déjà à côté. Pré-remplir le formulaire depuis la ligne effacée
  a été écarté : ça mettrait de l'état partagé entre une liste serveur et un
  formulaire client, pour économiser une frappe.
