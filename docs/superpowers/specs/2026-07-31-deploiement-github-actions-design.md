# Déployer par GitHub Actions — preview au merge, production au tag

**Issue :** [#47](https://github.com/tjarrier/HomeBudget/issues/47)
**Date :** 2026-07-31

## Le problème

Le déploiement est implicite. L'intégration Git de Vercel publie seule, et un push
sur `main` part **en production**. Rien ne relie « la CI est verte » à « c'est en
ligne », et il n'existe aucune notion de version : la production suit `main`, commit
par commit.

On veut deux chemins nommés, un seul déployeur :

- un merge dans `main` publie une **preview**, après CI verte ;
- un tag `vX.Y.Z` publie en **production**, après CI verte et revue humaine.

## Décisions, et les trois écarts avec l'issue

L'issue est le cahier des charges. Trois de ses détails ne survivent pas au contact
de la configuration réelle du projet Vercel. Chaque écart est là pour tenir
l'*intention* de l'issue, pas pour la contourner.

### Écart 1 — `vercel.json` va dans `apps/web`, pas à la racine

Le **Root Directory** du projet Vercel `home-budget` vaut `apps/web`. Vercel ne lit
que le `vercel.json` de ce répertoire : un fichier posé à la racine serait ignoré en
silence, `git.deploymentEnabled: false` n'aurait aucun effet, et un merge dans `main`
continuerait de partir en production par la porte de derrière — sans que rien ne le
signale. C'est le pire mode de défaillance possible pour cette tâche, puisque tout le
reste en dépend.

Corollaire — et il va dans le sens **inverse** de l'intuition : la CLI Vercel tourne à
la **racine du dépôt**. Elle joint le Root Directory au répertoire courant, donc lancée
depuis `apps/web` elle cherche `apps/web/apps/web`. `vercel build` s'en tire par un
repli assorti d'un avertissement ; `vercel deploy --prebuilt` échoue net. Ce que la CLI
écrit — `.vercel/project.json`, le fichier d'environnement, `.vercel/output` — atterrit
donc à la racine, et les étapes qui le lisent aussi.

### Écart 2 — pas d'entrée `ref` sur le `workflow_dispatch`

`workflow_dispatch` a déjà un sélecteur de branche natif. Une entrée `ref` en plus
créerait une divergence réelle : le job `verif` vérifierait la branche du dispatch
pendant que le job `deploy` déploierait la ref saisie. Vert sur un commit, en ligne
sur un autre — exactement ce que cette tâche existe pour supprimer.

### Écart 3 — la cible Preview est l'alias d'auteur, et l'alias ne dépend pas de la ref

> **Corrigé après le premier passage réel.** Ce paragraphe affirmait que l'hôte est
> `-git-main-`, fabriqué à partir de la **ref git** du déploiement. La vérification
> prévue plus bas — celle qui devait confirmer au lieu de supposer — a démenti la
> supposition. Le texte d'origine est conservé en fin de section.

Les sous-domaines `*.vercel.app` **ne peuvent pas être assignés à la main** : ce sont
des noms réservés, aucun `vercel alias set` n'est possible dessus. Cette moitié tient.

Ce qui ne tenait pas, c'est *ce dont* Vercel fabrique le nom. Ce n'est pas la ref, c'est
la **source du déploiement**. L'API le montre sur le projet réel :

    source=cli  ref=main  → home-budget-tjarrier-...
    source=git  ref=main  → home-budget-tjarriers-projects, home-budget-git-main-...

Le déploiement de la CLI portait `main` en métadonnée et n'a reçu aucun `-git-main-`.
Les hôtes `-git-<branche>-` sont attribués par l'**intégration Git**, c'est-à-dire
exactement le mécanisme que l'écart 1 coupe. Un déploiement `--prebuilt` n'en obtiendra
donc jamais, quelle que soit la branche.

Ce qu'il obtient à la place est l'**alias d'auteur**, `<projet>-<utilisateur>-<scope>` :

    https://home-budget-tjarrier-tjarriers-projects.vercel.app

Il est stable, il suit le dernier déploiement, et Vercel le pose sans qu'on demande
rien. Sa seule dépendance est le compte propriétaire du `VERCEL_TOKEN` : en changer
change l'hôte, et le contrôle d'alias du workflow le signale au run suivant.

Corollaire sur le `workflow_dispatch` : un dispatch sur une autre branche ne produit
plus un hôte différent, il **reprend le même**. La connexion y fonctionne, mais la
preview de `main` cesse d'être en ligne jusqu'au prochain déploiement. Le contrôle
d'alias, qui ne s'appliquait qu'à `main`, vaut désormais sur toutes les refs.

Cet hôte fait 37 caractères avant `.vercel.app` : la troncature à 63 caractères dont
parle CLAUDE.md ne mord pas ici.

<details>
<summary>Le texte d'origine, démenti par le premier passage</summary>

> L'issue disait `-git-main-`, CLAUDE.md disait `-git-preview-`. Le point tranché : les
> sous-domaines `*.vercel.app` **ne peuvent pas être assignés à la main**, ce sont des
> noms réservés que Vercel fabrique lui-même à partir de la **ref git du déploiement**.
> Aucun `vercel alias set` n'est donc possible sur un hôte `.vercel.app` ; on ne choisit
> pas le hostname, on choisit la ref. La preview déploie le commit de `main`, donc
> l'hôte est `https://home-budget-git-main-tjarriers-projects.vercel.app`.

</details>

L'avertissement que CLAUDE.md portait par ailleurs (« `-git-main-` est un alias de la
production ») ne tenait que tant que l'intégration Git envoyait `main` en production.
Une fois `deploymentEnabled: false`, Vercel ne déploie plus `main` du tout ; c'est le
workflow qui le fait, en preview, donc avec les variables d'environnement Preview.

