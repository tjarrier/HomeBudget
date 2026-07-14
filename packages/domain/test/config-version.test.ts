import { describe, expect, it } from 'vitest'
import {
  type VersionConfig,
  cloturerEtAjouter,
  loyerParPersonne,
  ratioThomas,
  totalChargesCommunes,
  veilleDe,
  verifierContinuite,
  versionEnVigueurLe,
} from '../src/config-version.js'

const V1: VersionConfig = {
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
    { libelle: 'Elec + gaz', montant: 16900 },
    { libelle: 'Internet', montant: 3599 },
    { libelle: 'Salle de sport', montant: 3600 },
  ],
  chargesPersoThomas: [],
  chargesPersoLiz: [],
}

const V2: VersionConfig = {
  id: 'v2',
  libelle: 'Revision loyer',
  dateDebut: '2026-07-01',
  dateFin: null,
  salaireNetThomas: 330000,
  salaireNetLiz: 180000,
  chargesCommunes: [
    { libelle: 'Loyer', montant: 79100 },
    { libelle: 'Charges locatives', montant: 3500 },
    { libelle: 'Assurance habitation', montant: 1959 },
    { libelle: 'Eau', montant: 3000 },
    { libelle: 'Elec + gaz', montant: 12000 },
    { libelle: 'Internet', montant: 3000 },
    { libelle: 'Salle de sport', montant: 3600 },
    { libelle: 'Entretien chaudiere', montant: 1200 },
  ],
  chargesPersoThomas: [],
  chargesPersoLiz: [],
}

describe('champs derives', () => {
  it('calcule le total des charges communes', () => {
    expect(totalChargesCommunes(V1)).toBe(111058)
    expect(totalChargesCommunes(V2)).toBe(107359)
  })

  it('calcule le ratio de Thomas depuis les salaires', () => {
    expect(ratioThomas(V1)).toBeCloseTo(0.6470588, 7)
  })

  it('calcule le loyer par personne', () => {
    expect(loyerParPersonne(V1)).toEqual({ thomas: 71861, liz: 39197 })
    expect(loyerParPersonne(V2)).toEqual({ thomas: 69468, liz: 37891 })
  })

  it('refuse des salaires cumules nuls', () => {
    const zero = { ...V1, salaireNetThomas: 0, salaireNetLiz: 0 }
    expect(() => ratioThomas(zero)).toThrow(/salaires/i)
  })

  it('refuse un salaire individuel negatif meme si le total est positif', () => {
    const negatif = { ...V1, salaireNetThomas: -50000, salaireNetLiz: 400000 }
    expect(() => ratioThomas(negatif)).toThrow(/negatif/i)
  })
})

describe('versionEnVigueurLe', () => {
  const versions = [V1, V2]

  it('trouve la version au milieu de sa periode', () => {
    expect(versionEnVigueurLe(versions, '2025-12-05').id).toBe('v1')
  })

  it('inclut le premier jour de la periode', () => {
    expect(versionEnVigueurLe(versions, '2025-07-01').id).toBe('v1')
    expect(versionEnVigueurLe(versions, '2026-07-01').id).toBe('v2')
  })

  it('inclut le dernier jour de la periode', () => {
    expect(versionEnVigueurLe(versions, '2026-06-30').id).toBe('v1')
  })

  it('bascule bien a la veille / au jour de la revision', () => {
    // La borne exacte : c'est la que les bugs de fuseau horaire se logent.
    expect(versionEnVigueurLe(versions, '2026-06-30').id).toBe('v1')
    expect(versionEnVigueurLe(versions, '2026-07-01').id).toBe('v2')
  })

  it('trouve la version courante (dateFin null) pour une date lointaine', () => {
    expect(versionEnVigueurLe(versions, '2030-01-01').id).toBe('v2')
  })

  it('refuse une date anterieure a toute version', () => {
    expect(() => versionEnVigueurLe(versions, '2025-06-30')).toThrow(/aucune version/i)
  })

  it('refuse une liste vide', () => {
    expect(() => versionEnVigueurLe([], '2025-07-01')).toThrow(/aucune version/i)
  })

  it('refuse une date mal formee (non zero-paddee) plutot que de comparer silencieusement', () => {
    const bornees = [
      { ...V1, dateDebut: '2027-01-01', dateFin: '2027-06-30' },
      { ...V2, dateDebut: '2027-07-01', dateFin: '2027-12-31' },
    ]
    expect(() => versionEnVigueurLe(bornees, '2027-1-1')).toThrow(/invalide/i)
  })
})

