# Borner la liste des dépenses

**Issue :** [#41](https://github.com/tjarrier/HomeBudget/issues/41)
**Date :** 2026-08-09

## Le problème

`apps/web/app/(app)/depenses/page.tsx` rend 100 % des dépenses. 34 lignes
aujourd'hui, une douzaine de plus par mois. En viewport 360 px la page dépasse
4 000 px de haut, et le formulaire de saisie est tout en bas : ajouter une
dépense depuis un téléphone demande de traverser tout l'historique.

Les filtres livrés par #27 et #28 ne bornent rien. « Toutes les dépenses
courantes » reste une liste qui grandit sans fin. Les deux se complètent.

## La décision qui commande tout : la borne est en SQL, pas à l'affichage

Trancher le tableau en mémoire (`depenses.slice(0, 20)`) rend l'écran court en
une ligne de code. Mais Postgres continue de renvoyer tout, et la borne est alors
**cosmétique** : l'écran ment sur ce qu'il coûte.

Deux lectures non bornées vivent dans l'application, et la seconde condamne la
première : la page des dépenses charge tout pour la synthèse du règlement et pour
la liste des mois du sélecteur, et le tableau de bord charge tout pour le solde et
ses cinq dernières lignes. Borner la liste sans borner ces lectures-là ne change
rien.

**Après ce changement, aucune lecture de l'application ne rend un nombre non borné
de lignes.**

## Ce que ça coûte, et pourquoi c'est acceptable

`resumer()` est un pliage : huit accumulateurs sur des colonnes **déjà figées**.
Aucune part n'y est recalculée — c'est ce qui rend la règle 4 indifférente à
l'endroit où la somme se fait.

Le porter en SQL crée néanmoins une **deuxième implémentation** de la même règle,
hors de `packages/domain`. C'est exactement ce que le projet interdit ailleurs
(« ne les dédouble jamais », à propos de `calculerPartsPourSaisie`).

Ce qui rend le dédoublement tenable ici, et rien d'autre : **un test compare les
deux sur le seed, champ pour champ.** Le canari des 114 580 centimes passe alors
par les deux chemins. Sans ce test, l'agrégat SQL dérive silencieusement le
premier jour où `resumer()` change.

Et la frontière est nette : **SQL fait le pliage, jamais le sens.** `synthese()`
et `phraseSynthese()` ne bougent pas — qui doit à qui, le signe du transfert, la
phrase affichée restent du domaine et n'ont qu'une implémentation.

## Le domaine : `Resume` gagne `nombre`

```ts
export interface Resume {
  nombre: number   // <- nouveau
  totalDepenses: Cents
  // … inchangé
}
```

`resumer()` le remplit avec `depenses.length`.

Une seule raison de le mettre là plutôt que de le rendre à côté : c'est le champ
dont l'agrégat SQL a besoin (« 20 sur 34 » dans l'en-tête de la carte, « Sur 34
dépenses » sur le tableau de bord), et le porter dans `Resume` rend les deux
implémentations **strictement isomorphes**. Le test d'égalité couvre alors le
compte comme le reste, au lieu de le laisser hors du verrou.

## Les trois lectures de `packages/db/src/lecture.ts`

### `listerDepenses({ …filtres, limite })`

Un `LIMIT` de plus, rien d'autre. Le tri reste `date`, `createdAt`, `id` —
ce tiebreaker existait déjà pour la stabilité entre deux lectures, il devient ici
la condition pour qu'une borne veuille dire quelque chose : sans ordre total, « les
20 premières » ne désigne pas le même ensemble d'un appel à l'autre.

**Pas de `decalage`.** « Voir plus » est cumulatif — `?n=40` demande `LIMIT 40`
depuis le début, jamais la deuxième page de 20. Rien dans le produit n'a besoin
d'un offset, et une borne qu'on n'utilise pas est une borne qu'on ne teste pas.

### `resumerDepenses(filtres?)`

Un `SELECT` de neuf agrégats sur les colonnes déjà figées, avec les mêmes
`conditions(filtres)` que la liste :

    count(*)
    sum(montant) FILTER (WHERE type <> 'transfert')   -- totalDepenses
    sum(montant) FILTER (WHERE type =  'transfert')   -- totalTransferts
    sum(montant) FILTER (WHERE paye_par = 'thomas')   -- payeThomas
    sum(montant) FILTER (WHERE paye_par = 'liz')      -- payeLiz
    sum(part_thomas)                                  -- duThomas
    sum(part_liz)                                     -- duLiz

Les deux soldes se dérivent en TypeScript (`payeThomas - duThomas`), comme dans
`resumer()` : une soustraction de plus en SQL serait une ligne de règle métier de
plus à tenir en double.

