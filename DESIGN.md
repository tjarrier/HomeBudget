# HomeBudget — manuel visuel

Ce fichier est la source de vérité du système visuel de `apps/web`. Il documente
ce que le code fait **aujourd'hui**, pas ce qu'une spec projetait.

**Design system :** projet Claude Design « HomeBudget Design System »
(`af475afc-2e2d-4ac6-9010-1c73823dbe91`), maquette `ui_kits/homebudget/`.
**Implémentation :** `apps/web/app/globals.css` — les tokens ; `apps/web/components/` — les composants.
**Verrou :** `apps/web/test/theme.test.ts`.

> **La spec `docs/superpowers/specs/2026-07-19-direction-visuelle-design.md` est
> dépassée sur trois points** — elle prévoyait Instrument Serif en titrage, un blanc
> dominant sans cartes, et la suppression de `card.tsx`. L'intégration du design
> system a tranché autrement (une seule fonte, des cartes partout). Elle reste utile
> pour les *raisonnements* qu'elle porte — surtout sur `Montant` —, pas pour ses valeurs.

## Les règles qui ne se négocient pas

1. **Le système est achromatique.** Une échelle slate, et **deux accents seulement** :
   emerald pour la réassurance, rouge pour l'erreur de formulaire. Aucune autre teinte
   n'existe. Il n'y a pas de couleur de marque : le « primaire » est l'encre.

2. **Aucune couleur ne code un sens.** Un solde n'est pas un positif/négatif, c'est une
   **direction** : qui doit à qui. `+1 145,80` pour Thomas et `−1 145,80` pour Liz sont
   *le même fait vu des deux bouts* — les teinter dirait que l'un a raison et l'autre
   tort d'une seule et même dette. Le signe et le libellé portent la direction. Là où
   l'emerald apparaît (badge « Transfert »), le libellé dit déjà tout en toutes lettres :
   la couleur double l'information, elle ne la remplace jamais.

3. **Une seule famille de caractères.** Inter, auto-hébergée par `next/font`. La
   hiérarchie vient du poids, de la taille et du contraste de surface — jamais d'un
   changement de fonte. Un `--font-heading` qui réapparaîtrait ferait échouer un test.

4. **Le markup n'écrit jamais une couleur.** Il écrit un token sémantique
   (`bg-surface`, `text-faint`, `border-subtle`). `theme.test.ts` interdit par regex
   toute classe de palette Tailwind en dur (`bg-slate-100`, `text-red-700`, `bg-white`…)
   dans `app/` et `components/`. C'est ce qui rend vrai « changer un token se répercute
   partout ».

5. **Clair uniquement.** Il n'y a pas de bloc `.dark`, et le test vérifie qu'il ne
   revient pas. Le mode sombre pourra être ajouté un jour ; il ne se réintroduit pas
   par accident.

## Tokens

### L'échelle et ses alias

`globals.css` déclare une échelle `--slate-50` → `--slate-900`, puis des **alias
sémantiques** par-dessus. Le markup n'utilise que les alias.

| Utilitaire | Token | Valeur | Rôle |
|---|---|---|---|
| `bg-app` | `--app-bg` | slate-50 | le fond de page |
| `bg-surface` | `--surface-card` | `#ffffff` | toute carte, tout champ |
| `bg-emphasis` / `text-on-emphasis` | `--surface-emphasis` | slate-900 | le bandeau du solde, l'avatar sombre, le logo. **Le seul aplat sombre.** |
| `text-strong` | `--text-strong` | slate-900 | titres, montants |
| `text-body` | `--text-body` | slate-700 | corps, libellés de champ |
| `text-muted-foreground` | `--text-muted` | slate-500 | méta : dates, payeur |
| `text-faint` | `--text-faint` | slate-400 | placeholders, mentions latérales |
| `border-subtle` | `--border-subtle` | slate-200 | **filet** entre deux surfaces |
| `border-input` | `--input` | slate-500 | **limite** d'un contrôle de formulaire |
| `bg-primary` | `--primary` | slate-900 | bouton plein |
| `ring-ring` | `--ring` | slate-900 | anneau de focus |
| `bg-muted` | `--muted` | slate-100 | fond atténué, état actif de nav |
| `bg-positive-surface` / `text-positive` | emerald-50 / emerald-900 | | réassurance : transfert, version en cours |
| `text-destructive` | `--destructive` | red-700 | **erreurs de formulaire uniquement** |

