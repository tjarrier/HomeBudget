import {
  type Cents,
  type Depense,
  type ModeRepartition,
  type Parts,
  type Personne,
  type TypeDepense,
  type VersionConfig,
  calculerParts,
  ratioThomas,
  versionEnVigueurLe,
} from '@homebudget/domain'
import { db } from './client.js'
import { listerVersions } from './lecture.js'
import { depenseDepuisLigne } from './mapper.js'
import { depense } from './schema.js'

export interface SaisieDepense {
  /** ISO YYYY-MM-DD. */
  date: string
  description: string
  /** Deja en centimes entiers : aucun flottant n'atteint cette fonction. */
  montant: Cents
  payePar: Personne
  type: TypeDepense
  mode: ModeRepartition
  /** Requis si et seulement si mode === 'personnalise'. */
  partsPersonnalisees?: Parts
  commentaire?: string
}

export interface PartsCalculees {
  parts: Parts
  version: VersionConfig
}

/**
 * Le coeur de I2, extrait pour etre partage par l'ECRITURE et l'APERCU.
 * Meme code des deux cotes : un apercu qui divergerait de l'ecriture serait un
 * mensonge affiche a l'utilisateur.
 *
 * `versionEnVigueurLe(versions, saisie.date)` — et JAMAIS la version courante.
 * Voir le commentaire de la migration 0004.
 */
export function calculerPartsPourSaisie(
  saisie: SaisieDepense,
  versions: VersionConfig[],
): PartsCalculees {
  const version = versionEnVigueurLe(versions, saisie.date)
  // `exactOptionalPropertyTypes` : on ne pose la cle que si elle a une valeur.
  const parts = calculerParts({
    montant: saisie.montant,
    mode: saisie.mode,
    payePar: saisie.payePar,
    ratioThomas: ratioThomas(version),
    ...(saisie.partsPersonnalisees ? { partsPersonnalisees: saisie.partsPersonnalisees } : {}),
  })
  return { parts, version }
}

/**
 * Fige une depense. Les gardes du domaine et les contraintes SQL jettent :
 * l'appelant (une Server Action) attrape et traduit pour l'humain.
 */
export async function ajouterDepense(saisie: SaisieDepense): Promise<Depense> {
  const versions = await listerVersions()
  const { parts, version } = calculerPartsPourSaisie(saisie, versions)

  const lignes = await db
    .insert(depense)
    .values({
      date: saisie.date,
      description: saisie.description,
      montantCents: saisie.montant,
      payePar: saisie.payePar,
      type: saisie.type,
      modeRepartition: saisie.mode,
      partThomasCents: parts.thomas,
      partLizCents: parts.liz,
      // Le trigger `depense_dans_sa_version` REVERIFIE que cette version
      // couvre bien saisie.date. Deux filets, jamais un seul.
      versionConfigId: version.id,
      genereAuto: false,
      commentaire: saisie.commentaire ?? null,
    })
    .returning()

  const ligne = lignes[0]
  if (!ligne) throw new Error("L'insertion de la depense n'a rien renvoye.")
  return depenseDepuisLigne(ligne)
}
