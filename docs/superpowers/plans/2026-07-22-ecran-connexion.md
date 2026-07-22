# B5 — Écran de connexion soigné : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire qu'une adresse Google non autorisée revienne sur l'écran de login avec un message compréhensible plutôt qu'une erreur 403 brute, et affermir la première impression de cet écran.

**Architecture:** On donne un `code` à l'`APIError` du hook d'allowlist pour que Better Auth passe par sa redirection propre (au lieu de propager un 403 brut), et on passe `errorCallbackURL: '/login'` à `signIn.social` pour que le refus atterrisse sur `/login?error=<code>`. La page de login devient un Server Component qui lit `searchParams.error`, le mappe vers une copie française via une fonction pure, et rend un encart neutre. On unifie au passage le signal de garde `?erreur=compte-incomplet` de `exigerSession()` sur le même paramètre `?error=`.

**Tech Stack:** Next.js 15 (App Router, Server Components, `searchParams` en Promise), Better Auth 1.6.23, Vitest, Playwright, Tailwind (tokens sémantiques uniquement).

## Global Constraints

- **Tokens sémantiques uniquement.** Aucune classe de palette Tailwind en dur (`bg-slate-*`, `text-red-*`, `bg-white`…) dans `app/` et `components/` — `theme.test.ts` échoue sinon. On n'écrit que des alias : `bg-surface`, `bg-muted`, `border-subtle`, `text-body`, `text-faint`, `bg-emphasis`, `text-on-emphasis`.
- **Une seule fonte (Inter), mode clair uniquement.** Pas de `--font-heading`, pas de bloc `.dark`. La hiérarchie vient du poids et de l'échelle.
- **Achromatique, deux accents seulement** (emerald = réassurance, rouge = erreur de **formulaire**). L'encart de refus n'est **pas** rouge : filet + `bg-muted` + `text-body`. Le mot porte le sens.
- **Le libellé du bouton reste `Se connecter avec Google`** au caractère près (verrouillé par l'e2e `parcours.spec.ts`).
- **`/login` doit rester accessible sans session.** Il est dans le groupe `(auth)`, hors de la garde statique d'`architecture.test.ts` (qui ne vise que `(app)`), et hors du `matcher` du middleware. Ne jamais y appeler `exigerSession()`.
- **On ne fait jamais confiance à `error_description`.** Paramètre d'URL ouvert : la page ne lit que le `error` **code** et mappe vers sa propre copie. `error_description` est ignoré.
- **Valeurs de contrat figées :** code de refus = `acces_refuse` ; code de compte incomplet = `compte_incomplet`. Le paramètre d'URL est `error` (anglais, imposé par Better Auth).
- **Domaine, `packages/db`, invariants SQL, canari du solde : intacts.** On ne change que la *forme* de l'erreur d'accès (ajout d'un `code`), jamais la décision de qui passe.

---

### Task 1 : Le code de refus sur l'`APIError`

Sans `code` dans le corps de l'`APIError`, Better Auth (`callback.mjs:154`, garde `if (isAPIError(e) && e.body?.code)`) saute sa redirection propre et propage un 403 brut. Cette tâche pose le `code` et verrouille le contrat par un test.

**Files:**
- Create: `apps/web/lib/codes-connexion.ts`
- Modify: `apps/web/lib/allowlist.ts`
- Test: `apps/web/test/allowlist.test.ts`

**Interfaces:**
- Produces: `CODE_REFUS = 'acces_refuse'` et `CODE_COMPTE_INCOMPLET = 'compte_incomplet'` (exportés de `lib/codes-connexion.ts`) ; l'`APIError` levée par `avantCreationUtilisateur` pour une adresse refusée porte désormais `body.code === CODE_REFUS`.

- [ ] **Step 1 : Créer le module des codes**

Create `apps/web/lib/codes-connexion.ts` :

```ts
/**
 * Les codes d'erreur qui transitent par `/login?error=<code>`. Une seule
 * source, cote jet (allowlist, session) ET cote lecture (l'ecran). Ce sont des
 * valeurs de contrat : les changer casse le mapping de `messages.ts`.
 *
 * Le parametre d'URL s'appelle `error` (anglais) : Better Auth l'impose dans son
 * callback OAuth, on aligne le notre dessus plutot que d'en avoir deux.
 */
export const CODE_REFUS = 'acces_refuse'
export const CODE_COMPTE_INCOMPLET = 'compte_incomplet'
```

- [ ] **Step 2 : Écrire le test qui échoue (contrat du `code`)**

Dans `apps/web/test/allowlist.test.ts`, ajouter en tête l'import du code :

```ts
import { CODE_REFUS } from '../lib/codes-connexion.js'
import { APIError } from 'better-auth/api'
```

Puis, dans le `describe('avantCreationUtilisateur — le hook Better Auth', ...)`, après le test `'rejette la creation pour une troisieme adresse'`, ajouter :

```ts
  it("porte le code qui fait rediriger Better Auth au lieu d'un 403 brut", async () => {
    // Sans `code` dans le corps, le callback OAuth (`callback.mjs:154`) saute
    // sa redirection propre (`if (isAPIError(e) && e.body?.code)`) et propage
    // un 403 nu : la personne refusee voit une erreur brute, jamais l'ecran.
    // Ce test verrouille le contrat qui l'en empeche.
    await expect(
      avantCreationUtilisateur({ email: 'intrus@exemple.fr' }),
    ).rejects.toMatchObject({ body: { code: CODE_REFUS } })
    await expect(
      avantCreationUtilisateur({ email: 'intrus@exemple.fr' }),
    ).rejects.toBeInstanceOf(APIError)
  })
```

- [ ] **Step 3 : Lancer le test et le voir échouer**

Run: `pnpm --filter web test allowlist -- -t "porte le code"`
Expected: FAIL — `body.code` vaut `undefined` (le hook ne pose pas encore de `code`).

- [ ] **Step 4 : Poser le `code` dans l'`APIError`**

Dans `apps/web/lib/allowlist.ts`, ajouter l'import en tête (après les imports existants) :

```ts
import { CODE_REFUS } from './codes-connexion.js'
```

Puis, dans `avantCreationUtilisateur`, remplacer le `catch` :

```ts
  } catch {
    throw new APIError('FORBIDDEN', { message: MESSAGE_REFUS })
  }
```

par :

```ts
  } catch {
    // `code` n'est pas cosmetique : c'est lui qui fait passer Better Auth par
    // `redirectOnError` (respectant `errorCallbackURL`) au lieu de propager un
    // 403 brut. Sa valeur est le contrat lu par `messages.ts` cote ecran.
    throw new APIError('FORBIDDEN', { message: MESSAGE_REFUS, code: CODE_REFUS })
  }
```

- [ ] **Step 5 : Lancer le test et le voir passer**

Run: `pnpm --filter web test allowlist`
Expected: PASS (les 11 tests existants + le nouveau).

- [ ] **Step 6 : Commit**

```bash
git add apps/web/lib/codes-connexion.ts apps/web/lib/allowlist.ts apps/web/test/allowlist.test.ts
git commit -m "feat(web): le refus allowlist porte un code redirigeable, pas un 403 brut"
```

---

### Task 2 : Le mapping code → message français (fonction pure)

**Files:**
- Create: `apps/web/app/(auth)/login/messages.ts`
- Test: `apps/web/test/messages.test.ts`

**Interfaces:**
- Consumes: `CODE_REFUS`, `CODE_COMPTE_INCOMPLET` de `lib/codes-connexion.ts` (Task 1).
- Produces: `messageConnexion(code: string | undefined): string | null`.

- [ ] **Step 1 : Écrire le test qui échoue**

Create `apps/web/test/messages.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { messageConnexion } from '../app/(auth)/login/messages.js'
import { CODE_COMPTE_INCOMPLET, CODE_REFUS } from '../lib/codes-connexion.js'

describe('messageConnexion', () => {
  it('donne le message de refus pour une adresse non autorisee', () => {
    expect(messageConnexion(CODE_REFUS)).toMatch(/n'est pas autorisée/i)
  })

  it('donne un message pour un compte incomplet', () => {
    expect(messageConnexion(CODE_COMPTE_INCOMPLET)).toMatch(/pas tout à fait prêt/i)
  })

  it('donne un message generique pour un code inconnu', () => {
    // Google renvoie `access_denied` si l'utilisateur annule cote consentement,
    // et d'autres codes OAuth existent : on ne les enumere pas, on rassure.
    expect(messageConnexion('access_denied')).toMatch(/n'a pas abouti/i)
  })

  it('ne rend aucun message quand il n y a pas de code', () => {
    expect(messageConnexion(undefined)).toBeNull()
    expect(messageConnexion('')).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer le test et le voir échouer**

Run: `pnpm --filter web test messages`
Expected: FAIL — module `messages.ts` introuvable.

- [ ] **Step 3 : Écrire la fonction**

Create `apps/web/app/(auth)/login/messages.ts` :

```ts
import { CODE_COMPTE_INCOMPLET, CODE_REFUS } from '@/lib/codes-connexion'

/**
 * Traduit un `error` code d'URL en copie affichable. On ne lit JAMAIS
 * `error_description` (parametre d'URL ouvert, donc controlable par un tiers :
 * vecteur d'hameconnage) : chaque bord possede son texte, le code est le seul
 * contrat. Le texte est accentue, comme toute l'UI — distinct du `MESSAGE_REFUS`
 * ASCII de `allowlist.ts`, qui sert au log et aux consommateurs non navigateur.
 */
const MESSAGES: Record<string, string> = {
  [CODE_REFUS]:
    "Cette adresse Google n'est pas autorisée. HomeBudget est un budget privé, réservé à deux comptes.",
  [CODE_COMPTE_INCOMPLET]:
    "Ton compte n'est pas tout à fait prêt. Reconnecte-toi, ou préviens Thomas si ça persiste.",
}

const MESSAGE_GENERIQUE = "La connexion n'a pas abouti. Réessaie."

export function messageConnexion(code: string | undefined): string | null {
  if (!code) return null
  return MESSAGES[code] ?? MESSAGE_GENERIQUE
}
```

- [ ] **Step 4 : Lancer le test et le voir passer**

Run: `pnpm --filter web test messages`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add "apps/web/app/(auth)/login/messages.ts" apps/web/test/messages.test.ts
git commit -m "feat(web): mapping pur des codes d erreur de connexion vers un message"
```

---

### Task 3 : Unifier le signal de garde sur `?error=`

`exigerSession()` redirige vers `/login?erreur=compte-incomplet` (paramètre français, valeur avec tiret). Better Auth impose `error` (anglais) : on aligne le nôtre pour que l'écran n'ait qu'un mécanisme de lecture. Ce paramètre n'est lu nulle part ailleurs (seuls `session.ts` et `session.test.ts` le mentionnent).

**Files:**
- Modify: `apps/web/lib/session.ts:25`
- Test: `apps/web/test/session.test.ts:49-64`

**Interfaces:**
- Consumes: `CODE_COMPTE_INCOMPLET` de `lib/codes-connexion.ts` (Task 1).

- [ ] **Step 1 : Ajuster le test d'abord**

Dans `apps/web/test/session.test.ts`, ajouter l'import en tête :

```ts
import { CODE_COMPTE_INCOMPLET } from '../lib/codes-connexion.js'
```

Puis, dans le bloc `it.each([...])`, remplacer la description et les deux assertions :

```ts
    'redirige vers /login?erreur=compte-incomplet quand `personne` est %s',
```
devient
```ts
    'redirige vers /login?error=compte_incomplet quand `personne` est %s',
```

et
```ts
      await expect(exigerSession()).rejects.toThrow('REDIRECT:/login?erreur=compte-incomplet')
      expect(redirectMock).toHaveBeenCalledWith('/login?erreur=compte-incomplet')
```
devient
```ts
      await expect(exigerSession()).rejects.toThrow(
        `REDIRECT:/login?error=${CODE_COMPTE_INCOMPLET}`,
      )
      expect(redirectMock).toHaveBeenCalledWith(`/login?error=${CODE_COMPTE_INCOMPLET}`)
```

- [ ] **Step 2 : Lancer le test et le voir échouer**

Run: `pnpm --filter web test session`
Expected: FAIL — `session.ts` redirige encore vers `/login?erreur=compte-incomplet`.

- [ ] **Step 3 : Ajuster la redirection**

Dans `apps/web/lib/session.ts`, ajouter l'import en tête :

```ts
import { CODE_COMPTE_INCOMPLET } from './codes-connexion.js'
```

Puis remplacer la ligne 25 :

```ts
    redirect('/login?erreur=compte-incomplet')
```
par
```ts
    redirect(`/login?error=${CODE_COMPTE_INCOMPLET}`)
```

- [ ] **Step 4 : Lancer le test et le voir passer**

Run: `pnpm --filter web test session`
Expected: PASS (6 tests).

- [ ] **Step 5 : Commit**

```bash
git add apps/web/lib/session.ts apps/web/test/session.test.ts
git commit -m "refactor(web): un seul parametre d erreur (?error=) sur l ecran de login"
```

---

### Task 4 : Le bouton client et la refonte de la page

La page devient un Server Component qui lit `searchParams`. La seule part interactive (l'`onClick` de connexion) est isolée dans une feuille cliente, qui gagne `errorCallbackURL: '/login'`.

**Files:**
- Create: `apps/web/app/(auth)/login/bouton-google.tsx`
- Modify: `apps/web/app/(auth)/login/page.tsx` (remplacement complet)

**Interfaces:**
- Consumes: `messageConnexion` de `./messages` (Task 2) ; `Button` de `@/components/ui/button` ; `signIn` de `@/lib/auth-client`.
- Produces: `BoutonGoogle` (composant client, sans props).

- [ ] **Step 1 : Créer la feuille cliente**

Create `apps/web/app/(auth)/login/bouton-google.tsx` :

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { signIn } from '@/lib/auth-client'

/**
 * La seule part interactive de l'ecran : l'`onClick` de connexion. Isolee ici
 * pour que `page.tsx` reste un Server Component (il lit `searchParams`).
 *
 * `errorCallbackURL: '/login'` est le pendant cote client du `code` pose sur
 * l'`APIError` (voir `allowlist.ts`) : ensemble, ils font revenir un refus SUR
 * l'ecran de login (`/login?error=...`) au lieu d'une page d'erreur brute.
 */
export function BoutonGoogle() {
  return (
    <Button
      type="button"
      className="w-full"
      onClick={() =>
        signIn.social({ provider: 'google', callbackURL: '/', errorCallbackURL: '/login' })
      }
    >
      Se connecter avec Google
    </Button>
  )
}
```

- [ ] **Step 2 : Remplacer la page**

Replace the entire content of `apps/web/app/(auth)/login/page.tsx` with :

```tsx
import { BoutonGoogle } from './bouton-google'
import { messageConnexion } from './messages'

/**
 * Le premier ecran, et le seul accessible sans session. Server Component : il
 * lit `searchParams.error` (un code, jamais `error_description`) pour afficher
 * un refus comprehensible plutot qu'une erreur brute. Le groupe `(auth)` est
 * hors de la garde `exigerSession()` — cet ecran DOIT s'ouvrir sans session.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const { error } = await searchParams
  const code = Array.isArray(error) ? error[0] : error
  const message = messageConnexion(code)

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-100 rounded-xl border border-subtle bg-surface px-8 py-10 text-center shadow-sm">
        <span
          aria-hidden="true"
          className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-emphasis text-lg font-semibold tracking-[-0.02em] text-on-emphasis"
        >
          HB
        </span>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">HomeBudget</h1>
        <p className="mt-3 text-sm leading-relaxed text-body">
          Le budget partagé de Thomas et Liz.
          <br />
          L’historique ne se recalcule jamais.
        </p>

        {message ? (
          <p
            role="alert"
            className="mt-6 rounded-lg border border-subtle bg-muted px-4 py-3 text-left text-sm leading-relaxed text-body"
          >
            {message}
          </p>
        ) : null}

        <div className="mt-7">
          <BoutonGoogle />
        </div>

        <p className="mt-5 inline-flex items-center gap-2 text-xs text-faint">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Aucune inscription · deux comptes autorisés
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3 : Typecheck + garde-fous visuels**

Run: `pnpm --filter web typecheck && pnpm --filter web test theme`
Expected: PASS — types OK, et `theme.test.ts` vert (aucune couleur en dur : on n'a écrit que des tokens `bg-surface`, `bg-emphasis`, `bg-muted`, `border-subtle`, `text-body`, `text-on-emphasis`, `text-faint`).

- [ ] **Step 4 : Vérifier à l'œil (facultatif mais recommandé)**

Run: `task dev` puis ouvrir `http://localhost:3000/login` et `http://localhost:3000/login?error=acces_refuse`.
Expected: sans paramètre, la carte affirmée (marque, wordmark, proposition de valeur, bouton, note de sécurité) sans encart ; avec `?error=acces_refuse`, l'encart neutre de refus apparaît sous la proposition de valeur.

- [ ] **Step 5 : Commit**

```bash
git add "apps/web/app/(auth)/login/bouton-google.tsx" "apps/web/app/(auth)/login/page.tsx"
git commit -m "feat(web): ecran de connexion affirme, avec message de refus lisible"
```

---

### Task 5 : Prouver les deux états à l'écran (e2e)

Deux visites sans authentification, qui prouvent le critère de fin sans dépendre d'un credential Google : la page rend l'encart purement depuis `searchParams`.

**Files:**
- Modify: `apps/web/e2e/parcours.spec.ts` (ajout après le premier test, avant `test.describe('parcours authentifies', ...)`)

- [ ] **Step 1 : Ajouter les deux tests**

Dans `apps/web/e2e/parcours.spec.ts`, juste après le test `'un visiteur sans session est renvoye vers /login'` (ligne 8) et avant `test.describe('parcours authentifies', ...)`, insérer :

```ts
test("l'ecran de connexion nu identifie l'app sans afficher d'erreur", async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'HomeBudget' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Se connecter avec Google/ })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('une adresse refusee recoit un message comprehensible, pas une erreur brute', async ({
  page,
}) => {
  // On simule le retour de Better Auth apres un refus d'allowlist : le callback
  // OAuth redirige vers /login?error=acces_refuse. Pas besoin de credential
  // Google — l'ecran rend l'encart a partir du seul parametre d'URL.
  await page.goto('/login?error=acces_refuse')
  await expect(page.getByRole('alert')).toContainText(/n'est pas autorisée/i)
})
```

- [ ] **Step 2 : Lancer l'e2e sur base neuve**

Run: `task test:e2e:frais`
Expected: PASS — tous les parcours, canari du solde inclus, plus les deux nouveaux états de l'écran de connexion.

> Rappel worktree (voir memory) : copier les `.env` du checkout principal et purger le conteneur `homebudget-db` orphelin avant ce lancement si la base ne monte pas.

- [ ] **Step 3 : Commit**

```bash
git add apps/web/e2e/parcours.spec.ts
git commit -m "test(web): verrouille les deux etats de l ecran de connexion (nu, refuse)"
```

---

### Task 6 : Vérification finale

- [ ] **Step 1 : La porte avant de conclure**

Run: `task verif`
Expected: PASS — lint (Biome), typecheck du monorepo, tous les tests unitaires (dont `allowlist`, `messages`, `session`, `theme`, `architecture`).

- [ ] **Step 2 : Cocher l'issue**

Vérifier les deux critères de fin de l'issue #12 :
- l'écran identifie l'application et son propos (wordmark + proposition de valeur) ✔
- le refus par allowlist affiche un message compréhensible (encart neutre via `/login?error=acces_refuse`) plutôt qu'une erreur brute ✔

## Self-review (fait par l'auteur du plan)

**Couverture du spec :**
- Refus revient à l'écran (code + errorCallbackURL) → Tasks 1 & 4. ✔
- Lecture du `error` code, jamais `error_description` → Task 4 (page) + contrainte globale. ✔
- Mapping pur français → Task 2. ✔
- Unification `?error=` (compte incomplet) → Task 3. ✔
- Refonte visuelle carte centrée affermie + encart neutre → Task 4. ✔
- Tests : contrat du code, mapping, session ajusté, e2e deux états → Tasks 1, 2, 3, 5. ✔
- Domaine/canari intacts → aucune tâche n'y touche. ✔

**Cohérence des types :** `CODE_REFUS` / `CODE_COMPTE_INCOMPLET` (Task 1) consommés à l'identique en Tasks 2, 3 ; `messageConnexion(string | undefined): string | null` défini en Task 2 et appelé en Task 4 ; `BoutonGoogle` (Task 4) sans props. Aucun renommage divergent.

**Pas de placeholder :** chaque étape porte son code complet et sa commande. ✔
