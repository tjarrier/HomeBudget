# Hôte de preview fixe par projet miroir — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à la preview un hôte fixe et partageable, `homebudget-preview.vercel.app`, en faisant déployer `deploy-preview.yml` sur la *production* d'un second projet Vercel — sans domaine personnalisé.

**Architecture :** Un projet Vercel `homebudget-preview` dont la production est notre preview. Le workflow y bascule via un secret `VERCEL_PROJECT_ID` surchargé par l'environment GitHub `Preview`, et une nouvelle étape « Confirmer la cible » vérifie l'identité du projet auprès de l'API Vercel **avant** la première commande qui écrit quoi que ce soit.

**Tech Stack :** GitHub Actions (YAML lu comme du texte par Vitest), CLI Vercel, API REST Vercel (`/v9/projects`, `/v10/projects/.../env`), `curl` + `jq`.

**Spec :** `docs/superpowers/specs/2026-08-03-preview-hote-fixe-projet-miroir-design.md`

## Global Constraints

- **Aucun `git commit` ni `git push` sans accord explicite de Thomas.** Les étapes de commit de ce plan sont rédigées prêtes à l'emploi, mais chacune demande l'accord avant d'être lancée.
- **Nom du projet Vercel miroir : `homebudget-preview`** — littéral, choisi, comparé par la garde.
- **Domaine attendu : `https://homebudget-preview.vercel.app`** — à **lire** au premier déploiement, jamais à reconstruire. S'il porte un suffixe de scope, c'est cette valeur-là qui va dans `BETTER_AUTH_URL`, et rien dans le code n'en dépend.
- **Les commentaires des fichiers `.yml` s'écrivent sans accents**, comme tout le reste de `.github/workflows/`. Les commentaires TypeScript, eux, en portent.
- **`drizzle-kit push` reste interdit**, dans tous les workflows.
- **L'ordre construction → migration → promotion ne bouge pas.** `apps/web/test/deploiement.test.ts` le verrouille par les positions dans le fichier.
- **Rien ne s'affiche qui puisse porter une valeur secrète** : le dépôt est public, ses logs se lisent sans compte.
- La commande de vérification du dépôt est `task verif` (lint + typecheck + test). Le test visé seul : `pnpm --filter web test deploiement`.

## Ordre général

Les tâches 1 à 3 sont du code, sur la branche courante. La tâche 4 est de la configuration humaine (Vercel, Google, GitHub). La tâche 5 est la vérification réelle, après merge.

