# HomeBudget — Design v1

**Date :** 2026-07-12
**Statut :** validé
**Source :** PRD « Application de budget partagé Liz & Thomas »

## 1. Objectif

Remplacer le Google Sheet « v2_Loyers 2025/2026 » par une application web partagée entre deux personnes (Thomas et Liz), déployée et utilisable au quotidien depuis un téléphone.

Le projet existe pour résoudre **un** problème : dans le Sheet, chaque ligne de dépense référence une cellule de configuration unique, donc toute modification de la config recalcule rétroactivement l'historique. Une révision de loyer corrompt les mois passés.

Deux mécanismes, et eux seuls, suppriment ce problème. Ils sont les invariants non négociables du projet :

**I1 — Configuration versionnée, effective-dated, append-only.**
Chaque version de config porte une date de prise d'effet. On ne modifie jamais une version passée ; on en crée une nouvelle à partir d'une date, ce qui clôture la précédente la veille. Les versions ne se chevauchent pas et ne laissent pas de trou.

**I2 — Répartition figée à l'écriture (snapshot on write).**
À la création d'une dépense, l'application calcule les parts d'après la version de config en vigueur *à la date de la dépense*, puis les fige sur la ligne avec une référence vers cette version. Aucune lecture ne recalcule jamais une part.

Tout le reste du design découle de ces deux points. Une modification qui les affaiblit est un bug, quelle que soit son élégance.

## 2. Décisions techniques

| Domaine | Choix | Raison |
|---|---|---|
| Monorepo | pnpm workspaces | Trois paquets, pas de build système lourd nécessaire |
| Application | Next.js (App Router) + TypeScript strict | Full-stack en un déploiement, Server Actions pour les écritures |
| Cœur métier | `packages/domain`, TypeScript pur | Zéro dépendance framework, testable sans mock |
| Base de données | Supabase (Postgres hébergé) | Les invariants deviennent des contraintes SQL, pas des `if` |
| Authentification | SSO Google via Supabase Auth, allowlist de deux e-mails | Un tap sur mobile, aucun mot de passe |
| UI | Tailwind CSS v4 + shadcn/ui | Mobile-first, composants accessibles |
| Lint / format | Biome | Une dépendance, assez rapide pour tourner à chaque écriture de fichier |
| Tests | Vitest (domaine, TDD strict) + Playwright (E2E) | Le domaine est le seul endroit où un bug coûte de l'argent |
| CI / déploiement | GitHub Actions + Vercel | Preview par PR, checks bloquants sur `main` |

**Écarté :** NestJS. Le bénéfice recherché (règles métier isolées de React, testables) est atteint par `packages/domain` sans le coût d'un second processus, d'un contrat HTTP et du boilerplate DTO/modules. Reconsidérer si un client natif ou des jobs serveur apparaissent.

## 3. Architecture

```
homebudget/
├─ apps/web/              Next.js — UI + Server Actions
│  └─ app/
│     ├─ (dashboard)/     Écran 1 — « qui doit quoi »
│     ├─ depenses/        Écran 2 — liste + formulaire guidé
│     └─ config/          Écran 3 — timeline des versions
├─ packages/domain/       TypeScript pur — le cœur métier
│  ├─ money.ts            arithmétique en centimes
│  ├─ config-version.ts   résolution effective-dated, invariants de période
│  ├─ repartition.ts      les 4 modes de répartition
│  ├─ solde.ts            soldes par dépense + agrégats du résumé
│  └─ *.test.ts           Vitest
└─ packages/db/           schéma, migrations SQL, seed, types générés
```

**Sens des dépendances :** `apps/web` → `packages/domain`. Jamais l'inverse. `packages/domain` n'importe ni React, ni Next, ni Supabase, ni aucune librairie de dates lourde.

**Flux d'écriture d'une dépense :** le formulaire (client) → Server Action → charge la version de config en vigueur à la date saisie → `domain.calculerParts()` → écrit la dépense avec `part_thomas`, `part_liz`, `version_config_id` figés → revalide le cache.

**Flux de lecture :** Server Component → lit les dépenses telles quelles → `domain.agreger()` pour le résumé. Aucun recalcul de part.

