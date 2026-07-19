import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Un groupe de contenu. Elle ne DESSINE rien : ni bordure, ni fond, ni ombre.
 * Le groupement vient de l'ecart vertical — 40px entre deux sections, 12px a
 * l'interieur. C'est ce rapport qui remplace le cadre qu'on a retire ; il n'est
 * pas decoratif, c'est le mecanisme de structure de l'ecran.
 */
export function Section({
  titre,
  children,
  className,
}: {
  titre?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {titre ? (
        <h2 className="text-[0.8125rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          {titre}
        </h2>
      ) : null}
      {children}
    </section>
  )
}
