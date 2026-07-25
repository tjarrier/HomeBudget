# Navigation au pouce et sortie de session — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche.
> Les étapes sont des cases à cocher (`- [ ]`).

**Spec :** `docs/superpowers/specs/2026-07-25-navigation-au-pouce-design.md`
**Issue :** [#13](https://github.com/tjarrier/HomeBudget/issues/13)

**But :** rendre la navigation atteignable au pouce sur téléphone et la déconnexion
réellement accessible, dans `apps/web/app/(app)/layout.tsx` et ses composants.

**Approche :** la coque de l'application cesse d'être un unique `<aside>` qui pivote par
CSS. Sous 768 px, la marque monte dans un `<header>` et la navigation descend dans une
barre `fixed bottom-0` à quatre cellules, dont une ouvre un `<dialog>` natif portant la
déconnexion. Au-dessus de 768 px, rien ne change à l'œil : le rail latéral reste tel
quel, la déconnexion gagne seulement une cible tactile digne de ce nom.

**Pile :** Next.js 15 (App Router), React 19, Tailwind CSS v4, Base UI (`Button` seul),
Playwright, Vitest, Biome.

## Contraintes globales

Elles s'appliquent à **toutes** les tâches, sans rappel.

- **Aucune classe de palette Tailwind en dur** dans `apps/web/app/` et
  `apps/web/components/` — ni `bg-slate-900`, ni `bg-white`, ni `text-red-700`. Le markup
  n'écrit que des tokens sémantiques (`bg-surface`, `text-faint`, `border-subtle`).
  `apps/web/test/theme.test.ts` échoue sinon. Toute couleur nouvelle passe d'abord par un
  token dans `apps/web/app/globals.css`.
- **Une seule famille de caractères** (Inter). Aucun `--font-heading`.
- **Pas de mode sombre** : aucun bloc `.dark`, aucune variante `dark:`.
- **44 px de hauteur minimale** pour toute cible tactile.
- **Les commentaires de code du projet sont en français sans accents** (contrainte
  existante du dépôt, visible dans tout `apps/web/`). Les chaînes affichées à
  l'utilisateur, elles, sont accentuées normalement (« Dépenses », « Se déconnecter »).
- **`apps/web` est UI seulement** : aucun import de `drizzle-orm`, `pg`, ou du client
  `db`. Aucune tâche ici n'a de raison d'y toucher.
- **Formatage Biome** : guillemets simples, pas de point-virgule, largeur 100.
- Ne jamais lancer `drizzle-kit push`. Aucune tâche ici ne touche à la base.

## Prérequis d'environnement (à faire une fois, avant la tâche 1)

Ce dépôt est un **worktree** : les fichiers `.env` ne sont pas suivis par git et n'y ont
pas été copiés. Les tests Playwright en ont besoin (`BETTER_AUTH_SECRET` pour signer le
cookie de session, `DATABASE_URL` pour insérer l'utilisateur de test).

- [ ] **Copier les `.env` depuis le checkout principal**

```bash
cd /home/thomas_jarrier/Workspace/Personal/HomeBudget/.claude/worktrees/issue-13-navigation-au-pouce
cp /home/thomas_jarrier/Workspace/Personal/HomeBudget/.env .env
cp /home/thomas_jarrier/Workspace/Personal/HomeBudget/apps/web/.env.local apps/web/.env.local
```

- [ ] **Vérifier que Postgres répond**

```bash
docker compose exec -T postgres pg_isready -U homebudget
```

Attendu : `accepting connections`. Sinon : `task db:up`. Si le conteneur `homebudget-db`
existe mais provient d'un autre worktree, `docker rm -f homebudget-db` puis `task db:up`.

## Carte des fichiers

| Fichier | Sort | Responsabilité |
|---|---|---|
| `apps/web/components/marque.tsx` | créé | le monogramme + « HomeBudget / Thomas & Liz ». Aucun comportement. |
| `apps/web/components/nav-principale.tsx` | créé | les 3 liens d'écran, `aria-current`, deux habillages. Remplace `nav-laterale.tsx`. |
| `apps/web/components/menu-compte.tsx` | créé | le déclencheur + le `<dialog>` de déconnexion. Remplace `pied-profil.tsx`. |
| `apps/web/components/nav-laterale.tsx` | supprimé | |
| `apps/web/components/pied-profil.tsx` | supprimé | |
| `apps/web/app/(app)/layout.tsx` | modifié | assemble la coque : entête mobile, rail/barre, colonne de contenu. |
| `apps/web/app/layout.tsx` | modifié | `export const viewport` avec `viewport-fit=cover`. |
| `apps/web/app/globals.css` | modifié | le token `--overlay` pour `::backdrop`. |
| `apps/web/e2e/parcours.spec.ts` | modifié | les deux verrous en viewport 390 × 844. |
| `DESIGN.md` | modifié | renommages, `Marque`, `--overlay`, coque mobile. |

L'ordre des tâches est celui du rouge vers le vert : la tâche 1 pose les deux tests qui
échouent, les tâches 2 à 5 les font passer, la tâche 6 documente et referme.

**La branche est rouge en e2e entre la tâche 1 et la tâche 5.** C'est voulu, et c'est la
raison de ne pas pousser avant la fin.

---

### Tâche 1 : Les deux verrous Playwright (rouges)

**Fichiers :**
- Modifier : `apps/web/e2e/parcours.spec.ts` (à la fin du `describe('parcours authentifies')`)

**Interfaces :**
- Consomme : `ouvrirSession(personne)` de `./session`, déjà appelée par le `beforeEach`
  du `describe` parent — le `describe` imbriqué en hérite, rien à réécrire.
- Produit : deux noms accessibles que les tâches suivantes doivent honorer —
  un `<nav aria-label="Navigation principale">` et un `<button>` dont le nom accessible
  vaut exactement `Compte` sous 768 px, puis un `<button>` nommé `Se déconnecter`.

- [ ] **Étape 1 : Écrire les deux tests**

Les ajouter **à la fin** du `describe('parcours authentifies')`, après le dernier test
existant, juste avant l'accolade fermante du `describe`. En dernier parce que le second
test détruit la session courante : la placer avant ferait dépendre les tests suivants de
l'ordre de réexécution, alors même que `ouvrirSession()` les protège déjà.

```ts
  // Le viewport par defaut de Chromium (1280x720) affiche le rail lateral : les
  // deux defauts de l'issue #13 n'y existent tout simplement pas. On descend a
  // la taille d'un telephone courant pour les rendre observables.
  test.describe('sur un telephone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('la navigation est dans la moitie basse de l ecran', async ({ page }) => {
      await page.goto('/')
      const barre = page.getByRole('navigation', { name: 'Navigation principale' })
      await expect(barre).toBeVisible()
      const boite = await barre.boundingBox()
      // « Au pouce » se mesure. 422 = la moitie des 844px de haut du viewport :
      // au-dessus, la barre est hors d'atteinte d'une main qui tient l'appareil.
      expect(boite?.y ?? 0).toBeGreaterThan(422)
    })

    test('on peut se deconnecter depuis un telephone', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'Compte' }).click()
      await page.getByRole('button', { name: 'Se déconnecter' }).click()
      await expect(page).toHaveURL(/\/login/)
    })
  })
```

- [ ] **Étape 2 : Construire l'application, puis lancer les deux tests**

```bash
task build
pnpm --filter @homebudget/web exec playwright test -g "telephone"
```

Attendu : **2 failed**.
- « la navigation est dans la moitie basse » échoue sur `expect(received).toBeGreaterThan(422)`
  avec une valeur autour de 60 — le bandeau est en tête d'écran.
- « on peut se deconnecter » échoue sur un timeout de `getByRole('button', { name: 'Compte' })` :
  ce bouton n'existe pas encore.

Si Playwright meurt sur « Executable doesn't exist », lancer d'abord
`pnpm --filter @homebudget/web exec playwright install chromium`.

- [ ] **Étape 3 : Committer les tests rouges**

```bash
git add apps/web/e2e/parcours.spec.ts
git commit -m "test(web): verrouille la nav au pouce et la sortie de session (rouge)"
```

---

### Tâche 2 : Le composant `Marque`

Extraction pure du bloc d'identité déjà présent dans le layout, pour pouvoir le rendre à
deux endroits différents de la coque mobile.

**Fichiers :**
- Créer : `apps/web/components/marque.tsx`
- Modifier : `apps/web/app/(app)/layout.tsx:21-32` (le bloc remplacé par `<Marque />`)

**Interfaces :**
- Produit : `export function Marque(): JSX.Element` — aucune prop, aucun style de
  position. Le positionnement (marges, `md:hidden`) appartient à l'appelant.

- [ ] **Étape 1 : Créer le composant**

Le contenu est copié à l'identique de `layout.tsx`, à une exception près : le
`max-md:sr-only` sur « Thomas & Liz » disparaît. Il existait parce que le bandeau
horizontal n'avait pas la place ; l'entête mobile l'a.

```tsx
/**
 * Le bloc d'identite du produit : le monogramme et le nom.
 *
 * Il est rendu DEUX FOIS dans la coque — dans l'entete sous 768px, en tete du
 * rail au-dessus —, jamais deux fois a l'ecran : chaque exemplaire porte la
 * bascule qui masque l'autre. Le dupliquer coute moins qu'un exemplaire unique
 * qu'il faudrait deplacer par CSS entre deux regions distinctes de l'ecran.
 * C'est du balisage statique : il ne porte aucun comportement, donc rien a
 * desynchroniser.
 */
export function Marque() {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-emphasis text-[0.8125rem] font-semibold tracking-[-0.02em] text-on-emphasis"
      >
        HB
      </span>
      <div>
        <div className="text-base font-semibold tracking-[-0.01em]">HomeBudget</div>
        <div className="text-[0.6875rem] text-faint">Thomas &amp; Liz</div>
      </div>
    </div>
  )
}
```

- [ ] **Étape 2 : L'utiliser dans le layout**

Dans `apps/web/app/(app)/layout.tsx`, remplacer le `<div className="flex items-center gap-2.5 md:px-2 md:pt-1 md:pb-5">…</div>`
(lignes 21 à 32) par :

```tsx
        <div className="md:px-2 md:pt-1 md:pb-5">
          <Marque />
        </div>
```

Et ajouter l'import en tête, dans l'ordre alphabétique des chemins :

```tsx
import { Marque } from '@/components/marque'
```

- [ ] **Étape 3 : Vérifier**

```bash
task verif
```

Attendu : lint, typecheck et les tests unitaires passent. `theme.test.ts` en particulier
doit rester vert — `marque.tsx` n'écrit que des tokens.

- [ ] **Étape 4 : Committer**

```bash
git add apps/web/components/marque.tsx "apps/web/app/(app)/layout.tsx"
git commit -m "refactor(web): extraire Marque du layout"
```

---

### Tâche 3 : `NavPrincipale` remplace `NavLaterale`

**Fichiers :**
- Créer : `apps/web/components/nav-principale.tsx`
- Supprimer : `apps/web/components/nav-laterale.tsx`
- Modifier : `apps/web/app/(app)/layout.tsx` (import et usage)

**Interfaces :**
- Produit : `export function NavPrincipale(): JSX.Element` — aucune prop. Rend un
  `<nav aria-label="Navigation principale">`, ce que le test de la tâche 1 cible.
  Sous 768 px, il porte `flex-1` : il occupe les trois quarts de la barre, la cellule
  « Compte » de la tâche 4 prend le quart restant.

- [ ] **Étape 1 : Créer `nav-principale.tsx`**

Les trois icônes SVG sont recopiées **à l'identique** de `nav-laterale.tsx` — ce sont des
`<path>` inline, le projet n'utilise pas `lucide-react`.

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// `libelleCourt` n'est pas une abreviation de confort : c'est ce qui rend la
// barre basse lisible. Une barre de trois icones muettes est une devinette, et
// « Tableau de bord » ne tient pas dans une cellule de 90px (la largeur plancher
// du projet, 360px, divisee par les quatre cellules).
const LIENS: { href: string; libelle: string; libelleCourt: string; icone: ReactNode }[] = [
  {
    href: '/',
    libelle: 'Tableau de bord',
    libelleCourt: 'Accueil',
    icone: (
      <>
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </>
    ),
  },
  {
    href: '/depenses',
    libelle: 'Dépenses',
    libelleCourt: 'Dépenses',
    icone: (
      <>
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </>
    ),
  },
  {
    href: '/config',
    libelle: 'Configuration',
    libelleCourt: 'Config',
    icone: (
      <>
        <line x1="21" x2="14" y1="4" y2="4" />
        <line x1="10" x2="3" y1="4" y2="4" />
        <line x1="21" x2="12" y1="12" y2="12" />
        <line x1="8" x2="3" y1="12" y2="12" />
        <line x1="21" x2="16" y1="20" y2="20" />
        <line x1="12" x2="3" y1="20" y2="20" />
        <line x1="14" x2="14" y1="2" y2="6" />
        <line x1="8" x2="8" y1="10" y2="14" />
        <line x1="16" x2="16" y1="18" y2="22" />
      </>
    ),
  },
]

/**
 * La navigation principale : barre basse sous 768px, rail lateral au-dessus.
 *
 * Cliente pour une seule raison : `usePathname()`, qui designe le lien actif.
 * L'etat actif est porte par le fond ET par `aria-current`, jamais par le
 * contraste seul.
 *
 * Les deux libelles sont masques par `hidden` / `md:hidden` et non par
 * `sr-only` : `sr-only` les laisserait TOUS LES DEUX dans l'arbre
 * d'accessibilite, et le nom du lien deviendrait « Tableau de bord Accueil ».
 * Ici, un seul est rendu a la fois, et il correspond toujours au texte visible.
 */
export function NavPrincipale() {
  const chemin = usePathname()

  return (
    <nav
      aria-label="Navigation principale"
      className="flex max-md:flex-1 max-md:items-stretch md:mt-1 md:flex-col md:gap-0.5"
    >
      {LIENS.map(({ href, libelle, libelleCourt, icone }) => {
        const actif = chemin === href
        return (
          <Link
            key={href}
            href={href}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'flex items-center rounded-lg transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
              // Barre basse : une cellule par lien, icone au-dessus du libelle,
              // 44px de haut au minimum — le plancher tactile du projet.
              'max-md:min-h-11 max-md:flex-1 max-md:flex-col max-md:justify-center max-md:gap-0.5 max-md:py-1.5',
              // Rail : une rangee icone + libelle.
              'md:gap-3 md:px-2.5 md:py-2 md:text-sm md:font-medium md:whitespace-nowrap',
              actif ? 'bg-muted text-strong' : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-[18px] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {icone}
            </svg>
            <span className="hidden md:inline">{libelle}</span>
            <span className="text-[0.625rem] font-medium md:hidden">{libelleCourt}</span>
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Étape 2 : Supprimer l'ancien composant et basculer le layout**

```bash
git rm apps/web/components/nav-laterale.tsx
```

Dans `apps/web/app/(app)/layout.tsx` : remplacer l'import
`import { NavLaterale } from '@/components/nav-laterale'` par
`import { NavPrincipale } from '@/components/nav-principale'`, et l'usage
`<NavLaterale />` par `<NavPrincipale />`.

- [ ] **Étape 3 : Vérifier**

```bash
task verif
```

Attendu : vert. Si le typecheck signale `nav-laterale` introuvable, c'est qu'une
référence subsiste — la trouver avec `grep -rn "NavLaterale\|nav-laterale" apps/web --exclude-dir=node_modules`.

- [ ] **Étape 4 : Committer**

```bash
git add -A apps/web/components "apps/web/app/(app)/layout.tsx"
git commit -m "refactor(web): NavPrincipale remplace NavLaterale, avec libelles courts"
```

---

### Tâche 4 : `MenuCompte` remplace `PiedProfil`

Le cœur de l'issue : un seul chemin de déconnexion, visible aux deux tailles.

**Fichiers :**
- Modifier : `apps/web/app/globals.css` (le token `--overlay`)
- Créer : `apps/web/components/menu-compte.tsx`
- Supprimer : `apps/web/components/pied-profil.tsx`
- Modifier : `apps/web/app/(app)/layout.tsx` (import et usage)

**Interfaces :**
- Consomme : `Avatar` de `@/components/avatar` (props `personne`, `sombre`, `decoratif`),
  `Button` de `@/components/ui/button` (prop `variant: 'primaire' | 'discret'`, `min-h-11`
  déjà réglé), `signOut` de `@/lib/auth-client`, `Personne` de `@homebudget/domain`.
- Produit : `export function MenuCompte({ personne, nom }: { personne: Personne; nom: string })`.
  Rend un `<button>` dont le nom accessible vaut `Compte` sous 768 px et le nom de la
  personne au-dessus, plus un `<dialog>` contenant un `<button>` nommé `Se déconnecter`.
  Sous 768 px le déclencheur occupe `w-1/4` de la barre.

- [ ] **Étape 1 : Ajouter le token `--overlay`**

Le `::backdrop` a besoin d'une couleur, et le markup n'a pas le droit d'en écrire une.
Dans `apps/web/app/globals.css`, à l'intérieur du bloc `@theme inline`, à la suite des
autres `--color-*` (juste après `--color-positive-surface`) :

```css
  --color-overlay: var(--overlay);
```

Puis dans le bloc `:root`, à la suite de `--muted` :

```css
  /* Le voile du <dialog> de deconnexion. L'encre du systeme a 45% : il n'y a
     pas de noir dans le produit, pas meme derriere une feuille modale. */
  --overlay: color-mix(in oklab, var(--slate-900) 45%, transparent);
```

- [ ] **Étape 2 : Créer `menu-compte.tsx`**

```tsx
'use client'

import type { Personne } from '@homebudget/domain'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'

import { Avatar } from '@/components/avatar'
import { Button } from '@/components/ui/button'
import { signOut } from '@/lib/auth-client'

/**
 * Qui est connecte, et par ou sortir.
 *
 * UN declencheur et UNE feuille, deux habillages : quatrieme cellule de la barre
 * basse sous 768px, pied de rail au-dessus. Le dedoubler dedoublerait le chemin
 * de deconnexion — et c'est exactement ce qui avait echoue : le pied de rail
 * portait bien un bouton « Quitter », mais dans un conteneur `max-md:sr-only`.
 * Il existait, personne ne pouvait le toucher.
 *
 * <dialog> NATIF, ouvert par showModal() : il apporte gratuitement le piege de
 * focus, la fermeture par Escape, l'inertisation de l'arriere-plan et
 * ::backdrop. Meme raisonnement que le <select> natif de components/ui/select.tsx.
 */
export function MenuCompte({ personne, nom }: { personne: Personne; nom: string }) {
  const feuille = useRef<HTMLDialogElement>(null)
  const router = useRouter()

  async function seDeconnecter() {
    feuille.current?.close()
    await signOut()
    // La session vit dans un cookie lu cote serveur : rester sur place
    // afficherait un ecran encore rendu avec l'ancienne. `replace` plutot que
    // `push` pour que le bouton retour ne ramene pas sur la coque authentifiee,
    // et `refresh` ensuite pour purger le Router Cache, qui garde encore la
    // charge RSC rendue avec la session d'avant.
    router.replace('/login')
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => feuille.current?.showModal()}
        className={[
          'flex items-center rounded-lg transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:outline-none',
          // Barre basse : la quatrieme cellule, au meme gabarit que les trois liens.
          'max-md:min-h-11 max-md:w-1/4 max-md:flex-col max-md:justify-center max-md:gap-0.5 max-md:py-1.5',
          // Rail : l'encart de pied, pousse en bas par mt-auto.
          'md:mt-auto md:w-full md:gap-2.5 md:border md:border-subtle md:p-2.5 md:text-left',
          'text-muted-foreground hover:bg-muted/60',
        ].join(' ')}
      >
        <Avatar personne={personne} sombre decoratif />
        <span className="hidden min-w-0 flex-1 truncate text-sm font-medium text-strong md:inline">
          {nom}
        </span>
        <span className="text-[0.625rem] font-medium md:hidden">Compte</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="hidden size-4 shrink-0 md:block"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>

      <dialog
        ref={feuille}
        aria-label="Compte"
        // Le <dialog> se ferme deja au clavier par Escape ; ce handler n'ajoute
        // que le clic sur le voile. Un clic sur le ::backdrop rapporte le
        // <dialog> lui-meme comme cible — d'ou la comparaison, qui laisse passer
        // tous les clics sur le contenu.
        onClick={(evenement) => {
          if (evenement.target === feuille.current) feuille.current?.close()
        }}
        className={[
          'w-full border-0 bg-surface p-0 text-body shadow-sm backdrop:bg-overlay',
          // Sous 768px : une feuille ancree au bord bas, pleine largeur.
          'max-md:mt-auto max-md:mb-0 max-md:max-w-none max-md:rounded-t-xl',
          // Au-dessus : une boite centree.
          'md:m-auto md:max-w-sm md:rounded-xl',
        ].join(' ')}
      >
        <div className="flex flex-col gap-4 p-5 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2.5">
            <Avatar personne={personne} sombre decoratif />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-strong">{nom}</div>
              <div className="text-[0.6875rem] text-faint">Connecté</div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={seDeconnecter}>Se déconnecter</Button>
            <Button variant="discret" onClick={() => feuille.current?.close()}>
              Annuler
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}
```

- [ ] **Étape 3 : Supprimer l'ancien composant et basculer le layout**

```bash
git rm apps/web/components/pied-profil.tsx
```

Dans `apps/web/app/(app)/layout.tsx` : remplacer l'import
`import { PiedProfil } from '@/components/pied-profil'` par
`import { MenuCompte } from '@/components/menu-compte'`, et
`<PiedProfil personne={session.personne} nom={session.nom} />` par
`<MenuCompte personne={session.personne} nom={session.nom} />`.

- [ ] **Étape 4 : Vérifier, et traiter le cas Biome**

```bash
task verif
```

Attendu : vert. **Si** Biome signale `a11y/useKeyWithClickEvents` (ou
`a11y/noStaticElementInteractions`) sur le `onClick` du `<dialog>`, ajouter la
suppression ciblée juste au-dessus de l'attribut, et rien de plus large :

```tsx
        // biome-ignore lint/a11y/useKeyWithClickEvents: le <dialog> natif ferme deja au clavier par Escape ; ce handler n'ajoute que le clic sur le voile.
        onClick={(evenement) => {
```

Ne pas désactiver la règle dans `biome.json` : la suppression reste locale et lisible.

- [ ] **Étape 5 : Committer**

```bash
git add -A apps/web/components apps/web/app "apps/web/app/(app)/layout.tsx"
git commit -m "feat(web): MenuCompte, une seule sortie de session visible aux deux tailles"
```

---

### Tâche 5 : La coque mobile — le rouge passe au vert

**Fichiers :**
- Modifier : `apps/web/app/layout.tsx` (le `viewport`)
- Modifier : `apps/web/app/(app)/layout.tsx` (l'assemblage complet)

**Interfaces :**
- Consomme : `Marque` (tâche 2), `NavPrincipale` (tâche 3), `MenuCompte` (tâche 4),
  `exigerSession()` de `@/lib/session` — qui renvoie `{ userId, personne, nom }` et
  **doit rester la première ligne du composant**.

- [ ] **Étape 1 : Déclarer `viewport-fit=cover`**

Dans `apps/web/app/layout.tsx`, remplacer la ligne
`export const metadata: Metadata = { title: 'HomeBudget' }` par :

```tsx
export const metadata: Metadata = { title: 'HomeBudget' }

// `viewport-fit=cover` etend le document sous l'indicateur d'accueil des
// iPhone. Sans lui, env(safe-area-inset-bottom) vaut 0 et la barre de
// navigation basse passerait dessous. Exporter cet objet REMPLACE les valeurs
// par defaut de Next : width et initialScale sont redeclares ici, sans quoi la
// page se rendrait a la largeur de bureau sur telephone.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}
```

Et étendre l'import de types en tête de fichier :

```tsx
import type { Metadata, Viewport } from 'next'
```

- [ ] **Étape 2 : Réécrire la coque**

Remplacer intégralement le corps de `apps/web/app/(app)/layout.tsx` :

```tsx
import type { ReactNode } from 'react'

import { Marque } from '@/components/marque'
import { MenuCompte } from '@/components/menu-compte'
import { NavPrincipale } from '@/components/nav-principale'
import { exigerSession } from '@/lib/session'

/**
 * La coque de l'application.
 *
 * Au-dessus de 768px : un rail lateral fixe de 248px et une colonne de contenu
 * centree a 1080px.
 *
 * En dessous : la marque monte dans un entete, la navigation descend dans une
 * barre `fixed bottom-0` a quatre cellules — atteignable au pouce d'une main qui
 * tient l'appareil. Ce sont deux REGIONS distinctes de l'ecran, ce qu'un unique
 * <aside> pivotant par CSS ne savait plus couvrir : d'ou <Marque /> rendue deux
 * fois, chacune masquee a la taille de l'autre.
 *
 * L'<aside> reste AVANT <main> dans le DOM alors qu'il s'affiche en bas :
 * l'ordre de lecture au lecteur d'ecran (marque, navigation, contenu) prime sur
 * la coincidence avec l'ordre visuel.
 */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const session = await exigerSession()

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <header className="flex items-center border-b border-subtle bg-surface px-5 py-3 md:hidden">
        <Marque />
      </header>

      <aside className="flex shrink-0 border-subtle bg-surface max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:items-stretch max-md:border-t max-md:px-2 max-md:pb-[env(safe-area-inset-bottom)] md:sticky md:top-0 md:h-screen md:w-62 md:flex-col md:border-r md:p-4">
        <div className="max-md:hidden md:px-2 md:pt-1 md:pb-5">
          <Marque />
        </div>

        <NavPrincipale />
        <MenuCompte personne={session.personne} nom={session.nom} />
      </aside>

      <div className="min-w-0 flex-1">
        {/* 5rem = la barre basse (~56px) plus une respiration : sans cette
            reserve, la derniere ligne de depense se cache dessous. `env()` y
            ajoute l'indicateur d'accueil des iPhone — nul partout ailleurs. */}
        <main className="mx-auto max-w-[1080px] px-5 pt-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-10 md:pt-7 md:pb-14">
          {children}
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Étape 3 : Lancer les deux tests de la tâche 1**

```bash
task build
pnpm --filter @homebudget/web exec playwright test -g "telephone"
```

Attendu : **2 passed**.

Si « on peut se deconnecter » échoue sur l'URL restée `/` : c'est que le `router.replace`
n'a pas été suivi. Vérifier que `signOut()` est bien **attendu** (`await`) avant, sinon le
cookie est encore là au moment de la navigation.

Si « la navigation est dans la moitie basse » échoue avec un `y` de l'ordre de 100 : la
barre n'est pas sortie du flux — vérifier que `max-md:fixed` et `max-md:bottom-0` sont
bien tous deux présents sur l'`<aside>`.

- [ ] **Étape 4 : Vérifier le reste**

```bash
task verif
```

Attendu : vert.

- [ ] **Étape 5 : Committer**

```bash
git add apps/web/app
git commit -m "feat(web): la navigation descend sous le pouce sur telephone"
```

---

### Tâche 6 : `DESIGN.md`, et la porte complète

**Fichiers :**
- Modifier : `DESIGN.md`

`DESIGN.md` est la source de vérité du système visuel et décrit ce que le code fait
*aujourd'hui* : il ne peut pas rester en retard d'un commit.

- [ ] **Étape 1 : La table des tokens**

Dans la table de la section « L'échelle et ses alias », après la ligne `bg-muted`,
insérer :

```markdown
| `backdrop:bg-overlay` | `--overlay` | slate-900 à 45 % | le voile du `<dialog>` de compte. **Le seul voile du produit.** |
```

- [ ] **Étape 2 : Les composants produit**

Dans la section « Les composants produit », remplacer les deux dernières entrées
(`NavLaterale` et `PiedProfil`) par :

```markdown
- **`Marque`** — le monogramme et le nom du produit. Rendue **deux fois** dans la coque
  (entête sous 768px, tête de rail au-dessus), jamais deux fois à l'écran : c'est du
  balisage statique, il n'y a rien à désynchroniser.
- **`NavPrincipale`** — cliente pour une seule raison : `usePathname()`. L'état actif est
  porté par le fond **et** par `aria-current`. Chaque entrée a un `libelleCourt`
  (`Accueil`, `Dépenses`, `Config`) affiché sous l'icône dans la barre basse : trois
  icônes muettes seraient une devinette. Les deux libellés se masquent par `hidden` /
  `md:hidden`, jamais par `sr-only` — `sr-only` les laisserait tous les deux dans l'arbre
  d'accessibilité, et le lien s'appellerait « Tableau de bord Accueil ».
- **`MenuCompte`** — qui est connecté, et par où sortir. **Un** déclencheur et **une**
  feuille, deux habillages : quatrième cellule de la barre basse sous 768px, pied de rail
  au-dessus. Le dédoubler dédoublerait le chemin de déconnexion — c'est précisément ce qui
  avait échoué avant l'issue #13 : le bouton « Quitter » existait, dans un conteneur
  `max-md:sr-only` que personne ne pouvait toucher. La feuille est un `<dialog>` **natif**
  ouvert par `showModal()`, pour la même raison que le `<select>` est natif : piège de
  focus, `Escape`, inertisation de l'arrière-plan et `::backdrop`, sans une ligne de JS.
```

- [ ] **Étape 3 : La coque, dans la section accessibilité**

À la fin de la liste « Accessibilité — les planchers tenus à la source », ajouter :

```markdown
- **La navigation est sous le pouce.** Sous 768px, l'`<aside>` devient une barre
  `fixed bottom-0` de quatre cellules d'au moins 44px, `main` réserve la hauteur
  correspondante, et `app/layout.tsx` déclare `viewport-fit=cover` pour que
  `env(safe-area-inset-bottom)` cesse de valoir `0` sur iOS. L'`<aside>` reste **avant**
  `<main>` dans le DOM : l'ordre de lecture prime sur l'ordre visuel.
  `e2e/parcours.spec.ts` mesure les deux faits en viewport 390 × 844 — la barre est dans
  la moitié basse, et on peut s'y déconnecter.
```

- [ ] **Étape 4 : La porte complète**

```bash
task verif
task test:e2e:frais
```

`task test:e2e:frais` est **DESTRUCTIF** : il détruit la base locale, la remonte, la migre
et la seede avant de jouer les parcours. C'est nécessaire ici — les parcours existants
écrivent en base et le canari vérifie le seed.

Attendu : tout vert, **le canari compris** — `le solde de reference du seed est a l ecran`
doit continuer à trouver `1 145,80 €`. S'il tombe, ce n'est pas ce plan qu'il faut
ajuster : c'est qu'une des quatre règles du `CLAUDE.md` a été violée. Aucune tâche ici ne
touche au domaine ni à la base, donc un canari rouge signalerait une erreur de manipulation
(base non réinitialisée, `.env` pointant ailleurs), pas un défaut du code.

- [ ] **Étape 5 : Committer**

```bash
git add DESIGN.md
git commit -m "docs(web): DESIGN.md suit la coque mobile et MenuCompte"
```

- [ ] **Étape 6 : Relire la branche d'un œil neuf**

```bash
git log --oneline main..HEAD
git diff main...HEAD --stat
```

Vérifier qu'il ne reste aucune référence aux anciens noms :

```bash
grep -rn "NavLaterale\|nav-laterale\|PiedProfil\|pied-profil" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next
```

Attendu : les seules occurrences sont dans `docs/superpowers/` (la spec et ce plan, qui
racontent l'histoire au passé) et dans le message du commit de la tâche 3.

## Ce que ce plan ne fait pas

- **Aucune migration, aucun changement de schéma.** `apps/web` est UI seulement.
- **Pas d'animation.** `tw-animate-css` reste importé par `globals.css` et non utilisé,
  comme aujourd'hui.
- **Pas de bascule vers `lucide-react`.** Les icônes restent des `<path>` inline.
- **Pas de geste de balayage** pour fermer la feuille : `Escape`, « Annuler » et le clic
  sur le voile suffisent.
- **Pas de page `/compte`.** Il n'y aurait rien à y mettre.
