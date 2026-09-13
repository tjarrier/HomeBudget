import { Input as InputPrimitive } from '@base-ui/react/input'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Un champ sur fond `--muted`, sans contour, delimite par un FILET INFERIEUR en
 * `--input` (3,30:1 sur ce fond, WCAG 1.4.11) qui passe a 2px prune au focus.
 * Le fond seul ne donne que 1,12:1 sur blanc : sans le filet, un champ vide
 * serait invisible. Arrondi en haut seulement, pour que le filet reste droit.
 *
 * `h-11` (44px) : le plancher tactile du projet (issue C1), regle ICI.
 * `text-base` (16px) : en dessous, Safari iOS zoome la page au focus.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-t-lg border-0 border-b border-input bg-muted px-4 text-base transition-[color,border-color] outline-none',
        'placeholder:text-muted-foreground',
        'focus-visible:border-b-2 focus-visible:border-marque',
        'disabled:pointer-events-none disabled:opacity-50',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
