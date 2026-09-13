import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Un `<select>` NATIF, volontairement.
 *
 * Le composant genere par shadcn etait le Select composé de Base UI : un popup
 * en JS. Les selecteurs restants (filtres de /depenses, generation mensuelle)
 * reposent sur l'ouverture du selecteur du systeme sur mobile, que ce popup ne
 * reproduit pas. Les parcours Playwright les pilotent par
 * `page.selectOption(...)`. Le formulaire de depense, lui, n'en utilise plus :
 * ses choix sont des radios natifs (`components/ui/choix.tsx`).
 *
 * Le natif porte gratuitement le clavier, l'ARIA et l'etat disabled : c'est la
 * raison meme pour laquelle la spec garde les controles.
 *
 * `h-11` (44px) : le meme plancher tactile que `Button` et `Input` (issue C1).
 * Un `<select>` natif se touche exactement comme un champ ; il n'a aucune
 * raison d'etre plus bas qu'eux.
 *
 * `appearance-none` retire la fleche du systeme ; le chevron qui la remplace
 * est pose par une regle CSS ciblant `[data-slot="select"]` dans
 * `app/globals.css` (un `background-image` colore au token, pas un litteral).
 * `pr-10` laisse la place pour qu'un intitule long ne passe jamais dessous.
 */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-11 w-full min-w-0 appearance-none rounded-t-lg border-0 border-b border-input bg-muted pr-10 pl-4 text-base transition-[color,border-color] outline-none',
        'focus-visible:border-b-2 focus-visible:border-marque',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Select }
