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
 * `appearance-none` retire la fleche du systeme ; le chevron qui la remplace
 * est pose par une regle CSS ciblant `[data-slot="select"]` dans
 * `app/globals.css` (un `background-image` colore au token, pas un litteral).
 * `pr-9` laisse la place pour qu'un intitule long ne passe jamais dessous.
 */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-10 w-full min-w-0 appearance-none rounded-lg border border-input bg-surface pr-9 pl-3 text-sm transition-[color,box-shadow] outline-none',
        'focus-visible:border-strong focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Select }
