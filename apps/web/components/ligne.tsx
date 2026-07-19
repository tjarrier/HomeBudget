import type { ReactNode } from 'react'

/**
 * Une entree de liste. UN SEUL balisage, une bascule purement CSS :
 *
 *   sous 640px  — deux colonnes, deux rangees :
 *                 intitule | montant
 *                 meta     | detail
 *   au-dela     — une seule rangee de quatre colonnes :
 *                 intitule | meta | detail | montant
 *
 * Pas de double rendu, pas de detection de viewport en JS. C'est ce qui rend
 * B2 (cartes sur mobile, tableau au-dela) et C2 (aucun debordement a 360px)
 * vraies par construction plutot que verifiees apres coup.
 *
 * `minmax(0,1fr)` sur la premiere colonne, et non `1fr` : sans lui une longue
 * description sans espace elargit la grille au-dela du viewport, ce qui est
 * exactement le debordement horizontal que C2 interdit.
 */
export function Ligne({
  intitule,
  montant,
  meta,
  detail,
}: {
  intitule: ReactNode
  montant: ReactNode
  meta?: ReactNode
  detail?: ReactNode
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
      <span className="min-w-0 font-medium break-words col-start-1 row-start-1 sm:col-start-1 sm:row-start-1">
        {intitule}
      </span>
      <span className="justify-self-end col-start-2 row-start-1 sm:col-start-4 sm:row-start-1">
        {montant}
      </span>
      {meta ? (
        <span className="text-[0.8125rem] text-muted-foreground min-w-0 break-words col-start-1 row-start-2 sm:col-start-2 sm:row-start-1">
          {meta}
        </span>
      ) : null}
      {detail ? (
        <span className="justify-self-end text-[0.8125rem] text-muted-foreground min-w-0 break-words col-start-2 row-start-2 sm:col-start-3 sm:row-start-1">
          {detail}
        </span>
      ) : null}
    </li>
  )
}
