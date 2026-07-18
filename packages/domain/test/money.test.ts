import { describe, expect, it } from 'vitest'
import {
  centsVersEuros,
  eurosVersCents,
  formaterEuros,
  parserEurosSaisis,
  repartirAuRatio,
} from '../src/money.js'

describe('eurosVersCents', () => {
  it('convertit un montant simple', () => {
    expect(eurosVersCents(1110.58)).toBe(111058)
  })

  it('resiste aux flottants pleins du Sheet', () => {
    expect(eurosVersCents(718.6105882)).toBe(71861)
    expect(eurosVersCents(762.6051613)).toBe(76261)
  })

  it('arrondit au centime le plus proche', () => {
    expect(eurosVersCents(0.005)).toBe(1)
    expect(eurosVersCents(0.004)).toBe(0)
  })

  it('refuse un montant non fini', () => {
    expect(() => eurosVersCents(Number.NaN)).toThrow()
    expect(() => eurosVersCents(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('formaterEuros', () => {
  it('formate a la francaise', () => {
    // Espace insecable etroit (U+202F) comme separateur de milliers, virgule decimale.
    expect(formaterEuros(111058).replace(/[\xa0\u202F]/g, ' ')).toBe('1 110,58 €')
    expect(formaterEuros(0).replace(/[\xa0\u202F]/g, ' ')).toBe('0,00 €')
  })

  it('formate les montants negatifs', () => {
    expect(formaterEuros(-39197).replace(/[\xa0\u202F]/g, ' ')).toBe('-391,97 €')
  })
})

describe('centsVersEuros', () => {
  it('fait l aller-retour', () => {
    expect(centsVersEuros(111058)).toBe(1110.58)
  })
})

describe('parserEurosSaisis', () => {
  it('accepte la virgule francaise et les separateurs de milliers', () => {
    expect(parserEurosSaisis('1 110,58')).toBe(111058)
    expect(parserEurosSaisis('1110,58')).toBe(111058)
    expect(parserEurosSaisis('1110.58')).toBe(111058)
    expect(parserEurosSaisis('791')).toBe(79100)
    expect(parserEurosSaisis(' 400,00 € ')).toBe(40000)
  })

  it('arrondit au centime plutot que de laisser fuir un flottant', () => {
    // 0.1 + 0.2 en flottant vaut 0.30000000000000004 : sans Math.round,
    // eurosVersCents laisserait passer 30.000000000000004 centimes.
    expect(parserEurosSaisis('0,30')).toBe(30)
    expect(Number.isInteger(parserEurosSaisis('19,99'))).toBe(true)
  })

  it('refuse ce qui n est pas un montant', () => {
    expect(() => parserEurosSaisis('')).toThrow(/Montant invalide/)
    expect(() => parserEurosSaisis('abc')).toThrow(/Montant invalide/)
    expect(() => parserEurosSaisis('12,345')).toThrow(/au centime/i)
  })
})

describe('repartirAuRatio', () => {
  const RATIO_THOMAS = 3300 / 5100 // 0,647058...

  it('reproduit les parts du Sheet sur le loyer v1', () => {
    expect(repartirAuRatio(111058, RATIO_THOMAS)).toEqual([71861, 39197])
  })

  it('reproduit les parts du Sheet sur le loyer v2', () => {
    expect(repartirAuRatio(107359, RATIO_THOMAS)).toEqual([69468, 37891])
  })

  it('garantit que la somme egale toujours le montant', () => {
    // Le coeur du probleme : aucun montant, aucun ratio ne doit casser l invariant.
    for (let montant = 1; montant <= 3000; montant++) {
      for (const ratio of [0.5, RATIO_THOMAS, 1 / 3, 0.999, 0.001]) {
        const [a, b] = repartirAuRatio(montant, ratio)
        expect(a + b).toBe(montant)
        expect(Number.isInteger(a)).toBe(true)
        expect(Number.isInteger(b)).toBe(true)
      }
    }
  })

  it('gere les bornes', () => {
    expect(repartirAuRatio(100, 0)).toEqual([0, 100])
    expect(repartirAuRatio(100, 1)).toEqual([100, 0])
    expect(repartirAuRatio(0, 0.5)).toEqual([0, 0])
  })

  it('refuse un ratio hors de [0,1]', () => {
    expect(() => repartirAuRatio(100, 1.5)).toThrow()
    expect(() => repartirAuRatio(100, -0.1)).toThrow()
  })

  it('refuse un montant non entier', () => {
    expect(() => repartirAuRatio(100.5, 0.5)).toThrow()
  })
})
