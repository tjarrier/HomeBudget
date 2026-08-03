# Un hôte de preview fixe, sans domaine personnalisé

**Issue :** [#55](https://github.com/tjarrier/HomeBudget/issues/55)
**Date :** 2026-08-03

## Le problème

La preview sert à valider une feature à deux, Thomas et Liz, avant de poser un tag.
Son URL circule donc : elle est mise en favori, elle s'envoie dans un message. Elle
doit être stable et lisible.

Elle ne l'est ni l'un ni l'autre. `CLAUDE.md` décrit la cible comme l'**alias
d'auteur** `home-budget-tjarrier-tjarriers-projects.vercel.app`, avec trois
contraintes qu'on subit plutôt qu'on ne choisit :

- Il ne se pose pas à la main — les sous-domaines `*.vercel.app` sont réservés,
  aucun `vercel alias set` n'est possible dessus.
- Il porte le nom du compte qui déploie. Changer le propriétaire du `VERCEL_TOKEN`
  change l'hôte, donc casse le tour OAuth : Google n'accepte aucun wildcard dans ses
  *Authorized redirect URIs*.
- Il ne se reconstruit pas. Au-delà de 63 caractères avant `.vercel.app`, Vercel
  tronque et retire le slug de scope en entier.

L'issue #55 proposait de résoudre tout ça par un domaine personnalisé,
`preview.homebudget.thomasjarrier.fr`. **Ce chemin est fermé** : le plan gratuit de
Vercel ne permet pas d'affecter un domaine à l'environnement Preview. Et l'usage d'un
domaine personnel pour ce projet n'est pas souhaité.

Le besoin de l'issue reste entier ; c'est sa solution qui change.

## L'idée

Vercel attribue automatiquement à **tout projet** un domaine de production
`<projet>.vercel.app`, qui suit son dernier déploiement de production.

On crée donc un second projet Vercel, `homebudget-preview`, et **sa production est
notre preview**. `deploy-preview.yml` déploie dessus avec `--prod`.

Les trois contraintes tombent, sans aucun domaine personnalisé :

- L'hôte porte le nom du **projet**, pas celui de l'auteur du token. Changer de
  compte déployeur ne le change plus.
- Il ne dépend pas de la ref — il n'en dépendait déjà pas, l'intégration Git étant
  coupée, mais désormais il ne dépend plus de rien d'observable.
- Il est court, donc jamais tronqué.
- Bonus non négligeable : un déploiement de **production** n'est pas derrière le SSO
  Vercel. Liz l'ouvre sans compte Vercel, ce que la Deployment Protection des
  previews aurait pu empêcher.

L'hôte cible est `https://homebudget-preview.vercel.app`. Il se **lit** au premier
déploiement, il ne se reconstruit pas : si le nom était déjà pris globalement, Vercel
attribue `homebudget-preview-<scope>.vercel.app`, et c'est cette valeur-là qui va
dans `BETTER_AUTH_URL`. Le dépôt a déjà payé une fois pour avoir supposé la façon dont
Vercel fabrique un nom.

### Ce qui ne bouge pas

Le code de l'application : **rien**. `origineAuth()` ne lit `VERCEL_ENV` que pour
répondre « suis-je sur Vercel », jamais pour distinguer preview de production —
seule `BETTER_AUTH_URL` détermine l'origine annoncée à Google, et elle est posée par
l'environnement. `createAuthClient()` reste sans `baseURL` et suit l'origine du
navigateur. `originesDeConfiance()` continue d'ajouter l'URL unique du déploiement,
ce qui permet d'ouvrir la preview depuis le dashboard Vercel.

L'ordre construction → migration → promotion. La base de recette : le secret
`DATABASE_URL` de l'environment GitHub `Preview` reste la source, et reste distincte
de la production. `apps/web/vercel.json` et `git.deploymentEnabled: false` — le
fichier vit dans le Root Directory, que les deux projets partagent, donc il coupe les
déploiements automatiques des deux d'un seul geste.

## Le danger que cette solution introduit

`deploiement.test.ts` contient aujourd'hui une assertion à une ligne :

```js
it('ne promeut jamais en production', () => {
  expect(preview).not.toContain('--prod')
})
```

C'est le filet qui empêche le workflow de preview d'écraser la production. Cette
solution ajoute `--prod` : le filet doit être **remplacé**, pas retiré.

Ce qu'il protège est réel. `VERCEL_PROJECT_ID` sera surchargé par un secret de
l'environment GitHub `Preview` — le mécanisme déjà en place pour `DATABASE_URL`. Mais
si ce secret d'environment est absent ou mal orthographié, **GitHub retombe en silence
sur celui du dépôt**, qui désigne le projet de production. Le workflow de preview
ferait alors `vercel deploy --prebuilt --prod` sur la production, publiant un commit
de `main` jamais taggé, sans revue, sans version.

Et la promotion n'est même pas le premier dégât. L'étape « Aligner `DATABASE_URL` sur
le secret GitHub » écrit dans le projet Vercel ciblé : sur le mauvais projet, elle
écrase la `DATABASE_URL` de **production** avec celle de la base de recette. La
production servirait alors les données de test, et le workflow de production suivant
la réécrirait sans que rien n'ait jamais signalé l'incident.

Le contrôle d'alias final détecterait la promotion — l'hôte attribué ne serait pas
celui attendu — mais après coup. Et il ne verrait rien de l'écrasement de la variable.

C'est exactement la classe de piège que le dépôt connaît déjà : un mécanisme qui
échoue sans le dire. La leçon de `vercel env add` était « une commande peut sortir
en 0 sans rien faire » ; celle-ci est « un secret absent ne vaut pas vide, il vaut
autre chose ».

### La garde : « Confirmer la cible »

Une étape placée **avant `vercel pull`**, donc avant la première commande qui parle à
Vercel et bien avant la première qui y écrit :

```
GET https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_ORG_ID
```

Elle exige que le champ `name` de la réponse vaille `homebudget-preview`, et échoue
sinon. Le code HTTP est vérifié avant le contenu, pour la même raison qu'ailleurs
dans ces workflows. Seul `.name` est extrait : la réponse porte d'autres champs, et
rien dans un log de dépôt public ne doit s'afficher sans qu'on l'ait voulu.

Si le secret d'environment manque, le run meurt là, sans avoir touché ni la base ni
un déploiement.

Deux valeurs distinctes ne doivent pas être confondues ici. Le **nom du projet** est
`homebudget-preview` : on le choisit, il est littéral, c'est lui que la garde compare.
Le **domaine** attribué peut, lui, porter un suffixe de scope si le nom était déjà
pris globalement : on le lit, et il vit dans `BETTER_AUTH_URL`. La garde vérifie le
premier, le contrôle d'alias vérifie le second.

Le contrôle d'alias final, lui, reste en place mais change de nature : il vérifiait
qu'un hôte **subi** ressemblait à ce qu'on attendait ; il vérifie maintenant que
l'hôte **demandé** a bien été attribué.

## Les changements

### `deploy-preview.yml`

| Aujourd'hui | Demain | Pourquoi |
| --- | --- | --- |
| `vercel pull --environment=preview` | `--environment=production` | Les variables du projet miroir vivent dans *sa* production. |
| lit `.vercel/.env.preview.local` | lit `.vercel/.env.production.local` | `vercel pull` nomme le fichier d'après l'environnement tiré. |
| `target:["preview"]` (API env) | `target:["production"]` | Idem : c'est la production du projet miroir. |
| `vercel build` | `vercel build --prod` | Sans lui, l'artefact est un artefact de preview et `deploy --prebuilt --prod` le refuse. |
| `vercel deploy --prebuilt` | `vercel deploy --prebuilt --prod` | C'est la promotion qui attache le domaine du projet. |
| — | + « Confirmer la cible », avant `vercel pull` | Voir ci-dessus. |

Inchangés : `on: push: branches: [main]` et `workflow_dispatch`,
`concurrency: group: preview` sans annulation, `environment: Preview`, la migration
sur la base de preview, et la position relative des trois étapes que
`deploiement.test.ts` verrouille.

Le message d'erreur du contrôle d'alias est à réécrire : il parle du compte
propriétaire du `VERCEL_TOKEN`, qui n'a plus d'influence sur l'hôte. Ce qu'il doit
désormais suggérer, c'est un renommage du projet miroir ou un retrait de son domaine.

Le commentaire d'en-tête du workflow explique qu'un `workflow_dispatch` sur une autre
branche reçoit le même hôte et fait perdre l'alias à la preview de `main`. Ça reste
vrai, pour une raison différente : ce n'est plus l'alias d'auteur qui suit le dernier
déploiement, c'est le domaine de production du projet miroir.

### `deploy-production.yml`

Aucun changement. Il cible le projet de production via le secret `VERCEL_PROJECT_ID`
du dépôt, et l'environment `Production` n'en définit pas de surcharge.

La garde sur `BETTER_AUTH_URL` que l'issue #55 suggérait d'ajouter par symétrie est
**hors périmètre** : elle ne dépend pas de cette solution et mérite sa propre issue.

### `apps/web/test/deploiement.test.ts`

- L'assertion « ne promeut jamais en production » est remplacée par un test de
  l'étape « Confirmer la cible » : elle existe, elle nomme `homebudget-preview`,
  elle sort en 1, et elle se situe avant `vercel build`. L'assertion est cadrée sur
  le corps de l'étape via le helper `etape()` déjà présent — sinon l'`exit 1` du
  contrôle d'alias la satisfait à lui seul, ce que le fichier documente déjà. La
  position est vérifiée contre `vercel pull` **et** contre `/env?upsert=true` : c'est
  l'écriture de la variable, et non la promotion, qui arrive en premier.
- Le commentaire du test explique *pourquoi* la garde a remplacé l'interdiction de
  `--prod` : `--prod` est désormais correct, ce qui ne l'est pas est de le pointer
  sur le mauvais projet.

### `CLAUDE.md`

La section « Cible Preview » et tout le passage sur l'alias d'auteur décrivent un
mécanisme abandonné. À réécrire, en gardant la trace de *pourquoi* l'alias d'auteur
était une contrainte : c'est ce qui explique la solution retenue.

Un point doit y figurer explicitement, sous peine de piéger la prochaine session :
**« production » est relatif au projet Vercel.** Le projet `homebudget-preview` n'a
qu'une production, et c'est notre preview. Un `--prod` dans `deploy-preview.yml` n'est
donc pas une erreur — et la seule chose qui le rend correct est l'identité du projet
ciblé, que la garde vérifie.

### `.env.example`

Le commentaire de `BETTER_AUTH_URL` dit « sur la cible Preview, posez l'URL de
BRANCHE ». Cette notion n'existe plus : c'est le domaine du projet miroir.

## Hors du code

Dans cet ordre, parce qu'il compte.

1. **Créer le projet Vercel `homebudget-preview`**, lié au dépôt GitHub, Root
   Directory `apps/web`, framework Next.js, et le réglage *Node.js Version* recopié
   depuis celui qu'affiche le projet de production. `apps/web/vercel.json` coupe déjà
   ses déploiements automatiques dès le premier fetch.
2. **Lire** le domaine de production attribué, dans le dashboard ou par l'API. Ne pas
   le supposer.
3. **Poser ses variables d'environnement**, en target Production :
   `BETTER_AUTH_URL` (la valeur lue à l'étape 2), `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `ALLOWLIST_THOMAS`, `ALLOWLIST_LIZ`, et un
   `BETTER_AUTH_SECRET` **distinct de celui de la production** — deux environnements
   qui partagent un secret de signature partagent leurs sessions. `DATABASE_URL` n'est
   pas à poser à la main : le workflow l'écrit à chaque run.
4. **Enregistrer le redirect URI chez Google** :
   `https://homebudget-preview.vercel.app/api/auth/callback/google`. Garder
   `http://localhost:3000/...` pour le dev local, et l'ancienne URI de l'alias
   d'auteur jusqu'à l'étape 7.
5. **Poser le secret `VERCEL_PROJECT_ID` dans l'environment GitHub `Preview`**, avec
   l'ID du projet miroir. C'est cette surcharge qui redirige tout le workflow.
6. **Supprimer les variables de target `Preview` du projet de production**, devenues
   orphelines. Ce n'est pas du ménage : sans `BETTER_AUTH_URL` en Preview, tout
   déploiement de preview qui atterrirait par erreur sur le projet de production
   échouerait au build, `origineAuth()` refusant de démarrer plutôt que de retomber
   sur `localhost`. Un garde-fou gratuit.
7. **Après un tour de connexion vert**, retirer de Google l'ancienne URI en
   `home-budget-tjarrier-...vercel.app`.

## À savoir avant de le découvrir

- **La session ne suit pas l'ancien hôte.** Le cookie est posé sur le domaine annoncé
  à Google. Ouvrir la preview par son URL unique de déploiement donnera une page
  déconnectée, et la connexion y échouera en mismatch d'origine — sauf via
  `originesDeConfiance()`, qui ajoute précisément cette URL unique. C'est le
  comportement voulu.
- **Deux projets à garder alignés.** Root Directory, framework, version de Node. Un
  écart ne se manifestera qu'au build du projet miroir, jamais dans la CI.
- **`DATABASE_URL` de preview reste distincte de la production.** Rien ici ne la
  touche et rien ne doit la toucher : une preview branchée sur la prod y crée de
  vraies dépenses et de vraies versions de config, et une version qui porte des
  dépenses n'est plus supprimable (`0002` et la FK `restrict`).
- **L'issue #55 conserve son besoin mais perd sa solution.** Son contenu décrit une
  zone DNS OVH et deux domaines personnalisés, dont plus rien n'est retenu. Elle doit
  être commentée ou refermée au profit de ce document, sinon elle décrira éternellement
  un plan qu'on n'a pas suivi.

## Critères d'acceptation

- [ ] `https://homebudget-preview.vercel.app` (ou l'hôte réellement lu à l'étape 2)
      sert le dernier déploiement de preview, certificat valide, **sans SSO Vercel**.
- [ ] Un tour de connexion Google complet réussit sur cet hôte, avec les deux comptes
      de l'allowlist.
- [ ] Le canari du solde — 1 145,80 € — est juste à l'écran sur cet hôte.
- [ ] `deploy-preview.yml` échoue **avant `vercel pull`** si `VERCEL_PROJECT_ID` ne
      désigne pas le projet miroir. Vérifié pour de vrai, en retirant temporairement
      le secret d'environment, et non supposé.
- [ ] `deploy-preview.yml` échoue si l'hôte de `BETTER_AUTH_URL` n'est pas parmi les
      hôtes attribués, et le résumé du run affiche les deux côte à côte.
- [ ] La production reste servie par son hôte actuel, et un tag continue de la
      déployer.
- [ ] `task verif` est vert. `CLAUDE.md` ne présente plus l'alias d'auteur comme la
      cible, et dit que « production » est relatif au projet Vercel.
