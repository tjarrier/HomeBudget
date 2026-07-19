# Direction visuelle de HomeBudget

**Issue :** [A1 — Définir la direction visuelle de HomeBudget](https://github.com/tjarrier/HomeBudget/issues/4)
**Date :** 2026-07-19
**Statut :** validé

Cette spec tranche la direction visuelle de `apps/web`. Les issues A2, A3, A4 et le
bloc B en découlent : elles appliquent ce qui est décidé ici, elles ne le rediscutent
pas.

## Le problème

`apps/web` n'a jamais fait de choix visuel. `app/globals.css` est le thème shadcn
livré tel quel — `baseColor: neutral`, chroma 0 partout, `--radius: 0.625rem`, aucune
police chargée. Pire, le thème n'est pas seulement générique : il est **court-circuité**.
Les six primitives de `components/ui/` (`button`, `card`, `input`, `label`, `select`,
`table`) ne sont importées nulle part. Chaque écran est du HTML natif stylé à la main
en `slate-*` codés en dur, hors du système de tokens.

Conséquence directe : tant que les pages n'utilisent pas les tokens, changer un token
ne change rien. C'est précisément ce que A2 exige (« changer un token se répercute
partout »), et ça ne peut pas être vrai sans A3.

## La direction

**Épuré et éditorial, professionnel, en clair uniquement.**

Blanc dominant, très peu de cadres, typographie de caractère, espacements larges.
L'UX/UI est un critère de premier ordre pour ce projet : l'application s'ouvre tous
les jours, elle doit être agréable, pas seulement fonctionnelle.

Le pari de cette direction : **on retire les bordures qui font aujourd'hui tout le
travail de structure, et c'est la typographie et le rythme vertical qui le
reprennent.** Si le rythme est mou, l'écran devient illisible — il n'y a plus de
cadre pour rattraper.

### Ce qui a été écarté, et pourquoi

- **Une couleur par personne** (Thomas / Liz) partout dans l'app. Expressif, mais
  vite gadget sur un écran quotidien, et ça moralise le solde.
- **Rouge / vert sur les soldes.** Le solde n'est pas un « positif = bien ». C'est une
  **direction** : qui doit à qui. Le sens s'inverse selon qui regarde l'écran ; une
  teinte de jugement y serait fausse pour au moins un des deux utilisateurs.
- **Le mode sombre.** Le bloc `.dark` de `globals.css` vient de shadcn, rien ne le
  déclenche : c'est du code mort. Le retirer divise par deux les arbitrages de tokens
  et supprime une variante qu'aucun test ne couvre. Il pourra revenir plus tard, une
  fois la direction établie en clair.

## Tokens

**Principe : on garde les *noms* de tokens de shadcn, on remplace toutes les
*valeurs*.** Les primitives de contrôle conservées référencent `--color-primary`,
`--color-input`, `--color-ring`, `--color-muted-foreground`. Renommer en français
obligerait à les réécrire entièrement pour un gain nul. Les noms sont le contrat avec
les primitives ; la direction visuelle vit dans les valeurs.

On supprime en revanche tout ce qui ne sert à rien : les six `--sidebar-*` (aucune
sidebar), les cinq `--chart-*` (aucun graphique), et le bloc `.dark` entier.

### Couleur

| Token | Valeur | Rôle |
|---|---|---|
| `--background` | `#FFFFFF` | fond de page, unique |
| `--foreground` | `#16181C` | encre : texte principal et montants |
| `--muted-foreground` | `#676C76` | méta : dates, payeur, libellés de section |
| `--muted` | `#F4F5F7` | le seul aplat de l'app (fond de champ, aperçu des parts) |
| `--border` | `#E4E6EA` | filet de séparation |
| `--primary` | `#16325C` | actions, liens actifs |
| `--primary-foreground` | `#FFFFFF` | texte sur action |
| `--ring` | `#16325C` à 45 % | focus visible, 2px |
| `--destructive` | `#8B1A1A` | erreurs de formulaire uniquement |

