import { describe, expect, it } from 'vitest'
import { calculerParts, modeParDefaut } from '../src/repartition.js'

const RATIO_THOMAS = 3300 / 5100

describe('mode prorata', () => {
  it('reproduit les parts du loyer v1', () => {
    expect(
      calculerParts({
        montant: 111058,
        mode: 'prorata',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
      }),
    ).toEqual({ thomas: 71861, liz: 39197 })
  })

  it('reproduit les parts du loyer v2', () => {
    expect(
      calculerParts({
        montant: 107359,
        mode: 'prorata',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
      }),
    ).toEqual({ thomas: 69468, liz: 37891 })
  })
})

describe('mode moitie', () => {
  it('partage en deux', () => {
    expect(
      calculerParts({ montant: 215274, mode: 'moitie', payePar: 'thomas', ratioThomas: RATIO_THOMAS }),
    ).toEqual({ thomas: 107637, liz: 107637 })
  })

  it('attribue le centime impair de facon deterministe, jamais en double', () => {
    // 101 centimes ne se coupent pas en deux : Thomas prend 51, Liz 50.
    // Ce qui compte n'est pas qui recoit le centime, mais que la somme soit exacte.
    const parts = calculerParts({
      montant: 101,
      mode: 'moitie',
      payePar: 'thomas',
      ratioThomas: RATIO_THOMAS,
    })
    expect(parts).toEqual({ thomas: 51, liz: 50 })
    expect(parts.thomas + parts.liz).toBe(101)
  })
})

describe('mode transfert', () => {
  // LE PIEGE. Le PRD dit "100% payeur" mais le calcul est l'inverse :
  // la part du payeur vaut 0, celle de l'autre vaut le montant.
  it('quand Liz verse 400 EUR, la part de Liz vaut 0', () => {
    expect(
      calculerParts({ montant: 40000, mode: 'transfert', payePar: 'liz', ratioThomas: RATIO_THOMAS }),
    ).toEqual({ thomas: 40000, liz: 0 })
  })

  it('quand Thomas verse, la part de Thomas vaut 0', () => {
    expect(
      calculerParts({
        montant: 40000,
        mode: 'transfert',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
      }),
    ).toEqual({ thomas: 0, liz: 40000 })
  })
})

describe('mode personnalise', () => {
  it('reprend les parts saisies', () => {
    expect(
      calculerParts({
        montant: 49214,
        mode: 'personnalise',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
        partsPersonnalisees: { thomas: 0, liz: 49214 },
      }),
    ).toEqual({ thomas: 0, liz: 49214 })
  })

  it('refuse une somme qui ne fait pas le montant', () => {
    expect(() =>
      calculerParts({
        montant: 10000,
        mode: 'personnalise',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
        partsPersonnalisees: { thomas: 4000, liz: 5000 },
      }),
    ).toThrow(/somme des parts/i)
  })

  it('refuse l absence de parts saisies', () => {
    expect(() =>
      calculerParts({
        montant: 10000,
        mode: 'personnalise',
        payePar: 'thomas',
        ratioThomas: RATIO_THOMAS,
      }),
    ).toThrow(/parts personnalisees/i)
  })
})

describe('invariant universel', () => {
  it('la somme des parts egale toujours le montant', () => {
    for (const mode of ['prorata', 'moitie', 'transfert'] as const) {
      for (let montant = 1; montant <= 2000; montant++) {
        for (const payePar of ['thomas', 'liz'] as const) {
          const p = calculerParts({ montant, mode, payePar, ratioThomas: RATIO_THOMAS })
          expect(p.thomas + p.liz).toBe(montant)
        }
      }
    }
  })
})

describe('modeParDefaut', () => {
  it('propose le mode attendu par type de depense', () => {
    expect(modeParDefaut('charge_fixe')).toBe('prorata')
    expect(modeParDefaut('courante')).toBe('moitie')
    expect(modeParDefaut('transfert')).toBe('transfert')
  })
})