## 4. L'argent est un entier de centimes

Le PRD exige que `part_thomas + part_liz == montant`, sans exception. En virgule flottante c'est intenable.

**Tous les montants sont des entiers de centimes**, en base (`integer`) comme dans le domaine (`number` entier, jamais fractionnaire). Le formatage `1 110,58 €` n'existe qu'à l'affichage, via `Intl.NumberFormat('fr-FR')`.

**Règle d'arrondi, asymétrique par construction :**

```ts
part_thomas = Math.round(montant_cents * ratio_thomas)
part_liz    = montant_cents - part_thomas   // le reste, jamais un second arrondi
```

La somme est exacte par définition, sans logique de correction du reste.

Vérifié contre les données réelles :
- `1 110,58 €` × 64,7058…% → `718,61 / 391,97` ✓ (valeurs du Sheet)
- `1 073,59 €` × 64,7058…% → `694,68 / 378,91` ✓ (valeurs du Sheet)

Le ratio est dérivé des salaires à la volée (`salaire_thomas / (salaire_thomas + salaire_liz)`), jamais stocké comme pourcentage arrondi — stocker `64,71 %` réintroduirait une perte de précision.

**Cas limite :** somme des salaires nulle → erreur explicite, pas une division par zéro silencieuse.

## 5. Modèle de données

### `personne`
`id`, `nom` — « Thomas », « Liz ». Les salaires ne vivent pas ici : ils changent dans le temps et pilotent la répartition, donc ils appartiennent à la version de config.

### `version_config` — effective-dated, append-only
`id`, `libelle`, `date_debut`, `date_fin` (null = version en cours), `salaire_net_thomas_cents`, `salaire_net_liz_cents`, `charges_communes` (jsonb : liste `{libelle, montant_cents}`), `charges_perso_thomas`, `charges_perso_liz`.

Champs dérivés, **jamais stockés** : total des charges communes, ratios de répartition, loyer par personne. Ils sont calculés par le domaine.

