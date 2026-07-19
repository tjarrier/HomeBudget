import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * La surface de base du produit : blanc, un filet, un rayon de 14px, une ombre
 * a peine perceptible. C'est le conteneur que la maquette pose autour de
 * CHAQUE bloc de contenu — a la seule exception du bandeau du solde, qui est
 * la surface sombre (voir `BandeauSolde`).
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
    <section className={cn('rounded-xl border border-subtle bg-surface p-5 shadow-xs', className)}>
      {titre ? (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[0.9375rem] font-semibold">{titre}</h2>
          {aside ? <span className="text-xs text-faint">{aside}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
