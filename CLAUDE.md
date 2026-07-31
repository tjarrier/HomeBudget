# HomeBudget — manuel d'opération

Budget partagé entre Thomas et Liz. Remplace un Google Sheet dont les formules
recalculaient rétroactivement tout l'historique à chaque changement de config.

**Spec :** `docs/superpowers/specs/2026-07-12-homebudget-harness-design.md`
**Données source :** `docs/data/sheet-export-2026-07-12/`
**Installation et prise en main :** `README.md`

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

**Postgres, et rien d'autre.** Un conteneur Docker en local (`task db:up`), Supabase
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

**L'origine annoncée à Google** est `BETTER_AUTH_URL`, posée par l'environnement et jamais
devinée (`apps/web/lib/origine.ts`). Google n'accepte **aucun wildcard** dans ses
*Authorized redirect URIs* : l'origine doit correspondre au caractère près à une entrée
enregistrée à la main dans la console. Elle doit donc être stable, ce qu'aucune URL de
déploiement Vercel n'est.

Sur Vercel, l'absence de la variable **fait échouer le démarrage**, délibérément. Le repli
`localhost` serait le pire des cas : cette URI *est* enregistrée chez Google, donc le tour
OAuth réussirait et renverrait l'utilisateur sur son propre poste — sans aucune erreur.

- **Cible Preview : `https://home-budget-git-main-tjarriers-projects.vercel.app`.** C'est
  l'URL de branche de `main`, et depuis que `apps/web/vercel.json` coupe les déploiements
  de l'intégration Git, elle ne sert plus la production : Vercel ne déploie plus `main` du
  tout, c'est `deploy-preview.yml` qui le fait, **en preview**, donc avec les variables
  d'environnement Preview. L'avertissement inverse qui figurait ici ne valait que tant que
  l'intégration Git envoyait `main` en production.
- **On ne choisit pas ce hostname, on choisit la ref.** Vercel le fabrique à partir de la
  ref git du déploiement, et les sous-domaines `*.vercel.app` sont réservés : aucun
  `vercel alias set` n'est possible dessus. Ne reconstruis jamais ce nom à la main non
  plus : au-delà de 63 caractères avant `.vercel.app`, Vercel tronque et retire le slug de
  scope en entier. Lis-le dans le résumé du run de `deploy-preview.yml`, qui affiche côte à
  côte l'origine annoncée à Google et les hôtes réellement attribués.
- **`DATABASE_URL` de Preview doit pointer sur une autre base que la production.** Une
  preview branchée sur la prod y crée de vraies dépenses et de vraies versions de config —
  et une version qui porte des dépenses n'est plus supprimable (`0002` et la FK `restrict`).
- `trustedOrigins` ajoute l'URL unique du déploiement, celle que propose le dashboard
  Vercel : sans elle, la preview ouverte depuis le dashboard refuse la connexion en
  mismatch d'origine.
- `createAuthClient()` reste sans `baseURL` : le client utilise l'origine courante du
  navigateur, donc il fonctionne sur n'importe quel hôte sans configuration.

**L'aperçu des parts** partage la fonction `calculerPartsPourSaisie()` avec l'écriture
réelle. Ne les dédouble jamais : un aperçu qui diverge de l'écriture est un mensonge
affiché à l'utilisateur.

## Déploiement

**Vercel ne déploie plus rien tout seul.** `apps/web/vercel.json` pose
`git.deploymentEnabled: false`. Le fichier est dans `apps/web` et non à la racine parce
que c'est le *Root Directory* du projet Vercel : Vercel ne lit que celui-là, et un fichier
à la racine serait ignoré en silence — `main` repartirait en production par la porte de
derrière, sans que rien ne le signale.

Deux workflows, un seul déployeur, et une seule définition de « vérifié » : `ci.yml` est
appelable (`workflow_call`), les deux l'appellent, aucun ne recopie ses étapes.

- **Preview au merge** (`deploy-preview.yml`) : push sur `main`, ou déclenchement manuel
  sur une branche. Cible `-git-main-`.
- **Production au tag** (`deploy-production.yml`) : un tag `vX.Y.Z`. Le workflow refuse un
  tag posé hors de `main`, rejoue la CI complète (un tag peut pointer un commit qu'elle n'a
  jamais vu), puis attend une revue humaine.

**L'ordre ne se négocie pas : construction d'abord, migration ensuite, promotion finalement.**
Rien ne s'écrit sur la base avant qu'un artefact existe, et la migration précède toujours la
promotion, afin que le code neuf ne parle jamais à un schéma vieux. `apps/web/test/deploiement.test.ts`
le verrouille en comparant les positions des trois étapes dans chaque workflow — n'y écris pas
`vercel build` ou `vercel deploy` dans un commentaire placé avant l'étape de migration, tu ferais
tomber le test à juste titre.

`drizzle-kit push` reste interdit, y compris en production. Les workflows appellent
`db:migrate`.

Approuver le déploiement de production, ce n'est pas seulement publier du code : c'est
autoriser une migration sur la base réelle. La revue se place après le vert de la CI et
avant l'écriture.

## Commandes

Le point d'entrée est `Taskfile.yml` (`task` seul liste tout). Il n'y a pas deux
sources de vérité : chaque tâche appelle le script pnpm correspondant. Ce que le
Taskfile ajoute, ce sont les prérequis qu'un script npm ne sait pas exprimer.

    task verif           la porte avant de committer : lint + typecheck + test
    task test            tous les tests unitaires (aucune dépendance à Docker)
    task test:domain     le cœur métier seul (rapide)
    task typecheck       vérification des types du monorepo
    task lint            Biome
    task format          Biome, en écriture

    task dev             lance l'application sur http://localhost:3000
    task test:integration    les invariants SQL et la façade, contre Postgres
    task test:e2e:frais      base neuve, puis les parcours Playwright

    task db:up           Postgres local (un conteneur)
    task db:reset        détruit, remonte, migre et seede la base — DESTRUCTIF
    task db:down         arrête Postgres
    task ci              rejoue localement la séquence exacte de la CI — DESTRUCTIF

Deux garde-fous y sont encodés, et ce sont les seules raisons d'utiliser `task`
plutôt que `pnpm` directement :

- Les tâches qui touchent la base **refusent de démarrer** si le conteneur ne tourne
  pas. Sans ça, l'échec arrive plus tard, sous la forme d'un timeout de connexion que
  personne ne relie à Docker.
- `task test:e2e` ne réinitialise **pas** la base : les parcours y écrivent, et le
  canari vérifie le seed, donc un second passage sur la même base échoue à juste titre.
  `task test:e2e:frais` fait le `db:reset` d'abord. La destruction est nommée, jamais
  implicite — ce n'est pas à une commande de test d'effacer des données sans le dire.

## Le canari

`packages/db/test/import-sheet.test.ts` rejoue les 33 lignes réelles du Sheet et
vérifie que le solde vaut **exactement 114 580 centimes** (« Liz doit 1 145,80 €
à Thomas »). Si ce test tombe, une des quatre règles ci-dessus a été violée.
Ne l'ajuste pas pour le faire passer : trouve ce qui a cassé.

Le même solde est vérifié après un aller-retour complet par Postgres
(`packages/db/test/facade.integration.test.ts`) et à l'écran
(`apps/web/e2e/parcours.spec.ts`) — à l'écran, **dans les deux tailles** : au large et
sur le téléphone de 360 px (`apps/web/e2e/telephone.ts`), parce que c'est celui-là qui
sert. Le parcours de saisie s'y rejoue aussi, et dans cet ordre : les deux canaris lisent
le seed intact avant que la moindre saisie ne l'écrive.