Les valeurs sont écrites en `oklch` dans `globals.css`, cohérentes avec Tailwind v4.

**`--border` est un filet horizontal, pas un contour.** C'est la traduction concrète
d'« épuré ». Aujourd'hui `border border-slate-200` fait le tour de chaque bloc ; après
A2, une séparation est une ligne, et un bloc n'a pas de bord.

### Typographie

Deux familles, chargées par `next/font/google` — auto-hébergées, aucune requête
externe, aucun décalage de rendu.

- **Instrument Serif** (400) — le solde et les titres d'écran. Rare par construction.
- **Inter** (400 / 500 / 600) — tout le reste, et **tous les montants en colonne**, en
  `tabular-nums`.

La répartition n'est pas arbitraire. Instrument Serif a des chiffres à chasse
proportionnelle : parfait pour un montant héros isolé, mauvais dès qu'il faut aligner
une colonne. D'où la règle : **la serif ne touche jamais un montant qui a un voisin
au-dessus ou en dessous.**

```
display   Instrument Serif 400   clamp(2.75rem, 12vw, 4rem)   tracking −0.02em
titre     Instrument Serif 400   1.75rem
section   Inter 500              0.8125rem  majuscules  tracking 0.08em  atténué
corps     Inter 400              0.9375rem
méta      Inter 400              0.8125rem  atténué
```

### Rythme

Base 4px.

- Entre deux sections : **40px** sous 640px, **56px** au-delà.
- Dans une section : **12px**.

C'est cet écart 40/12 qui crée le groupement, puisqu'il n'y a plus de cadre pour le
faire. Il n'est pas décoratif : c'est le mécanisme de structure de l'écran.

### Hors `globals.css`

`app/layout.tsx` code aujourd'hui `bg-slate-50 text-slate-900` en dur sur le `<body>`.
Tant que cette ligne existe, changer un token ne se répercute pas. Elle passe en
`bg-background text-foreground`.

## Composants

### La fourche : contrôles contre conteneurs

L'issue A3 dit « reprendre les six primitives selon les tokens ». Ça ne tient pas dans
cette direction : `Card` est un contour — précisément ce qu'on retire — et `Table` est
ce que B2 démonte. Les habiller reviendrait à découvrir en B1/B2 qu'aucune des deux ne
sert.

On tranche donc entre ce qui porte un **comportement** et ce qui porte un **cadre** :

- **On garde et on retouche les quatre contrôles** — `button`, `input`, `label`,
  `select`. Ils portent le focus visible, l'état `disabled`, la sémantique ARIA, que
  `@base-ui/react` fournit déjà correctement en dessous. C'est là que les tokens ont du
  sens.
- **On supprime `card.tsx` et `table.tsx`.**
- **On introduit trois composants projet** qui portent la direction éditoriale :
  `Montant`, `Section`, `Ligne`.

### Les quatre contrôles (`components/ui/`)

**`button`** — deux variantes, pas plus.

- *primaire* : aplat `--primary`, texte `--primary-foreground`, rayon 6px.
- *discret* : texte `--primary`, ni fond ni bordure.

Hauteur minimale **44px** dans les deux cas — ce qui règle C1 à la source plutôt
qu'écran par écran. Focus : anneau `--ring` de 2px avec 2px de décalage, jamais
supprimé.

**`input`** et **`select`** — c'est ici que se joue le risque de l'épuré : un champ
sans contour peut devenir invisible. L'affordance vient donc d'ailleurs.

- Pas de contour. Fond `--muted`.
- **Filet inférieur** de 1px en `--border`, qui passe à 2px en `--primary` au focus.
- Hauteur 48px.

**`label`** — Inter 500, 0.8125rem, encre atténuée, au-dessus du champ, toujours lié
par `htmlFor`.

### Les trois composants projet (`components/`)

**`Section`** — un titre en style *section* et le rythme vertical de son contenu. Elle
ne dessine rien : c'est l'écart 40/12 qui fait le groupement.

