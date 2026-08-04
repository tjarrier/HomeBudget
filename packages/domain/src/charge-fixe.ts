import {
  type VersionConfig,
  assertDateIsoValide,
  ratioThomas,
  totalChargesCommunes,
  versionEnVigueurLe,
} from './config-version.js'
import { calculerParts } from './repartition.js'
import type { Depense } from './solde.js'
import type { Personne } from './types.js'

/**
 * La charge fixe mensuelle : UNE ligne agregee « Loyer + charges <mois> », au
 * total des charges communes, repartie au prorata des salaires.
 *
 * C'est la forme des 12 lignes du Sheet. Une ligne par poste (loyer, eau,
 * internet...) donnerait 96 lignes par an, et surtout huit arrondis au lieu
 * d'un : la somme des parts resterait juste poste par poste, mais le total du
 * mois ne vaudrait plus le prorata du total.
 *
 * ## Le mois de bascule
 *
 * Si le loyer passe de 785 a 791 le 15/07, juillet produit **une seule ligne,
 * datee du 15/07, au nouveau montant** — spec §7, « le mois de bascule prend
 * automatiquement le nouveau montant ».
 *
 * Cette date n'est pas cosmetique : c'est elle qui decide quelle version fige
 * les parts, via le trigger `depense_dans_sa_version` (migration 0004). Datee
 * du 01/07, la ligne serait figee par l'ANCIENNE version — donc au prorata des
 * anciens salaires, ce qui contredirait son propre montant. La date retenue est
 * `max(1er du mois, dateDebut de la version)` : le premier jour ou la version
 * qui porte le montant s'applique reellement. Un mois sans bascule reste donc
 * date du 1er.
 *
 * La version n'est pas un parametre, et ce n'est pas un oubli : la passer
 * laisserait un appelant choisir l'ancienne pour un mois a cheval, et produire
 * en silence une charge au mauvais montant. C'est exactement le bug du Sheet.
 * On resout ici, une fois, depuis la liste complete.
 *
 * Renvoie un brouillon de depense — tout sauf l'`id`, que la base attribue.
 */
export function genererChargeFixe(
  versions: VersionConfig[],
  /** ISO YYYY-MM. */
  mois: string,
  payePar: Personne,
): Omit<Depense, 'id'> {
  const premierJour = `${moisValide(mois)}-01`
  // La DERNIERE version du mois : c'est elle qui porte le montant a jour.
  const version = versionEnVigueurLe(versions, dernierJourDuMois(mois))
  const date = version.dateDebut > premierJour ? version.dateDebut : premierJour

  const montant = totalChargesCommunes(version)
  return {
    date,
    description: `Loyer + charges ${libelleMois(mois)}`,
    montant,
    payePar,
    type: 'charge_fixe',
    mode: 'prorata',
    parts: calculerParts({ montant, mode: 'prorata', payePar, ratioThomas: ratioThomas(version) }),
    versionConfigId: version.id,
    genereAuto: true,
    commentaire: null,
  }
}

/** Valide `YYYY-MM` en reutilisant la validation calendaire des dates. */
function moisValide(mois: string): string {
  if (!/^\d{4}-\d{2}$/.test(mois)) {
    throw new Error(`Mois ISO invalide : ${mois}. Attendu YYYY-MM.`)
  }
  assertDateIsoValide(`${mois}-01`)
  return mois
}

/** `Date.UTC(a, m, 0)` = jour 0 du mois suivant, donc le dernier du mois vise. */
function dernierJourDuMois(mois: string): string {
  const [a, m] = mois.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

const MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** « juillet 2026 ». L'annee evite deux libelles identiques a douze mois d'ecart. */
function libelleMois(mois: string): string {
  const [a, m] = mois.split('-').map(Number) as [number, number]
  return MOIS.format(new Date(Date.UTC(a, m - 1, 1)))
}
