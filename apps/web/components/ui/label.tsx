'use client'

import type * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * `peer-disabled:` a ete retire : il etait mort deux fois. Aucun controle de
 * l'app ne porte la classe `peer`, et le variant s'appuie sur `~`, qui ne
 * regarde qu'en AVANT — or le Label precede toujours son controle. Il ne
 * pouvait donc jamais s'appliquer. `has-[+_:disabled]:` rendrait l'intention
 * vraie le jour ou on la veut ; on ne garde pas la version qui ment.
 */
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-xs leading-none font-medium text-body select-none',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
