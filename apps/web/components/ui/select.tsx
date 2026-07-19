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
 */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-12 w-full min-w-0 appearance-none rounded-t-md border-0 border-b border-border bg-muted px-3 text-base outline-none transition-colors focus-visible:border-b-2 focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Select }
