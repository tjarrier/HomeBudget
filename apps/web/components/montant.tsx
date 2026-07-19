import { formaterMontantSigne } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Cents } from '@homebudget/domain'

/**
 * L'unique frontiere entre les centimes et l'ecran.
 *
 * Ce composant N'A PAS LE DROIT de calculer un signe. Il affiche celui de la
 * valeur qu'il recoit. Il ne nie jamais une valeur, ne l'inverse jamais selon
 * la personne regardee, ne derive jamais un signe d'un contexte. C'est la garde
 * contre le piege du mode transfert documente dans CLAUDE.md.
 *
 * Aucune couleur ne code un sens : le solde est une DIRECTION (qui doit a qui),
 * pas un positif/negatif. Rouge/vert s'inverserait selon lequel des deux
 * utilisateurs regarde l'ecran.
 */
const NIVEAUX = {
  // Instrument Serif : chiffres proportionnels. Reserve a un montant ISOLE,
  // jamais a un montant qui a un voisin au-dessus ou en dessous.
  heros: 'font-heading text-[clamp(2.75rem,12vw,4rem)] leading-none tracking-[-0.02em]',
  notable: 'text-xl font-semibold tabular-nums',
  discret: 'text-[0.9375rem] font-medium tabular-nums text-muted-foreground',
} as const

export function Montant({
  cents,
  niveau,
  signe = false,
  className,
}: {
  cents: Cents
  niveau: keyof typeof NIVEAUX
  signe?: boolean
  className?: string
}) {
  return (
    // <data> : la valeur exacte en centimes reste lisible par une machine,
    // jamais l'euro arrondi.
    <data value={cents} className={cn(NIVEAUX[niveau], className)}>
      {formaterMontantSigne(cents, signe)}
    </data>
  )
}
