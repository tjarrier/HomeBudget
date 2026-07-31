# HomeBudget

Budget partagé entre Thomas et Liz. Il remplace un Google Sheet dont les formules
recalculaient rétroactivement tout l'historique à chaque changement de configuration :
une révision de loyer saisie aujourd'hui réécrivait les parts de l'an dernier.

Ici, les parts d'une dépense sont **figées à sa création**, d'après la configuration en
vigueur *à la date de la dépense*. Aucune lecture ne recalcule jamais une part.

## Démarrage

Prérequis : Node ≥ 22 (voir `.nvmrc`), [pnpm](https://pnpm.io), Docker, et
[Task](https://taskfile.dev) pour les commandes ci-dessous.

```sh
task install
cp .env.example .env                 # outillage base de données
cp .env.example apps/web/.env.local  # l'application Next et Playwright
task db:reset                        # Postgres, migrations, seed
task dev                             # http://localhost:3000
```

Se connecter demande un client OAuth Google (origine `http://localhost:3000`, URI de
redirection `http://localhost:3000/api/auth/callback/google`) et ses identifiants dans
`apps/web/.env.local`. **Il n'y a pas d'inscription** : seules les deux adresses de
`ALLOWLIST_THOMAS` et `ALLOWLIST_LIZ` peuvent entrer.

## Commandes

`task` seul liste tout. Les principales :

| Commande | Ce qu'elle fait |
| --- | --- |
| `task verif` | La porte avant de committer : lint, types, tests unitaires |
| `task test` | Tous les tests unitaires — aucune dépendance à Docker |
| `task test:domain` | Le cœur métier seul, la boucle la plus rapide |
| `task test:integration` | Les invariants SQL et la façade, contre Postgres |
| `task test:e2e:frais` | Base neuve, puis les trois parcours Playwright |
| `task dev` | L'application sur http://localhost:3000 |
| `task db:up` / `db:down` | Démarre / arrête le Postgres local (port 5433) |
| `task db:reset` | **Destructif** : détruit le volume, remigre, reseede |
| `task ci` | **Destructif** : rejoue localement la séquence exacte de la CI |

Les tâches qui ont besoin de la base refusent de démarrer si le conteneur ne tourne
pas, plutôt que d'échouer plus tard sur un timeout de connexion illisible.

## Livrer

Le déploiement est fait par GitHub Actions, jamais à la main, et jamais par Vercel de sa
propre initiative.

- **Un push sur une branche** lance la CI, et rien d'autre : lint, types, tests, invariants
  SQL et parcours Playwright. Pas besoin d'ouvrir une PR pour la déclencher, et quand la PR
  existe, ce run est le check qu'elle affiche.
- **Un merge dans `main`** publie une preview sur
  `home-budget-git-main-tjarriers-projects.vercel.app`, après CI verte. Le résumé du run
  affiche l'URL et les hôtes attribués. Cet hôte est la cible attendue, à confirmer par le
  premier run réel (voir `CLAUDE.md` et le repli prévu si l'alias n'est pas attribué).
- **Un tag de version** publie en production :

  ```sh
  git tag v0.1.0
  git push origin v0.1.0
  ```

  Le workflow refuse le tag s'il ne pointe pas un commit de `main`, rejoue la CI complète,
  puis attend une approbation sur l'environment `Production` de GitHub. Approuver déclenche
  la construction, puis la migration de la base, puis la promotion, dans cet ordre.

Une CI rouge bloque les deux.

## Le canari

Les 33 lignes réelles du Sheet sont rejouées en test, et le solde doit valoir
**exactement 114 580 centimes** — « Liz doit 1 145,80 € à Thomas ». Le même montant est
vérifié trois fois : en mémoire, après un aller-retour complet par Postgres, et à
l'écran par Playwright.

Si ce chiffre bouge, une règle du projet a été violée. Ne l'ajustez pas pour faire
passer un test : cherchez ce qui a cassé.

## Architecture

- `packages/domain` — TypeScript pur, zéro dépendance de production. Toute la logique
  métier y vit : montants en centimes entiers, arrondi asymétrique, répartitions.
- `packages/db` — schéma Postgres. Les invariants sont des contraintes SQL (`EXCLUDE`,
  `CHECK`, triggers) écrites à la main, pas des `if` : la base refuse physiquement
  d'écrire une donnée qui violerait les règles.
- `apps/web` — Next.js (App Router), UI seulement, derrière Better Auth et l'allowlist.

**Documentation de travail :** [`CLAUDE.md`](CLAUDE.md) — les quatre règles qui ne se
négocient pas, le piège de signe sur les transferts, et pourquoi `drizzle-kit push` est
interdit. À lire avant de toucher au code, humain comme agent.

**Spécification :** `docs/superpowers/specs/2026-07-12-homebudget-harness-design.md`
