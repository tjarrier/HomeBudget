import { type Cents, formaterEuros } from './money.js'
import type { ModeRepartition, Parts, Personne, TypeDepense } from './types.js'

/**
 * Une depense enregistree. `parts` est FIGE a la creation d'apres la version de
 * config en vigueur a `date` : rien ne le recalcule jamais (invariant I2).
 */
export interface Depense {
  id: string
  /** ISO YYYY-MM-DD. */
  date: string
  description: string
  montant: Cents
  payePar: Personne
  type: TypeDepense
  mode: ModeRepartition
  parts: Parts
  versionConfigId: string
  genereAuto: boolean
  commentaire: string | null
}

/** « Ce que j'ai paye » moins « ce que j'aurais du payer ». */
export function soldeDepense(d: Depense): Parts {
  return {
    thomas: (d.payePar === 'thomas' ? d.montant : 0) - d.parts.thomas,
    liz: (d.payePar === 'liz' ? d.montant : 0) - d.parts.liz,
  }
}

export interface Resume {
  /** Depenses reelles, transferts exclus. */
  totalDepenses: Cents
  /** Virements et remboursements : des mouvements de dette, pas des depenses. */
  totalTransferts: Cents
  payeThomas: Cents
  payeLiz: Cents
  duThomas: Cents
  duLiz: Cents
  soldeThomas: Cents
  soldeLiz: Cents
}

export function resumer(depenses: Depense[]): Resume {
  const r: Resume = {
    totalDepenses: 0,
    totalTransferts: 0,
    payeThomas: 0,
    payeLiz: 0,
    duThomas: 0,
    duLiz: 0,
    soldeThomas: 0,
    soldeLiz: 0,
  }

  for (const d of depenses) {
    if (d.type === 'transfert') {
      r.totalTransferts += d.montant
    } else {
      r.totalDepenses += d.montant
    }

    if (d.payePar === 'thomas') r.payeThomas += d.montant
    else r.payeLiz += d.montant

    r.duThomas += d.parts.thomas
    r.duLiz += d.parts.liz
  }

  r.soldeThomas = r.payeThomas - r.duThomas
  r.soldeLiz = r.payeLiz - r.duLiz
  return r
}

export function phraseSynthese(r: Resume): string {
  if (r.soldeThomas === 0) return 'Vous êtes à jour'
  return r.soldeThomas > 0
    ? `Liz doit ${formaterEuros(r.soldeThomas)} à Thomas`
    : `Thomas doit ${formaterEuros(-r.soldeThomas)} à Liz`
}