## 1. Vercel ne déploie plus tout seul

**`apps/web/vercel.json`** — nouveau fichier :

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": { "deploymentEnabled": false }
}
```

C'est la condition de tout le reste : sans lui, « production = tag » est faux.

**Conséquence assumée :** les previews automatiques par PR disparaissent. Une PR n'a
plus d'URL avant son merge ; le `workflow_dispatch` du workflow de preview les
remplace, à la demande.

## 2. `ci.yml` devient appelable, et ne tourne plus qu'une fois

```yaml
on:
  pull_request:
  workflow_call:
```

Le déclencheur `push: branches: [main]` disparaît. Sur `main`, c'est
`deploy-preview.yml` qui appelle la CI : un seul run, un seul signal vert, et il est
relié au déploiement. Une seule définition de « vérifié », pas trois copies qui
divergent.

Le job garde son service Postgres et ses variables factices : il n'a besoin d'aucun
secret, donc les appelants n'ont rien à lui passer (`secrets:` reste absent).

**Effet de bord à traiter à la main :** si une règle de protection de branche exige le
check `qualite`, son nom devient `verif / qualite` dans les runs appelés ; la règle
doit être mise à jour, sinon les PR restent bloquées sur un check qui n'arrive jamais.

## 3. Preview — `.github/workflows/deploy-preview.yml`

```
on: push (branches: main) | workflow_dispatch
concurrency: preview, cancel-in-progress: false   ← deux migrations ne courent pas
permissions: contents: read

verif   → uses: ./.github/workflows/ci.yml

deploy  → needs: verif
          environment: Preview
          1. checkout, pnpm install --frozen-lockfile
          2. db:migrate            ← DATABASE_URL, secret d'environment Preview
          3. npm i -g vercel@latest
          4. vercel pull --yes --environment=preview
          5. garde : BETTER_AUTH_URL présente dans l'environnement tiré ?
          6. vercel build
          7. URL=$(vercel deploy --prebuilt)
          8. vercel inspect $URL   → alias réellement attribués
          9. $GITHUB_STEP_SUMMARY : origine annoncée, URL unique, alias