describe('verifierContinuite', () => {
  it('accepte des versions contigues', () => {
    expect(() => verifierContinuite([V1, V2])).not.toThrow()
  })

  it('accepte une version unique ouverte', () => {
    expect(() => verifierContinuite([V2])).not.toThrow()
  })

  it('refuse un chevauchement', () => {
    const chevauchante = { ...V2, dateDebut: '2026-06-15' }
    expect(() => verifierContinuite([V1, chevauchante])).toThrow(/chevauche/i)
  })

  it('refuse un trou', () => {
    const trouee = { ...V2, dateDebut: '2026-08-01' }
    expect(() => verifierContinuite([V1, trouee])).toThrow(/trou/i)
  })

  it('refuse deux versions ouvertes', () => {
    const ouverte = { ...V1, dateFin: null }
    expect(() => verifierContinuite([ouverte, V2])).toThrow(/versions ouvertes/i)
  })

  it('refuse une liste ou AUCUNE version n est ouverte', () => {
    // Continue, sans chevauchement... mais plus aucune version courante. Une telle
    // liste ne peut plus figer aucune depense — et elle piegeait cloturerEtAjouter,
    // qui prend « la derniere » pour la version ouverte.
    const toutesCloses = [V1, { ...V2, dateFin: '2026-12-31' }]
    expect(() => verifierContinuite(toutesCloses)).toThrow(/aucune version ouverte/i)
  })
})

describe('veilleDe - validation de date', () => {
  it('rejette un mois et un jour hors bornes calendaires', () => {
    expect(() => veilleDe('2027-13-45')).toThrow(/invalide/i)
  })

  it('rejette le 30 fevrier, qui n existe pas', () => {
    expect(() => veilleDe('2027-02-30')).toThrow(/invalide/i)
  })

  it('rejette le mois 00', () => {
    expect(() => veilleDe('2027-00-01')).toThrow(/invalide/i)
  })
})

describe('cloturerEtAjouter (append-only)', () => {
  const nouvelle: VersionConfig = {
    ...V2,
    id: 'v3',
    libelle: 'Nouvelle revision',
    dateDebut: '2027-01-01',
    dateFin: null,
  }

  it('cloture la version courante la VEILLE de la nouvelle', () => {
    const resultat = cloturerEtAjouter([V1, V2], nouvelle)
    expect(resultat).toHaveLength(3)
    expect(resultat[1]?.id).toBe('v2')
    expect(resultat[1]?.dateFin).toBe('2026-12-31')
    expect(resultat[2]?.dateFin).toBeNull()
  })

  it('gere la cloture au 1er mars (annee non bissextile)', () => {
    const marsNonBissextile = { ...nouvelle, dateDebut: '2027-03-01' }
    const resultat = cloturerEtAjouter([V1, V2], marsNonBissextile)
    expect(resultat[1]?.dateFin).toBe('2027-02-28')
  })

  it('gere la cloture au 1er mars (annee bissextile)', () => {
    const marsBissextile = { ...nouvelle, dateDebut: '2028-03-01' }
    const resultat = cloturerEtAjouter([V1, V2], marsBissextile)
    expect(resultat[1]?.dateFin).toBe('2028-02-29')
  })

  it('ne modifie jamais les versions existantes en place', () => {
    const versions = [V1, V2]
    const avant = structuredClone(versions)
    cloturerEtAjouter(versions, nouvelle)
    expect(versions).toEqual(avant) // append-only : aucune mutation
  })

  it('refuse une nouvelle version qui commence avant la version courante', () => {
    const passee = { ...nouvelle, dateDebut: '2026-01-01' }
    expect(() => cloturerEtAjouter([V1, V2], passee)).toThrow(/anterieure/i)
  })

  it('produit une suite continue', () => {
    const resultat = cloturerEtAjouter([V1, V2], nouvelle)
    expect(() => verifierContinuite(resultat)).not.toThrow()
  })

  it('refuse d agir sur une liste deja incoherente plutot que de re-cloturer la mauvaise version', () => {
    // A est censee etre ouverte mais ne l'est pas vraiment : B, plus recente, est deja close.
    // Sans garde, cloturerEtAjouter prend "la derniere par dateDebut" (B) et ecrase sa dateFin.
    const versionA: VersionConfig = {
      ...V1,
      id: 'A',
      dateDebut: '2025-01-01',
      dateFin: null,
    }
    const versionB: VersionConfig = {
      ...V2,
      id: 'B',
      dateDebut: '2026-01-01',
      dateFin: '2026-06-30',
    }
    const suivante: VersionConfig = {
      ...V2,
      id: 'C',
      dateDebut: '2027-01-01',
      dateFin: null,
    }
    // La garde est celle de verifierContinuite, pas le controle de dateDebut :
    // la liste est refusee AVANT qu'on regarde la date de la nouvelle version.
    expect(() => cloturerEtAjouter([versionA, versionB], suivante)).toThrow(/ouverte mais/i)
  })

  it('refuse de RE-CLOTURER une version deja close quand aucune n est ouverte', () => {
    // Le trou laisse par le correctif de la task 4 : il attrapait « une version
    // ouverte suivie d'une autre », jamais « aucune version ouverte ». La liste est
    // pourtant continue, sans chevauchement — elle passait verifierContinuite.
    const b = { ...V2, id: 'B', dateFin: '2026-12-31' } // deja CLOSE
    const suivante = { ...V2, id: 'C', dateDebut: '2027-06-01', dateFin: null }

    // Sans garde : dateFin de B passe silencieusement de 2026-12-31 a 2027-05-31.
    expect(() => cloturerEtAjouter([V1, b], suivante)).toThrow(/aucune version ouverte/i)
  })
})
