# HomeBudget — manuel visuel

Ce fichier est la source de vérité du système visuel de `apps/web`. Il documente
ce que le code fait **aujourd'hui**.

**Spec :** `docs/superpowers/specs/2026-09-13-refonte-prune-abricot-design.md`
**Maquette :** « Refonte HomeBudget », page « Direction A » (issue #68)
**Implémentation :** `apps/web/app/globals.css` — les tokens ; `apps/web/components/` — les composants.
**Verrous :** `apps/web/test/theme.test.ts`, `apps/web/test/cibles-tactiles.test.ts`, `apps/web/e2e/`.

> `docs/superpowers/specs/2026-07-19-direction-visuelle-design.md` est dépassée : elle
> décrivait une app achromatique. Elle reste utile pour les raisonnements qu'elle porte
> sur `Montant`.

## Les règles qui ne se négocient pas

1. **Deux couleurs d'identité, et aucune ne code un sens.** Le **prune** porte la marque
   (bandeau du solde, liens, icônes), l'**abricot** porte l'action principale. Un solde
   est une **direction** : `+1 145,80` pour Thomas et `−1 145,80` pour Liz sont le même
   fait vu des deux bouts. Le bandeau est prune quel que soit le sens de la dette ; les
   deux soldes ont la même encre.

2. **Aucune couleur par personne.** Les pastilles de Thomas et de Liz sont identiques ;
   le nom porte l'identité.

3. **Deux familles de caractères.** Manrope pour le texte, Bricolage Grotesque pour le
   solde et les titres. Bricolage ne touche jamais un montant en liste : ses chiffres
   ne s'alignent pas. `theme.test.ts` refuse une troisième famille.

4. **Le markup n'écrit jamais une couleur.** Il écrit un token (`bg-emphasis`,
   `text-marque`, `border-subtle`). `theme.test.ts` interdit les classes de palette
   Tailwind en dur, `bg-white`, et les tokens retirés (`text-faint`, `*-positive`).

5. **Clair uniquement.** Pas de bloc `.dark`.

## Tokens

| Utilitaire | Valeur | Rôle | Contraste |
|---|---|---|---|
| `bg-app` | `#f7f4ef` | fond de page | |
| `bg-surface` | `#ffffff` | cartes, feuilles | |
| `bg-emphasis` / `text-on-emphasis` | `#3d2344` / blanc | **prune** : le bandeau du solde | 13,79:1 ; blanc 72 % 7,87:1 ; 60 % 5,95:1 |
| `text-marque` / `bg-marque` | `#5b3563` | liens, icônes, barres, focus | 9,84:1 sur blanc |
| `bg-marque-surface` | `#f3ecf3` | pastilles d'icône, état actif, réassurance | |
| `bg-primary` / `text-primary-foreground` | `#f2a45e` / `#1f1a24` | **abricot** : l'action principale | texte 8,32:1 ; abricot sur blanc 2,05:1 |
| `text-strong` | `#1f1a24` | encre : titres, montants, choix sélectionné | 17,05:1 |
| `text-muted-foreground` | `#6e6673` | **le seul gris de texte** | 5,51:1 blanc, 5,02:1 fond, 4,90:1 champ |
| `bg-muted` | `#f5f1ec` | fond de champ et de choix | |
| `border-input` | `#8a828e` | **limite** : filet inférieur d'un champ | 3,30:1 sur `bg-muted` |
| `border-subtle` | `#efeae4` | **filet** entre deux lignes | |
| `ring-ring` | `#5b3563` | focus visible | 9,84:1 |
| `text-destructive` | `#b91c1c` | erreurs de formulaire et d'action échouée | 6,47:1 |
| `backdrop:bg-overlay` | encre à 55 % | le voile des `<dialog>` | |

**L'abricot ne porte jamais de texte** et ne sert jamais de filet ni d'icône seule sur
fond clair : 2,05:1 sur blanc. Un bouton abricot est identifié par son libellé.

**Filet ≠ limite.** `border-subtle` sépare deux lignes et reste léger. `border-input`
délimite un champ et tient 3:1. Le fond d'un champ seul ne donne que 1,12:1 sur blanc :
sans son filet inférieur, un champ vide est invisible.

Rayons : 14 px champs, choix et boutons ; 20 px cartes ; 24 px bandeau ; 28 px feuilles.
Une ombre `shadow-xs` sur les cartes, `shadow-action` sur le « + » et lui seul.

Le chevron du `<select>` est un hex littéral dans `globals.css` (`url()` ne lit pas une
variable) : `#6e6673`, à resynchroniser si `--text-muted` change.

## Typographie

```
solde (heros)     Bricolage 600   clamp(2.25rem, 12vw, 3.125rem)
titre d'écran     Bricolage 600   1.3125rem
titre de section  Bricolage 600   1.1875rem
montant saisi     Bricolage 600   3.625rem
corps             Manrope 600     0.9375rem
libellé, méta     Manrope 600/400 0.8125rem   atténué
```

