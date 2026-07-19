import type { ReactNode } from 'react'

import { NavLaterale } from '@/components/nav-laterale'
import { PiedProfil } from '@/components/pied-profil'
import { exigerSession } from '@/lib/session'

/**
 * La coque de l'application : une barre laterale fixe de 248px et une colonne
 * de contenu centree a 1080px.
 *
 * Sous 768px, la barre bascule en bandeau horizontal en tete — meme balisage,
 * bascule purement CSS (les libelles passent en `sr-only`, il ne reste que les
 * icones). Pas de detection de viewport en JS, pas de second rendu.
 */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const session = await exigerSession()

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-subtle bg-surface max-md:items-center max-md:gap-3 max-md:border-b max-md:px-4 max-md:py-3 md:sticky md:top-0 md:h-screen md:w-62 md:border-r md:p-4 max-md:flex-row">
        <div className="flex items-center gap-2.5 md:px-2 md:pt-1 md:pb-5">
          <span
            aria-hidden="true"
            className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-emphasis text-[0.8125rem] font-semibold tracking-[-0.02em] text-on-emphasis"
          >
            HB
          </span>
          <div>
            <div className="text-base font-semibold tracking-[-0.01em]">HomeBudget</div>
            <div className="text-[0.6875rem] text-faint max-md:sr-only">Thomas &amp; Liz</div>
          </div>
        </div>

        <NavLaterale />
        <PiedProfil personne={session.personne} nom={session.nom} />
      </aside>

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[1080px] px-5 pt-6 pb-14 md:px-10 md:pt-7">{children}</main>
      </div>
    </div>
  )
}
