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
 * Aucune couleur ne teinte un solde. La maquette du design system tinte le
 * positif en emerald et le negatif en rouge ; l'ecran « Répartition » affiche
 * les deux soldes cote a cote, et ces deux soldes sont LE MEME FAIT vu des deux
 * bouts (+1 145,80 pour Thomas, −1 145,80 pour Liz). Les teinter reviendrait a
 * dire que Thomas a raison et Liz a tort d'une seule et meme dette. Le signe et
 * le libelle portent la direction ; la couleur n'ajouterait qu'un jugement.
 */
const NIVEAUX = {
  /** Le solde du bandeau sombre. Le seul montant de cette taille. */
  heros: 'text-3xl font-semibold tabular-nums tracking-[-0.02em]',
  /** Les quatre chiffres cles du tableau de bord. */
  notable: 'text-[1.375rem] font-semibold tabular-nums tracking-[-0.02em]',
  /** Le montant d'une ligne de liste, d'une ligne de bilan. */
  courant: 'text-sm font-semibold tabular-nums',
  /** Une valeur de second plan : meta, detail de parts. */
  discret: 'text-xs font-medium tabular-nums text-muted-foreground',
} as const

export function Montant({
  cents,
  niveau,
  signe = false,
  className,
  testId,
}: {
  cents: Cents
  niveau: keyof typeof NIVEAUX
  signe?: boolean
  className?: string
  /** Cible le montant lui-meme, jamais le libelle qui l'accompagne. */
  testId?: string
}) {
  return (
    // <data> : la valeur exacte en centimes reste lisible par une machine,
    // jamais l'euro arrondi.
    <data value={cents} data-testid={testId} className={cn(NIVEAUX[niveau], className)}>
      {formaterMontantSigne(cents, signe)}
    </data>
  )
}
