import type { Cents } from './money.js'

export type Personne = 'thomas' | 'liz'

export type TypeDepense = 'charge_fixe' | 'courante' | 'transfert'

/**
 * `transfert` : la part du PAYEUR vaut 0, celle de l'autre vaut le montant total.
 * Le PRD l'appelle « 100 % payeur », ce qui suggere l'inverse. Voir CLAUDE.md.
 */
export type ModeRepartition = 'prorata' | 'moitie' | 'personnalise' | 'transfert'

export interface Parts {
  thomas: Cents
  liz: Cents
}

export function autre(p: Personne): Personne {
  return p === 'thomas' ? 'liz' : 'thomas'
}
