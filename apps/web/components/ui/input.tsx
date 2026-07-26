import { Input as InputPrimitive } from '@base-ui/react/input'
import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Un champ borde, sur fond blanc, rayon 10px — la forme que porte le design
 * system. Le focus epaissit un anneau de 3px et fonce la limite.
 *
 * `h-11` (44px) et non les 32px de la maquette : celle-ci mesure une vignette
 * de composant, pas une cible tactile. C'est le plancher tactile du projet
 * (issue C1), le meme que celui de `Button` — regle ICI, a la source, pour que
 * personne n'ait a y penser ecran par ecran. `border-input` (et non `border-subtle`)
 * parce qu'une LIMITE de controle doit tenir 3:1 sur le fond (WCAG 1.4.11),
 * la ou le filet entre deux surfaces doit rester leger.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-lg border border-input bg-surface px-3 text-sm transition-[color,box-shadow] outline-none',
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

export { Input }
