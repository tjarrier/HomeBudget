import { type Cents, repartirAuRatio } from './money.js'
import type { Parts } from './types.js'

export interface Charge {
  libelle: string
  montant: Cents
}

/**
 * Une version de config decrit « les regles applicables a partir de telle date ».
 * Append-only : on ne modifie jamais une version passee, on en cree une nouvelle.
 */
export interface VersionConfig {
  id: string
  libelle: string
  /** ISO YYYY-MM-DD, inclus. */
  dateDebut: string
  /** ISO YYYY-MM-DD, inclus. `null` = version en cours. */
  dateFin: string | null
  salaireNetThomas: Cents
  salaireNetLiz: Cents
  chargesCommunes: Charge[]
  chargesPersoThomas: Charge[]
  chargesPersoLiz: Charge[]
}

export function totalChargesCommunes(v: VersionConfig): Cents {
  return v.chargesCommunes.reduce((somme, c) => somme + c.montant, 0)
}

export function ratioThomas(v: VersionConfig): number {
  if (v.salaireNetThomas < 0 || v.salaireNetLiz < 0) {
    throw new Error(
      `Salaire negatif : salaireNetThomas=${v.salaireNetThomas}, salaireNetLiz=${v.salaireNetLiz}. Un salaire individuel ne peut pas etre negatif.`,
    )
  }
  const total = v.salaireNetThomas + v.salaireNetLiz
  if (total <= 0) {
    throw new Error('Salaires cumules nuls : la repartition au prorata est indefinie.')
  }
  return v.salaireNetThomas / total
}

export function ratioLiz(v: VersionConfig): number {
  return 1 - ratioThomas(v)
}

export function loyerParPersonne(v: VersionConfig): Parts {
  const [thomas, liz] = repartirAuRatio(totalChargesCommunes(v), ratioThomas(v))
  return { thomas, liz }
}

/**
 * La version applicable a une date. C'est elle qui sert a figer les parts
 * d'une depense — et jamais la version « courante ».
 */
export function versionEnVigueurLe(versions: VersionConfig[], date: string): VersionConfig {
  assertDateIsoValide(date)
  const trouvee = versions.find(
    (v) => date >= v.dateDebut && (v.dateFin === null || date <= v.dateFin),
  )
  if (!trouvee) {
    throw new Error(
      `Aucune version de config ne couvre le ${date}. Une depense sans regle applicable ne peut pas etre figee.`,
    )
  }
  return trouvee
}

/** Les versions ne se chevauchent pas et ne laissent pas de trou. */
export function verifierContinuite(versions: VersionConfig[]): void {
  if (versions.length === 0) return

  const triees = [...versions].sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))

  const ouvertes = triees.filter((v) => v.dateFin === null)
  if (ouvertes.length > 1) {
    throw new Error(`${ouvertes.length} versions ouvertes : une seule peut avoir dateFin === null.`)
  }

  for (const v of triees) {
    if (v.dateFin !== null && v.dateFin < v.dateDebut) {
      throw new Error(
        `Version ${v.id} : dateFin (${v.dateFin}) precede dateDebut (${v.dateDebut}).`,
      )
    }
  }

  for (let i = 0; i < triees.length - 1; i++) {
    const courante = triees[i]
    const suivante = triees[i + 1]
    if (!courante || !suivante) continue

    if (courante.dateFin === null) {
      throw new Error(`Version ${courante.id} est ouverte mais ${suivante.id} la suit.`)
    }
    if (courante.dateFin >= suivante.dateDebut) {
      throw new Error(
        `Version ${courante.id} (fin ${courante.dateFin}) chevauche ${suivante.id} (debut ${suivante.dateDebut}).`,
      )
    }
    if (veilleDe(suivante.dateDebut) !== courante.dateFin) {
      throw new Error(
        `Trou entre ${courante.id} (fin ${courante.dateFin}) et ${suivante.id} (debut ${suivante.dateDebut}).`,
      )
    }
  }
}

/**
 * Ajoute une version en cloturant la precedente la VEILLE de sa prise d'effet.
 * Ne mute rien : renvoie une nouvelle liste. C'est l'append-only en pratique.
 */
export function cloturerEtAjouter(
  versions: VersionConfig[],
  nouvelle: VersionConfig,
): VersionConfig[] {
  if (versions.length === 0) {
    return [{ ...nouvelle, dateFin: null }]
  }

  // On ne cloture jamais une liste deja incoherente : sans cette garde, on
  // suppose a tort que "la derniere par dateDebut" est la version ouverte,
  // et on ecraserait silencieusement la dateFin d'une version deja close.
  verifierContinuite(versions)

  const triees = [...versions].sort((a, b) => a.dateDebut.localeCompare(b.dateDebut))
  const derniere = triees[triees.length - 1]
  if (!derniere) throw new Error('Liste de versions incoherente.')

  if (nouvelle.dateDebut <= derniere.dateDebut) {
    throw new Error(
      `Date de prise d'effet (${nouvelle.dateDebut}) anterieure ou egale a la version courante (${derniere.dateDebut}). Le versioning est append-only.`,
    )
  }

  const cloturee: VersionConfig = { ...derniere, dateFin: veilleDe(nouvelle.dateDebut) }
  return [...triees.slice(0, -1), cloturee, { ...nouvelle, dateFin: null }]
}

/**
 * La veille d'une date ISO, en arithmetique de calendrier pure.
 * `Date` est utilise en UTC uniquement, jamais expose : un objet Date porte un
 * fuseau, et un decalage d'un jour ici corromprait toutes les bornes de version.
 */
export function veilleDe(date: string): string {
  assertDateIsoValide(date)
  const [a, m, j] = date.split('-').map(Number) as [number, number, number]
  const d = new Date(Date.UTC(a, m - 1, j))
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Valide la forme (`YYYY-MM-DD`, zero-paddee) ET la validite calendaire reelle.
 * `Date.UTC` deborde silencieusement (mois 13, 30 fevrier...) au lieu de
 * rejeter : on reconstruit la date puis on relit ses composants pour
 * detecter le debordement.
 */
function assertDateIsoValide(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Date ISO invalide : ${date}`)
  }
  const [a, m, j] = date.split('-').map(Number) as [number, number, number]
  const d = new Date(Date.UTC(a, m - 1, j))
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) {
    throw new Error(`Date ISO invalide : ${date}`)
  }
}
