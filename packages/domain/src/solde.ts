import { type Cents, formaterEuros } from './money.js'
import {
  type ModeRepartition,
  type Parts,
  type Personne,
  type TypeDepense,
  nomPersonne,
} from './types.js'

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

/**
 * Qui doit combien a qui, sous forme de STRUCTURE.
 *
 * Le tableau de bord compose lui-meme son bandeau : un montant heros en serif
 * a 64px enchasse au milieu d'une phrase en Inter est incomposable. `montant`
 * est toujours POSITIF — c'est `debiteur`/`crediteur` qui porte le sens, de
 * sorte qu'aucun consommateur n'ait a nier une valeur pour l'afficher.
 */
export type Synthese =
  | { etat: 'a-jour' }
  | { etat: 'dette'; debiteur: Personne; crediteur: Personne; montant: Cents }

export function synthese(r: Resume): Synthese {
  if (r.soldeThomas === 0) return { etat: 'a-jour' }
  return r.soldeThomas > 0
    ? { etat: 'dette', debiteur: 'liz', crediteur: 'thomas', montant: r.soldeThomas }
    : { etat: 'dette', debiteur: 'thomas', crediteur: 'liz', montant: -r.soldeThomas }
}

/**
 * La meme information en une phrase. REECRITE PAR-DESSUS `synthese()` : il n'y
 * a donc toujours qu'une seule source de verite sur qui doit a qui. Sa sortie
 * ne change pas — cinq assertions la verrouillent (domain, db x2, seed), dont
 * le canari `Liz doit 1 145,80 € à Thomas`.
 */
export function phraseSynthese(r: Resume): string {
  const s = synthese(r)
  if (s.etat === 'a-jour') return 'Vous êtes à jour'
  return `${nomPersonne(s.debiteur)} doit ${formaterEuros(s.montant)} à ${nomPersonne(s.crediteur)}`
}
