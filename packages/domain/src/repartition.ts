import { type Cents, repartirAuRatio } from './money.js'
import type { ModeRepartition, Parts, Personne, TypeDepense } from './types.js'

export interface EntreeRepartition {
  montant: Cents
  mode: ModeRepartition
  payePar: Personne
  /** Issu de la version de config en vigueur A LA DATE de la depense. */
  ratioThomas: number
  /** Requis si et seulement si mode === 'personnalise'. */
  partsPersonnalisees?: Parts
}

export function modeParDefaut(type: TypeDepense): ModeRepartition {
  switch (type) {
    case 'charge_fixe':
      return 'prorata'
    case 'courante':
      return 'moitie'
    case 'transfert':
      return 'transfert'
  }
}

export function calculerParts(entree: EntreeRepartition): Parts {
  const { montant, mode, payePar, ratioThomas, partsPersonnalisees } = entree

  switch (mode) {
    case 'prorata': {
      const [thomas, liz] = repartirAuRatio(montant, ratioThomas)
      return { thomas, liz }
    }

    case 'moitie': {
      const [thomas, liz] = repartirAuRatio(montant, 0.5)
      return { thomas, liz }
    }

    case 'transfert': {
      // La part du payeur vaut 0 : il ne se doit rien a lui-meme.
      // Sa creance sur l'autre est le montant entier. Ne pas inverser.
      return payePar === 'liz' ? { thomas: montant, liz: 0 } : { thomas: 0, liz: montant }
    }

    case 'personnalise': {
      if (!partsPersonnalisees) {
        throw new Error('Mode personnalise : parts personnalisees requises.')
      }
      const { thomas, liz } = partsPersonnalisees
      if (thomas + liz !== montant) {
        throw new Error(
          `La somme des parts (${thomas} + ${liz} = ${thomas + liz}) doit egaler le montant (${montant}).`,
        )
      }
      return { thomas, liz }
    }
  }
}
