# Refonte « Prune et abricot »

**Issue :** [#68](https://github.com/tjarrier/HomeBudget/issues/68)
**Date :** 2026-09-13
**Maquette :** [Refonte HomeBudget](https://claude.ai/code/artifact/4ea069ff-3b79-479f-af93-ab4d4215509d), page « Direction A »
**Statut :** direction validée, spec à relire

Cette spec remplace `DESIGN.md` et `2026-07-19-direction-visuelle-design.md` comme
direction en vigueur. Elle dit ce qu'elle garde de l'ancienne, ce qu'elle abandonne, et
ce que ça change dans le code et dans les tests.

## Le problème

Deux reproches, posés dans l'issue :

- **L'identité est fade.** Le système est achromatique par décision (`DESIGN.md`,
  règle 1) : une échelle slate, un emerald, un rouge, et « il n'y a pas de couleur de
  marque ». Le résultat est propre et générique.
- **Sur le téléphone, ça fait site web rétréci.** Ajouter une dépense, le geste le plus
  fréquent, demande d'aller sur `/depenses` et d'y remplir un formulaire posé dans une
  `Carte`, sous l'en-tête de page.

## Ce qui est gardé, et pourquoi

Ces règles ne sont pas esthétiques. La refonte les garde telles quelles.

1. **Aucune couleur ne code un sens.** `+1 145,80` pour Thomas et `−1 145,80` pour Liz
   sont le même fait vu des deux bouts. La couleur de marque peut être partout, sauf
   sur le signe : le bandeau du solde est prune que Liz doive à Thomas ou l'inverse.
2. **Pas de couleur par personne.** Les pastilles de Thomas et de Liz sont identiques ;
   le nom porte l'identité.
3. **`Montant` ne dérive jamais un signe.** Tout le paragraphe « Ce que le composant
   n'a pas le droit de faire » de `DESIGN.md` reste vrai, mot pour mot.
4. **Le markup n'écrit jamais une couleur.** `theme.test.ts` continue d'interdire les
   classes de palette Tailwind en dur. On change les valeurs des tokens, on en ajoute ;
   on ne contourne pas le test.
5. **Clair uniquement.** Le mode sombre reste hors périmètre.
6. **Les planchers d'accessibilité** : 44 px sur tout ce qui se touche, 12 px entre deux
   actions adjacentes, 3:1 pour la limite d'un contrôle et l'anneau de focus, 360 px de
   largeur testée, `aria-current` sur la navigation.

## Ce qui est abandonné

- **L'achromatisme.** Deux couleurs d'identité entrent : prune et abricot.
- **La famille unique.** Inter s'en va ; deux familles la remplacent.
- **L'emerald.** Il ne servait qu'à la « réassurance » (badge Transfert, version en
  cours). Une troisième teinte à côté du prune et de l'abricot diluerait les deux. Les
  encadrés de réassurance prennent la surface prune ; le badge Transfert disparaît des
  listes, où l'icône du type le remplace.
- **Les formulaires de saisie dans une page.** La saisie devient une feuille ouverte
  depuis n'importe quel écran.
- **« Config » dans la barre basse.**

## Les couleurs

Toutes les valeurs de contraste ci-dessous ont été calculées (formule WCAG 2.x), pas
estimées.

| Token | Valeur | Rôle | Contraste vérifié |
|---|---|---|---|
| `--app-bg` | `#F7F4EF` | fond de page, blanc cassé chaud | |
| `--surface-card` | `#FFFFFF` | cartes, feuilles | |
| `--surface-emphasis` | `#3D2344` | **prune** : le bandeau du solde, et lui seul | blanc dessus : 13,79:1 |
| `--on-emphasis` | `#FFFFFF` | texte sur prune | à 72 % : 7,87:1 ; à 60 % : 5,95:1 |
| `--marque` | `#5B3563` | prune clair : liens, icônes, anneau de focus | sur blanc 9,84:1, sur fond 8,97:1 |
| `--marque-surface` | `#F3ECF3` | pastilles d'icône, état actif de nav, réassurance | |
| `--primary` | `#F2A45E` | **abricot** : l'action principale, et elle seule | |
| `--primary-foreground` | `#1F1A24` | texte sur abricot | 8,32:1 |
| `--text-strong` | `#1F1A24` | encre : titres, montants, choix sélectionné | sur blanc 17,05:1 |
| `--text-muted` | `#6E6673` | méta : dates, payeur, parts, libellés | blanc 5,51:1, fond 5,02:1, champ 4,90:1 |
| `--muted` | `#F5F1EC` | fond de champ et de choix non sélectionné | |
| `--input` | `#8A828E` | **limite** d'un champ : filet inférieur | sur le fond de champ 3,30:1 |
| `--border-subtle` | `#EFEAE4` | **filet** entre deux lignes | |
| `--ring` | `#5B3563` | focus visible | 9,84:1 |
| `--destructive` | `#B91C1C` | erreurs de formulaire et d'action échouée | 6,47:1 |

Trois corrections par rapport à la maquette, imposées par ces calculs :

- **Le gris clair des parts (`#A39CA6`) ne passe pas** : 2,67:1 sur blanc, pour du texte
  de 12 px qui porte une information (les parts figées, que le parcours Playwright
  compare avant et après une version de config). Il n'existe pas de troisième gris de
  texte : `--text-faint` est retiré et ses usages passent en `--text-muted`.
- **Les libellés inactifs de la barre basse (`#8A828E`) ne passent pas** : 3,71:1 pour
  du texte de 11 px. Ils passent en `--text-muted` ; l'état actif reste porté par la
  pastille `--marque-surface`, la couleur `--surface-emphasis` **et** `aria-current`.
- **Un champ sans limite visible ne passe pas** : le fond `#F5F1EC` sur blanc donne
  1,12:1. Le champ garde son fond et reçoit un **filet inférieur** de 1 px en `--input`
  (3,30:1), qui passe à 2 px en `--marque` au focus. C'est la même distinction
  « filet ≠ limite » que `DESIGN.md` : `--border-subtle` sépare, `--input` délimite.

L'abricot sur blanc ne donne que 2,05:1. Ce n'est pas un défaut : un bouton est
identifié par son libellé (8,32:1), pas par son contour. Mais l'abricot **ne porte donc
jamais de texte** et ne sert jamais de filet ou d'icône seule sur fond clair.

Le chevron du `<select>` natif reste un hex littéral dans `globals.css` (`url()` ne lit
pas une variable) : il passe de `#64748b` à `#6E6673`.

## La typographie

Deux familles, chargées par `next/font/google`, auto-hébergées :

- **Bricolage Grotesque** (500, 600, 700, axe `opsz`) — le solde, les titres d'écran et
  de section, le montant saisi. Variable CSS `--font-display`.
- **Manrope** (400 à 700) — tout le reste. Variable CSS `--font-sans`.

```
solde (heros)     Bricolage 600   3.125rem   tracking −0.035em   interligne 1.02
titre d'écran     Bricolage 600   1.3125rem  tracking −0.015em
titre de section  Bricolage 600   1.1875rem  tracking −0.01em
montant saisi     Bricolage 600   3.625rem   tracking −0.035em
corps             Manrope 600     0.9375rem
libellé, méta     Manrope 600/400 0.8125rem  --text-muted
nav               Manrope 700/600 0.6875rem
```

**Tous les montants en liste sont en `tabular-nums`**, et aucun n'est en Bricolage. La
règle de l'ancienne spec A1 revient, pour la même raison : un chiffre d'affichage
proportionnel est juste pour un montant isolé, faux dès qu'une colonne doit s'aligner.
Bricolage ne touche donc jamais un montant qui a un voisin au-dessus ou en dessous.

## Rayons et élévation

`--radius` passe de 10 à 14 px. Champs, choix et boutons : 14 px ; bouton d'action de
feuille : 16 px ; cartes : 20 px ; bandeau du solde : 24 px ; feuille : 28 px en haut.
Les cartes perdent leur bordure et gardent `shadow-xs` : sur le fond chaud, le blanc
suffit à les détacher.

## Les écrans

### La coque — `app/(app)/layout.tsx`

**Sous 768 px.**

- **En-tête** : la marque à gauche, l'avatar à droite. L'avatar est le déclencheur de
  `MenuCompte`, qui quitte la barre basse. Son nom accessible reste « Compte ».
  `MenuCompte` est rendu deux fois, comme `Marque` : dans l'en-tête sous 768 px, en pied
  de rail au-dessus, chaque exemplaire masqué à la taille de l'autre. Un exemplaire
  masqué par `display: none` sort de l'arbre d'accessibilité : il n'y a jamais deux
  boutons « Compte » atteignables.
- **Barre basse à trois cases** : Accueil, **+**, Dépenses. Le « + » est un cercle
  abricot de 58 px qui déborde de 26 px au-dessus de la barre ; son nom accessible est
  « Ajouter une dépense ».
- **`MenuCompte`** gagne un lien « Configuration » au-dessus de « Se déconnecter ».
  L'écart de 12 px entre « Se déconnecter » et « Annuler » est conservé.

**À partir de 768 px.** La maquette ne dessine pas le grand écran. Le rail latéral est
conservé et reçoit les mêmes entrées que la barre basse : Accueil, Dépenses, puis un
bouton « Ajouter une dépense » ; `MenuCompte` reste en pied de rail. Une seule liste de
liens pour les deux tailles, comme aujourd'hui.

### Accueil — `app/(app)/page.tsx`

1. Le **bandeau du solde**, prune : « Liz doit à Thomas », puis `<Montant niveau="heros">`,
   puis « Sur 33 dépenses ». Deux actions dessous : « Régler les comptes » (seulement en
   cas de dette, comme aujourd'hui) et « Voir le détail », qui mène au tableau de bord.
   Le `data-testid="phrase-synthese"` reste sur le bloc libellé + montant. Ce bloc est
   le `<h1>` de l'écran : l'accueil n'a pas d'autre titre, et `debordement.spec.ts`
   attend un `<h1>` visible sur chaque route.
2. **Dernières dépenses** : un titre, le lien « Voir tout » (le libellé actuel est
   gardé, la maquette dit « Tout voir »), et les cinq dernières lignes
   (`listerDepenses({ limite: 5 })`, inchangé).

Les quatre tuiles et la carte « Répartition » quittent l'accueil pour le tableau de bord.

### Tableau de bord — `app/(app)/tableau-de-bord/page.tsx`, nouveau

`exigerSession()` en première ligne, et une seule lecture : `resumerDepenses()`. Aucune
ligne de dépense n'est lue, donc la règle de borne de G2 ne s'applique pas.

1. En-tête avec retour vers l'accueil et titre « Tableau de bord ».
2. Rappel du solde sur un bandeau prune compact. Il utilise lui aussi le niveau `heros`,
   à la même taille que sur l'accueil : la maquette le dessine en 34 px, mais un
   cinquième niveau de `Montant` pour un seul usage coûterait plus qu'une ligne de haut.
   Pas de `data-testid="phrase-synthese"` ici : le canari lit l'accueil.
3. **Vue d'ensemble**, grille de deux colonnes : Total dépensé, Transferts, Dû par
   Thomas, Dû par Liz, chacun avec sa mention (« Transferts exclus », « 71 % des
   charges »…). Contenu identique aux tuiles `Chiffre` d'aujourd'hui.
4. **Répartition**, une carte, une section par personne : « a payé », une barre de
   progression décorative (`aria-hidden`, le pourcentage est écrit en clair dessous),
   « Aurait dû payer », « Solde » signé. Les deux barres ont la même couleur.

Les pourcentages restent calculés par la fonction `pourcent()` de la page actuelle : un
ratio d'affichage, pas une règle de répartition. `+1 145,80` et `−1 145,80` sont rendus
par `<Montant signe>` avec la même encre.

### La feuille de saisie — `components/feuille-saisie.tsx`, nouveau

**Un `<dialog>` natif ouvert par `showModal()`**, pour les raisons qui l'ont fait choisir
pour `MenuCompte` : piège de focus, `Escape`, arrière-plan inerte, `::backdrop`. Sous
768 px il est ancré en bas, à pleine largeur, arrondi en haut ; au-delà, centré, 28rem
de large au plus.

**L'état ouvert vit dans l'URL** : `?saisie=1` ouvre la feuille par-dessus l'écran
courant, `?saisie=regler` l'ouvre pré-remplie pour régler les comptes. C'est le choix
déjà fait pour « Voir plus » (G2) : un lien fonctionne sans JavaScript, le bouton retour
du téléphone ferme la feuille, et un test peut ouvrir la feuille par `goto()`. Le « + »
est un `<Link>` qui ajoute le paramètre à l'URL courante **en gardant les autres** (les
filtres de `/depenses` survivent à une saisie).

La feuille est montée une fois, dans `app/(app)/layout.tsx`. Un layout ne reçoit pas
`searchParams` : c'est la feuille, composant client, qui lit `useSearchParams()`.

**Contenu, replié** (écran « Saisie » de la maquette) :

- le **montant** en grand, centré — un `Input` stylé en Bricolage, `inputMode="decimal"`,
  `autoFocus` ;
- la **description** ;
- **Payé par** : deux choix, la personne de la session sélectionnée par défaut ;
- le résumé des valeurs par défaut (« Aujourd'hui · courante, moitié-moitié » : le mode
  par défaut d'une dépense courante est `moitie`, `modeParDefaut()` ; la maquette écrivait
  « Au prorata » à tort) et le bouton « Modifier » ;
- en pied de feuille, séparé par un filet : l'aperçu des parts, puis « Ajouter la
  dépense » en abricot.

**Contenu, déplié** (écran « Saisie, détails ouverts ») : Date (Aujourd'hui, Hier,
Autre date), Type (Courante, Charge fixe, Transfert), Répartition (Au prorata, Moitié,
Personnalisée, et les deux champs de parts quand elle est choisie), Commentaire, et
« Replier ». Le montant et la description restent en place : la maquette les remonte en
sous-titre, mais un champ masqué ne se corrige plus, et la feuille dépliée défile de
toute façon.

**Le clavier.** Pendant la frappe du montant et de la description, le clavier du
téléphone occupe le bas de l'écran ; ces deux champs sont en haut de la feuille et
restent visibles. Toucher un choix de payeur n'est pas un champ texte : le clavier se
ferme et toute la feuille repliée est visible. D'où le critère de l'issue — ajouter une
dépense courante sans défiler — tenu sans suivre le clavier en JavaScript. **À vérifier
sur un vrai téléphone** avant de clore : c'est une hypothèse sur la hauteur du clavier,
que Playwright ne peut pas mesurer.

**Ce qui ne change pas dans le fond :**

- L'aperçu appelle toujours `previsualiserPartsAction`, donc `calculerPartsPourSaisie()`,
  la fonction de l'écriture.
- L'écriture passe toujours par `ajouterDepenseAction`, qui appelle `exigerSession()` en
  première ligne.
- Les champs repliés restent **montés et masqués par `hidden`**, jamais `disabled` : un
  champ désactivé n'est pas soumis (commentaire de `formulaire-depense.tsx`).
- `max` sur la date (issue #29) et le refus serveur restent en place ; « Replier » ne
  masque toujours pas une date hors borne.
- **Après une écriture réussie, la feuille se ferme** (le paramètre quitte l'URL) et
  l'écran se rafraîchit. Aujourd'hui, vider le montant désarme un second clic qui
  redoublerait l'écriture ; fermer la feuille le désarme de la même façon.

**Régler les comptes.** Le montant exact vient du domaine (`synthese()` sur
`resumerDepenses()`), jamais du client. La page `/depenses` le calculait parce qu'elle
recevait `?regler=1` ; la feuille, montée dans le layout, ne peut pas. Elle l'obtient
d'une **Server Action** `preparerReglementAction()` (`exigerSession()` en première ligne, qui
rend `{ montant, payePar }` ou « à jour »), appelée à l'ouverture en mode `regler`. Le
calcul n'est pas dupliqué : c'est le même `synthese()`.

### Les choix — `components/ui/choix.tsx`, nouvelle primitive

Payeur, date, type et répartition deviennent des **boutons radio natifs** habillés en
segments : `<fieldset>`, `<legend>`, un `<label>` par option contenant un
`<input type="radio">` masqué visuellement. Même raisonnement que le `<select>` natif :
le clavier (flèches), l'ARIA, et la soumission dans le `FormData` sans une ligne de JS.
Sélectionné : fond `--text-strong`, texte blanc, coche. Non sélectionné : fond `--muted`.
Hauteur `h-12` (48 px).

La date fait exception, parce qu'une date est une valeur et non un choix fermé : un seul
`<input type="date" name="date">` est soumis ; « Aujourd'hui » et « Hier » écrivent sa
valeur, « Autre date » le rend visible.

Les `<select>` de payeur, type et répartition disparaissent du formulaire de saisie.
`Select` reste la primitive des filtres de `/depenses` et du formulaire de version.

### Dépenses — `app/(app)/depenses/page.tsx`

L'écran de l'historique : filtres, liste bornée et « Voir plus » (G2), suppression
(#40), génération de la charge du mois (`FormulaireGeneration`, à côté de l'historique
au large et dessous au téléphone : on ouvre cet écran pour relire, pas pour générer un
loyer une fois par mois). La colonne `FormulaireDepense` et le paramètre `?regler`
disparaissent.

`LigneDepense` suit la maquette : pastille d'icône du type (charge fixe, transfert,
courante), description, « date · payé par Liz », parts en toutes lettres
(« Thomas 718,61 · Liz 391,97 »), montant à droite. La maquette écrit « Liz → Thomas »
pour un transfert et « 5 juil. » pour la date ; « payé par » et `05/07/2026` sont gardés
pour tous les types, parce que le parcours des filtres (#28) reconnaît une ligne de Liz
à ce texte et un mois à `/07/2026`. Les parts restent **affichées**, pour la raison
documentée dans le composant.

### Configuration et connexion

Pas de maquette. Les deux écrans reçoivent les tokens, les polices et les primitives
retouchées, sans changement de structure. `/config` n'est plus dans la navigation : on
l'atteint par `MenuCompte`.

## Les composants touchés

| Composant | Changement |
|---|---|
| `globals.css` | la palette ci-dessus, `--font-display`, `--radius` 14 px ; retirer l'échelle slate, `--text-faint`, `--positive-*` |
| `app/layout.tsx` | charger Bricolage Grotesque et Manrope au lieu d'Inter |
| `Button` | `primaire` = abricot sur encre ; `discret` = texte `--marque`, sans bordure. Toujours deux variantes, toujours `min-h-11` |
| `Input`, `Select`, `Textarea` | fond `--muted`, filet inférieur `--input`, 14 px. Plancher 44 px inchangé |
| `Choix` | nouveau |
| `Montant` | mêmes quatre niveaux, mêmes interdits. `heros` passe en Bricolage 3.125rem |
| `Carte` | sans bordure, 20 px |
| `Avatar` | pastille `--marque-surface`, initiale `--surface-emphasis` |
| `BadgeType`, `BadgeVersion` | le badge Transfert sort des listes ; « En cours » passe en `--marque-surface` |
| `NavPrincipale` | deux liens et le « + » ; `useSearchParams()` pour garder les paramètres |
| `MenuCompte` | déclencheur dans l'en-tête ; lien « Configuration » |
| `FormulaireDepense` | devient le contenu de `FeuilleSaisie` |
| `FeuilleSaisie` | nouveau |
| `actions/depenses.ts` | `preparerReglementAction` ; les trois actions d'écriture ajoutent `revalidatePath('/tableau-de-bord')` à `/` et `/depenses`, sans quoi le tableau de bord afficherait un résumé périmé après une saisie |
| `DESIGN.md` | réécrit dans la même PR pour décrire le système livré |

Aucune icône de bibliothèque : les icônes de type et de navigation restent des `<path>`
inline, dans le style de celles de `NavPrincipale`.

## Les tests

Ce qui doit bouger, et pourquoi ce n'est pas assouplir :

- **`test/theme.test.ts`** — « ne charge qu'une seule famille » devient « charge
  exactement deux familles » : `--font-sans` sur Manrope, `--font-display` sur Bricolage,
  aucune troisième. Le test reste un verrou, sur la nouvelle règle. Le reste du fichier
  (palette en dur, `bg-white`, `.dark`, valeurs shadcn) ne change pas.
- **`test/cibles-tactiles.test.ts`** — `choix` entre dans `PRIMITIVES`.
- **`e2e/parcours.spec.ts`** — les parcours de saisie ouvrent la feuille au lieu d'aller
  sur `/depenses`. **Un** parcours la déclenche en touchant le « + », pour prouver le
  point d'entrée réel ; les autres l'ouvrent par `goto('/?saisie=1')`. Les
  `selectOption` deviennent des `getByRole('radio')`. Les deux parcours de règlement
  passent par `?saisie=regler` (le second sur `/depenses?mois=2026-08&saisie=regler`,
  pour garder ce qu'il prouve). Le test de la barre basse compte trois cases, et la
  déconnexion part de l'en-tête. **Les valeurs attendues ne bougent pas** : 114 580
  centimes, 25,00 € / 25,00 €, parts identiques avant et après une version.
- **`e2e/cibles-tactiles.spec.ts`** — le test du formulaire devient celui de la feuille
  dépliée ; un test couvre `/tableau-de-bord`.
- **`e2e/debordement.spec.ts`** — les tests du formulaire et de l'aperçu visent la
  feuille. `/tableau-de-bord` entre dans la boucle des routes sans qu'on l'y inscrive :
  elle est lue sur le disque.
- **`test/architecture.test.ts`** — rien à changer : il trouvera la nouvelle page et la
  nouvelle Server Action, et exigera `exigerSession()` dans les deux.

## Risques

- **La hauteur du clavier.** Le critère « sans défiler » repose sur l'hypothèse décrite
  plus haut. S'il ne tient pas sur le téléphone réel, la correction est de rapprocher le
  pied de feuille du haut, pas d'ajouter du JavaScript qui suit le clavier.
- **Les chiffres tabulaires de Manrope.** À vérifier au premier rendu : si
  `font-variant-numeric: tabular-nums` n'a pas d'effet sur la fonte servie par
  `next/font`, les colonnes de montants ne s'aligneront plus, et c'est le choix de
  Manrope qui est à revoir.
- **Le grand écran n'est pas dessiné.** Les tokens et les composants s'y appliquent ;
  la composition, elle, n'a été validée qu'à 360 px.

## Hors périmètre

Le mode sombre. Les animations d'ouverture de la feuille au-delà du comportement natif
du `<dialog>`. Une refonte de la structure de `/config` et de `/login`.
