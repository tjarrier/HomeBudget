import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { type VariantProps, cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Deux variantes, pas plus. `min-h-11` = 44px : la cible tactile est reglee
// ICI, a la source, plutot qu'ecran par ecran (issue C1) — la maquette dessine
// des boutons de 42px, on ne descend pas sous le plancher pour 2px.
//
// Le plein est l'encre du systeme (slate-900) : il n'y a pas de couleur de
// marque. `active:translate-y-px` reprend le leger enfoncement du design
// system ; aucun autre mouvement nulle part.
const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primaire: 'bg-primary text-primary-foreground hover:bg-primary/80',
        discret: 'border border-input bg-surface text-body hover:bg-muted',
      },
    },
    defaultVariants: {
      variant: 'primaire',
    },
  },
)

function Button({
  className,
  variant = 'primaire',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
