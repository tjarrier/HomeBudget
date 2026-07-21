import type { VersionConfig } from '@homebudget/domain'
import { describe, expect, it } from 'vitest'
import { apercuCloture } from '../lib/apercu-cloture.js'

// Version courante de référence : salaires 3 300 / 1 800 (part Thomas ≈ 65 %),
// charges communes = 79 100 + 12 000 = 91 100 centimes.
const COURANTE: VersionConfig = {
  id: 'v-test',
  libelle: 'Loyer 2026',
  dateDebut: '2026-07-01',
  dateFin: null,
  salaireNetThomas: 330000,
  salaireNetLiz: 180000,
  chargesCommunes: [
    { libelle: 'Loyer', montant: 79100 },
    { libelle: 'Élec', montant: 12000 },
  ],
  chargesPersoThomas: [],
  chargesPersoLiz: [],
}

// Une saisie qui recopie exactement la version courante (aucun changement).
const SAISIE_IDENTIQUE = {
  dateDebut: '',
  salaireNetThomas: '3 300,00',
  salaireNetLiz: '1 800,00',
  chargesCommunes: 'Loyer=791,00\nÉlec=120,00',
}

describe('apercuCloture', () => {
  it('clôture à la veille quand la date est postérieure au début courant', () => {
    const a = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '2026-09-01' })
    expect(a.dateCloture).toBe('2026-08-31')
    expect(a.dateTropTot).toBe(false)
  })

  it('refuse une date antérieure ou égale au début courant', () => {
    const egale = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '2026-07-01' })
    expect(egale.dateCloture).toBeNull()
    expect(egale.dateTropTot).toBe(true)

    const avant = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '2026-06-01' })
    expect(avant.dateCloture).toBeNull()
    expect(avant.dateTropTot).toBe(true)
  })

  it('sans date : aucune clôture, pas de « trop tôt »', () => {
    const a = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '' })
    expect(a.dateCloture).toBeNull()
    expect(a.dateTropTot).toBe(false)
  })

  it('config identique : aucune ligne de diff', () => {
    const a = apercuCloture(COURANTE, { ...SAISIE_IDENTIQUE, dateDebut: '2026-09-01' })
    expect(a.lignes).toEqual([])
  })

  it('salaire Thomas modifié : ligne salaire + recalcul de la part', () => {
    const a = apercuCloture(COURANTE, {
      ...SAISIE_IDENTIQUE,
      dateDebut: '2026-09-01',
      salaireNetThomas: '4 000,00',
    })
    const libelles = a.lignes.map((l) => l.libelle)
    expect(libelles).toEqual(['Part Thomas', 'Salaire Thomas'])

    const salaire = a.lignes.find((l) => l.libelle === 'Salaire Thomas')
    expect(salaire).toMatchObject({ unite: 'euros', avant: 330000, apres: 400000 })

    const part = a.lignes.find((l) => l.libelle === 'Part Thomas')
    expect(part?.unite).toBe('pourcent')
    // 3 300 / 5 100 ≈ 0,647 → 65 % ; 4 000 / 5 800 ≈ 0,690 → 69 %
    expect(Math.round((part?.avant ?? 0) * 100)).toBe(65)
    expect(Math.round((part?.apres ?? 0) * 100)).toBe(69)
  })

  it("champ salaire en cours de frappe : ligne omise, pas d'exception", () => {
    const a = apercuCloture(COURANTE, {
      ...SAISIE_IDENTIQUE,
      dateDebut: '2026-09-01',
      salaireNetThomas: '4 000,', // illisible (virgule sans décimales)
      salaireNetLiz: '1 000,00', // lisible et modifié
    })
    // Salaire Thomas illisible → pas de ligne salaire Thomas, et Part Thomas
    // indéfinie (un des deux salaires manque) → pas de ligne part non plus.
    expect(a.lignes.map((l) => l.libelle)).toEqual(['Salaire Liz'])
  })

  it('charges communes modifiées : ligne charges avec le nouveau total', () => {
    const a = apercuCloture(COURANTE, {
      ...SAISIE_IDENTIQUE,
      dateDebut: '2026-09-01',
      chargesCommunes: 'Loyer=791,00\nÉlec=120,00\nEau=30,00',
    })
    const charges = a.lignes.find((l) => l.libelle === 'Charges communes')
    expect(charges).toMatchObject({ unite: 'euros', avant: 91100, apres: 94100 })
  })

  it('ligne de charges illisible : ligne charges omise, pas d’exception', () => {
    const a = apercuCloture(COURANTE, {
      ...SAISIE_IDENTIQUE,
      dateDebut: '2026-09-01',
      chargesCommunes: 'Loyer 791,00', // pas de « = » → parserCharges lève
    })
    expect(a.lignes.some((l) => l.libelle === 'Charges communes')).toBe(false)
  })
})
