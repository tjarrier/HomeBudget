import { describe, expect, it } from 'vitest'
import { genererChargeFixe } from '../src/charge-fixe.js'
import type { VersionConfig } from '../src/config-version.js'

/** 785 € de loyer + 100 € de divers = 885 €. Ratio Thomas : 330/510. */
const V1: VersionConfig = {
  id: 'v1',
  libelle: 'Config initiale',
  dateDebut: '2026-01-01',
  dateFin: '2026-07-14',
  salaireNetThomas: 330000,
  salaireNetLiz: 180000,
  chargesCommunes: [
    { libelle: 'Loyer', montant: 78500 },
    { libelle: 'Divers', montant: 10000 },
  ],
  chargesPersoThomas: [],
  chargesPersoLiz: [],
}

/** Revision AU MILIEU du mois : 791 € de loyer a partir du 15/07. */
const V2: VersionConfig = {
  ...V1,
  id: 'v2',
  libelle: 'Revision loyer',
  dateDebut: '2026-07-15',
  dateFin: null,
  chargesCommunes: [
    { libelle: 'Loyer', montant: 79100 },
    { libelle: 'Divers', montant: 10000 },
  ],
}

const VERSIONS = [V1, V2]

describe('genererChargeFixe', () => {
  it('date la ligne du 1er du mois et l attribue a la version en vigueur', () => {
    const c = genererChargeFixe(VERSIONS, '2026-03', 'thomas')

    expect(c.date).toBe('2026-03-01')
    expect(c.montant).toBe(88500)
    expect(c.versionConfigId).toBe('v1')
    expect(c.description).toBe('Loyer + charges mars 2026')
    expect(c.type).toBe('charge_fixe')
    expect(c.mode).toBe('prorata')
    expect(c.payePar).toBe('thomas')
    expect(c.genereAuto).toBe(true)
  })

  it('repartit au prorata, avec un seul arrondi', () => {
    const c = genererChargeFixe(VERSIONS, '2026-03', 'thomas')

    // Math.round(88500 × 330/510) = 57265, et Liz recoit le reste.
    expect(c.parts).toEqual({ thomas: 57265, liz: 31235 })
    expect(c.parts.thomas + c.parts.liz).toBe(c.montant)
  })

  describe('mois a cheval sur deux versions', () => {
    it('produit UNE ligne, au nouveau montant, datee de la prise d effet', () => {
      const c = genererChargeFixe(VERSIONS, '2026-07', 'thomas')

      expect(c.date).toBe('2026-07-15')
      expect(c.montant).toBe(89100)
      expect(c.versionConfigId).toBe('v2')
    })

    it('date la ligne DANS la version qui la fige (trigger 0004)', () => {
      const c = genererChargeFixe(VERSIONS, '2026-07', 'thomas')

      expect(c.date >= V2.dateDebut).toBe(true)
      // Sans quoi la ligne serait figee par v1 tout en portant le montant de v2.
      expect(c.date > (V1.dateFin as string)).toBe(true)
    })

    it('ne recalcule pas les mois passes : juin reste a l ancien montant', () => {
      const juin = genererChargeFixe(VERSIONS, '2026-06', 'thomas')

      expect(juin.date).toBe('2026-06-01')
      expect(juin.montant).toBe(88500)
      expect(juin.versionConfigId).toBe('v1')
    })

    it('le mois suivant repart du 1er', () => {
      const aout = genererChargeFixe(VERSIONS, '2026-08', 'thomas')

      expect(aout.date).toBe('2026-08-01')
      expect(aout.montant).toBe(89100)
      expect(aout.versionConfigId).toBe('v2')
    })
  })

  it('une bascule au 1er du mois ne decale pas la date', () => {
    const versions = [
      { ...V1, dateFin: '2026-06-30' },
      { ...V2, dateDebut: '2026-07-01' },
    ]

    expect(genererChargeFixe(versions, '2026-07', 'thomas').date).toBe('2026-07-01')
  })

  it('trouve la version meme quand le mois se termine un 28 ou un 31', () => {
    const versions = [
      { ...V1, dateFin: '2026-02-28' },
      { ...V2, dateDebut: '2026-03-01' },
    ]

    expect(genererChargeFixe(versions, '2026-02', 'thomas').versionConfigId).toBe('v1')
    expect(genererChargeFixe(versions, '2026-03', 'thomas').versionConfigId).toBe('v2')
  })

  it('refuse un mois mal forme ou inexistant', () => {
    expect(() => genererChargeFixe(VERSIONS, '2026-7', 'thomas')).toThrow(/Mois ISO invalide/)
    expect(() => genererChargeFixe(VERSIONS, '2026-03-01', 'thomas')).toThrow(/Mois ISO invalide/)
    expect(() => genererChargeFixe(VERSIONS, '2026-13', 'thomas')).toThrow(/Date ISO invalide/)
  })

  it('refuse un mois anterieur a toute version', () => {
    expect(() => genererChargeFixe(VERSIONS, '2025-12', 'thomas')).toThrow(/Aucune version/)
  })
})