**Ne pas poser le secret `VERCEL_PROJECT_ID` de l'environment `Preview` avant la tâche 4.** Posé plus tôt, un merge dans `main` ferait tourner l'ancien workflow sur le projet miroir : il échouerait proprement à l'étape « Lire l'origine » (le projet miroir n'a pas de variables de target Preview), mais pour une raison qui n'aurait rien à voir avec le vrai sujet.

---

### Task 1: La garde « Confirmer la cible »

Elle arrive **avant** `--prod`, et c'est volontaire : le filet est en place avant le danger contre lequel il protège. À la fin de cette tâche le workflow déploie encore exactement comme avant.

**Files:**
- Modify: `.github/workflows/deploy-preview.yml` (bloc `env:` du job `deploy`, ~l.36-39 ; nouvelle étape après « Installer la CLI Vercel », ~l.51-52)
- Test: `apps/web/test/deploiement.test.ts` (constante près de `ALIGNEMENT` l.90 ; nouveau `it` dans `describe('deploy-preview.yml')` l.214)

**Interfaces:**
- Consumes: les helpers `sansCommentaires(contenu)`, `etape(contenu, nom)` et la constante `RACINE_DEPOT`, tous déjà dans `deploiement.test.ts`.
- Produces: l'étape nommée exactement `Confirmer la cible`, et la variable de job `PROJET_ATTENDU`. La tâche 2 s'appuie sur l'existence de cette étape ; la tâche 4 s'appuie sur la valeur de `PROJET_ATTENDU`.

- [ ] **Step 1: Écrire le test qui échoue**

Dans `apps/web/test/deploiement.test.ts`, sous la constante `ALIGNEMENT` (l.90), ajouter :

```ts
/** Le nom de l'étape qui vérifie l'identité du projet Vercel ciblé. */
const CIBLE = 'Confirmer la cible'
```

Puis, dans `describe('deploy-preview.yml')`, ajouter ce test :

```ts
  it('refuse de continuer si VERCEL_PROJECT_ID ne designe pas le projet miroir', () => {
    // `--prod` dans le workflow de preview n'est correct que parce que le projet visé
    // n'est pas celui de la production : `homebudget-preview` n'a qu'une production,
    // et c'est notre preview.
    //
    // Ce qui le rend correct repose donc entièrement sur un secret d'environment. Or
    // un secret d'environment absent ne vaut pas vide : GitHub retombe en silence sur
    // celui du dépôt, qui désigne la PRODUCTION. Sans cette garde, l'alignement
    // écraserait la `DATABASE_URL` de production avec celle de la base de recette, et
    // la promotion y publierait un commit de `main` jamais taggé.
    //
    // Le contrôle d'alias, en fin de workflow, verrait la promotion — mais après
    // coup, et il ne verrait rien de la variable écrasée. Cette garde passe avant
    // tout ce qui écrit, donc avant `vercel pull` lui-même.
    const etapes = sansCommentaires(preview)
    const cible = etape(etapes, CIBLE)

    expect(cible).toContain('/v9/projects/$VERCEL_PROJECT_ID')
    expect(cible).toContain('$PROJET_ATTENDU')
    expect(cible).toMatch(/http_code[\s\S]*?exit 1/)
    expect(preview).toMatch(/^\s+PROJET_ATTENDU: homebudget-preview$/m)

    // La position, mesurée contre les deux commandes qui comptent : la première qui
    // parle a Vercel, et la première qui y écrit.
    const garde = etapes.indexOf(`- name: ${CIBLE}`)
    expect(garde).toBeGreaterThan(-1)
    expect(etapes.indexOf('vercel pull')).toBeGreaterThan(garde)
    expect(etapes.indexOf('/env?upsert=true')).toBeGreaterThan(garde)
  })
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm --filter web test deploiement
```

Attendu : ÉCHEC. `etape()` renvoie `''` quand le nom est absent, donc la première assertion échoue sur `expected '' to contain '/v9/projects/$VERCEL_PROJECT_ID'`.

- [ ] **Step 3: Déclarer `PROJET_ATTENDU` dans le job**

Dans `.github/workflows/deploy-preview.yml`, bloc `env:` du job `deploy` :

```yaml
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
      VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
      # Le projet dont la production EST notre preview. Le secret VERCEL_PROJECT_ID
      # ci-dessus vient de l'environment `Preview`, qui surcharge celui du depot :
      # c'est cette surcharge, et elle seule, qui empeche ce workflow de deployer sur
      # la production. L'etape « Confirmer la cible » verifie qu'elle a bien eu lieu.
      PROJET_ATTENDU: homebudget-preview
```

- [ ] **Step 4: Ajouter l'étape, juste après « Installer la CLI Vercel »**

Elle se place avant `vercel pull` : c'est la première chose qui parle à Vercel.

```yaml
      # Un secret d'environment absent ne vaut pas vide : GitHub retombe en silence
      # sur celui du depot, qui designe le projet de PRODUCTION. Le workflow
      # ecraserait alors la DATABASE_URL de la production avec celle de la base de
      # recette, puis y publierait un commit de `main` jamais tagge.
      #
      # Le controle d'alias, en fin de course, verrait la promotion — mais apres
      # coup, et il ne verrait rien de la variable ecrasee. Cette garde passe donc
      # avant `vercel pull`, la premiere commande qui parle a Vercel.
      #
      # Le code HTTP est verifie avant le contenu : sans ca, une reponse 403 donnerait
      # un `name` vide et un message d'erreur qui parlerait du mauvais probleme.
      #
      # Seul `.name` est extrait de la reponse, et le corps n'est jamais affiche : les
      # logs d'un depot public se lisent sans compte.
      - name: Confirmer la cible
        run: |
          code=$(curl -sS -o projet.json -w '%{http_code}' \
            "https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID?teamId=$VERCEL_ORG_ID" \
            -H "Authorization: Bearer $VERCEL_TOKEN")
          if [ "$code" != "200" ]; then
            echo "::error::la lecture du projet Vercel a repondu $code ($(jq -r '.error.code // "sans code"' projet.json)). Impossible de confirmer que ce run ne visera pas la production : rien n'a ete deploye."
            rm -f projet.json
            exit 1
          fi
          nom=$(jq -r '.name' projet.json)
          rm -f projet.json
          if [ "$nom" != "$PROJET_ATTENDU" ]; then
            echo "::error::VERCEL_PROJECT_ID designe le projet '$nom' et non '$PROJET_ATTENDU'. Le secret VERCEL_PROJECT_ID de l'environment Preview est probablement absent : GitHub retombe alors sur celui du depot, qui designe la production. Rien n'a ete deploye."
            exit 1
          fi
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

```bash
pnpm --filter web test deploiement
```

Attendu : SUCCÈS, y compris les tests existants — `not.toContain('--prod')` passe toujours, le workflow ne promeut encore rien.

- [ ] **Step 6: Vérifier que le test peut échouer**

Retirer temporairement la ligne `PROJET_ATTENDU: homebudget-preview` du YAML, relancer, constater l'échec, la remettre. Le dépôt a déjà eu un test qui passait alors que la garde n'était plus là : on ne fait pas confiance à un test qu'on n'a pas vu rougir.

- [ ] **Step 7: Vérifier l'ensemble**

```bash
task verif
```

- [ ] **Step 8: Commit** — *demander l'accord de Thomas avant de lancer.*

```bash
git add .github/workflows/deploy-preview.yml apps/web/test/deploiement.test.ts
git commit -m "$(cat <<'EOF'
feat(deploiement): confirmer le projet Vercel cible avant d'ecrire quoi que ce soit

Un secret d'environment absent ne vaut pas vide : GitHub retombe sur celui du
depot, qui designe la production. La garde passe avant `vercel pull`.

Generated with ThomAssistant

Co-Authored-By: ThomAssistant <thomas.jarrier@anyti.me>
EOF
)"
```

---

### Task 2: Déployer sur la production du projet miroir

**Files:**
- Modify: `.github/workflows/deploy-preview.yml` (l.9-11 en-tête, l.62 `vercel pull`, l.76 fichier lu, l.78 message, l.113-115 commentaire, l.125 `target`, l.138 `vercel build`, l.152 `vercel deploy`, l.155-176 commentaire du résumé, l.201 message d'erreur)
- Test: `apps/web/test/deploiement.test.ts` (`describe.each` l.97 ; `describe('deploy-preview.yml')` l.214, suppression du `it` l.222-224)

**Interfaces:**
- Consumes: l'étape `Confirmer la cible` et `PROJET_ATTENDU`, produits par la tâche 1.
- Produces: rien que la tâche 3 consomme en code — la tâche 3 documente ce que celle-ci fait.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `describe.each(WORKFLOWS_DE_DEPLOIEMENT)`, ajouter cet invariant — il vaut pour les deux workflows :

```ts
  it("aligne DATABASE_URL sur l'environnement Vercel qu'il tire", () => {
    // Deux valeurs à tenir ensemble : l'environnement que `vercel pull` tire, et la
    // cible que l'API se voit écrire. Les désaccorder ne casse rien tout de suite —
    // le build réussit, avec les variables de l'autre environnement, et
    // l'application parle à la base que personne n'a voulu.
    //
    // Depuis que la preview déploie sur la *production* de son propre projet, les
    // deux workflows tirent `production`. Ce test empêche d'en changer un seul.
    const etapes = sansCommentaires(contenu)
    const environnement = etapes.match(/vercel pull --yes --environment=(\w+)/)?.[1]

    expect(environnement).toBeDefined()
    expect(etapes).toContain(`target:["${environnement}"]`)
  })