Deux pièges de `sum()` en Postgres, tous les deux muets s'ils passent :

- il rend `numeric`, que le driver `pg` livre en **chaîne** — `Number(x)` sur une
  chaîne d'entier est exact, et reste un entier de centimes (règle 1) ;
- il rend `null` sur un ensemble vide, jamais `0` — d'où `Number(x ?? 0)`, sans
  quoi une base neuve produirait `NaN` partout au lieu d'un résumé à zéro.

### `listerMoisDepenses()`

`SELECT DISTINCT date_trunc('month', date)`, décroissant, rendu en `YYYY-MM`.

La même expression que `conditions()` et que l'index partiel de la migration
0008 : il n'y a qu'une définition de « le mois de cette date » dans le projet, et
le sélecteur ne peut donc pas proposer un mois que le filtre ne saurait pas
retrouver.

## L'écran des dépenses

**Le paramètre `?n`.** 20 par défaut, +20 par palier. C'est une saisie, donc il se
valide comme les filtres : retenu s'il est un multiple de 20 compris entre 20 et
le total des lignes correspondantes, sinon 20 — c'est-à-dire s'il est exactement
l'une des valeurs auxquelles « Voir plus » a pu mener. Un `?n=999999` tapé à la
main ne doit pas pouvoir déborner la lecture.

**« Voir plus (14) »** est un `<Link>` vers `?n=40` construit à partir des
paramètres courants — le filtre posé et `?regler=1` (#26) y survivent. Server
Component, aucun JavaScript de plus, et l'URL reste partageable. Le reste à voir
est dans le libellé : « Voir plus » sans chiffre n'apprend rien.

**Les lectures de la page**, toutes bornées :

| ce qu'on affiche | lecture |
|---|---|
| le solde et le total (34) | `resumerDepenses()` — **jamais filtré** |
| le compte correspondant (« sur 12 ») | `resumerDepenses(filtres)`, seulement si un filtre est posé |
| les lignes | `listerDepenses({ …filtres, limite: n })` |
| le sélecteur de mois | `listerMoisDepenses()` |

Le solde reste calculé sur **tout**, jamais sur ce qui est affiché. C'est déjà la
règle du code actuel et elle ne change pas : un solde calculé sur le seul mois
affiché est un règlement partiel présenté comme le solde. Filtrer l'écran ne doit
pas pouvoir changer le montant qu'on s'apprête à virer — et maintenant, borner
l'écran non plus.

**Le formulaire passe devant l'historique sous `lg`** : `max-lg:order-first` sur la
colonne de saisie. Au téléphone, ouvrir l'écran Dépenses, c'est être déjà dans le
formulaire ; la ligne saisie apparaît juste en dessous. Au large, où les deux
colonnes coexistent, rien ne bouge. C'est ce que le code disait déjà de cet écran :
« on ouvre cet écran pour saisir une dépense ».

## Le tableau de bord

`resumerDepenses()` pour le bandeau et les quatre chiffres, `listerDepenses({ limite: 5 })`
pour « Dépenses récentes ». Le `slice(0, 5)` disparaît avec la lecture complète qui
le nourrissait, et « Sur N dépenses » vient de `resume.nombre`.

## Tests

- **Domaine** — `resumer()` rend `nombre`, y compris `0` sur un tableau vide.
- **Intégration** — la limite rend bien les N plus récentes ; l'agrégat filtré
  suit les mêmes filtres que la liste ; les mois sont distincts et décroissants ;
  et le verrou : `resumerDepenses()` **égal champ pour champ** à
  `resumer(await listerDepenses())` sur le seed.
- **Architecture** — `resumerDepenses` et `listerMoisDepenses` entrent dans la
  liste blanche de `apps/web/test/architecture.test.ts`.
- **e2e (360 px)** — le formulaire de saisie précède l'historique dans la page, et
  « Voir plus » allonge la liste. Le canari du solde est à revérifier : il ne doit
  porter d'assertion ni sur le nombre de lignes affichées, ni sur une ligne
  ancienne, qui passe désormais sous la borne.

## Ce qu'on ne fait pas

- **Pas de pagination par pages.** « Voir plus » cumulatif garde un seul fil de
  lecture, ce qui compte plus au pouce que de pouvoir sauter à la page 3.
- **Pas de défilement infini.** Il enlève à l'utilisateur le contrôle de ce qu'il
  charge, et rend le bas de page inatteignable.
- **Pas de filtre par type**, toujours : #28 l'avait écarté pour ne pas alourdir
  l'écran, et borner la liste ne change pas cet arbitrage.