**`Ligne`** — une entrée de liste : intitulé, méta, montant, détail optionnel.

- Sous 640px : empilée en bloc, séparée de la suivante par un filet.
- Au-delà : la même instance bascule en grille alignée, et la liste redevient un
  tableau.

**Un seul balisage, une bascule purement CSS.** Pas de double rendu, pas de JS, pas de
détection de viewport. C'est ce qui rend B2 (cartes sur mobile, tableau au-delà) et C2
(aucun débordement à 360px) vraies par construction plutôt que vérifiées après coup.

## Le traitement des montants

C'est le contenu principal de chaque écran, et c'est ce que le composant `Montant`
(issue A4) fige.

### Interface

```tsx
<Montant cents={114580} niveau="heros" />
<Montant cents={resume.soldeThomas} niveau="notable" signe />
<Montant cents={depense.partLiz} niveau="discret" />
```

Trois niveaux, un booléen. Rien d'autre — pas de `couleur`, pas de `variante`, pas de
`devise`.

| Niveau | Rendu | Usage |
|---|---|---|
| `heros` | Instrument Serif, `display`, chiffres proportionnels | le solde du tableau de bord ; une occurrence par écran au plus |
| `notable` | Inter 600, 1.25rem, `tabular-nums` | totaux, montant d'une dépense dans une liste |
| `discret` | Inter 500, 0.9375rem, `tabular-nums`, encre atténuée | parts, montants de configuration |

Aucune couleur ne code un sens. La direction du solde est portée par le libellé
(« Liz doit à Thomas »), pas par une teinte.

### Ce que le composant n'a pas le droit de faire

Il reçoit des `Cents` et les affiche. **Il ne nie jamais une valeur, ne l'inverse
jamais selon la personne regardée, ne dérive jamais un signe d'un contexte.** Quand
`signe` est activé, le glyphe affiché vient *uniquement* du signe de la valeur reçue ;
à zéro, aucun glyphe.

C'est la garde contre le piège du mode transfert documenté dans `CLAUDE.md`. Si un
écran affiche un jour le mauvais sens, le bug est dans le domaine et se corrige là —
jamais par un `-` posé dans le JSX.

### Mécanique

Le composant formate la **valeur absolue** via `formaterMontant()`, puis pose lui-même
le glyphe de signe. Plus verbeux que de laisser `Intl` s'en charger, mais ça donne le
contrôle sur deux choses qui comptent :

- le glyphe est un vrai moins typographique `−` (U+2212), pas un trait d'union ;
- il occupe une chasse identique au `+`, donc une colonne de soldes signés reste
  alignée au caractère près.

Le rendu est un `<data value={cents}>` : la valeur exacte en centimes reste lisible par
une machine, jamais l'euro arrondi.

### Ce que `Montant` ne couvre pas, volontairement

`enEuros()` dans `app/(app)/config/formulaire-version.tsx` convertit des centimes en
valeur **éditable** de champ de saisie. C'est du pré-remplissage de formulaire, pas de
l'affichage. Elle reste où elle est. A4 dit « aucun `page.tsx` ne formate un montant
lui-même » : les champs de saisie ne sont pas concernés.

### La conséquence sur `phraseSynthese()`

`phraseSynthese()` (`packages/domain/src/solde.ts`) rend une chaîne complète :
`Liz doit 1 145,80 € à Thomas`. Un montant héros en serif à 64px enchâssé au milieu
d'une phrase en Inter est impossible à composer proprement — le solde doit être un
bloc, pas un mot dans une ligne.

Le domaine expose donc la **structure** plutôt que la phrase :

```ts
type Synthese =
  | { etat: 'a-jour' }
  | { etat: 'dette'; debiteur: Personne; crediteur: Personne; montant: Cents }
```

`phraseSynthese()` ne disparaît pas : elle est **réécrite par-dessus** cette structure.
Il n'y a donc toujours qu'une seule source de vérité sur qui doit à qui, et ses tests
unitaires actuels continuent de la couvrir. Le tableau de bord consomme `synthese()` et
compose lui-même : libellé en Inter atténué, puis `<Montant niveau="heros">` en dessous.

