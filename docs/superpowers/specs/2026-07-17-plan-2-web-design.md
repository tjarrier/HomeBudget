# HomeBudget — Plan 2 : l'application web

**Date :** 2026-07-17
**Statut :** validé
**Précède :** `2026-07-12-homebudget-harness-design.md` (design v1), dont ceci est l'étape 4
**Suit :** le plan 1 (fondations), fusionné — `packages/domain` et `packages/db` sont complets et couverts.

## 1. Objectif et périmètre

Construire `apps/web` : l'application Next.js par laquelle Thomas et Liz saisissent et
consultent le budget. Le plan 1 a posé le cœur métier (`packages/domain`) et la base avec
ses invariants (`packages/db`). Le plan 2 leur donne une interface, et **une frontière de
sécurité** — la seule du projet, puisqu'on a écarté RLS.

**Ce que marque la fin du plan 2 :** les trois écrans (tableau de bord, dépenses, config)
et l'authentification Google tournent **en local**, sur le seed de reprise. Le solde de
référence (« Liz doit 1 145,80 € à Thomas ») est visible à l'écran, et les tests le
prouvent jusque dans l'UI.

**Explicitement hors périmètre — remis au plan 3 :**

- Déploiement Vercel + Supabase (étape 5 du design v1).
- Bouton « Régler les comptes » (pré-remplir un transfert du montant du solde).
- Génération mensuelle automatique de la charge fixe depuis la version active.
- Filtres de la liste des dépenses (mois, personne, type).

On les nomme ici pour que personne ne les croie oubliés. Le plan 2 livre le CRUD des
dépenses et des versions, plus **l'aperçu des parts en direct** à la saisie, et rien de plus.

## 2. Les règles héritées, non négociables

Ce plan ne réécrit aucune règle du design v1 ni du `CLAUDE.md` ; il les respecte à la
frontière de l'UI. Rappel de celles que le code de `apps/web` peut trahir s'il est
distrait :

1. **L'argent est un entier de centimes.** Le formatage `1 110,58 €` n'existe qu'à
   l'affichage (`Intl.NumberFormat('fr-FR')`). Aucun flottant ne traverse une Server Action.
2. **Snapshot on write (I2).** Une dépense fige ses parts à la création, d'après la version
   en vigueur *à sa date* — jamais la version courante. Aucune lecture ne recalcule une part.
3. **Config append-only (I1).** L'UI de config crée des versions, n'en modifie jamais une
   passée. La création passe par la fonction SQL `creer_version_config()`, point de passage
   obligé.
4. **Le domaine est la seule source de vérité du calcul.** `apps/web` n'implémente aucune
   règle de répartition, de solde ou de résolution de version : il appelle `packages/domain`.

## 3. Architecture

### 3.1 Structure et sens des dépendances

```
apps/web/                    Next.js (App Router, TS strict)
├─ app/
│  ├─ (auth)/login/          écran de connexion Google
│  ├─ (app)/                 groupe protégé par la session
│  │  ├─ page.tsx            écran 1 — tableau de bord « qui doit quoi »
│  │  ├─ depenses/           écran 2 — liste + formulaire guidé
│  │  └─ config/             écran 3 — timeline des versions
│  └─ api/auth/[...all]/     handler Better Auth
├─ lib/
│  ├─ auth.ts                config Better Auth (provider Google, hook allowlist)
│  ├─ auth-client.ts         client Better Auth côté navigateur
│  └─ session.ts             garde partagé : exige une session, sinon redirige
└─ actions/                  Server Actions (écritures + prévisualisation)
```

**Sens des dépendances, jamais inversé :** `apps/web → packages/db → packages/domain`.
`apps/web` **n'importe jamais** `db`/`pool` directement, ni n'écrit une ligne de SQL. Il ne
connaît que la façade de `packages/db` (§3.2). Le navigateur ne parle jamais à Postgres :
toute écriture passe par une Server Action, vérifiée côté serveur.

### 3.2 La façade `packages/db`

Aujourd'hui `packages/db/src/index.ts` n'exporte que `import-sheet`. Le plan 2 ouvre une
façade à **deux familles**, et rien d'autre. C'est le seul point de contact entre l'app et
la base.

**Lectures** (appelées depuis les Server Components) — elles renvoient les lignes telles
quelles, jamais un agrégat recalculé :

- `listerVersions(): Promise<VersionConfig[]>` — pour la timeline et pour résoudre la
  version applicable à une date.
- `listerDepenses(): Promise<Depense[]>` — pour la liste et pour le résumé.

Le résumé du tableau de bord n'est **pas** une requête SQL : c'est `resumer(depenses)` du
domaine, appelé côté serveur sur le résultat de `listerDepenses()`. Aucun `SELECT`
n'additionne un solde — ce serait réintroduire le bug du Sheet.

**Écritures** (appelées depuis les Server Actions) — chacune enveloppe le domaine *puis* la
base :

