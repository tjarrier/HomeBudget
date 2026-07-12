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

## Si la modification touche `packages/db/`

Les invariants sont dans la base, pas dans le code. Il faut les exercer :

    pnpm db:up
    pnpm --filter @homebudget/db db:migrate
    pnpm --filter @homebudget/db test:integration

Ces tests prouvent que la base **refuse** d'écrire une donnée qui viole le PRD :
versions qui se chevauchent, version close modifiée ou supprimée, parts qui ne
somment pas au montant.

Si tu as touché à `src/schema.ts`, il faut une migration :

    pnpm --filter @homebudget/db db:generate

**N'utilise jamais `drizzle-kit push`.** Il compare le schéma TS à la base et
propose de supprimer ce qu'il ne reconnaît pas — c'est-à-dire l'`EXCLUDE`, le
trigger append-only et la fonction `creer_version_config()`, qui vivent dans
`drizzle/0001_invariants.sql` et `drizzle/0002_append_only_delete.sql`, et
n'apparaissent nulle part dans `schema.ts`. Aucun script `db:push` n'existe
dans ce dépôt : le seul chemin est `db:generate` puis `db:migrate`.

## Si la modification touche `packages/domain`

Vérifie qu'aucune dépendance de production n'a été ajoutée :

    cat packages/domain/package.json

Le bloc `dependencies` doit rester absent (seul `@types/node` figure en
`devDependencies`). Le domaine est pur — c'est ce qui le rend testable sans
mock et réutilisable partout.

## Avant de déclarer que c'est fini

Montre la sortie réelle des commandes. Ne dis pas « les tests passent » sans
l'avoir vu.