**Filet ≠ limite, et l'écart est un arbitrage d'accessibilité.** Un filet entre deux
surfaces doit rester léger (slate-200). La limite d'un contrôle doit atteindre 3:1 sur
son fond (WCAG 1.4.11) : slate-300 ne donne que ~1,5:1, d'où slate-500 (4,6:1). Ne pas
les fusionner « pour simplifier ».

### Rayons et élévation

`--radius: 10px`. Puis `sm` 6px, `md` 8px, `lg` 10px (champs, boutons, selects),
`xl` 14px (cartes, bandeaux). Deux ombres seulement, `shadow-xs` et `shadow-sm` —
la carte porte `shadow-xs`, à peine perceptible.

### Typographie

Inter partout. `--font-mono` existe pour la saisie des charges et les `<code>`, rien
d'autre.

```
titre d'écran   1.5rem   600   tracking −0.02em     (EntetePage → <h1>)
titre de carte  0.9375rem 600                        (Carte → <h2>)
section         0.75rem  500   majuscules  tracking 0.08em  atténué
corps           0.875rem 400
méta            0.75rem  400   atténué
```

**Tous les montants sont en `tabular-nums`**, sans exception : une colonne de soldes
signés reste alignée au caractère près.

## Composants

### Les contrôles — `components/ui/`

Quatre primitives, retouchées depuis shadcn. `card.tsx` et `table.tsx` ont été
supprimés ; le conteneur est `Carte`, et les listes sont des `<ul>`.

- **`Button`** — deux variantes, pas plus : `primaire` (aplat encre) et `discret`
  (bordé sur blanc). `min-h-11` = **44px dans les deux cas** : la cible tactile est
  réglée ici, à la source, pas écran par écran. La maquette dessine 42px ; on ne
  descend pas sous le plancher pour 2px.
- **`Input`** — bordé, fond blanc, rayon 10px, `h-10`. Le focus épaissit un anneau de
  3px et fonce la limite. `aria-invalid` bascule en `--destructive`.
- **`Textarea`** — la même liste de classes que `Input`, ligne pour ligne. Il existe
  précisément parce que les champs de charges recopiaient ce style à la main et avaient
  déjà divergé (ni `disabled:`, ni `aria-invalid:`).
- **`Select`** — un `<select>` **natif**, volontairement : il porte gratuitement le
  clavier, l'ARIA, `disabled`, et ouvre le sélecteur du système sur mobile. Le popup JS
  de Base UI ne fait rien de tout ça. La flèche native est retirée par `appearance-none`
  et remplacée par un chevron SVG posé dans `globals.css` — **sa couleur est un hex
  littéral** (`#64748b`) parce que `url()` ne peut pas lire une variable CSS : à
  resynchroniser à la main si `--text-muted` change.
- **`Label`** — `text-body`, 500, toujours lié par `htmlFor`.

### Les composants produit — `components/`

- **`Carte`** — la surface de base : blanc, filet, rayon 14px, `shadow-xs`. Elle entoure
  chaque bloc de contenu, à la seule exception du bandeau du solde. `titre` rend un
  `<h2>` : les cartes sont le second niveau de titre de chaque écran.
- **`EntetePage`** — le `<h1>` unique du document, plus un sous-titre atténué.
- **`Montant`** — voir ci-dessous.
- **`LigneDepense`** — une entrée d'historique. Elle **affiche les parts**, ce que la
  maquette ne montrait pas : c'est la seule chose que cet écran prouve à l'œil — les
  parts ne bougent plus après la saisie. Le parcours Playwright compare ce texte avant
  et après création d'une version de config ; le retirer viderait ce test de son sens.