```

Dans `describe('deploy-preview.yml')`, **remplacer** le test `it('ne promeut jamais en production', …)` (l.222-224) par ces deux tests :

```ts
  it('promeut sur le projet miroir, dont la production est notre preview', () => {
    // `--prod` a longtemps ete interdit ici, et l'interdiction etait juste : elle
    // empechait ce workflow d'ecraser la production. Ce qui a change n'est pas le
    // drapeau, c'est le projet — `homebudget-preview` n'a qu'une production, et c'est
    // notre preview. Ce qui protege la vraie production est desormais l'etape
    // « Confirmer la cible », testee plus haut.
    //
    // Les deux drapeaux vont ensemble ou pas du tout : `vercel deploy --prebuilt
    // --prod` refuse un artefact construit sans `--prod`.
    const etapes = sansCommentaires(preview)

    expect(etapes).toContain('vercel build --prod')
    expect(etapes).toContain('vercel deploy --prebuilt --prod')
  })

  it("lit l'origine dans le fichier que `vercel pull` a reellement ecrit", () => {
    // `vercel pull --environment=X` nomme le fichier `.vercel/.env.X.local`. Viser
    // l'autre nom ne casse pas le run tout de suite : le fichier est absent, `grep`
    // ne trouve rien, et l'étape échoue en accusant BETTER_AUTH_URL d'être absente de
    // l'environnement Vercel — un message qui envoie chercher au mauvais endroit.
    const etapes = sansCommentaires(preview)
    const environnement = etapes.match(/vercel pull --yes --environment=(\w+)/)?.[1]

    expect(etapes).toContain(`.vercel/.env.${environnement}.local`)
  })
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
pnpm --filter web test deploiement
```

Attendu : le test `promeut sur le projet miroir` ÉCHOUE (`vercel build --prod` absent). L'invariant `aligne DATABASE_URL sur l'environnement` **passe déjà** — `preview`/`preview` s'accordent aujourd'hui : c'est un filet contre une désynchronisation future, pas un moteur de cette tâche. Le test `lit l'origine dans le fichier` passe aussi pour la même raison. Les deux seront revérifiés au Step 5.

