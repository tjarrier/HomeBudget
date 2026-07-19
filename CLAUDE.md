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
une erreur. Une seule variable d'environnement pour la connexion : `DATABASE_URL`
(l'authentification a les siennes — `BETTER_AUTH_SECRET`, `ALLOWLIST_THOMAS`,
`ALLOWLIST_LIZ`, etc. —, voir « L'application web » plus bas).

**Drizzle ne possède pas le schéma.** Il donne le typage et les requêtes. Mais les
invariants vivent dans des migrations **écrites à la main** :

- `0001_invariants.sql` — `EXCLUDE USING gist` (pas deux versions qui se chevauchent),
  le trigger append-only, la fonction `creer_version_config()`.
- `0002_append_only_delete.sql` — l'append-only étendu à `DELETE`.
- `0004_depense_dans_sa_version.sql` — **le point de passage obligé de la règle 4** :
  une dépense ne peut référencer qu'une version qui *couvre sa date*. Et une version
  qui porte déjà des dépenses n'accepte plus que sa clôture.
- `0006` — les tables de Better Auth (`user`, `session`, `account`, `verification`),
  dans notre propre Postgres. Aucun SDK Supabase, toujours aucune Row Level Security :
  la frontière de sécurité est le hook d'allowlist du serveur, pas la base.
- `0007` — `CHECK personne_valide` sur `user.personne` : la base refuse physiquement
  toute valeur hors `thomas`/`liz`, tout en laissant la colonne nullable (Better Auth
  insère la ligne avant que le hook ne la remplisse).

C'est là que se joue le projet. Une dépense rattachée à la config *courante* au lieu de
celle *à sa date* produit des parts qui somment juste au mauvais ratio : le bug du Sheet,
que rien d'autre n'attraperait. La base le refuse maintenant physiquement.

> **`drizzle-kit push` est interdit.** Il compare le schéma TS à la base et propose
> de supprimer ce qu'il ne reconnaît pas : c'est-à-dire exactement nos garde-fous.
> Le seul chemin autorisé est `db:generate` puis `db:migrate`. Si tu modifies le
> schéma, génère une migration ; ne pousse jamais.

## L'application web

`apps/web` est une application Next.js (App Router). Elle est **UI seulement** :

- Elle n'importe ni `drizzle-orm`, ni `pg`, ni `client.ts`, et n'écrit aucune ligne de
  SQL. Son seul accès aux données est la façade de `packages/db` : `listerVersions`,
  `listerDepenses`, `ajouterDepense`, `creerVersion`, `calculerPartsPourSaisie`.
  `apps/web/test/architecture.test.ts` le vérifie par **liste blanche** : tout nom
  importé de `@homebudget/db` hors de cette façade fait échouer le test — en
  particulier `db`, le client Drizzle brut, que `packages/db` réexporte.
  **Une seule exception, déclarée et commentée dans le test** : `lib/auth.ts`, qui
  reçoit `db` et les tables d'auth parce que `drizzleAdapter` de Better Auth exige
  l'instance Drizzle elle-même. Ce fichier ne contient aucune requête métier.
- Chaque `page.tsx` du groupe `(app)` appelle `exigerSession()` **en première ligne**.
  Le layout l'appelle aussi, mais Next.js ne garantit pas de re-rendre un layout à
  chaque requête de segment, et `middleware.ts` ne fait qu'une vérification
  *optimiste* (présence du cookie, pas sa signature) — délibérément. La garde réelle
  est dans la page ; un test statique la verrouille pour toute page future.
- Elle n'implémente aucun calcul de répartition, de solde ou de résolution de version.
- Toute écriture passe par une Server Action qui appelle `exigerSession()` **en première
  ligne** : une Server Action est un endpoint HTTP, joignable sans jamais charger la page.

**Authentification.** Better Auth, provider Google, ses tables dans notre Postgres
(migration `0006`). Il n'y a pas d'inscription : un hook `databaseHooks.user.create.before`
(`apps/web/lib/allowlist.ts`) rejette toute adresse hors des deux autorisées et pose la
colonne `user.personne`. Sans RLS, **ce hook est la sécurité du projet** ; il est verrouillé
par `apps/web/test/allowlist.test.ts`, qui ne dépend d'aucun credential Google.

**L'aperçu des parts** partage la fonction `calculerPartsPourSaisie()` avec l'écriture
réelle. Ne les dédouble jamais : un aperçu qui diverge de l'écriture est un mensonge
affiché à l'utilisateur.

## Commandes

    pnpm test            tous les tests (aucune dépendance à Docker)
    pnpm test:domain     le cœur métier seul (rapide)
    pnpm typecheck       vérification des types du monorepo
    pnpm lint            Biome
    pnpm format          Biome, en écriture

    pnpm dev             lance l'application sur http://localhost:3000
    pnpm --filter @homebudget/web test:e2e    les trois parcours Playwright

    pnpm db:up           Postgres local (un conteneur)
    pnpm db:reset        détruit, remonte, migre et seede la base
    pnpm db:down         arrête Postgres

## Le canari

`packages/db/test/import-sheet.test.ts` rejoue les 33 lignes réelles du Sheet et
vérifie que le solde vaut **exactement 114 580 centimes** (« Liz doit 1 145,80 €
à Thomas »). Si ce test tombe, une des quatre règles ci-dessus a été violée.
Ne l'ajuste pas pour le faire passer : trouve ce qui a cassé.

Le même solde est vérifié après un aller-retour complet par Postgres
(`packages/db/test/facade.integration.test.ts`) et à l'écran
(`apps/web/e2e/parcours.spec.ts`).