- **`Avatar`** — la pastille d'initiale. La couleur ne distingue pas les deux personnes
  (le système est achromatique), donc le nom complet est porté par `aria-label` et
  l'initiale masquée. `decoratif` sort la pastille de l'arbre d'accessibilité là où le
  nom suit déjà en clair, plutôt que de faire annoncer « Thomas Thomas ».
- **`BadgeType` / `BadgeVersion`** — étiquettes. Seul `transfert` et « En cours »
  portent l'emerald.
- **`NavLaterale`** — cliente pour une seule raison : `usePathname()`. L'état actif est
  porté par le fond **et** par `aria-current` — sous 880px les libellés disparaissent,
  et un contraste de fond seul n'annoncerait rien.
- **`PiedProfil`** — qui est connecté, et par où sortir.

## Le traitement des montants

`Montant` est **l'unique frontière entre les centimes et l'écran**. Quatre niveaux, un
booléen `signe`. Rien d'autre — pas de `couleur`, pas de `variante`, pas de `devise`.

| Niveau | Rendu | Usage |
|---|---|---|
| `heros` | 1.875rem / 600 | le solde du bandeau sombre, et lui seul |
| `notable` | 1.375rem / 600 | les quatre chiffres clés du tableau de bord |
| `courant` | 0.875rem / 600 | le montant d'une ligne de liste ou de bilan |
| `discret` | 0.75rem / 500, atténué | méta, détail des parts |

**Ce que le composant n'a pas le droit de faire.** Il reçoit des `Cents` et les affiche.
Il ne nie jamais une valeur, ne l'inverse jamais selon la personne regardée, ne dérive
jamais un signe d'un contexte. C'est la garde contre le piège du mode transfert
documenté dans `CLAUDE.md` : si un écran affiche un jour le mauvais sens, le bug est
dans le domaine et se corrige là — jamais par un `-` posé dans le JSX.

Le formatage vit dans `lib/format.ts` :

- le moins est un vrai moins typographique `−` (U+2212), de chasse identique au `+` ;
- `avecSignePositif` ne commande **que** le plus explicite — un négatif porte toujours
  son moins, sans quoi un drapeau oublié afficherait `1 145,80 €` pour une valeur de
  `−114580` ;
- le rendu est un `<data value={cents}>` : la valeur exacte en centimes reste lisible
  par une machine, jamais l'euro arrondi.

`enEuros()` dans `config/formulaire-version.tsx` reste où elle est : elle produit une
valeur **éditable** de champ de saisie, pas de l'affichage.

## Accessibilité — les planchers tenus à la source

- **44px** de hauteur minimale sur `Button`.
- **3:1** pour la limite d'un contrôle (`--input`) et pour l'anneau de focus (`--ring`),
  d'où l'encre pleine plutôt qu'un gris clair.
- Le focus visible n'est **jamais** supprimé : `focus-visible:ring-[3px]` avec décalage.
- Aucune information portée par la couleur seule : `aria-current` sur la nav,
  `aria-label` sur les avatars, libellé en clair sur chaque badge.
- **360px** est la largeur plancher testée (issue C2).

## Hors périmètre

Le mode sombre. Les icônes de bibliothèque — `lucide-react` est installé et n'est
importé nulle part ; les trois icônes de nav sont des `<path>` inline. Les animations
(`tw-animate-css`, idem). Toute couleur d'identité au-delà des deux accents.

## Quand on touche au visuel

`task verif` avant de committer. `theme.test.ts` échoue si une couleur en dur, une
seconde fonte, un bloc `.dark` ou une valeur du thème shadcn d'origine réapparaît — ne
l'assouplis pas, c'est lui qui rend les règles ci-dessus vraies plutôt que déclaratives.