- [ ] **Step 3: Basculer le workflow**

Cinq remplacements dans `.github/workflows/deploy-preview.yml` :

```yaml
# l.62
        run: vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
```

```yaml
# l.76 — le nom du fichier suit l'environnement tire
          origine=$(grep -m1 '^BETTER_AUTH_URL=' .vercel/.env.production.local | cut -d= -f2- | tr -d '"' || true)
```

```yaml
# l.125 — la cible suit le meme environnement
              '{key:"DATABASE_URL", value:$v, type:"sensitive", target:["production"]}' \
```

```yaml
# l.137-138
      - name: Construire
        run: vercel build --prod --token="$VERCEL_TOKEN"
```

```yaml
# l.150-153
      - name: Publier
        run: |
          url=$(vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN")
          echo "URL=$url" >> "$GITHUB_ENV"
```

Et le nom de l'étape `Migrer la base de preview` ne change pas : c'est bien la base de preview qu'elle migre, le secret `DATABASE_URL` de l'environment `Preview` étant inchangé.

- [ ] **Step 4: Corriger les commentaires devenus faux**

Ils décrivent l'alias d'auteur, mécanisme abandonné. Quatre endroits :

1. **En-tête, l.8-11** — remplacer le paragraphe sur `workflow_dispatch` par :

```yaml
# `workflow_dispatch` n'a pas d'entree `ref` : le selecteur de branche natif de
# GitHub fait deja le travail, et une entree en plus ferait verifier une branche
# pendant qu'on en deploie une autre. Un dispatch sur une autre branche recoit le
# MEME hote — c'est le domaine de production du projet `homebudget-preview`, il
# suit le dernier deploiement et ne depend pas de la ref — donc la connexion y
# fonctionne, mais la preview de `main` cesse d'etre en ligne jusqu'au prochain
# deploiement. Ce n'est pas une panne, c'est ce qu'on a demande.
```

2. **Étape « Lire l'origine », message d'erreur l.78** — « l'URL de branche stable » n'existe plus :

```yaml
            echo "::error::BETTER_AUTH_URL est absente de l'environnement Production du projet homebudget-preview. Posez-y le domaine de production de ce projet, le meme que le redirect URI enregistre chez Google."
```

3. **Étape d'alignement, commentaire l.113-115** — remplacer par :

```yaml
      # Le secret vise la base de PREVIEW, qui doit etre distincte de la
      # production : une preview branchee sur la prod y creerait de vraies
      # depenses et de vraies versions de config. La cible Vercel, elle, est
      # `production` — celle du projet miroir, dont la production est notre preview.
```

4. **Étape « Resumer », commentaire l.159-175** — remplacer les paragraphes sur l'alias d'auteur et la ref par :