```

`cancel-in-progress: false` n'est pas de la prudence décorative : la migration est
l'étape non idempotente de la chaîne, et deux runs concurrents sur la même base sont
la seule façon de la corrompre.

### La garde sur `BETTER_AUTH_URL` (étape 5)

Sans cette variable dans l'environnement Preview de Vercel, `next build` échoue :
`origineAuth()` refuse de démarrer sur Vercel plutôt que de retomber sur `localhost`
(c'est délibéré — voir `apps/web/lib/origine.ts`). La garde ne change pas le verdict,
elle le rend lisible et immédiat, avant deux minutes de build.

Elle sert surtout à alimenter le résumé : **l'origine annoncée à Google** d'un côté,
**les alias que Vercel a réellement attribués** de l'autre. C'est la vérification que
l'issue demande de faire pour de vrai, réduite à deux lignes qu'on lit côte à côte
après chaque déploiement.

L'étape ne fait qu'extraire cette seule variable de `.vercel/.env.preview.local` —
ce fichier contient aussi `DATABASE_URL` et `GOOGLE_CLIENT_SECRET`, il ne doit jamais
être affiché.

### Le déclenchement manuel

Un dispatch sur une autre branche reprend le **même** hôte : l'alias d'auteur ne dépend
pas de la ref (écart 3). La connexion Google y fonctionne donc, mais l'alias quitte le
déploiement précédent — la preview de `main` cesse d'être en ligne jusqu'au prochain
merge. Le résumé du run affiche la ref déployée à côté de l'origine, ce qui rend l'état
lisible plutôt que surprenant.

## 4. Production — `.github/workflows/deploy-production.yml`

```
on: push (tags: v[0-9]+.[0-9]+.[0-9]+)
concurrency: production, cancel-in-progress: false
permissions: contents: read

garde   → refuse si le commit tagué n'est pas un ancêtre de main
verif   → needs: garde, uses: ./.github/workflows/ci.yml
deploy  → needs: verif
          environment: Production   ← reviewer requis
          1. checkout, pnpm install --frozen-lockfile
          2. db:migrate            ← DATABASE_URL, secret d'environment Production
          3. vercel pull --yes --environment=production
          4. vercel build --prod
          5. vercel deploy --prebuilt --prod
```

**La garde d'ancêtre est un job, pas une étape.** Un tag posé sur un commit hors
`main` est refusé en dix secondes, sans brûler Playwright et Postgres pour rien
(`git merge-base --is-ancestor $GITHUB_SHA origin/main`, avec `fetch-depth: 0`).

**Un tag peut pointer un commit que la CI n'a jamais vu** : le workflow rejoue la
vérification complète, il ne fait pas confiance à l'historique.

**L'ordre migration → promotion n'est pas négociable**, et il est séquentiel dans un
seul job : une migration qui échoue arrête le déploiement avant que du code neuf ne
parle à un schéma vieux. La revue humaine se place après le vert de la CI et avant la
migration — approuver, c'est autoriser l'écriture en base.

`drizzle-kit push` reste interdit, y compris ici. Le workflow appelle `db:migrate`.

## 5. Ce qui verrouille tout ça — `apps/web/test/deploiement.test.ts`

Dans le style de `architecture.test.ts` : lecture de fichiers, aucune dépendance
ajoutée. `JSON.parse` pour `vercel.json` ; pour les workflows, des assertions de
texte et des comparaisons de position (pas de parseur YAML dans le projet, et on n'en
ajoute pas un pour ça).

Le test vérifie :

1. `apps/web/vercel.json` existe et pose `git.deploymentEnabled === false` ;
2. `ci.yml` expose `workflow_call` et ne se déclenche plus sur `push` ;
3. les deux workflows de déploiement appellent `./.github/workflows/ci.yml`, et leur
   job `deploy` en dépend par `needs` ;
4. **`db:migrate` apparaît avant `vercel deploy` dans les deux** — la règle non
   négociable, testée et non plus seulement écrite ;
5. aucun `drizzle-kit push` sous `.github/` ;
6. la production ne se déclenche que sur tag (aucun `branches:`), et la preview ne
   contient jamais `--prod` ;
7. chaque job `deploy` déclare son `environment`.

Le fichier vit dans `apps/web/test` parce que c'est le paquet déployé, que
`vercel.json` y est désormais, et que `pnpm test` (donc la CI) n'exécute que les tests
des paquets du workspace. Un commentaire d'en-tête le dit, pour que personne ne le
prenne pour un test d'UI égaré.

## 6. Documentation à reprendre

- **CLAUDE.md** — la section « L'application web » affirme que `-git-main-` est un
  alias de la production et prescrit une branche `preview` figée. Les deux deviennent
  faux. Ajouter une section « Déploiement » : preview au merge, production au tag, la
  migration avant la promotion, `drizzle-kit push` toujours interdit.
- **`apps/web/test/origine.test.ts`** — ses fixtures utilisent
  `-git-preview-`. Les passer à l'alias d'auteur : le test ne change pas de sens (il
  vérifie qu'on lit la variable et qu'on ignore l'URL unique du déploiement), mais il
  cesse de documenter un hôte qu'on n'utilise pas.
- **README.md** — comment on livre : `git tag v0.1.0 && git push origin v0.1.0`, puis
  approuver l'environment `Production`.

## Prérequis humains, dans cet ordre

Aucun de ces points n'est automatisable, et les trois premiers bloquent le premier
passage.

1. **Secrets de dépôt** : `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
2. **Secrets d'environment** (les environments `Preview` et `Production` existent
   déjà, créés par le bot Vercel) :
   - `Preview` → `DATABASE_URL` de la base de preview, **distincte de la
     production**. Une preview branchée sur la prod y crée de vraies dépenses et de
     vraies versions de config, et une version qui porte des dépenses n'est plus
     supprimable (`0002` et la FK `restrict`).
   - `Production` → `DATABASE_URL` de Supabase, **plus la protection par reviewer**.