**Tous les montants en liste sont en `tabular-nums`.**

## Composants

### Les contrôles — `components/ui/`

- **`Button`** — deux variantes : `primaire` (abricot, texte encre) et `discret` (texte
  prune, sans contour). `min-h-11` dans les deux cas.
- **`Input`**, **`Select`**, **`Textarea`** — fond `bg-muted`, arrondis en haut, filet
  inférieur `border-input` qui passe à 2 px prune au focus. `h-11` / `min-h-11`.
  `text-base` : sous 16 px, Safari iOS zoome au focus. `Select` reste un `<select>`
  natif.
- **`Choix`** — des boutons radio natifs en segments (`<fieldset>`, `<legend>`). L'input
  couvre tout le segment en `opacity-0` : un radio `sr-only` de 1 px tomberait sous le
  plancher mesuré par `e2e/cibles-tactiles.spec.ts`.
- **`Label`** — atténué, 600, toujours lié par `htmlFor`.

### Les composants produit — `components/`

- **`FeuilleSaisie`** — la saisie, un `<dialog>` natif monté une fois dans le layout.
  Son état ouvert vit dans l'URL : `?saisie=1`, `?saisie=regler` (`lib/url-saisie.ts`).
  Le formulaire n'est monté que feuille ouverte, et la feuille se ferme après une
  écriture : c'est ce qui désarme un second clic.
- **`FormulaireDepense`** — montant, description et payeur visibles ; date, type,
  répartition et commentaire repliés, **montés et masqués par `hidden`**, jamais
  `disabled`. L'aperçu est `previsualiserPartsAction`, qui appelle `calculerPartsPourSaisie`
  — la même fonction que l'écriture (`ajouterDepense`) : l'aperçu ne peut pas diverger de
  ce qui sera réellement figé.
- **`NavPrincipale`** — trois cases sous 768 px (Accueil, « + », Dépenses), rail
  au-dessus. Le « + » est un lien qui ajoute `saisie=1` à l'URL courante.
- **`MenuCompte`** — rendu deux fois, dans l'en-tête sous 768 px et en pied de rail
  au-dessus. Il porte « Configuration », « Se déconnecter » et « Annuler ».
- **`Carte`** — blanc, sans bordure, 20 px, `shadow-xs`. `titre` rend un `<h2>`.
- **`EntetePage`** — le `<h1>` d'un écran, avec une flèche de retour optionnelle.
- **`LigneDepense`** — icône du type (nom accessible : le type), description,
  « date · payé par », **parts affichées**, montant.
- **`Montant`** — voir ci-dessous.

## Le traitement des montants

`Montant` est **l'unique frontière entre les centimes et l'écran**. Quatre niveaux, un
booléen `signe`.

| Niveau | Rendu | Usage |
|---|---|---|
| `heros` | Bricolage 600, proportionnel | le solde, sur l'accueil et le tableau de bord |
| `notable` | Manrope 700, 1.1875rem | les quatre chiffres du tableau de bord |
| `courant` | Manrope 700, 0.9375rem | une ligne de liste, de bilan, l'aperçu |
| `discret` | Manrope 500, 0.75rem, atténué | détail des parts |

**Ce que le composant n'a pas le droit de faire.** Il ne nie jamais une valeur, ne
l'inverse jamais selon la personne regardée, ne dérive jamais un signe d'un contexte.
Si un écran affiche un jour le mauvais sens, le bug est dans le domaine — jamais un `-`
dans le JSX. Le moins est un vrai `−` (U+2212), et le rendu est un `<data value={cents}>`.

## Accessibilité — les planchers

- **44 px** sur tout ce qui se touche, tenu à la source dans chaque primitive et mesuré
  sur le rendu par `e2e/cibles-tactiles.spec.ts`, écran par écran, feuilles ouvertes.
- **12 px** entre « Se déconnecter » et « Annuler ».
- **3:1** pour la limite d'un champ et l'anneau de focus ; **4,5:1** pour tout texte.
- **360 px** de largeur testée (`e2e/telephone.ts`) ; `e2e/debordement.spec.ts` lit les
  routes sur le disque.
- La saisie tient **sans défiler**, feuille repliée : `e2e/parcours.spec.ts` le mesure.
- Aucune information portée par la couleur seule : `aria-current` sur la navigation,
  `aria-label` sur les icônes de type et les avatars.
- `viewport-fit=cover` : chaque bord a sa contrepartie en `calc(base + env(…))`.

## Hors périmètre

Le mode sombre. Les icônes de bibliothèque (`lucide-react` n'est importé nulle part) et
les animations au-delà du `<dialog>` natif.

## Quand on touche au visuel

`task verif` avant de committer, `task test:e2e:frais` avant de pousser. Ne pas
assouplir `theme.test.ts` : c'est lui qui rend les règles ci-dessus vraies.
