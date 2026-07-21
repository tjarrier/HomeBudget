# B3 — Formulaire de dépense : réduire le nombre de gestes

**Issue :** [#10](https://github.com/tjarrier/HomeBudget/issues/10) — *B3, Formulaire de
dépense : réduire le nombre de gestes.*
**Fichier touché :** `apps/web/app/(app)/depenses/formulaire-depense.tsx` (un seul).
**Date :** 2026-07-21.

## Le problème

Ajouter une dépense est un geste quotidien. Le formulaire actuel remplit déjà
correctement ses défauts — date du jour, payeur = personne connectée, type
`courante`, mode pré-sélectionné d'après le type. Mais les quatre champs porteurs
de ces défauts (date, payeur, type, répartition) **restent affichés en plein**,
chacun avec son libellé et son contrôle. Ils occupent l'écran et demandent de la
réflexion même quand leur défaut convient — ce que l'issue appelle « trop de
saisie et trop de réflexion ».

Le montant, lui, est aujourd'hui en troisième position, après date/payeur puis
description.

## Le « Fini quand »

> Une dépense courante se saisit **sans toucher** aux champs qui ont une valeur
> par défaut correcte. L'aperçu des parts continue de passer par
> `calculerPartsPourSaisie()` — ne jamais le dédoubler.

## Ce qu'on ne touche pas

- **Le domaine, la façade `packages/db`, les Server Actions.** Aucune règle de
  calcul ne change. L'aperçu reste servi par `previsualiserPartsAction` →
  `calculerPartsPourSaisie()`, la même fonction que l'écriture réelle. On ne le
  dédouble pas ; un aperçu qui divergerait de l'écriture serait un mensonge à
  l'écran (CLAUDE.md).
- **Le canari du solde.** L'e2e vérifie 1 120,80 € après un ajout puis 1 145,80 €
  après une révision de version. On ne touche ni aux montants ni à l'ordre des
  écritures : le canari reste identique.
- **Le `Select` natif.** Il porte gratuitement le clavier, l'ARIA, l'état
  `disabled` et surtout **le sélecteur système sur mobile** — précisément ce que
  B3 cherche. Les parcours Playwright le pilotent par `page.selectOption(...)`.
- **Les variantes de bouton.** Le design system en a deux, `primaire` et
  `discret`, « pas plus ». On n'en crée pas une troisième.

## La conception retenue : résumé éditable

Approche choisie parmi trois (résumé éditable ; repli « Détails » complet ;
simple réordonnancement). Le résumé éditable gagne parce qu'il traite le vrai
grief — « trop de réflexion » — : l'utilisateur lit **une ligne en langage
naturel** qui dit ce qui sera enregistré, plutôt que d'analyser quatre contrôles.

### Structure repliée (état par défaut)

L'écran par défaut ne montre que ce qui change à chaque dépense :

1. **Montant (€)** — remonté en **premier**. `inputMode="decimal"` (déjà présent)
   et `autoFocus`, pour que le clavier numérique s'ouvre d'emblée sur mobile.
2. **Description**.
3. **Ligne de résumé** en langage naturel + bouton **« Modifier »**
   (`variant="discret"`).
4. **Aperçu des parts** — inchangé.
5. **Messages d'erreur** + **bouton d'envoi** — inchangés.

Le **Commentaire (facultatif)** descend *dans* la zone repliée : optionnel,
rarement rempli, il n'a pas à peser sur le geste courant.

Vue repliée d'une dépense courante :

```
Ajouter une dépense
┌─────────────────────────────────┐
│ Montant (€)  [ 42,00        ]   │  ← clavier num, autoFocus, en 1er
│ Description  [ Courses      ]   │
│                                 │
│ Aujourd'hui · payé par Thomas · │
│ courante, au prorata   Modifier │  ← une ligne, déplie la zone détails
│                                 │
│ ┌ Aperçu des parts ───────────┐ │
│ │ Thomas 21,00   Liz 21,00    │ │
│ └─────────────────────────────┘ │
│ [   Ajouter la dépense       ]  │
└─────────────────────────────────┘
```

### La zone « détails » et la contrainte de soumission

Contrainte technique non négociable : les champs repliés — **date, payeur, type,
répartition, parts personnalisées, commentaire** — restent **montés dans le DOM**,
masqués par l'attribut `hidden` quand la zone est fermée. On ne les démonte
jamais.

Raison : un `<input>`/`<select>` `hidden` mais **non** `disabled` est sérialisé
normalement par le navigateur à la soumission du formulaire. La Server Action
reçoit donc toujours date + payeur + type + mode, même quand l'utilisateur n'a
rien ouvert. Les démonter les enverrait vides au serveur — la dépense partirait
sans date ni payeur.

État React : `detailsOuverts: boolean`, défaut `false`.

- **Fermé** (défaut) : la ligne de résumé est visible ; la zone détails porte
  `hidden` ; le bouton dit « Modifier », `aria-expanded={false}`.
- **Ouvert** : la ligne de résumé s'efface ; la zone détails s'affiche (les
  contrôles date/payeur/type/répartition/commentaire, et les parts
  personnalisées si `mode === 'personnalise'`) ; le bouton dit « Replier »,
  `aria-expanded={true}`.

### La ligne de résumé

Construite dans le composant à partir de l'état courant. Elle **dit toujours la
vérité** sur ce qui sera enregistré ; rien n'est dérivé d'un contexte figé.

- **Date** : `Aujourd'hui` si `date === AUJOURDHUI()`, sinon `formaterDate(date)`
  (ex. `10/07/2026`).
- **Payeur** : `payé par Thomas` / `payé par Liz`.
- **Type + mode** :
  - `courante, au prorata`
  - `charge fixe, moitié-moitié`
  - `courante, parts personnalisées`
  - etc. (produit cartésien type × mode).
- **Cas transfert** traité à part : type et mode valent tous deux `transfert`, on
  affiche **seulement** `transfert` — jamais « transfert, transfert ».

Rendu, exemple : `Aujourd'hui · payé par Thomas · courante, au prorata`.
Classe `text-muted-foreground`, **tokens sémantiques uniquement** — aucune couleur
de palette en dur (le texte porte le sens ; DESIGN.md).

### Ordre des champs, complet

| Ordre | Champ | Visible replié ? |
|---|---|---|
| 1 | Montant (€) — `autoFocus` | ✅ |
| 2 | Description | ✅ |
| 3 | Ligne de résumé + « Modifier »/« Replier » | ✅ (résumé) |
| 3a | Date | zone détails |
| 3b | Payé par | zone détails |
| 3c | Type | zone détails |
| 3d | Répartition (+ parts perso si `personnalise`) | zone détails |
| 3e | Commentaire (facultatif) | zone détails |
| 4 | Aperçu des parts | ✅ (si montant + description) |
| 5 | Messages d'erreur | ✅ (le cas échéant) |
| 6 | Bouton d'envoi | ✅ |

## Accessibilité & design system

- **« Modifier » / « Replier »** = `Button variant="discret"` → cible tactile
  44px, `focus-visible` et sémantique bouton gratuites. `aria-expanded` reflète
  l'état. **Aucune troisième variante créée.**
- **`Select` natif** conservé, y compris le champ caché de compensation
  `transfert` déjà présent (un `<select disabled>` n'est pas soumis).
- **Aucune classe de palette en dur** : `theme.test.ts` reste vert.

## Tests

- **Unitaires** (`theme`, `architecture`, `saisie`, `format`, …) : restent verts.
  On n'introduit **aucun** nouvel harnais de rendu React (aucun n'existe
  aujourd'hui ; ce serait du hors-sujet).
- **e2e `apps/web/e2e/parcours.spec.ts`** : le parcours d'ajout saisit des
  valeurs **non-défaut** (date `2026-07-10`, payeur = Liz). Il doit donc, en tête
  de ce pas, **verrouiller la promesse B3** puis ouvrir la zone détails avant de
  remplir date/payeur/type :

  ```ts
  // La promesse de B3 : les champs a defaut correct sont replies.
  await expect(page.getByLabel('Date')).toBeHidden()
  await expect(page.getByText(/Aujourd'hui · payé par/)).toBeVisible()
  await page.getByRole('button', { name: 'Modifier' }).click()
  // ... puis les fill/selectOption existants, inchanges.
  ```

  Le **canari du solde reste identique** (1 120,80 € puis 1 145,80 €).

## Vérification

`task verif` (lint + typecheck + tests unitaires). Le worktree n'a pas
nécessairement Docker : l'e2e (`task test:e2e:frais`) et les tests d'intégration
SQL peuvent ne pas tourner ici. Ce qui n'aura pas pu être exécuté sera signalé
explicitement plutôt que présenté comme vert.
