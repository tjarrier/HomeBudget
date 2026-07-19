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

const NOMS: Record<Personne, string> = { thomas: 'Thomas', liz: 'Liz' }

/** Le libelle affichable d'une personne. Le domaine porte deja ces deux noms
 *  dans `phraseSynthese` : les dupliquer dans l'UI ferait diverger les deux. */
export function nomPersonne(p: Personne): string {
  return NOMS[p]
}