```yaml
      # L'hote attendu est le domaine de production du projet `homebudget-preview`,
      # que Vercel attribue au projet et non a l'auteur du deploiement. Il doit
      # figurer parmi les hotes du deploiement : sinon le tour OAuth est casse, la
      # connexion Google renvoyant l'utilisateur sur une URL inconnue.
      #
      # Ce controle a change de nature en changeant de solution. Il verifiait qu'un
      # hote *subi* — l'alias d'auteur, que Vercel fabriquait a partir du nom du
      # compte deployeur — ressemblait a ce qu'on attendait. Il verifie maintenant
      # que l'hote *demande* a bien ete attribue.
      #
      # Il vaut sur n'importe quelle ref. Un garde-fou `if [ "$REF" = "main" ]`
      # vivait ici, parce qu'on croyait l'hote fabrique a partir de la ref ; le
      # premier run reel a dementi la croyance, et le domaine du projet n'en depend
      # pas davantage.
      #
      # Consequence pour un `workflow_dispatch` sur une autre branche : le controle
      # passe, mais la preview de `main` n'est plus en ligne — le domaine suit le
      # dernier deploiement. Rien a verifier la-dessus, c'est ce qu'on a demande.
      #
      # On ne filtre que des hostnames, jamais la sortie brute de `vercel inspect`.
```

5. **Message d'erreur du contrôle d'alias, l.201** — il envoie chercher du côté du propriétaire du token, qui n'a plus d'influence :

```yaml
            echo "::error::l'hote attendu $hostname n'a pas ete attribue par Vercel. Voir la liste des hotes attribues dans le resume ci-dessus. Verifier que le projet homebudget-preview n'a pas ete renomme, et que BETTER_AUTH_URL porte bien son domaine de production."
```

Le filtre `grep -o '[a-z0-9.-]*\.vercel\.app'` ne change pas : l'hôte reste en `.vercel.app`.

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

```bash
pnpm --filter web test deploiement
```

Attendu : SUCCÈS. Le test `construit, puis migre, puis promeut` doit toujours passer — `--prod` ne change pas les positions.

- [ ] **Step 6: Vérifier que les deux filets peuvent échouer**

Ils étaient verts avant la bascule ; on ne les garde que si on les a vus rougir.

1. Remplacer temporairement `target:["production"]` par `target:["preview"]`, relancer : l'invariant `aligne DATABASE_URL sur l'environnement Vercel qu'il tire` doit échouer. Rétablir.
2. Remplacer temporairement `.vercel/.env.production.local` par `.vercel/.env.preview.local`, relancer : `lit l'origine dans le fichier que vercel pull a reellement ecrit` doit échouer. Rétablir.

- [ ] **Step 7: Vérifier l'ensemble**

```bash
task verif
```

- [ ] **Step 8: Commit** — *demander l'accord de Thomas avant de lancer.*

```bash
git add .github/workflows/deploy-preview.yml apps/web/test/deploiement.test.ts
git commit -m "$(cat <<'EOF'
feat(deploiement): servir la preview sur la production du projet homebudget-preview

Le plan gratuit de Vercel n'affecte pas de domaine a l'environnement Preview. Un
second projet, dont la production EST notre preview, donne un hote fixe qui porte
le nom du projet et non celui du compte deployeur.

Generated with ThomAssistant

Co-Authored-By: ThomAssistant <thomas.jarrier@anyti.me>
EOF
)"
```

---

### Task 3: La documentation qui décrit encore l'alias d'auteur

**Files:**
- Modify: `CLAUDE.md` (l.129-151 les puces « Cible Preview » ; l.191-196 la puce « Preview au merge »)
- Modify: `.env.example` (le commentaire de `BETTER_AUTH_URL`)

**Interfaces:**
- Consumes: rien.
- Produces: rien. Aucun test ne lit ces fichiers ; la vérification est une relecture.

- [ ] **Step 1: Réécrire les puces de `CLAUDE.md`**