- `ajouterDepense(saisie)` — voir le flux §3.3.
- `creerVersion(saisie)` — appelle la fonction SQL `creer_version_config(...)`, qui clôture
  la précédente la veille et insère la nouvelle en une transaction. On ne réimplémente pas
  cette logique en TypeScript : elle existe déjà en SQL et est le point de passage obligé de
  l'append-only.

La façade est testée contre le Postgres local, dans la lignée de
`packages/db/test/invariants.integration.test.ts`.

### 3.3 Flux d'écriture d'une dépense — le point sensible

C'est ici que I2 se joue côté application. L'ordre est strict :

```
ajouterDepense(saisie) :
  1. exiger la session (sinon rejet)
  2. versions = listerVersions()
  3. v = versionEnVigueurLe(versions, saisie.date)    ← version À LA DATE, jamais « courante »
  4. parts = calculerParts({
       montant, mode, payePar,
       ratioThomas: ratioThomas(v),
       partsPersonnalisees?              // requis ssi mode === 'personnalise'
     })
  5. INSERT depense (parts figées, version_config_id = v.id, genereAuto = false)
     └─ le trigger SQL `depense_dans_sa_version` REVÉRIFIE que v couvre saisie.date
```

L'étape 3 est le piège documenté dans la migration `0004` : attraper `where date_fin is null`
(la version courante) au lieu de la version à la date produit des parts qui somment juste au
**mauvais ratio** — le `CHECK parts_somment_au_montant` est satisfait, les parts sont
pourtant fausses. Le domaine calcule avec la bonne version, et la base le revérifie : deux
filets, jamais un seul.

### 3.4 Flux de lecture

Server Component → `listerDepenses()` / `listerVersions()` → `resumer()` et
`phraseSynthese()` du domaine pour le tableau de bord. Aucun recalcul de part. Après une
écriture, la Server Action invalide le cache (`revalidatePath`) pour que le solde affiché
suive.

## 4. Authentification — le mur porteur

Sans RLS, ce hook *est* la sécurité. Il est construit **en premier** (§7).

### 4.1 Better Auth dans notre base

Better Auth, provider Google. Ses tables (`user`, `session`, `account`, `verification`) sont
générées par son CLI et **commitées comme une migration Drizzle de plus** : mêmes règles que
le reste du dépôt — `db:generate` puis `db:migrate`, jamais `drizzle-kit push`. Elles
cohabitent avec `version_config` et `depense` dans le même Postgres. Aucun SDK Supabase, une
seule variable `DATABASE_URL`.

### 4.2 Rattachement identité → personne

Le domaine ne connaît que l'enum `'thomas' | 'liz'` ; il n'existe pas de table `personne`.
On ajoute donc **une colonne `personne` sur la table `user`** de Better Auth. C'est ce champ
qui pré-remplit « payé par » à la saisie. Il est posé une fois pour toutes à la création du
compte, par le hook d'allowlist — jamais devinable depuis Google.

### 4.3 L'allowlist stricte

Un hook `before` sur la création d'utilisateur applique le mapping :

```
adresse ∈ { ALLOWLIST_THOMAS → thomas, ALLOWLIST_LIZ → liz }
   ?  créer le user avec sa personne
   :  rejeter la création
```

Il n'y a pas d'inscription : deux personnes autorisées, point. Une troisième adresse qui
tente Google est refusée à la création du compte. Les deux adresses viennent de
l'environnement (`ALLOWLIST_THOMAS`, `ALLOWLIST_LIZ`), pas du code en dur — ce qui permet au
test de tourner sans credential réel.

