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
 * Aucune couleur ne teinte un solde. Une maquette tinte volontiers le positif
 * et le negatif ; l'ecran « Répartition » affiche
 * les deux soldes cote a cote, et ces deux soldes sont LE MEME FAIT vu des deux
 * bouts (+1 145,80 pour Thomas, −1 145,80 pour Liz). Les teinter reviendrait a
 * dire que Thomas a raison et Liz a tort d'une seule et meme dette. Le signe et
 * le libelle portent la direction ; la couleur n'ajouterait qu'un jugement.
 */
const NIVEAUX = {
  /**
   * Le solde du bandeau prune. Bricolage Grotesque, chiffres PROPORTIONNELS :
   * un montant isole, qui n'a pas de voisin a aligner. `clamp` : 43px a 360px,
   * 50px au-dela — assez pour un solde a cinq chiffres sans deborder.
   */
  heros:
    'font-display text-[clamp(2.25rem,12vw,3.125rem)] leading-[1.02] font-semibold tracking-[-0.035em]',
  /** Les quatre chiffres du tableau de bord. */
  notable: 'text-[1.1875rem] font-bold tabular-nums tracking-[-0.02em]',
  /** Le montant d'une ligne de liste, d'une ligne de bilan, de l'apercu. */
  courant: 'text-[0.9375rem] font-bold tabular-nums',
  /** Une valeur de second plan : detail des parts. */
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
