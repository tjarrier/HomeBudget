import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * La surface de base du produit : blanc, sans bordure, un rayon de 20px, une
 * ombre a peine perceptible : sur le fond chaud, le blanc suffit a la
 * detacher. C'est le conteneur que la maquette pose autour de
 * CHAQUE bloc de contenu — a la seule exception du bandeau du solde, qui est
 * la surface sombre (le bandeau de `app/(app)/page.tsx`).
 *
 * `titre` rend un <h2> : les cartes sont les sections de second niveau de
 * chaque ecran, sous le <h1> porte par `EntetePage`. `aside` est la mention
 * discrete alignee a droite du titre (« 11 dépenses », « Payé vs dû »).
 */
export function Carte({
  titre,
  aside,
  children,
  className,
}: {
  titre?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl bg-surface p-5 shadow-xs', className)}>
      {titre ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[1.1875rem] font-semibold tracking-[-0.01em]">
            {titre}
          </h2>
          {aside ? <span className="text-[0.8125rem] text-muted-foreground">{aside}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
