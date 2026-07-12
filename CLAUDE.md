# HomeBudget — manuel d'opération

Budget partagé entre Thomas et Liz. Remplace un Google Sheet dont les formules
recalculaient rétroactivement tout l'historique à chaque changement de config.

**Spec :** `docs/superpowers/specs/2026-07-12-homebudget-harness-design.md`
**Données source :** `docs/data/sheet-export-2026-07-12/`

## Les règles qui ne se négocient pas

Le projet existe pour faire tenir ces quatre règles. Du code qui les viole est
faux, même s'il passe les tests et paraît plus simple.

1. **L'argent est un entier de centimes.** `1 110,58 €` s'écrit `111058`. Aucun
   flottant, nulle part — ni en base, ni dans le domaine. Le formatage en euros
   n'existe qu'à l'affichage.

2. **Arrondi asymétrique.** `part_thomas = Math.round(montant × ratio)`, puis
   `part_liz = montant − part_thomas`. Jamais deux arrondis : la somme doit être
   exacte *par construction*, pas par chance.

3. **Config append-only.** On ne modifie jamais une version de config passée. Une
   révision de loyer crée une *nouvelle* version qui clôture la précédente la
   veille. C'est la raison d'être du projet.

4. **Snapshot on write.** Les parts d'une dépense sont figées à sa création,
   d'après la config en vigueur *à la date de la dépense*. Aucune lecture ne
   recalcule jamais une part. Si tu écris un `SELECT` ou une vue qui recalcule
   une part, tu viens de réintroduire le bug du Sheet.

## Le piège qui coûte de l'argent

Le mode `transfert` n'est **pas** « 100 % au payeur », malgré ce que suggère le
PRD. Quand Liz verse 400 € à Thomas :

    part_liz = 0        part_thomas = 400
    solde_liz = 400 − 0 = +400   → la dette de Liz BAISSE de 400 €

Inverser ce signe fait dire à l'app que Liz doit 800 € de plus. Un test verrouille
le signe : ne le « corrige » pas.

## Architecture

- `packages/domain` — TypeScript pur, **zéro dépendance de production**. Toute la
  logique métier vit ici. Si tu écris une règle de calcul ailleurs, tu te trompes
  d'endroit.
- `packages/db` — schéma Postgres et import du Sheet. Les invariants ci-dessus
  sont des contraintes SQL (`EXCLUDE`, `CHECK`, triggers), pas des `if`. La base
  refuse physiquement d'écrire une donnée qui viole le PRD.
- `apps/web` — Next.js. UI seulement. Appelle le domaine, jamais l'inverse.

Les dates sont des chaînes ISO `YYYY-MM-DD`, jamais des objets `Date` (ils portent
un fuseau, ce qui décale les bornes de version d'un jour). Drizzle rend les colonnes
`date` en chaînes : ne les convertis pas en `Date`.

## Base de données

**Postgres, et rien d'autre.** Un conteneur Docker en local (`pnpm db:up`), Supabase
en production. On n'utilise **aucun** SDK Supabase : ni `supabase-js`, ni PostgREST,
ni Supabase Auth. Si tu vois passer `createClient` de `@supabase/supabase-js`, c'est
une erreur. Une seule variable d'environnement : `DATABASE_URL`.

**Drizzle ne possède pas le schéma.** Il donne le typage et les requêtes. Mais les
invariants — `EXCLUDE USING gist`, le trigger append-only, la fonction
`creer_version_config()` — vivent dans `drizzle/0001_invariants.sql`, écrit à la main.

> **`drizzle-kit push` est interdit.** Il compare le schéma TS à la base et propose
> de supprimer ce qu'il ne reconnaît pas : c'est-à-dire exactement nos garde-fous.
> Le seul chemin autorisé est `db:generate` puis `db:migrate`. Si tu modifies le
> schéma, génère une migration ; ne pousse jamais.

L'accès à la base se fait depuis les Server Actions uniquement. Le navigateur n'a
jamais d'accès direct — c'est pourquoi il n'y a pas de Row Level Security à
maintenir : la frontière de sécurité est le serveur.

## Authentification

**Better Auth**, provider Google, avec ses tables dans notre propre base. Deux
adresses sont autorisées, point. Il n'y a pas d'inscription : un hook rejette toute
adresse hors allowlist, et un test le vérifie.

## Commandes

    pnpm test            tous les tests (aucune dépendance à Docker)
    pnpm test:domain     le cœur métier seul (rapide)
    pnpm typecheck       vérification des types du monorepo
    pnpm lint            Biome
    pnpm format          Biome, en écriture

    pnpm db:up           Postgres local (un conteneur)
    pnpm db:reset        détruit, remonte, migre et seede la base
    pnpm db:down         arrête Postgres

## Le canari

`packages/db/test/import-sheet.test.ts` rejoue les 33 lignes réelles du Sheet et
vérifie que le solde vaut **exactement 114 580 centimes** (« Liz doit 1 145,80 €
à Thomas »). Si ce test tombe, une des quatre règles ci-dessus a été violée.
Ne l'ajuste pas pour le faire passer : trouve ce qui a cassé.
