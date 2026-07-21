import {
  type Cents,
  type VersionConfig,
  parserEurosSaisis,
  ratioThomas,
  totalChargesCommunes,
  veilleDe,
} from '@homebudget/domain'
import { parserCharges } from './charges.js'

export interface SaisieBruteVersion {
  dateDebut: string
  salaireNetThomas: string
  salaireNetLiz: string
  chargesCommunes: string
}

export interface LigneCloture {
  libelle: string
  unite: 'euros' | 'pourcent'
  /** centimes si `unite === 'euros'`, ratio 0–1 si `'pourcent'`. */
  avant: number
  apres: number
}

export interface ApercuCloture {
  /** ISO `YYYY-MM-DD`. `null` tant qu'aucune date valide ET postérieure au début courant. */
  dateCloture: string | null
  /** Date saisie mais antérieure ou égale au début de la version courante. */
  dateTropTot: boolean
  /** Uniquement les moteurs de répartition qui changent réellement. */
  lignes: LigneCloture[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Les euros saisis, ou `null` si la chaîne est encore illisible (frappe en cours). */
function centsOuNull(brut: string): Cents | null {
  try {
    return parserEurosSaisis(brut)
  } catch {
    return null
  }
}

/** Le total des charges saisies, ou `null` si une ligne est illisible. */
function totalChargesOuNull(brut: string): Cents | null {
  try {
    return parserCharges(brut).reduce((somme, c) => somme + c.montant, 0)
  } catch {
    return null
  }
}

/** La part Thomas, ou `null` si la répartition est indéfinie (somme des salaires ≤ 0). */
function ratioOuNull(v: VersionConfig): number | null {
  try {
    return ratioThomas(v)
  } catch {
    return null
  }
}

function calculerDateCloture(
  courante: VersionConfig,
  dateDebut: string,
): { dateCloture: string | null; dateTropTot: boolean } {
  if (!ISO.test(dateDebut)) return { dateCloture: null, dateTropTot: false }
  // Le versioning est append-only : une prise d'effet <= au début courant serait
  // rejetée par `cloturerEtAjouter`. On n'affiche pas une « veille » absurde.
  if (dateDebut <= courante.dateDebut) return { dateCloture: null, dateTropTot: true }
  try {
    return { dateCloture: veilleDe(dateDebut), dateTropTot: false }
  } catch {
    // Bien formée mais calendairement invalide (30 février) : <input type="date">
    // n'en produit pas, mais on ne fait pas confiance à la saisie.
    return { dateCloture: null, dateTropTot: false }
  }
}

/**
 * Ce que la création d'une version va fermer, et ce qu'elle change.
 *
 * Fonction PURE : elle ne calcule aucune règle elle-même, elle réutilise le
 * domaine (`veilleDe`, `ratioThomas`, `totalChargesCommunes`). La date de clôture
 * qu'elle renvoie est exactement celle qu'écrira `cloturerEtAjouter`.
 */
export function apercuCloture(courante: VersionConfig, saisie: SaisieBruteVersion): ApercuCloture {
  const lignes: LigneCloture[] = []

  const salaireThomasApres = centsOuNull(saisie.salaireNetThomas)
  const salaireLizApres = centsOuNull(saisie.salaireNetLiz)

  // Part Thomas en tête, mais elle exige les DEUX salaires « après ».
  const ratioAvant = ratioOuNull(courante)
  const ratioApres =
    salaireThomasApres !== null && salaireLizApres !== null
      ? ratioOuNull({
          ...courante,
          salaireNetThomas: salaireThomasApres,
          salaireNetLiz: salaireLizApres,
        })
      : null
  if (
    ratioAvant !== null &&
    ratioApres !== null &&
    Math.round(ratioAvant * 100) !== Math.round(ratioApres * 100)
  ) {
    lignes.push({ libelle: 'Part Thomas', unite: 'pourcent', avant: ratioAvant, apres: ratioApres })
  }

  if (salaireThomasApres !== null && salaireThomasApres !== courante.salaireNetThomas) {
    lignes.push({
      libelle: 'Salaire Thomas',
      unite: 'euros',
      avant: courante.salaireNetThomas,
      apres: salaireThomasApres,
    })
  }
  if (salaireLizApres !== null && salaireLizApres !== courante.salaireNetLiz) {
    lignes.push({
      libelle: 'Salaire Liz',
      unite: 'euros',
      avant: courante.salaireNetLiz,
      apres: salaireLizApres,
    })
  }

  const chargesApres = totalChargesOuNull(saisie.chargesCommunes)
  const chargesAvant = totalChargesCommunes(courante)
  if (chargesApres !== null && chargesApres !== chargesAvant) {
    lignes.push({
      libelle: 'Charges communes',
      unite: 'euros',
      avant: chargesAvant,
      apres: chargesApres,
    })
  }

  const { dateCloture, dateTropTot } = calculerDateCloture(courante, saisie.dateDebut)
  return { dateCloture, dateTropTot, lignes }
}
