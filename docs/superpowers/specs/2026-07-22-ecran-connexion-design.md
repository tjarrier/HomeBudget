# B5 — Écran de connexion : soigner la première impression

**Issue :** [#12](https://github.com/tjarrier/HomeBudget/issues/12) — *B5, Écran de
connexion : soigner la première impression.*
**Fichier principal touché :** `apps/web/app/(auth)/login/page.tsx`.
**Fichiers ajoutés :** `apps/web/app/(auth)/login/bouton-google.tsx`,
`apps/web/app/(auth)/login/messages.ts` (+ son test).
**Fichiers effleurés :** `apps/web/lib/allowlist.ts`, `apps/web/lib/session.ts`.
**Date :** 2026-07-22.

## Le problème

L'issue pose deux critères de fin. **Le premier est déjà rempli** : depuis
l'intégration du design system (commit `799b953`), l'écran identifie HomeBudget,
son propos et la restriction à deux comptes. Ce n'est plus « un bouton nu ».

**Le second ne l'est pas.** Quand une adresse Google non autorisée tente d'entrer,
le hook d'allowlist lève `new APIError('FORBIDDEN', { message: MESSAGE_REFUS })`
— *sans champ `code`*. Or, dans le callback OAuth de Better Auth 1.6.23
(`api/routes/callback.mjs:154`), la seule branche qui redirige proprement est
gardée par `if (isAPIError(e) && e.body?.code)`. Sans `code`, la condition est
fausse, l'exécution tombe sur `throw e`, et l'`APIError` remonte brute au handler
Next : la personne refusée voit **une erreur 403 nue** (réponse JSON / page
d'erreur), jamais un message. C'est exactement l'« erreur brute » que l'issue veut
supprimer.

À côté de ça, `exigerSession()` redirige déjà vers `/login?erreur=compte-incomplet`
dans un cas de garde (session présente mais `personne` invalide). Ce signal
**n'est lu nulle part** aujourd'hui : la page l'ignore en silence. Comme on
construit précisément la surface d'affichage des erreurs de l'écran, on le traite
au passage — sinon on laisse un échec muet sur l'écran même qu'on refait.

## Le « Fini quand »

> L'écran identifie l'application et son propos (déjà acquis, et **affermi** par la
> refonte visuelle), et le cas du refus par allowlist affiche **un message
> compréhensible** plutôt qu'une erreur brute.

## Le mécanisme — comment le refus revient à l'écran

Trois crochets, tous côté application, aucun côté domaine ni base :

1. **`lib/allowlist.ts`** — on ajoute un `code` au corps de l'`APIError` :
   `throw new APIError('FORBIDDEN', { message: MESSAGE_REFUS, code: CODE_REFUS })`,
   avec `CODE_REFUS = 'acces_refuse'` exporté du module. C'est ce `code` qui fait
   passer Better Auth par `redirectOnError` (`callback.mjs:154`) **au lieu** de
   propager un 403 brut. La valeur est en français, distincte du `access_denied`
   standard qu'OAuth renvoie quand l'utilisateur annule côté Google : deux causes,
   deux codes.

2. **`bouton-google.tsx`** — l'appel `signIn.social` gagne
   `errorCallbackURL: '/login'`. `redirectOnError` respecte cette URL : la personne
   refusée revient donc **sur l'écran de login**, désormais à
   `/login?error=acces_refuse&error_description=…`. Le middleware ne garde pas
   `/login` (hors de son `matcher`), la page se rend normalement, sans session.

3. **Unification du signal `?error=`** — `session.ts` redirige aujourd'hui vers
   `/login?erreur=compte-incomplet` (paramètre français `erreur`). Better Auth, lui,
   impose `error` (anglais) : on ne peut pas renommer le sien. Pour que l'écran
   n'ait **qu'un** mécanisme de lecture, on aligne le nôtre sur le sien —
   `/login?error=compte_incomplet`. Ce paramètre n'est lu nulle part ailleurs
   (vérifié : seuls `session.ts` et `session.test.ts` le mentionnent), le
   changement est donc mécanique et sans onde de choc.

**On ne fait jamais confiance à `error_description`.** C'est un paramètre d'URL
ouvert : n'importe qui peut forger `/login?error=…&error_description=<texte>`. React
échappe le rendu (pas de XSS), mais afficher un texte contrôlé par un tiers reste un
vecteur d'hameçonnage. La page **ignore** `error_description` et ne lit que le
`error` **code**, qu'elle mappe vers **sa propre** copie française. Le code est le
contrat entre le serveur et l'écran ; chaque bord possède son texte humain.

## Le mapping — `messages.ts`

Une fonction pure, testable sans réseau ni Better Auth :

```
messageConnexion(code: string | undefined): string | null
```

| `error` | Rendu |
|---|---|
| `acces_refuse` | « Cette adresse Google n'est pas autorisée. HomeBudget est un budget privé, réservé à deux comptes. » |
| `compte_incomplet` | « Ton compte n'est pas tout à fait prêt. Reconnecte-toi, ou préviens Thomas si ça persiste. » |
| autre valeur non vide | « La connexion n'a pas abouti. Réessaie. » |
| `undefined` / vide | `null` (aucun encart) |

`CODE_REFUS` est importé depuis `lib/allowlist.ts` (couche basse) : une seule
source pour le code du refus, côté jet **et** côté lecture. Le texte affiché est
volontairement **distinct** de `MESSAGE_REFUS` (qui, lui, reste en ASCII pour le
log et les consommateurs API) : la copie d'écran porte ses accents, comme tout le
reste de l'UI.

## La refonte visuelle — carte centrée affermie

Direction retenue : **une seule carte centrée**, mais hiérarchie repensée. On
reste strictement dans `DESIGN.md` — achromatique, Inter seule, un seul aplat
sombre (le logo), aucune couleur qui code un sens.

```
            ╭──────────────────────╮
            │        ██ HB          │   marque : l'aplat emphasis (le seul)
            │                       │
            │      HomeBudget       │   wordmark, plus affirmé
            │                       │
            │  Le budget partagé de │   proposition de valeur —
            │  Thomas et Liz.       │   dit ce qu'est le produit
            │  L'historique ne se   │   et pourquoi lui faire confiance
            │  recalcule jamais.    │
            │                       │
            │ ┌───────────────────┐ │
            │ │ Se connecter · G  │ │   ← label EXACT préservé (e2e)
            │ └───────────────────┘ │
            │                       │
            │ 🔒 Aucune inscription │   note de sécurité (conservée)
            │    · deux comptes     │
            ╰──────────────────────╯

     (refus / compte incomplet : encart neutre
      inséré sous la proposition de valeur)
```

Ce que la refonte change concrètement :

- **Le wordmark** gagne en présence (taille, rythme) : c'est la marque, dans un
  système sans couleur d'identité — la hiérarchie vient du poids et de l'échelle,
  jamais d'une seconde fonte.
- **Une phrase de proposition de valeur** remplace le sous-titre purement
  fonctionnel actuel. Elle dit l'identité du produit — *l'historique ne se
  recalcule jamais*, la raison d'être du projet — plutôt que seulement sa
  contrainte d'accès.
- **Le rythme vertical** est repris (espacements de l'échelle DESIGN), la carte
  respire.
- **Le bouton et la note de sécurité** sont conservés dans leur rôle ; le libellé
  du bouton reste `Se connecter avec Google` au caractère près.

### L'encart de refus — neutre, sans couleur

Conformément à `DESIGN.md` (le rouge est réservé aux erreurs de **formulaire**, le
système est achromatique), le message n'est **pas** rouge. C'est un encart neutre :
filet `border-subtle`, fond `bg-muted`, texte `text-body`, rayon de la maison. Le
**mot** porte le sens, pas la couleur. Il porte `role="alert"` pour être annoncé
par les lecteurs d'écran dès l'arrivée sur la page. Aucune classe de palette en
dur : rien que des tokens sémantiques (sinon `theme.test.ts` échoue, à raison).

## L'architecture des fichiers

- **`page.tsx`** devient un **Server Component** (on retire `'use client'`). Il lit
  `searchParams` (Promise en Next 15 : `const { error } = await searchParams`),
  calcule `messageConnexion(error)`, rend la carte et — s'il y a lieu — l'encart.
  Le groupe `(auth)` n'est pas soumis à la garde `exigerSession()` (le scan statique
  d'`architecture.test.ts` ne vise que `(app)`) : `/login` **doit** rester
  accessible sans session.
- **`bouton-google.tsx`** (`'use client'`) isole la seule part interactive :
  l'`onClick` qui appelle `signIn.social({ provider: 'google', callbackURL: '/',
  errorCallbackURL: '/login' })`. C'est la feuille cliente ; la page reste serveur.
- **`messages.ts`** — la fonction pure de mapping ci-dessus.

## Le plan de test

- **`test/allowlist.test.ts`** (étendu) — pour une adresse refusée,
  `avantCreationUtilisateur` lève une `APIError` dont `body.code === CODE_REFUS`.
  C'est **le** contrat qui fait rediriger Better Auth au lieu de renvoyer un 403
  brut : sans cette assertion, le retrait du `code` repasserait en silence.
- **`test/messages.test.ts`** (nouveau) — la table de mapping : `acces_refuse` et
  `compte_incomplet` donnent leurs messages ; une valeur inconnue donne le message
  générique ; `undefined` et `''` donnent `null`.
- **`test/session.test.ts`** (ajusté) — la redirection du compte incomplet vise
  désormais `/login?error=compte_incomplet` (les deux assertions de chaîne suivent).
- **`e2e/parcours.spec.ts`** (ajouté) — deux visites sans authentification, qui
  prouvent le critère de fin à l'écran :
  - `/login` nu → le bouton est visible, **aucun** encart d'erreur ;
  - `/login?error=acces_refuse` → le message de refus est visible.
  Aucune dépendance à un credential Google : la page rend l'encart purement à
  partir de `searchParams`.

## Ce qu'on ne touche pas

- **Le domaine, `packages/db`, les invariants SQL, le canari du solde.** Aucune
  règle de calcul, de part, de version. La sécurité d'accès reste le hook
  d'allowlist — on n'en change que la **forme de l'erreur** (ajout d'un `code`),
  pas la décision. `allowlist.test.ts` continue de verrouiller *qui* passe.
- **`MESSAGE_REFUS`** reste tel quel (ASCII), pour le log et les consommateurs non
  navigateur. L'écran a sa propre copie accentuée.
- **Le libellé du bouton, la palette, les fontes, le mode clair unique.** La
  refonte se fait entièrement en tokens sémantiques ; `theme.test.ts` reste vert.

## Vérification

`task verif` avant de committer (lint + typecheck + tests unitaires). L'e2e
(`task test:e2e:frais`) rejoue le parcours, canari du solde inclus, et couvre
maintenant les deux états de l'écran de connexion.
