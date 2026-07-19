'use client'

import type { Personne } from '@homebudget/domain'
import { useRouter } from 'next/navigation'

import { Avatar } from '@/components/avatar'
import { signOut } from '@/lib/auth-client'

/**
 * Le bloc de bas de barre laterale : qui est connecte, et par ou sortir.
 *
 * `router.refresh()` apres deconnexion plutot qu'un `href` : la session vit
 * dans un cookie lu cote serveur, et une navigation cliente afficherait un
 * ecran encore rendu avec l'ancienne. Le middleware renvoie alors vers /login.
 */
export function PiedProfil({ personne, nom }: { personne: Personne; nom: string }) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-subtle p-2.5 md:mt-auto max-md:ml-auto">
      <Avatar personne={personne} sombre decoratif />
      <div className="min-w-0 max-md:sr-only">
        <div className="truncate text-sm font-medium">{nom}</div>
        <div className="text-[0.6875rem] text-faint">
          Connecté ·{' '}
          <button
            type="button"
            onClick={async () => {
              await signOut()
              router.refresh()
            }}
            className="underline underline-offset-2 hover:text-body focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Quitter
          </button>
        </div>
      </div>
    </div>
  )
}