3. **Variables d'environnement Preview du projet Vercel** :
   `BETTER_AUTH_URL=https://home-budget-tjarrier-tjarriers-projects.vercel.app`, plus
   `DATABASE_URL` (la base de preview), `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `ALLOWLIST_THOMAS`, `ALLOWLIST_LIZ`.
4. **Console Google, après la vérification du premier passage** : ajouter le redirect
   URI `https://home-budget-tjarrier-tjarriers-projects.vercel.app/api/auth/callback/google`.

## La vérification du premier passage

L'issue le dit : il faut le vérifier pour de vrai, pas le supposer. Il restait une
inconnue que seul un run pouvait trancher — **est-ce que Vercel attribue l'alias de
branche à un déploiement `--prebuilt` fait par la CLI, alors que les déploiements Git
sont désactivés ?**

**Le run a répondu non**, et c'est ce qui a produit la version corrigée de l'écart 3.
Le repli imaginé ici — faire porter au déploiement une autre ref, pour obtenir
`-git-preview-` — n'aurait pas marché : il reposait sur la même croyance fausse. La
ref n'y change rien, la source du déploiement seule compte. La cible retenue est
l'alias d'auteur, que Vercel attribue déjà de lui-même.

Ce qu'il reste à vérifier, une fois `BETTER_AUTH_URL` et le redirect URI posés :

1. le résumé du run fait coïncider l'origine annoncée et les hôtes attribués sur
   `home-budget-tjarrier-tjarriers-projects.vercel.app` — le workflow échoue sinon ;
2. ouvrir cette URL et vérifier qu'elle sert la **base de preview**, pas la
   production (le solde y diffère, ou la base est vide) ;
3. tester la connexion Google.

Et une inconnue demeure, sur l'autre moitié : **quels alias Vercel donne-t-il à un
`vercel deploy --prebuilt --prod` fait par la CLI ?** Le domaine de production
`home-budget-tjarriers-projects.vercel.app` est attaché au *projet* et non à
l'intégration Git, donc il devrait suivre — mais c'est exactement le raisonnement qui
vient d'être démenti pour la preview. Le premier tag le tranchera ; en attendant, ne
pas le supposer.

## Ce qu'on ne fait pas

- **Pas de tâche `task deploy`.** Le déployeur est la CI, et lui seul ; une commande
  locale de déploiement rouvrirait précisément le chemin qu'on ferme.
- **Pas de rollback automatique.** Une migration ratée arrête le déploiement, donc la
  production continue de tourner sur l'ancien code avec l'ancien schéma. Revenir en
  arrière sur une migration déjà appliquée est une décision humaine, pas un `if` dans
  un workflow.
- **Pas de version épinglée pour la CLI Vercel** (`vercel@latest`). L'épingler
  demanderait de la déclarer en dépendance du dépôt pour rien : la CLI n'est pas du
  code du projet, et c'est l'usage documenté par Vercel pour GitHub Actions.