**Invariants garantis par Postgres, pas par le code applicatif :**
- Contrainte `EXCLUDE USING gist` sur `daterange(date_debut, date_fin)` : deux versions ne peuvent pas se chevaucher. Un chevauchement devient littéralement impossible à écrire.
- Trigger bloquant l'`UPDATE` d'une version dont la période est close, sauf drapeau explicite.
- Création d'une version : transaction unique qui clôture la précédente à `date_debut - 1 jour`.
- L'absence de trou est vérifiée par un test d'intégration sur le jeu de données (une contrainte SQL ne peut pas l'exprimer simplement).

### `depense`
`id`, `date`, `description`, `montant_cents`, `paye_par`, `type` (`charge_fixe` | `courante` | `transfert`), `mode_repartition` (`prorata` | `moitie` | `personnalise` | `payeur`), `part_thomas_cents`, `part_liz_cents`, `version_config_id`, `genere_auto`, `commentaire`.

`part_thomas_cents` et `part_liz_cents` sont **figés à la création**. Contrainte `CHECK (part_thomas_cents + part_liz_cents = montant_cents)`.

Les soldes (`solde_thomas`, `solde_liz`) sont **dérivés**, jamais stockés : ils se déduisent de `montant`, `paye_par` et des parts figées.

## 6. Règles de calcul

**Répartition** (§5.1 du PRD) :
- `prorata` (défaut pour charge fixe) — parts au ratio des salaires de la version en vigueur à la date de la dépense.
- `moitie` (défaut pour courante) — `part_thomas = round(montant/2)`, `part_liz = montant - part_thomas`.
- `personnalise` — saisie directe, validation bloquante `part_thomas + part_liz == montant`.
- `transfert` (défaut pour type transfert) — **la part du payeur vaut 0, celle de l'autre vaut le montant total.**

> **Piège de vocabulaire, à ne jamais inverser.** Le PRD nomme ce dernier mode « 100 % payeur », ce qui suggère l'inverse de ce qu'il fait. Quand Liz verse 400 € à Thomas : `part_liz = 0`, `part_thomas = 400`. Le solde de Liz devient `400 - 0 = +400`, donc sa dette *baisse* de 400 € — ce qui est bien le but d'un remboursement. Le mode s'appelle `transfert` dans le code, jamais `payeur`. Un test vérifie explicitement le signe.

**Solde d'une dépense** (§5.2) — « ce que j'ai payé moins ce que j'aurais dû payer » :
```
solde_thomas = (paye_par == Thomas ? montant : 0) - part_thomas
solde_liz    = (paye_par == Liz    ? montant : 0) - part_liz
```

**Résumé** (§5.3) : total dépensé, payé par chacun, dû par chacun, solde net. `solde_liz == -solde_thomas` est un invariant vérifié par test.
Phrase de synthèse : si `solde_thomas > 0` → « Liz doit X € à Thomas », sinon l'inverse. Si le solde est nul → « Vous êtes à jour ».

## 7. Écrans

**Tableau de bord** — bandeau « qui doit quoi » proéminent (phrase + montant, gros et lisible), cartes des chiffres clés, bouton « Régler les comptes » qui pré-remplit un transfert du montant exact du solde.

**Dépenses** — liste filtrable (mois, personne, type). Formulaire guidé : `mode_repartition` pré-sélectionné selon le type mais modifiable, **aperçu en direct des parts avant validation**, et rappel explicite de la version de config appliquée (« Config en vigueur au 05/07/2026 : loyer 791 € »). Génération mensuelle de la charge fixe à partir de la version active — le mois de bascule prend automatiquement le nouveau montant, ce qui est tout l'intérêt du versioning.

**Configuration** — timeline chronologique des versions. Action clé : « Créer une nouvelle version à partir du … » qui duplique la courante comme point de départ, clôture la précédente, et affiche un message de réassurance explicite : aucune dépense passée n'est impactée. L'édition d'une version passée est verrouillée par défaut.

## 8. Cas limites (§7 du PRD)

- **Premier mois proratisé** (Thomas arrivé le 09/07/2025, Liz le 23/07/2025) — géré via `personnalise` + commentaire. L'app ne calcule pas le prorata, elle permet de le saisir proprement.
- **Transferts** — mouvements de dette, pas des dépenses partagées. `payeur`, 100 % au crédit de celui qui a versé.
- **Dépense courante non 50/50** (type « Tricount ») — `personnalise`.
- **Dates aberrantes** — le Sheet contient une ligne datée 2029 au lieu de 2025. Validation à l'import et à la saisie : une date hors de la fenêtre `[première version de config, aujourd'hui + 1 an]` déclenche un avertissement.
- **Dépense antérieure à toute version de config** — erreur explicite, la dépense est refusée (on ne peut pas figer une part sans règle applicable).

## 9. Reprise des données

Source : le Sheet réel, lu le 2026-07-12. **33 lignes** de dépenses (le PRD en annonçait ~34).

Deux versions de config : v1 « depuis le 01/07/2025 » (loyer 785 €, total 1 110,58 €) et v2 « à partir du 01/07/2026 » (loyer 791 €, total 1 073,59 €). Salaires : Thomas 3 300 €, Liz 1 800 €, inchangés entre les deux versions (ratio Thomas = 3300/5100 = 64,7058…%).

Les dépenses sont importées **avec leurs parts figées**, arrondies au centime, et rattachées à la version correspondant à leur date.

### Trois écarts entre le Sheet et le PRD, tranchés

**Le solde de référence est 1 145,80 €, pas 1 145,79 €.**
Le Sheet stocke des flottants pleins : la part de Thomas sur un loyer vaut `718,6105882 €`. Le solde y vaut `1 145,788425 €`, dont « 1 145,79 » n'est que l'affichage. En figeant au centime, douze lignes de loyer perdent chacune ~6 millièmes de centime, et le solde exact devient **1 145,80 €** (114 580 centimes). Ce n'est pas une régression : c'est la suppression d'une dérive de sous-centimes que personne ne pouvait payer.

**La ligne du 05/07/2026 est importée telle quelle, à 1 110,58 €.**
Le PRD (§9) la donnait à 1 073,59 € avec la config v2. Le Sheet réel la porte encore à 1 110,58 € : la révision de loyer n'y a jamais été répercutée. On importe la réalité (c'est ce qui a été payé), pas l'intention. Si le montant est faux, il se corrige dans l'app — c'est précisément son rôle.

**La ligne datée 2029-09-29 est corrigée en 2025-09-29.**
Coquille signalée par le PRD (§7). Le Tricount remboursé date du 27/09/2025. Sans impact sur le solde, mais indispensable à la chronologie.

### Reclassement des types

Le Sheet ne connaît que « Charge fixe » et « Courante » ; le type « Transfert » du PRD n'y existe pas. Au seed :

| Lignes | Type | Mode |
|---|---|---|
| 12 loyers à 1 110,58 € (08/2025 → 07/2026) | charge fixe | `prorata` |
| Loyer de juillet 2025 (762,61 €, prorata jours) | charge fixe | `personnalise` + commentaire |
| Virements de Liz, remboursements de loyer, remboursements Tricount (13 lignes) | transfert | `transfert` |
| Tricount (492,14 € et 83,95 €), Noël (500 €), Coiffeur (30 €) | courante | `personnalise` |
| Billets Colombie (2 152,74 €) | courante | `moitie` |

Le reclassement ne modifie aucun solde ; il rend seulement la sémantique conforme au PRD.

### Contrôle de non-régression, bloquant

Après import du seed, le solde doit valoir **exactement 114 580 centimes — « Liz doit 1 145,80 € à Thomas »**. Ce test est le canari du projet : si un agent réintroduit un recalcul rétroactif, inverse le signe d'un transfert ou casse la règle d'arrondi, il tombe.

## 10. Tests

**TDD strict sur `packages/domain`.** Chaque règle du §6 a son test écrit avant son implémentation. Cibles : les 4 modes de répartition, la résolution de version à une date (y compris aux bornes exactes : premier jour, dernier jour, veille), l'arrondi (somme des parts toujours égale au montant, y compris sur des montants impairs), les soldes, les agrégats.

**Tests d'intégration** sur `packages/db` : les invariants SQL rejettent bien un chevauchement de versions, une somme de parts incohérente, une modification de version close.

**Playwright** sur trois parcours : ajouter une dépense et voir le solde bouger ; créer une version de config et vérifier qu'aucune dépense passée n'a changé ; régler les comptes et retomber à zéro.

**Test de non-régression du seed** — le §9. Il tourne en CI sur chaque push.

## 11. Harness IA

`CLAUDE.md` — le manuel d'opération : I1 et I2 en tête, la règle des centimes, l'interdiction de placer de la logique métier hors de `packages/domain`, les commandes, les pièges connus.

**Hooks** — à chaque écriture de fichier : Biome (format + lint) puis `tsc --noEmit`. À l'arrêt de l'agent : les tests du domaine. Un agent ne peut pas laisser le repo cassé derrière lui.

**Skills projet** — `/run` (lance l'app et la Supabase locale), `/verify` (exerce réellement le parcours modifié, pas seulement les tests), `/seed` (réinitialise la base au seed et vérifie l'invariant du solde).

**CI** — GitHub Actions : lint, typecheck, tests unitaires, tests d'intégration, E2E. Bloquants sur `main`.

## 12. Hors périmètre v1

Import automatique depuis Google Sheets (la reprise est un seed unique), catégorisation analytique, budgets prévisionnels, notifications d'échéance, multi-foyers, calcul automatique du prorata au premier mois.

## 13. Ordre de construction

1. Squelette du monorepo, outillage, hooks, CI.
2. `packages/domain` en TDD, complet et couvert.
3. `packages/db` : schéma, contraintes, migrations, seed importé du Sheet, test de non-régression du solde.
4. `apps/web` : les trois écrans, auth Google.
5. Déploiement Vercel + Supabase, vérification de bout en bout sur mobile.

Fin de l'étape 3 : on peut prouver « Liz doit 1 145,79 € à Thomas » par un test. Fin de l'étape 5 : Liz peut saisir une dépense depuis son téléphone.
