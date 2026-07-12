---
name: seed
description: Réinitialise la base locale au seed de reprise du Google Sheet et vérifie que le solde de référence (1 145,80 €) est intact.
---

# Seed de HomeBudget

Remet la base locale dans l'état de la reprise du Sheet, puis se vérifie.

## Marche à suivre

Une seule commande, à la racine :

    pnpm db:reset

Elle détruit le volume Postgres, remonte le conteneur, applique les migrations,
puis lance le seed. Aucune variable d'environnement n'est requise en local :
`src/client.ts` retombe sur le Postgres local par défaut. En production,
`DATABASE_URL` la remplace.

Si tu veux seulement rejouer le seed sur une base déjà migrée :

    pnpm --filter @homebudget/db db:seed

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
