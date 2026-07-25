# Navigation au pouce et sortie de session — design

**Issue :** [#13](https://github.com/tjarrier/HomeBudget/issues/13) — B6, Layout.
**Fichiers visés :** `apps/web/app/(app)/layout.tsx`, `apps/web/app/layout.tsx`,
`apps/web/components/`, `apps/web/app/globals.css`, `apps/web/e2e/parcours.spec.ts`.

## Ce qui ne va pas aujourd'hui

L'issue affirme que `signOut` n'est importé nulle part. C'est **faux depuis le
commit 799b953** : `components/pied-profil.tsx` l'importe et l'appelle. Le constat
reste vrai en pratique, pour une autre raison — dans `PiedProfil`, le nom et le
bouton « Quitter » sont enveloppés dans un `<div className="max-md:sr-only">`.
Sous 768 px il ne reste que la pastille d'avatar : **la déconnexion existe, elle
est simplement invisible et intappable sur téléphone.**

Second défaut, celui du titre : la navigation bascule sous 768 px en bandeau
horizontal *en tête* d'écran. C'est le point le plus loin du pouce sur un
téléphone tenu à une main.

Aucun test ne couvre l'un ni l'autre. `theme.test.ts` ne regarde que les couleurs,
et les parcours Playwright tournent au viewport par défaut de Chromium (1280 ×
720), où le rail latéral est affiché et où les deux défauts n'existent pas.

## La coque

Aujourd'hui un seul `<aside>` bascule du rail vertical au bandeau horizontal par
CSS seule — un même balisage, deux orientations. Cette astuce meurt ici : sur
mobile la marque va **en haut** et la navigation **en bas**, deux régions
distinctes de l'écran, plus une seule qui pivote.

```
app/(app)/layout.tsx
  <Marque />                    md:hidden      — entête, marque seule
  <aside>                       max-md:fixed inset-x-0 bottom-0 flex-row
      <Marque />                max-md:hidden
      <NavPrincipale />                        — les 3 écrans
      <MenuCompte />                           — 4ᵉ cellule ; pied de rail sur desktop
  </aside>
  <main>
```

`Marque` est rendue **deux fois**, jamais deux fois à l'écran : c'est du balisage
statique d'une dizaine de lignes, et le coût d'un composant dupliqué en DOM est
nul quand il ne porte aucun comportement.

`NavPrincipale` et `MenuCompte` restent en **un seul exemplaire**. Un second
`<nav>` en DOM, ce serait deux jeux de liens à maintenir et deux points de vérité
pour `aria-current` — le genre de dédoublement qui diverge silencieusement.

## Les composants

### `NavPrincipale` (ex-`NavLaterale`)

Le nom devient faux : sur téléphone elle est *en bas*, pas sur le côté.
`aria-label="Navigation principale"` était déjà dans le fichier ; le nom du
composant le rejoint.

Chaque entrée gagne un `libelleCourt` — `Accueil`, `Dépenses`, `Config` — **visible
sous l'icône** dans la barre basse. Le `max-md:sr-only` actuel disparaît : une
barre de trois icônes muettes est une devinette, et la place existe (4 cellules de
90 px à 360 px, la largeur plancher testée du projet).

L'état actif reste porté par le fond **et** par `aria-current`, comme aujourd'hui.

### `MenuCompte` (remplace `PiedProfil`)

Un seul `<button>` et un seul `<dialog>`, deux habillages par classes responsives :

| | déclencheur | feuille |
|---|---|---|
| mobile | 4ᵉ cellule de la barre : avatar + « Compte » | feuille ancrée au bord bas |
| desktop | pied de rail : avatar + nom + chevron | boîte centrée |

Le `<dialog>` est **natif**, ouvert par `showModal()` — pas le popup de Base UI.
L'argument est celui déjà écrit dans `DESIGN.md` pour le `<select>` natif : il
apporte gratuitement le piège de focus, `Escape`, l'inertisation de
l'arrière-plan et `::backdrop`. Contenu : avatar + nom, un `Button` pleine largeur
« Se déconnecter », un « Annuler ».

Le corps de la déconnexion reprend le raisonnement de `PiedProfil` en le rendant
déterministe : `await signOut()`, puis `router.replace('/login')` **et**
`router.refresh()`. La prémisse n'a pas changé — la session vit dans un cookie lu
côté serveur, rester sur place afficherait un écran encore rendu avec l'ancienne.
Mais le `router.refresh()` seul faisait reposer la sortie sur le fait que Next
suive la redirection émise par le middleware pendant une requête RSC : vrai en
théorie, jamais testé ici. `replace` nomme la destination et empêche le bouton
retour de ramener sur la coque authentifiée ; `refresh` purge derrière lui le
Router Cache, qui garde encore la charge RSC rendue avec la session d'avant.

Effet de bord assumé, et souhaitable : sur desktop, le « Quitter » souligné à
11 px (cible d'environ 15 px de haut, très sous le plancher de 44 px que
`DESIGN.md` revendique) devient une vraie cible.

### `Marque`

Extraction pure du bloc logo + « HomeBudget / Thomas & Liz » déjà présent dans le
layout. Aucun comportement, aucune prop.

## La physique tactile

- **Barre fixe** : `fixed inset-x-0 bottom-0 z-40`, `bg-surface`,
  `border-t border-subtle` — le filet passe du bas de l'élément à son haut.
- **`padding-bottom: env(safe-area-inset-bottom)`** sur la barre, sinon elle passe
  sous l'indicateur d'accueil des iPhone récents.
- **`viewport-fit=cover`** dans `app/layout.tsx` (`export const viewport`). Sans
  lui, `env(safe-area-inset-bottom)` vaut `0` sur iOS et le point précédent ne sert
  à rien. On y redéclare `width` et `initialScale` explicitement : exporter l'objet
  remplace les valeurs par défaut de Next plutôt que de s'y ajouter.
- **Cellules d'au moins 44 px de haut** — le plancher que `DESIGN.md` fixe déjà à
  la source sur `Button`, tenu ici aussi. Barre d'environ 56 px.
- **`main` réserve la place** :
  `max-md:pb-[calc(5rem+env(safe-area-inset-bottom))]`. Sans ça, la dernière ligne
  de dépense se cache sous la barre. Un seul nombre magique, commenté sur place.
- **Nouveau token `--overlay`** pour le `::backdrop` (`backdrop:bg-overlay`), dans
  l'échelle slate. Le markup n'écrit jamais une couleur : un backdrop noir en dur
  serait la première entorse à la règle 4 de `DESIGN.md`, et `theme.test.ts`
  l'attraperait.
- L'`<aside>` reste **avant** `<main>` dans le DOM alors qu'il s'affiche en bas.
  L'ordre de lecture au lecteur d'écran (marque → navigation → contenu) prime sur
  la coïncidence avec l'ordre visuel.

## Les verrous

Deux tests Playwright, dans un `describe` imbriqué au `describe('parcours
authentifies')` existant, en viewport **390 × 844** (`test.use({ viewport })`) :

1. **« on peut se déconnecter depuis un téléphone »** — tap « Compte », tap
   « Se déconnecter », l'URL devient `/login`. C'est littéralement le critère de fin
   de l'issue. Sans danger pour le harnais : `ouvrirSession()` insère un **token
   neuf** à chaque `beforeEach`, donc détruire la session courante n'affecte pas les
   tests suivants.
2. **« la navigation est dans la moitié basse de l'écran »** —
   `boundingBox().y > 422` sur la barre. Ça teste « au pouce » comme un fait
   mesurable, pas comme une intention laissée dans un commentaire.

Pas de nouveau test unitaire. `theme.test.ts` couvre déjà `--overlay` par sa règle
« aucune classe de palette en dur », et un test statique qui vérifierait que
`signOut` est importé quelque part serait une paraphrase du test n° 1 — en plus
faible, puisqu'il passerait encore si le bouton était invisible, ce qui est
exactement le bug d'aujourd'hui.

## Documentation

`DESIGN.md` est la source de vérité du système visuel et décrit ce que le code
fait *aujourd'hui* : il change avec le code, dans le même commit.

- `NavLaterale` → `NavPrincipale`, avec la mention des libellés courts.
- `PiedProfil` → `MenuCompte`, avec l'argument du `<dialog>` natif.
- `Marque`, nouvelle entrée.
- La ligne `--overlay` dans la table des tokens.
- La coque mobile dans « Accessibilité — les planchers tenus à la source ».

## Hors périmètre

Le geste de balayage pour fermer la feuille (`Escape`, le bouton « Annuler » et le
backdrop suffisent). Toute animation — `tw-animate-css` reste non importé. Le
passage aux icônes `lucide-react` : les icônes de nav restent des `<path>` inline,
comme le reste du projet. Une page `/compte` : il n'y a rien à y mettre.
