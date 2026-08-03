'use client'

import { Button } from '@/components/ui/button'
import { signIn } from '@/lib/auth-client'
import posthog from 'posthog-js'

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
      onClick={() => {
        posthog.capture('google_sign_in_started')
        signIn.social({ provider: 'google', callbackURL: '/', errorCallbackURL: '/login' })
      }}
    >
      Se connecter avec Google
    </Button>
  )
}