Remplacer les lignes 129 à 151 (de « **Cible Preview :** » jusqu'à « réenregistrer le redirect URI chez Google. ») par :

```markdown
- **Cible Preview : `https://homebudget-preview.vercel.app`.** C'est le domaine de
  production d'un **second projet Vercel**, `homebudget-preview`, dont la production
  *est* notre preview — `deploy-preview.yml` y déploie avec `--prod`.
- **« Production » est relatif au projet Vercel.** Un `--prod` dans le workflow de
  preview n'est donc pas une erreur : il promeut sur le projet miroir, qui n'a qu'une
  production et dont c'est la seule raison d'exister. Ce qui le rend correct est
  l'identité du projet ciblé, et rien d'autre.
- **Cette identité repose sur un secret d'environment, donc elle se vérifie.**
  `VERCEL_PROJECT_ID` est surchargé par l'environment GitHub `Preview`. Un secret
  d'environment absent ne vaut pas vide : GitHub retombe en silence sur celui du
  dépôt, qui désigne la **production**. Le workflow y écraserait la `DATABASE_URL` de
  production avec celle de la base de recette, puis y publierait un commit de `main`
  jamais taggé. L'étape « Confirmer la cible » demande son nom au projet avant
  `vercel pull`, donc avant la première commande qui écrit quoi que ce soit.
- **Le nom du projet se choisit, le domaine se lit.** `homebudget-preview` est
  littéral dans le workflow. Son domaine, lui, porterait un suffixe de scope si le nom
  avait été pris globalement : lis-le dans le résumé du run, qui affiche côte à côte
  l'origine annoncée à Google et les hôtes réellement attribués. Ne le reconstruis
  pas.
- **Pourquoi pas un domaine à nous.** Le plan gratuit de Vercel n'affecte aucun
  domaine personnalisé à l'environnement Preview, et le projet ne passe pas par un
  domaine personnel. C'est ce qui a fermé le chemin de l'issue #55.
- **Ce que la solution précédente coûtait**, et qui explique celle-ci : la cible était
  l'**alias d'auteur** `home-budget-tjarrier-tjarriers-projects.vercel.app`,
  `<projet>-<utilisateur>-<scope>`, que Vercel attribue à tout déploiement de la CLI.
  Il ne se posait pas à la main — les sous-domaines `*.vercel.app` sont réservés,
  aucun `vercel alias set` n'est possible dessus. Il ne dépendait pas de la ref mais
  de la source du déploiement : le dépôt a longtemps affirmé le contraire, et le
  premier run réel l'a démenti. Et surtout il **portait le nom du compte qui
  déploie**, donc changer le propriétaire du `VERCEL_TOKEN` cassait le tour OAuth.
  Le domaine d'un projet ne dépend d'aucune de ces trois choses.
```

- [ ] **Step 2: Réécrire la puce « Preview au merge » de `CLAUDE.md`**

Remplacer les lignes 191-196 par :

```markdown
- **Preview au merge** (`deploy-preview.yml`) : push sur `main`, ou déclenchement
  manuel sur une branche. Déploie en `--prod` sur le projet `homebudget-preview`,
  dont le domaine de production ne dépend pas de la ref — un dispatch sur une autre
  branche produit donc le **même** hôte, et le déploiement précédent le perd. C'est
  la seule vraie conséquence de déployer autre chose que `main` : la preview de
  `main` n'est plus en ligne tant qu'on n'a pas redéployé. Le contrôle d'alias, lui,
  vaut sur n'importe quelle ref.
```

Noter au passage la phrase corrigée : l'ancienne version affirmait que « le contrôle d'alias du workflow ne fait échouer le run que sur `main` », ce qui était déjà faux — le garde-fou `if [ "$REF" = "main" ]` a été retiré, et `deploiement.test.ts` interdit son retour.

- [ ] **Step 3: Corriger `.env.example`**

Remplacer le commentaire de `BETTER_AUTH_URL` par :

```
# Requise sur Vercel, en Production comme en Preview : c'est l'origine annoncee
# a Google, qui doit correspondre au caractere pres a un redirect URI enregistre
# dans la console (Google n'accepte aucun wildcard). Sur la cible Preview, posez
# le domaine de production du projet `homebudget-preview` — jamais l'URL d'un
# deploiement. Voir CLAUDE.md.
```

- [ ] **Step 4: Relire, et vérifier qu'aucune trace ne subsiste**

```bash
grep -rn "alias d'auteur\|home-budget-tjarrier\|URL de branche\|l'URL de BRANCHE" CLAUDE.md .env.example .github/ apps/web/test/
```

Attendu : les seules occurrences restantes sont **historiques et assumées** — la puce « Ce que la solution précédente coûtait » de `CLAUDE.md`, et les commentaires de `deploiement.test.ts` qui racontent pourquoi tel garde-fou a été retiré. Aucune ne doit décrire l'alias d'auteur comme la cible *actuelle*.

- [ ] **Step 5: Vérifier l'ensemble**

```bash
task verif
```

- [ ] **Step 6: Commit** — *demander l'accord de Thomas avant de lancer.*

```bash
git add CLAUDE.md .env.example
git commit -m "$(cat <<'EOF'
docs(deploiement): la cible de preview est un projet, plus un alias d'auteur

Garde la trace de ce que l'alias d'auteur coutait : c'est ce qui explique la
solution. Corrige au passage une phrase deja fausse sur le controle d'alias, que
le test interdit de limiter a `main`.

Generated with ThomAssistant

Co-Authored-By: ThomAssistant <thomas.jarrier@anyti.me>
EOF
)"
```

---

### Task 4: La configuration hors code

Aucune ligne de code. À faire par Thomas, dans cet ordre — l'ordre compte : le secret GitHub arrive en dernier, quand tout ce qu'il déclenche est prêt.

**Files:** aucun.

**Interfaces:**
- Consumes: `PROJET_ATTENDU: homebudget-preview` (tâche 1) — le nom du projet à créer doit correspondre au caractère près.
- Produces: le domaine de production réellement attribué, dont la tâche 5 a besoin pour vérifier le tour OAuth.

- [ ] **Step 1: Créer le projet Vercel `homebudget-preview`**

Nom exact `homebudget-preview`. Lié au dépôt GitHub `tjarrier/HomeBudget`. **Root Directory `apps/web`** — sans lui, `vercel deploy --prebuilt` échoue net, et `vercel.json` ne serait pas lu. Framework Next.js. Réglage *Node.js Version* recopié depuis celui qu'affiche le projet de production.

`apps/web/vercel.json` porte déjà `git.deploymentEnabled: false` : le nouveau projet ne déploiera rien tout seul, dès son premier fetch du dépôt.

- [ ] **Step 2: Lire le domaine de production attribué**

Dans le dashboard du nouveau projet, onglet *Domains*, ou :

```bash
vercel project ls
```

Attendu : `homebudget-preview.vercel.app`. Si le nom était pris globalement, ce sera `homebudget-preview-<scope>.vercel.app` — c'est cette valeur-là qu'on note, et elle seule. **Ne pas la reconstruire de tête.**

- [ ] **Step 3: Poser les variables du projet miroir, en target Production**

Six variables, dans *Settings → Environment Variables* du projet `homebudget-preview`, toutes cochées **Production** uniquement :

| Variable | Valeur |
| --- | --- |
| `BETTER_AUTH_URL` | le domaine lu au Step 2, préfixé de `https://`, sans slash final |
| `BETTER_AUTH_SECRET` | **une nouvelle valeur**, `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | la même que la production |
| `GOOGLE_CLIENT_SECRET` | la même que la production, marquée *Sensitive* |
| `ALLOWLIST_THOMAS` | la même que la production |
| `ALLOWLIST_LIZ` | la même que la production |

`BETTER_AUTH_SECRET` doit différer de celui de la production : deux environnements qui partagent une clé de signature partagent leurs sessions.

**Ne pas poser `DATABASE_URL` :** le workflow l'écrit à chaque run depuis le secret GitHub, et c'est la seule source.

- [ ] **Step 4: Enregistrer le redirect URI chez Google**

Google Cloud Console, client OAuth du projet, *Authorized redirect URIs*. Ajouter :

```
<le domaine lu au Step 2>/api/auth/callback/google
```

Garder `http://localhost:3000/api/auth/callback/google` (dev local) **et** l'URI de l'alias d'auteur `https://home-budget-tjarrier-tjarriers-projects.vercel.app/api/auth/callback/google`, jusqu'à la tâche 5.

