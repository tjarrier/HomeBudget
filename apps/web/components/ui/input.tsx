import { Input as InputPrimitive } from '@base-ui/react/input'
import type * as React from 'react'

import { cn } from '@/lib/utils'

// Pas de contour : l'affordance vient du fond `muted` et du filet inferieur,
// qui s'epaissit et prend l'accent au focus. C'est la traduction de la
// direction epuree sur un champ, sans le rendre invisible.
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-t-md border-0 border-b border-border bg-muted px-3 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-b-2 focus-visible:border-primary disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