**Ce que ça casse, et il faut le nommer.** `apps/web/e2e/parcours.spec.ts` fait quatre
assertions sur `data-testid="phrase-synthese"`, dont deux en correspondance *exacte* :

- ligne 31 — `toHaveText('Liz doit 1 145,80 € à Thomas')`
- ligne 51 — `toHaveText('Liz doit 1 120,80 € à Thomas')`
- lignes 56 et 72 — lecture puis comparaison avant/après ; celles-ci continuent de
  fonctionner telles quelles.

L'ordre des mots change : le montant passe après « à Thomas » au lieu d'être au milieu.
Les deux assertions exactes sont donc mises à jour pour vérifier que **le bon montant
est affiché et que le sens est le bon**, plutôt que la ponctuation exacte.

Le `data-testid="phrase-synthese"` est **conservé**, porté par le bloc composé
(libellé + montant), sans quoi les lignes 56 et 72 casseraient elles aussi.

Ce n'est pas un ajustement de test pour le faire passer. Le solde canari reste
rigoureusement **114 580 centimes** : c'est la mise en forme de la phrase qui bouge,
délibérément.

## La page de référence

**Le tableau de bord** — `app/(app)/page.tsx`.

Trois raisons. Il porte le montant héros, donc la serif et l'échelle `display` : la
décision la plus risquée de la direction, celle qu'il faut voir avant d'écrire les
autres issues. Il porte une colonne de soldes signés, donc la validation de
l'alignement `tabular-nums` et du glyphe `−`. Et c'est le premier écran, celui dont
dépend l'impression générale.

C'est aussi le plus **petit** périmètre possible : le tableau de bord n'a ni formulaire
ni liste. A1 démontre la direction sans empiéter sur B1, B2 ou B3, qui gardent leur
substance. Les contrôles et `Ligne` sont **spécifiés** ici et **appliqués** en A3.

État visé :

```
                                    ← 56px de blanc

   LIZ DOIT À THOMAS                Inter 500 · 13px · maj · atténué

   1 145,80 €                       Instrument Serif · 64px

   ─────────────────────────────    filet

   Dépensé total        3 402,10 €  notable
   Transferts             800,00 €  notable

   PAR PERSONNE                     libellé de section

   Payé par Thomas      2 100,00 €  discret
   Payé par Liz         1 302,10 €  discret
   Solde Thomas        +1 145,80 €  discret · signé
   Solde Liz           −1 145,80 €  discret · signé
```

Les huit tuiles `grid-cols-2` actuelles disparaissent : elles traitent les huit chiffres
à égalité alors que sept d'entre eux sont du détail. C'est exactement ce que B1
reproche à l'écran — la hiérarchie tombe donc dès A1, et B1 n'a plus qu'à finir
l'ergonomie.

## Conséquences sur les issues du bloc A

- **A2** — remplacer les valeurs de `globals.css` selon la table ci-dessus, supprimer
  `--sidebar-*`, `--chart-*` et le bloc `.dark`, charger les deux polices via
  `next/font/google`. Corriger `app/layout.tsx` (`bg-slate-50` → `bg-background`), sans
  quoi le critère « changer un token se répercute partout » reste faux.
- **A3** — l'énoncé change : retoucher les **quatre** contrôles, supprimer `card.tsx` et
  `table.tsx`, introduire `Section` et `Ligne`. Et surtout, faire **migrer les pages**
  vers ces composants : c'est la partie la plus lourde, aujourd'hui absente de l'issue.
- **A4** — `Montant` tel que spécifié, plus l'extraction de `Synthese` dans le domaine et
  la mise à jour de l'assertion e2e.

## Ce qui reste hors périmètre

Le mode sombre, les icônes (`lucide-react` est installé et jamais importé — ça reste
vrai après A1), les animations (`tw-animate-css` idem), et toute couleur d'identité
au-delà de l'accent unique.