- [ ] **Step 5: Supprimer les variables de target `Preview` du projet de production**

Dans le projet Vercel **de production**, retirer toute variable cochée `Preview` — elles ne servent plus.

Ce n'est pas du ménage. Sans `BETTER_AUTH_URL` en Preview, un déploiement de preview qui atterrirait par erreur sur le projet de production échouerait au build : `origineAuth()` lève plutôt que de retomber sur `localhost`. Un second garde-fou, gratuit.

- [ ] **Step 6: Poser le secret `VERCEL_PROJECT_ID` dans l'environment GitHub `Preview`**

*Settings → Environments → Preview → Environment secrets*. Nom exact `VERCEL_PROJECT_ID`, valeur = l'ID du projet `homebudget-preview` (dashboard Vercel, *Settings → General → Project ID*).

C'est ce secret, et lui seul, qui redirige tout le workflow. Le secret du dépôt reste inchangé : il continue de désigner la production, pour `deploy-production.yml`.

Vérifier qu'il est bien dans l'**environment** `Preview` et non dans les secrets du dépôt. Posé au mauvais endroit, il enverrait la *production* sur le projet miroir.

---

### Task 5: Vérifier pour de vrai

Après merge dans `main`. Rien ici ne se déduit : chaque case se cocher après avoir vu le résultat.

