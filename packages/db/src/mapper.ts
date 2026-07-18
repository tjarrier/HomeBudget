import type { Depense, VersionConfig } from '@homebudget/domain'
import type { depense, versionConfig } from './schema.js'

type LigneVersion = typeof versionConfig.$inferSelect
type LigneDepense = typeof depense.$inferSelect

/**
 * Traduction ligne SQL -> type du domaine. Le SEUL endroit du depot qui connait
 * les deux vocabulaires. Il ne calcule rien : il renomme et regroupe.
 */
export function versionDepuisLigne(l: LigneVersion): VersionConfig {
  return {
    id: l.id,
    libelle: l.libelle,
    dateDebut: l.dateDebut,
    dateFin: l.dateFin,
    salaireNetThomas: l.salaireNetThomasCents,
    salaireNetLiz: l.salaireNetLizCents,
    chargesCommunes: l.chargesCommunes,
    chargesPersoThomas: l.chargesPersoThomas,
    chargesPersoLiz: l.chargesPersoLiz,
  }
}

export function depenseDepuisLigne(l: LigneDepense): Depense {
  return {
    id: l.id,
    date: l.date,
    description: l.description,
    montant: l.montantCents,
    payePar: l.payePar,
    type: l.type,
    mode: l.modeRepartition,
    // Les parts sont LUES, jamais recalculees : elles ont ete figees a l'ecriture.
    parts: { thomas: l.partThomasCents, liz: l.partLizCents },
    versionConfigId: l.versionConfigId,
    genereAuto: l.genereAuto,
    commentaire: l.commentaire,
  }
}
