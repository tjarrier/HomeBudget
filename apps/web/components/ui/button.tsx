import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { type VariantProps, cva } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Deux variantes, pas plus. `min-h-11` = 44px : la cible tactile est reglee
// ICI, a la source, plutot qu'ecran par ecran (issue C1).
const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md px-5 text-[0.9375rem] font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primaire: 'bg-primary text-primary-foreground hover:bg-primary/90',
        discret: 'text-primary hover:bg-muted',
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
