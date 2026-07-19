import type { TypeDepense } from '@homebudget/domain'

import { cn } from '@/lib/utils'

const LIBELLES: Record<TypeDepense, string> = {
  transfert: 'Transfert',
  charge_fixe: 'Charge fixe',
  courante: 'Courante',
}

/**
 * L'etiquette du type d'une depense.
 *
 * L'emerald du transfert ne code PAS un jugement (« bien » / « mal ») : il
 * signale le seul type qui ne se repartit pas, celui dont le montant deplace
 * une dette au lieu de creer une charge. C'est l'un des deux seuls accents
 * chromatiques du systeme. Le libelle porte l'information en toutes lettres :
 * la couleur ne fait que la doubler, elle ne la remplace jamais.
 */
export function BadgeType({ type }: { type: TypeDepense }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[0.6875rem] leading-5 font-medium',
        type === 'transfert' && 'border-transparent bg-positive-surface text-positive',
        type === 'charge_fixe' && 'border-input bg-surface text-body',
        type === 'courante' && 'border-transparent bg-muted text-body',
      )}
    >
      {LIBELLES[type]}
    </span>
  )
}

/** L'etat d'une version de config : « En cours » ou « Close ». */
export function BadgeVersion({ close }: { close: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] leading-5 font-medium',
        close ? 'bg-muted text-faint' : 'bg-positive-surface text-positive',
      )}
    >
      {close ? 'Close' : 'En cours'}
    </span>
  )
}
