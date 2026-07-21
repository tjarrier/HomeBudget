# Formulaire de dépense — moins de gestes (B3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une dépense courante se saisit sans toucher aux quatre champs à défaut correct (date, payeur, type, répartition), repliés derrière une ligne de résumé éditable.

**Architecture :** On ne modifie qu'un composant client, `formulaire-depense.tsx`. Le montant remonte en premier (`autoFocus`), la description suit, puis une **ligne de résumé** en langage naturel avec un bouton « Modifier ». Les champs à défaut correct — plus le commentaire — descendent dans une zone « détails » **restée montée dans le DOM**, masquée par l'attribut `hidden`. Aucun calcul, aucune Server Action, aucun schéma ne change : l'aperçu reste servi par `previsualiserPartsAction` → `calculerPartsPourSaisie()`.

**Tech Stack :** Next.js (App Router), React (`useState`), TypeScript, Tailwind (tokens sémantiques), Playwright (e2e).

## Global Constraints

Copiées verbatim de la spec (`docs/superpowers/specs/2026-07-21-formulaire-depense-moins-de-gestes-design.md`). Chaque tâche les inclut implicitement :

- **Un seul fichier de production touché :** `apps/web/app/(app)/depenses/formulaire-depense.tsx`. Le seul autre fichier modifié est le test e2e `apps/web/e2e/parcours.spec.ts`.
- **Aucun dédoublement de l'aperçu.** L'aperçu reste servi par `previsualiserPartsAction` → `calculerPartsPourSaisie()`, la même fonction que l'écriture réelle. Ne pas recalculer une part côté navigateur.
- **Champs repliés montés, jamais démontés.** date, payeur, type, répartition, parts personnalisées, commentaire restent dans le DOM, masqués par `hidden` — **non** `disabled`. Un `<input>`/`<select>` `hidden` mais non `disabled` est sérialisé normalement à la soumission ; les démonter enverrait la dépense sans date ni payeur.
- **`Select` natif conservé**, y compris le champ caché de compensation `transfert` déjà présent (un `<select disabled>` n'est pas soumis). Les parcours le pilotent par `page.selectOption(...)`.
- **Deux variantes de bouton, pas plus** (`primaire`, `discret`). « Modifier » / « Replier » = `Button variant="discret"`. On n'en crée pas une troisième.
- **Aucune classe de palette en dur.** Tokens sémantiques uniquement (`text-muted-foreground`, …) ; `theme.test.ts` reste vert.
- **Canari du solde identique.** L'e2e vérifie `1 120,80 €` après un ajout puis `1 145,80 €` après une révision. On ne touche ni aux montants ni à l'ordre des écritures.
- **Aucun nouvel harnais de rendu React.** Aucun n'existe aujourd'hui ; en introduire un serait du hors-sujet. Le seul garde-fou comportemental est l'e2e.

---

## File Structure

- `apps/web/app/(app)/depenses/formulaire-depense.tsx` — **modifié.** Ajoute l'état `detailsOuverts`, la fonction de résumé `construireResume()`, réordonne les champs (montant en 1er, `autoFocus`), enveloppe date/payeur/type/répartition/parts-perso/commentaire dans une zone « détails » masquable par `hidden`, insère la ligne de résumé + bouton « Modifier »/« Replier ».
- `apps/web/e2e/parcours.spec.ts` — **modifié.** Le pas « ajouter une dépense » verrouille d'abord la promesse B3 (Date masquée, résumé visible), puis clique « Modifier » avant de remplir les champs non-défaut.

Aucun fichier créé. Aucune dépendance ajoutée.

---

## Notes de conception (partagées par les tâches)

**Libellés du résumé** (produit cartésien type × mode ; cas `transfert` traité à part) :

| `type` | libellé | `mode` | libellé |
|---|---|---|---|
| `courante` | `courante` | `prorata` | `au prorata` |
| `charge_fixe` | `charge fixe` | `moitie` | `moitié-moitié` |
| `transfert` | `transfert` | `personnalise` | `parts personnalisées` |
| | | `transfert` | `transfert` |

Rendu attendu : `Aujourd'hui · payé par Thomas · courante, au prorata`.
Cas transfert : `type` et `mode` valent tous deux `transfert` → afficher **seulement** `transfert`, jamais « transfert, transfert ».

**Ordre des champs, complet (cible) :**

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

---

## Task 1 : Verrouiller la promesse B3 dans l'e2e (RED)

Le seul garde-fou comportemental de ce changement. On l'écrit **avant** de toucher le composant : tant que le formulaire n'est pas replié, ce pas doit échouer (Date visible, pas de ligne de résumé). Le parcours saisit des valeurs **non-défaut** (date `2026-07-10`, payeur = Liz) : il doit donc ouvrir la zone détails avant de remplir date/payeur/type.

**Files:**
- Modify: `apps/web/e2e/parcours.spec.ts:38-57` (le test `ajouter une depense fait bouger le solde`)

**Interfaces:**
- Consumes : le composant rendu à `/depenses`. Après cette tâche, il expose (Task 2) : un `input[name="date"]` masqué par défaut, un texte `Aujourd'hui · payé par …` visible, un `button` nommé `Modifier`.
- Produces : rien pour d'autres tâches (test terminal).

- [ ] **Step 1 : Insérer les assertions B3 + l'ouverture des détails en tête du pas**

Dans `apps/web/e2e/parcours.spec.ts`, remplacer le début du test `ajouter une depense fait bouger le solde` (les lignes de `page.goto('/depenses')` jusqu'au premier `selectOption` inclus) par :

```ts
  test('ajouter une depense fait bouger le solde', async ({ page }) => {
    await page.goto('/depenses')

    // La promesse de B3 : les champs a defaut correct sont replies.
    await expect(page.getByLabel('Date')).toBeHidden()
    await expect(page.getByText(/Aujourd'hui · payé par/)).toBeVisible()
    await page.getByRole('button', { name: 'Modifier' }).click()

    await page.fill('input[name="date"]', '2026-07-10')
    await page.fill('input[name="description"]', 'Courses du samedi')
    await page.fill('input[name="montant"]', '50,00')
    await page.selectOption('select[name="payePar"]', 'liz')
    await page.selectOption('select[name="type"]', 'courante')
```

Ne pas toucher au reste du test (aperçu, clic « Ajouter la dépense », canari `1 120,80 €`) : ces lignes restent identiques.

- [ ] **Step 2 : Vérifier que le test échoue (RED) — ou signaler l'absence de Docker**

Run : `task test:e2e:frais`
Expected : le pas `ajouter une depense fait bouger le solde` **échoue** — `getByLabel('Date')` est visible (le formulaire n'est pas encore replié), donc `toBeHidden()` casse, ou le bouton `Modifier` est introuvable.

> **Si Docker n'est pas disponible dans ce worktree**, l'e2e ne peut pas tourner. Ne pas le présenter comme vert ni comme rouge : **le signaler explicitement** (« e2e non exécuté : Docker absent ») et poursuivre. La correction sera validée par relecture du diff + `task verif`.

- [ ] **Step 3 : Commit**

```bash
git add apps/web/e2e/parcours.spec.ts
git commit -m "test(web): verrouiller la promesse B3 dans le parcours d ajout

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 : Replier le formulaire derrière un résumé éditable (GREEN)

Implémente la structure repliée. Un seul fichier. Après cette tâche, le pas e2e de Task 1 passe (là où Docker est disponible), et `task verif` reste vert.

**Files:**
- Modify: `apps/web/app/(app)/depenses/formulaire-depense.tsx`

**Interfaces:**
- Consumes : `Button` (variante `discret`) depuis `@/components/ui/button` ; `formaterDate` depuis `@/lib/format` ; `AUJOURDHUI` (déjà défini dans le fichier) ; les états `date`, `payePar`, `type`, `mode` (déjà présents).
- Produces : au rendu, un `input[name="date"]` masqué par `hidden` quand replié ; un texte `Aujourd'hui · payé par …` visible quand replié ; un `button` nommé `Modifier` (replié) / `Replier` (ouvert) portant `aria-expanded`.

- [ ] **Step 1 : Ajouter l'état `detailsOuverts` et les tables de libellés**

Dans `formulaire-depense.tsx`, juste après la ligne `const [partLiz, setPartLiz] = useState('')` (actuellement L41), ajouter :

```tsx
  // B3 : les champs a defaut correct sont replies par defaut. Ils restent
  // MONTES (masques par `hidden`, pas demontes) : un <input>/<select> hidden
  // mais non disabled est serialise normalement a la soumission. Les demonter
  // enverrait la depense sans date ni payeur.
  const [detailsOuverts, setDetailsOuverts] = useState(false)
```

Puis, juste avant la ligne `export function FormulaireDepense(...)` (actuellement L28), ajouter les tables de libellés du résumé :

```tsx
const LIBELLE_TYPE: Record<TypeDepense, string> = {
  courante: 'courante',
  charge_fixe: 'charge fixe',
  transfert: 'transfert',
}

const LIBELLE_MODE: Record<string, string> = {
  prorata: 'au prorata',
  moitie: 'moitié-moitié',
  personnalise: 'parts personnalisées',
  transfert: 'transfert',
}
```

- [ ] **Step 2 : Ajouter la fonction `construireResume()`**

Dans le corps du composant, juste après la fonction `changerType` (actuellement L46-49), ajouter :

```tsx
  // La ligne de resume DIT TOUJOURS LA VERITE sur ce qui sera enregistre :
  // rien n'est derive d'un contexte fige, tout vient de l'etat courant.
  function construireResume(): string {
    const dateTxt = date === AUJOURDHUI() ? "Aujourd'hui" : formaterDate(date)
    const payeurTxt = `payé par ${payePar === 'thomas' ? 'Thomas' : 'Liz'}`
    // Cas transfert : type et mode valent tous deux `transfert` — on n'affiche
    // qu'une fois `transfert`, jamais « transfert, transfert ».
    const typeMode =
      type === 'transfert'
        ? 'transfert'
        : `${LIBELLE_TYPE[type]}, ${LIBELLE_MODE[mode] ?? mode}`
    return `${dateTxt} · ${payeurTxt} · ${typeMode}`
  }
```

- [ ] **Step 3 : Réordonner — montant en premier avec `autoFocus`, description ensuite**

Remplacer le bloc de rendu qui va de l'ouverture `<form …>` (actuellement L108) jusqu'à la fin du bloc `Montant` (actuellement L158) par la nouvelle tête de formulaire : montant d'abord (`autoFocus`), puis description. La date et le payeur **quittent** cette position (ils descendront dans la zone détails à l'étape suivante).

```tsx
      <form action={action} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="montant">Montant (€)</Label>
          <Input
            id="montant"
            name="montant"
            required
            // biome-ignore lint/a11y/noAutofocus: le montant est le seul champ
            // toujours saisi ; l'autofocus ouvre le clavier numerique d'emblee.
            autoFocus
            inputMode="decimal"
            placeholder="1 110,58"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            name="description"
            required
            placeholder="Loyer + charges juillet"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
```

> Note : si Biome ne signale pas `autoFocus`, retirer la ligne `// biome-ignore …`. Vérifié à l'étape 6 par `task lint`.

- [ ] **Step 4 : Insérer la ligne de résumé + le bouton, puis la zone détails masquable**

Juste après le bloc Description (fin de l'étape 3), insérer la ligne de résumé (visible seulement quand replié) et la zone détails. La zone détails contient, **dans cet ordre** : date, payeur, type, répartition (+ parts perso), commentaire — c'est-à-dire les blocs qui existaient déjà, déplacés ici tels quels.

```tsx
        {!detailsOuverts && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{construireResume()}</p>
            <Button
              type="button"
              variant="discret"
              aria-expanded={false}
              onClick={() => setDetailsOuverts(true)}
            >
              Modifier
            </Button>
          </div>
        )}

        {/* Champs a defaut correct : MONTES en permanence, masques par `hidden`
            quand replies. Voir CLAUDE.md — un select hidden reste soumis, un
            select disabled ne l'est pas. */}
        <div hidden={!detailsOuverts} className="flex flex-col gap-3.5">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="payePar">Payé par</Label>
              <Select
                id="payePar"
                name="payePar"
                value={payePar}
                onChange={(e) => setPayePar(e.target.value)}
              >
                <option value="thomas">Thomas</option>
                <option value="liz">Liz</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Type</Label>
            <Select
              id="type"
              name="type"
              value={type}
              onChange={(e) => changerType(e.target.value as TypeDepense)}
            >
              <option value="courante">Dépense courante</option>
              <option value="charge_fixe">Charge fixe</option>
              <option value="transfert">Transfert / remboursement</option>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mode">Répartition</Label>
            <Select
              id="mode"
              name="mode"
              value={mode}
              disabled={estTransfert}
              onChange={(e) => setMode(e.target.value)}
            >
              {modesProposes.map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </Select>
            {/* Un <select disabled> n'est pas soumis par le navigateur : sans ce
                champ cache, `mode` arriverait vide au serveur. */}
            {estTransfert && <input type="hidden" name="mode" value="transfert" />}
            {estTransfert && (
              <span className="text-xs text-muted-foreground">
                Un transfert ne se répartit pas : la totalité est portée au crédit de celui qui verse.
              </span>
            )}
          </div>

          {mode === 'personnalise' && (
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="partThomas">Part Thomas (€)</Label>
                <Input
                  id="partThomas"
                  name="partThomas"
                  inputMode="decimal"
                  value={partThomas}
                  onChange={(e) => setPartThomas(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="partLiz">Part Liz (€)</Label>
                <Input
                  id="partLiz"
                  name="partLiz"
                  inputMode="decimal"
                  value={partLiz}
                  onChange={(e) => setPartLiz(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commentaire">Commentaire (facultatif)</Label>
            <Input id="commentaire" name="commentaire" />
          </div>

          <div>
            <Button
              type="button"
              variant="discret"
              aria-expanded={true}
              onClick={() => setDetailsOuverts(false)}
            >
              Replier
            </Button>
          </div>
        </div>
```

Ce bloc **remplace** les anciens blocs Type (L160-172), Répartition (L174-197), parts personnalisées (L199-222) et Commentaire (L224-227) à leur ancienne position : après ce déplacement, ces blocs ne doivent plus exister ailleurs dans le fichier. L'aperçu des parts, les messages d'erreur et le bouton d'envoi restent **après** cette zone, inchangés.

- [ ] **Step 5 : Relire le fichier entier pour vérifier l'ordre et l'unicité**

Run : `git diff apps/web/app/(app)/depenses/formulaire-depense.tsx`
Expected : montant → description → (résumé | zone détails masquable) → aperçu → erreurs → bouton d'envoi. Aucun bloc dupliqué (chaque `name="date"`, `name="payePar"`, `name="type"`, `name="mode"`, `name="commentaire"` apparaît **une seule fois**). Le champ caché `<input type="hidden" name="mode" value="transfert" />` est toujours là. Le bouton d'envoi `Ajouter la dépense` est inchangé.

- [ ] **Step 6 : `task verif` — lint + typecheck + tests unitaires**

Run : `task verif`
Expected : PASS. En particulier `theme.test.ts` (aucune couleur de palette en dur), `architecture.test.ts` (aucun import hors façade — inchangé ici), `saisie` et `format` restent verts. Si `task lint` se plaint de l'`autoFocus`, garder le commentaire `biome-ignore` de l'étape 3 ; s'il se plaint qu'il est inutile, le retirer.

- [ ] **Step 7 : e2e si Docker disponible — sinon signaler**

Run : `task test:e2e:frais`
Expected : les trois parcours passent, **canari inclus** (`1 120,80 €` puis `1 145,80 €`). Le pas de Task 1 passe désormais : Date masquée par défaut, résumé visible, clic « Modifier » ouvre la zone.

> **Si Docker est absent de ce worktree**, l'e2e et les tests d'intégration SQL ne tournent pas ici. Le signaler explicitement (« e2e / intégration non exécutés : Docker absent ») plutôt que de les présenter comme verts. La correction repose alors sur `task verif` + la relecture de l'étape 5.

- [ ] **Step 8 : Commit**

```bash
git add apps/web/app/(app)/depenses/formulaire-depense.tsx
git commit -m "feat(web): replier le formulaire de depense derriere un resume editable

Une depense courante se saisit sans toucher aux champs a defaut correct
(date, payeur, type, repartition), replies derriere une ligne de resume.
Montant remonte en premier avec autoFocus. Les champs replies restent
montes (hidden, pas demontes) pour rester soumis. Issue #10.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage :**

| Exigence de la spec | Tâche |
|---|---|
| Montant en 1er, `autoFocus`, `inputMode="decimal"` | Task 2, Step 3 |
| Description en 2e | Task 2, Step 3 |
| Ligne de résumé langage naturel + bouton « Modifier »/« Replier » | Task 2, Steps 2 & 4 |
| Aperçu inchangé (via `calculerPartsPourSaisie`) | non touché (reste après la zone détails) |
| Commentaire descend dans la zone détails | Task 2, Step 4 |
| État `detailsOuverts`, défaut `false` | Task 2, Step 1 |
| Champs repliés montés + `hidden`, jamais démontés | Task 2, Step 4 (`<div hidden={!detailsOuverts}>`) |
| `aria-expanded` reflète l'état ; « Modifier »/« Replier » | Task 2, Step 4 |
| Résumé : `Aujourd'hui` sinon `formaterDate` | Task 2, Step 2 |
| Résumé : `payé par Thomas/Liz` | Task 2, Step 2 |
| Résumé : produit cartésien type × mode | Task 2, Step 2 (tables `LIBELLE_*`) |
| Cas transfert affiché une seule fois | Task 2, Step 2 (branche `type === 'transfert'`) |
| Classe `text-muted-foreground`, tokens sémantiques | Task 2, Step 4 |
| `Button variant="discret"`, pas de 3e variante | Task 2, Step 4 |
| `Select` natif + champ caché `transfert` conservés | Task 2, Step 4 (blocs déplacés tels quels) |
| e2e verrouille la promesse B3 puis ouvre les détails | Task 1, Step 1 |
| Canari `1 120,80 €` / `1 145,80 €` inchangé | Task 1 (reste du test intact), Task 2, Step 7 |
| `theme.test.ts` reste vert | Task 2, Step 6 |
| Un seul fichier de production touché | Task 2 (seul `formulaire-depense.tsx`) |
| Signaler ce qui n'a pas pu tourner (Docker) | Task 1 Step 2, Task 2 Step 7 |

Aucune exigence sans tâche.

**2. Placeholder scan :** aucun « TBD/TODO/à compléter ». Chaque étape de code montre le code complet ; chaque étape de commande donne la commande exacte et l'attendu.

**3. Type consistency :** `construireResume()` (défini Task 2 Step 2, appelé Task 2 Step 4) ; `detailsOuverts`/`setDetailsOuverts` (Step 1, utilisés Steps 4) ; `LIBELLE_TYPE`/`LIBELLE_MODE` (Step 1, utilisés Step 2). `TypeDepense`, `date`, `payePar`, `type`, `mode`, `estTransfert`, `modesProposes`, `changerType`, `AUJOURDHUI`, `formaterDate` sont tous déjà présents dans le fichier ou importés — aucun renommage. Le nom de bouton `Modifier` est identique entre Task 1 (e2e `getByRole('button', { name: 'Modifier' })`) et Task 2 (libellé du bouton).
