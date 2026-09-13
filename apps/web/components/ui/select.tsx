import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Un `<select>` NATIF, volontairement.
 *
 * Le composant genere par shadcn etait le Select composé de Base UI : un popup
 * en JS. Le formulaire de depense repose sur deux comportements natifs que ce
 * popup ne reproduit pas — `disabled` (avec son champ cache de compensation,
 * voir `formulaire-depense.tsx`) et l'ouverture du selecteur du systeme sur
 * mobile, qui est precisement ce que l'issue B3 cherche. Les parcours
 * Playwright pilotent d'ailleurs ces champs par `page.selectOption(...)`.
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