**Files:** aucun.

**Interfaces:**
- Consumes: tout ce qui précède, et le domaine noté à la tâche 4 Step 2.

- [ ] **Step 1: Lancer le workflow et lire son résumé**

Le merge dans `main` le déclenche. Sinon, `workflow_dispatch` sur `main`.

Dans le résumé du run, vérifier que l'**origine annoncée à Google** et les **hôtes attribués** contiennent tous deux le domaine noté à la tâche 4. C'est ce que le contrôle final vérifie, mais on le lit soi-même une fois.

- [ ] **Step 2: Un tour de connexion Google complet, sur les deux comptes**

Ouvrir le domaine de preview, se connecter avec le compte de Thomas, se déconnecter, puis avec celui de Liz. Aucun écran d'authentification **Vercel** ne doit apparaître : un déploiement de production n'est pas derrière le SSO.

Si un tour échoue en `redirect_uri_mismatch`, c'est le Step 4 de la tâche 4 : l'URI enregistrée ne correspond pas au caractère près.

- [ ] **Step 3: Le canari, à l'écran**

Sur le domaine de preview, vérifier que le solde affiché est **1 145,80 €** (« Liz doit 1 145,80 € à Thomas »). Si la base de recette a déjà reçu des saisies de test, ce montant aura bougé : dans ce cas, vérifier plutôt que les montants sont cohérents avec ce que la preview contenait avant, et non un jeu de données inconnu — un solde inattendu ici voudrait dire que la preview parle à la mauvaise base.

- [ ] **Step 4: Vérifier que la garde échoue vraiment**

Le test le plus important de ce plan, et le seul qui ne se joue qu'en réel.

1. Renommer temporairement le secret d'environment `VERCEL_PROJECT_ID` de l'environment `Preview` (ou le supprimer après avoir noté sa valeur).
2. Lancer `deploy-preview.yml` par `workflow_dispatch` sur `main`.
3. **Attendu :** le run échoue à l'étape « Confirmer la cible », avec le message nommant le projet de production. Vérifier qu'aucune étape suivante n'a tourné — ni l'alignement de `DATABASE_URL`, ni le build, ni la promotion.
4. Rétablir le secret, relancer, vérifier que le run repasse au vert.

Sans ce test, la garde est une hypothèse. Le dépôt a déjà cru une étape verte qui ne faisait rien.

- [ ] **Step 5: Vérifier que la production n'a pas bougé**

Ouvrir l'hôte de production : il sert toujours la dernière version taggée. Et dans le projet Vercel de production, `DATABASE_URL` (target Production) est intacte — c'est ce que la garde protège.

- [ ] **Step 6: Retirer l'ancienne URI chez Google**

Seulement maintenant, et seulement si les Steps 1 à 5 sont tous verts : supprimer `https://home-budget-tjarrier-tjarriers-projects.vercel.app/api/auth/callback/google` des *Authorized redirect URIs*.

- [ ] **Step 7: Refermer l'issue #55**

Son corps décrit une zone DNS OVH et deux domaines personnalisés dont rien n'a été retenu. Y poster un commentaire qui dit ce qui a été fait à la place et pourquoi le chemin du domaine personnalisé était fermé, en pointant vers la spec — puis la fermer. Sinon elle décrira éternellement un plan qu'on n'a pas suivi.

`gh` est confiné par snap et ne lit pas `/tmp` : passer le corps du commentaire par stdin.

---

## Ce que ce plan ne fait pas

- **La garde `BETTER_AUTH_URL` sur `deploy-production.yml`**, que l'issue #55 suggérait par symétrie. Elle ne dépend pas de cette solution et mérite sa propre issue.
- **Aucun changement de domaine pour la production**, qui reste sur son hôte Vercel actuel.
- **Aucun changement dans le code de l'application.** `origineAuth()`, `originesDeConfiance()` et `createAuthClient()` sont déjà corrects pour ce scénario : le premier refuse de deviner, les deux autres suivent l'environnement et le navigateur.
