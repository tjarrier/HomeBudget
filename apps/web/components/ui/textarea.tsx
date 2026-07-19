import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * La meme forme que `Input`, sur plusieurs lignes.
 *
 * Il existe parce que les trois champs de charges recopiaient a la main le
 * style de `Input` — et avaient deja diverge : ni `disabled:`, ni
 * `aria-invalid:`. Un correctif de contraste sur la limite ou l'anneau de focus
 * ne se propageait donc pas ici. Les deux composants partagent desormais la
 * meme liste de classes, ligne pour ligne.
 *
 * Pas de hauteur fixe : c'est `rows` qui la donne, au cas par cas.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'w-full min-w-0 resize-y rounded-lg border border-input bg-surface px-3 py-2 text-sm transition-[color,box-shadow] outline-none',
        'placeholder:text-faint',
        'focus-visible:border-strong focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:pointer-events-none disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