**Un test verrouille ce comportement** (le `CLAUDE.md` l'exige explicitement). C'est le test
le plus important du plan.

### 4.4 La frontière côté pages et actions

Un garde partagé (`lib/session.ts`, appelé par le `middleware.ts` et en tête de chaque
Server Action d'écriture) vérifie la session Better Auth. Pas de session → redirection vers
`/login`. **La vérification est faite dans la Server Action elle-même**, pas seulement dans
l'UI : l'UI n'est pas une frontière de sécurité.

### 4.5 Ce que l'humain fait, une fois

Le login Google réel exige un client OAuth créé dans la Google Cloud Console — impossible à
automatiser. Au jalon 1, l'agent fournit les valeurs exactes à saisir :

- Origine JavaScript autorisée : `http://localhost:3000`
- URI de redirection autorisée : `http://localhost:3000/api/auth/callback/google`

Thomas crée le client, colle `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` dans `.env.local`
(jamais commité), et on teste le login réel ensemble. Le **test d'allowlist ne dépend
d'aucun credential** et est vert dès le jalon 1, avant même que Google soit branché.

## 5. Les écrans

Mobile-first (Liz saisit depuis son téléphone). Tailwind CSS v4 + shadcn/ui pour des
composants accessibles.

**Tableau de bord** (`/`) — bandeau « qui doit quoi » proéminent : la phrase de
`phraseSynthese()` et le montant, gros et lisibles. En dessous, les chiffres clés du
`Resume` (total dépensé, payé par chacun, dû par chacun, solde net).

**Dépenses** (`/depenses`) — liste des dépenses (date, description, montant, payé par,
parts). Formulaire guidé :

- `mode_repartition` pré-sélectionné selon le type (`modeParDefaut`), modifiable.
- **Aperçu des parts en direct** : avant validation, l'app montre part_thomas / part_liz et
  rappelle la version appliquée (« Config en vigueur au 05/07/2026 : loyer 791 € »). Réalisé
  par une Server Action `previsualiserParts(saisie)` qui rejoue exactement les étapes 3–4 du
  flux d'écriture — même code de résolution de version pour l'aperçu et pour l'écriture, et
  aucune logique de config expédiée au navigateur.

**Configuration** (`/config`) — timeline chronologique des versions. Action « Créer une
nouvelle version à partir du … » : duplique la courante comme point de départ, appelle
`creerVersion`, affiche un message de réassurance (aucune dépense passée n'est impactée).
L'édition d'une version passée est verrouillée — la base la refuse de toute façon.

## 6. Gestion d'erreur

Les gardes du domaine (`montant ≤ 0`, parts personnalisées incohérentes, date sans version
applicable) et les contraintes SQL (`CHECK`, triggers) **jettent** ; elles ne renvoient pas
un code. Chaque Server Action attrape et renvoie à l'UI un résultat typé
`{ ok: true, ... } | { ok: false, message: string }`. Le message métier remonte tel quel :
il est déjà rédigé pour un humain (« La version « … » ne couvre pas la dépense du … »). Le
formulaire l'affiche sans le reformuler.

## 7. Ordre de construction

**Auth d'abord** : aucune ligne d'UI n'existe sans frontière de sécurité derrière elle.

1. **Squelette + auth.** Bootstrap `apps/web`. Better Auth branché sur notre Postgres, tables
   commitées en migration. Provider Google. **Hook d'allowlist + son test** (vert sans
   credential). Jalon : Thomas crée le client OAuth avec les valeurs fournies ; on prouve
   qu'un login autorisé passe et qu'une 3ᵉ adresse est refusée.
2. **Façade de lecture + tableau de bord.** `listerDepenses` / `listerVersions`. Écran « qui
   doit quoi » sur le seed. Le solde de référence est à l'écran.
3. **Écran dépenses.** Liste + formulaire + aperçu en direct. Server Actions `ajouterDepense`
   et `previsualiserParts`.
4. **Écran config.** Timeline + création de version via `creerVersion`.

Si le jalon 1 (client OAuth, côté humain) traîne, les écrans peuvent avancer derrière le
garde de session ; le test d'allowlist, lui, est écrit et vert dès l'étape 1.

## 8. Tests

**Allowlist** (le test qu'exige le `CLAUDE.md`) — une adresse autorisée crée un `user` avec
la bonne `personne` ; une 3ᵉ adresse est rejetée à la création. Test d'intégration sur le
hook Better Auth, adresses injectées par l'environnement, sans Google réel.

**Server Actions** (intégration contre le Postgres local) — `ajouterDepense` fige les parts
d'après la version *à la date*, pas la courante ; une dépense sans version applicable est
refusée ; `creerVersion` clôture la précédente la veille. Dans la lignée de
`invariants.integration.test.ts`.

**Playwright — les trois parcours du design v1 §10** : ajouter une dépense et voir le solde
bouger ; créer une version et vérifier qu'aucune dépense passée n'a changé ; se connecter /
être bloqué hors allowlist. Ils tournent sur le seed, donc **le canari à 114 580 centimes
reste vrai jusque dans l'UI**.

**CI** — le workflow a déjà un service Postgres. On ajoute : build de `apps/web`, tests
d'intégration des Server Actions, Playwright (navigateur headless). Tout reste bloquant sur
`main`.

## 9. Risques

- **Le client OAuth Google est côté humain.** S'il traîne, il bloque le *login réel*, pas la
  preuve de sécurité : le test d'allowlist ne dépend d'aucun credential. Atténuation : écrans
  développables derrière le garde de session en attendant.
- **Réintroduire le bug du Sheet dans une Server Action.** C'est le risque central : attraper
  la version courante au lieu de la version à la date. Atténuation : le domaine
  (`versionEnVigueurLe`) et la base (trigger `depense_dans_sa_version`) le refusent tous deux ;
  un test d'intégration l'exerce explicitement sur une dépense antidatée.
- **Fuite de logique métier dans `apps/web`.** Atténuation : la façade `packages/db` est le
  seul accès ; l'app n'importe ni `pool` ni SQL, et n'implémente aucun calcul.
