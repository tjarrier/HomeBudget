import {
  type Depense,
  type ModeRepartition,
  type Parts,
  type Personne,
  type TypeDepense,
  type VersionConfig,
  calculerParts,
  eurosVersCents,
  ratioThomas,
  versionEnVigueurLe,
} from '@homebudget/domain'

/** Les deux versions de config du Sheet, en centimes. */
export const VERSIONS_INITIALES: VersionConfig[] = [
  {
    id: 'v1',
    libelle: 'Config initiale',
    dateDebut: '2025-07-01',
    dateFin: '2026-06-30',
    salaireNetThomas: 330000,
    salaireNetLiz: 180000,
    chargesCommunes: [
      { libelle: 'Loyer', montant: 78500 },
      { libelle: 'Charges locatives', montant: 3500 },
      { libelle: 'Assurance habitation', montant: 1959 },
      { libelle: 'Eau', montant: 3000 },
      { libelle: 'Élec + gaz', montant: 16900 },
      { libelle: 'Internet', montant: 3599 },
      { libelle: 'Salle de sport', montant: 3600 },
      { libelle: 'Entretien chaudière', montant: 0 },
    ],
    chargesPersoThomas: [
      { libelle: 'Frais CB', montant: 1800 },
      { libelle: 'Téléphone mobile', montant: 1699 },
      { libelle: 'Coaching', montant: 12000 },
      { libelle: 'Assurances (voitures, etc)', montant: 5426 },
      { libelle: 'Outils IA', montant: 11700 },
      { libelle: 'Zwift', montant: 1999 },
    ],
    chargesPersoLiz: [{ libelle: 'Téléphone mobile', montant: 1599 }],
  },
  {
    id: 'v2',
    libelle: 'Révision loyer',
    dateDebut: '2026-07-01',
    dateFin: null,
    salaireNetThomas: 330000,
    salaireNetLiz: 180000,
    chargesCommunes: [
      { libelle: 'Loyer', montant: 79100 },
      { libelle: 'Charges locatives', montant: 3500 },
      { libelle: 'Assurance habitation', montant: 1959 },
      { libelle: 'Eau', montant: 3000 },
      { libelle: 'Élec + gaz', montant: 12000 },
      { libelle: 'Internet', montant: 3000 },
      { libelle: 'Salle de sport', montant: 3600 },
      { libelle: 'Entretien chaudière', montant: 1200 },
    ],
    chargesPersoThomas: [
      { libelle: 'Frais CB', montant: 1800 },
      { libelle: 'Téléphone mobile', montant: 1699 },
      { libelle: 'Coaching', montant: 12000 },
      { libelle: 'Assurances (voitures, etc)', montant: 5426 },
      { libelle: 'Outils IA', montant: 11700 },
      { libelle: 'Zwift', montant: 1999 },
    ],
    chargesPersoLiz: [{ libelle: 'Téléphone mobile', montant: 1599 }],
  },
]

/** Corrections appliquees a la source. Chacune est justifiee dans la spec, §9. */
const DATES_CORRIGEES: Record<string, string> = {
  // Coquille du Sheet : le Tricount rembourse date du 27/09/2025.
  '2029-09-29': '2025-09-29',
}

/**
 * Un virement ou un remboursement n'est pas une depense : c'est un mouvement de
 * dette. Le Sheet les typait « Courante », faute de mieux.
 */
function estTransfert(description: string): boolean {
  const d = description.toLowerCase()
  return (
    d.startsWith('virement') || d.startsWith('remboursement') || d.startsWith('remoursement') // faute de frappe presente dans le Sheet
  )
}

interface LigneCsv {
  date: string
  description: string
  montant: number
  payePar: Personne
  partThomas: number
  partLiz: number
  commentaire: string
}

export function importerDepenses(csv: string, versions: VersionConfig[]): Depense[] {
  return parserCsv(csv).map((ligne, i) => construireDepense(ligne, versions, i))
}

function construireDepense(ligne: LigneCsv, versions: VersionConfig[], index: number): Depense {
  const date = DATES_CORRIGEES[ligne.date] ?? ligne.date
  const montant = eurosVersCents(ligne.montant)
  const version = versionEnVigueurLe(versions, date)
  const ratio = ratioThomas(version)

  const partThomasSheet = eurosVersCents(ligne.partThomas)
  const { type, mode } = classer(ligne, montant, partThomasSheet, ratio)

  const parts: Parts = calculerParts({
    montant,
    mode,
    payePar: ligne.payePar,
    ratioThomas: ratio,
    ...(mode === 'personnalise'
      ? { partsPersonnalisees: { thomas: partThomasSheet, liz: montant - partThomasSheet } }
      : {}),
  })

  return {
    id: `seed-${String(index + 1).padStart(2, '0')}`,
    date,
    description: ligne.description,
    montant,
    payePar: ligne.payePar,
    type,
    mode,
    parts,
    versionConfigId: version.id,
    genereAuto: false,
    commentaire: ligne.commentaire || null,
  }
}

/**
 * Retrouve le type et le mode d'une ligne du Sheet, qui ne connaissait que
 * « Charge fixe » et « Courante ». On deduit le mode des parts calculees :
 * si elles collent au prorata (ou a la moitie), c'est ce mode ; sinon, la
 * repartition etait ad hoc, donc personnalisee.
 */
function classer(
  ligne: LigneCsv,
  montant: number,
  partThomas: number,
  ratio: number,
): { type: TypeDepense; mode: ModeRepartition } {
  if (estTransfert(ligne.description)) {
    return { type: 'transfert', mode: 'transfert' }
  }
  if (partThomas === Math.round(montant * ratio)) {
    return { type: 'charge_fixe', mode: 'prorata' }
  }
  if (partThomas === Math.round(montant / 2)) {
    return { type: 'courante', mode: 'moitie' }
  }
  // Loyer de juillet 2025 : proratise a la main (arrivees echelonnees).
  // Tricount, Noel, Coiffeur : avances de l'un pour l'autre.
  const type: TypeDepense = ligne.description.toLowerCase().startsWith('loyer')
    ? 'charge_fixe'
    : 'courante'
  return { type, mode: 'personnalise' }
}

/** Parseur CSV minimal : gere les champs cites et les guillemets doubles. */
function parserCsv(csv: string): LigneCsv[] {
  const lignes = csv.trim().split('\n')
  return lignes.slice(1).map((ligne) => {
    const champs = decouper(ligne)
    const [date, description, montant, payePar, , partThomas, partLiz, , , commentaire] = champs
    if (!date || !description || !montant || !payePar || !partThomas || !partLiz) {
      throw new Error(`Ligne CSV incomplete : ${ligne}`)
    }
    return {
      date,
      description,
      montant: Number(montant),
      payePar: payePar === 'Thomas' ? 'thomas' : 'liz',
      partThomas: Number(partThomas),
      partLiz: Number(partLiz),
      commentaire: commentaire ?? '',
    }
  })
}

function decouper(ligne: string): string[] {
  const champs: string[] = []
  let courant = ''
  let dansGuillemets = false

  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"') {
      if (dansGuillemets && ligne[i + 1] === '"') {
        courant += '"'
        i++
      } else {
        dansGuillemets = !dansGuillemets
      }
    } else if (c === ',' && !dansGuillemets) {
      champs.push(courant)
      courant = ''
    } else {
      courant += c
    }
  }
  champs.push(courant)
  return champs.map((c) => c.trim())
}
